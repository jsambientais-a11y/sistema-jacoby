-- Inclui a empresa terceirizada emissora entre os destinatarios do BM.
-- O login do cliente continua sendo o destinatario principal; a terceirizada
-- so entra quando o proprio ciclo estiver configurado com issuer_type=outsourced.
ALTER TABLE public.billing_email_deliveries
  ALTER COLUMN recipient_user_id DROP NOT NULL;

ALTER TABLE public.billing_email_deliveries
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'client';

ALTER TABLE public.billing_email_deliveries
  DROP CONSTRAINT IF EXISTS billing_email_deliveries_recipient_type_check;

ALTER TABLE public.billing_email_deliveries
  ADD CONSTRAINT billing_email_deliveries_recipient_type_check
  CHECK (recipient_type IN ('client', 'outsourced'));

CREATE OR REPLACE FUNCTION public.queue_billing_portal_emails(
  target_cycle_id uuid,
  target_residue_emission_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_client_id uuid;
  target_issuer_type text;
  target_outsourced_company_id uuid;
  inserted_count integer := 0;
  affected_count integer := 0;
BEGIN
  SELECT client_id, issuer_type, outsourced_company_id
  INTO target_client_id, target_issuer_type, target_outsourced_company_id
  FROM public.billing_v2_cycles
  WHERE id = target_cycle_id;

  IF target_client_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Remove da fila destinatarios terceirizados antigos antes de recalcular o
  -- emissor atual. Isso cobre a troca da emissora ou a volta para a Jacoby.
  UPDATE public.billing_email_deliveries
  SET status = 'cancelled', last_error = NULL
  WHERE cycle_id = target_cycle_id
    AND recipient_type = 'outsourced'
    AND status IN ('pending', 'failed')
    AND (
      (target_residue_emission_id IS NULL AND residue_emission_id IS NULL)
      OR residue_emission_id = target_residue_emission_id
    );

  INSERT INTO public.billing_email_deliveries (
    delivery_key,
    cycle_id,
    residue_emission_id,
    recipient_user_id,
    recipient_email,
    recipient_type
  )
  SELECT
    CASE
      WHEN target_residue_emission_id IS NULL
        THEN 'cycle:' || target_cycle_id::text || ':user:' || link.user_id::text
      ELSE 'residue:' || target_residue_emission_id::text || ':user:' || link.user_id::text
    END,
    target_cycle_id,
    target_residue_emission_id,
    link.user_id,
    lower(trim(account.email::text)),
    'client'
  FROM public.client_user_links AS link
  JOIN auth.users AS account ON account.id = link.user_id
  WHERE link.client_id = target_client_id
    AND account.email IS NOT NULL
    AND trim(account.email::text) <> ''
  ON CONFLICT (delivery_key) DO UPDATE
    SET recipient_email = EXCLUDED.recipient_email,
        recipient_type = EXCLUDED.recipient_type,
        status = CASE
          WHEN billing_email_deliveries.status IN ('cancelled', 'failed') THEN 'pending'
          ELSE billing_email_deliveries.status
        END,
        next_attempt_at = CASE
          WHEN billing_email_deliveries.status IN ('cancelled', 'failed') THEN now()
          ELSE billing_email_deliveries.next_attempt_at
        END,
        last_error = CASE
          WHEN billing_email_deliveries.status IN ('cancelled', 'failed') THEN NULL
          ELSE billing_email_deliveries.last_error
        END;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF target_issuer_type = 'outsourced' AND target_outsourced_company_id IS NOT NULL THEN
    INSERT INTO public.billing_email_deliveries (
      delivery_key,
      cycle_id,
      residue_emission_id,
      recipient_user_id,
      recipient_email,
      recipient_type
    )
    SELECT
      CASE
        WHEN target_residue_emission_id IS NULL
          THEN 'cycle:' || target_cycle_id::text || ':outsourced:' || company.id::text
        ELSE 'residue:' || target_residue_emission_id::text || ':outsourced:' || company.id::text
      END,
      target_cycle_id,
      target_residue_emission_id,
      NULL,
      lower(trim(company.email)),
      'outsourced'
    FROM public.outsourced_companies AS company
    WHERE company.id = target_outsourced_company_id
      AND company.active
      AND company.email IS NOT NULL
      AND trim(company.email) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.client_user_links AS link
        JOIN auth.users AS account ON account.id = link.user_id
        WHERE link.client_id = target_client_id
          AND lower(trim(account.email::text)) = lower(trim(company.email))
      )
    ON CONFLICT (delivery_key) DO UPDATE
      SET recipient_email = EXCLUDED.recipient_email,
          recipient_type = EXCLUDED.recipient_type,
          status = CASE
            WHEN billing_email_deliveries.status IN ('cancelled', 'failed') THEN 'pending'
            ELSE billing_email_deliveries.status
          END,
          next_attempt_at = CASE
            WHEN billing_email_deliveries.status IN ('cancelled', 'failed') THEN now()
            ELSE billing_email_deliveries.next_attempt_at
          END,
          last_error = CASE
            WHEN billing_email_deliveries.status IN ('cancelled', 'failed') THEN NULL
            ELSE billing_email_deliveries.last_error
          END;

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    inserted_count := inserted_count + affected_count;
  END IF;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_billing_portal_emails(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_billing_portal_emails(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
