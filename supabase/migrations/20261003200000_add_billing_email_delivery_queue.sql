-- Fila auditavel para avisar os usuarios do cliente quando um BM (completo ou
-- filtrado por residuo) for publicado no portal. O envio fica desacoplado da
-- publicacao: uma falha do provedor de e-mail nunca impede o acesso no portal.
CREATE TABLE IF NOT EXISTS public.billing_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_key text NOT NULL UNIQUE,
  cycle_id uuid NOT NULL REFERENCES public.billing_v2_cycles(id) ON DELETE CASCADE,
  residue_emission_id uuid REFERENCES public.billing_v2_residue_emissions(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  custom_message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_email_deliveries_cycle_idx
  ON public.billing_email_deliveries (cycle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_email_deliveries_pending_idx
  ON public.billing_email_deliveries (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.billing_email_deliveries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_email_deliveries TO authenticated;
GRANT ALL ON public.billing_email_deliveries TO service_role;

DROP POLICY IF EXISTS billing_email_deliveries_billing_read ON public.billing_email_deliveries;
CREATE POLICY billing_email_deliveries_billing_read
  ON public.billing_email_deliveries FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));

CREATE OR REPLACE FUNCTION public.set_billing_email_delivery_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_email_deliveries_updated_at ON public.billing_email_deliveries;
CREATE TRIGGER trg_billing_email_deliveries_updated_at
  BEFORE UPDATE ON public.billing_email_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_billing_email_delivery_updated_at();

-- Cria uma entrega para cada login de cliente vinculado. A chave unica impede
-- e-mails duplicados mesmo que a publicacao seja clicada ou processada mais de uma vez.
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
  inserted_count integer := 0;
BEGIN
  SELECT client_id INTO target_client_id
  FROM public.billing_v2_cycles
  WHERE id = target_cycle_id;

  IF target_client_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.billing_email_deliveries (
    delivery_key,
    cycle_id,
    residue_emission_id,
    recipient_user_id,
    recipient_email
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
    lower(trim(account.email::text))
  FROM public.client_user_links AS link
  JOIN auth.users AS account ON account.id = link.user_id
  WHERE link.client_id = target_client_id
    AND account.email IS NOT NULL
    AND trim(account.email::text) <> ''
  ON CONFLICT (delivery_key) DO UPDATE
    SET recipient_email = EXCLUDED.recipient_email,
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
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_billing_portal_emails(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_billing_portal_emails(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_cycle_portal_email_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.client_portal_visible AND NEW.status = 'closed'
     AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.client_portal_visible, false)) THEN
    PERFORM public.queue_billing_portal_emails(NEW.id, NULL);
  ELSIF NOT NEW.client_portal_visible
        AND TG_OP = 'UPDATE'
        AND COALESCE(OLD.client_portal_visible, false) THEN
    UPDATE public.billing_email_deliveries
    SET status = 'cancelled', last_error = NULL
    WHERE cycle_id = NEW.id
      AND residue_emission_id IS NULL
      AND status IN ('pending', 'failed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cycle_portal_email_queue ON public.billing_v2_cycles;
CREATE TRIGGER trg_sync_cycle_portal_email_queue
  AFTER INSERT OR UPDATE OF client_portal_visible, status ON public.billing_v2_cycles
  FOR EACH ROW EXECUTE FUNCTION public.sync_cycle_portal_email_queue();

CREATE OR REPLACE FUNCTION public.sync_residue_portal_email_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.client_portal_visible
     AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.client_portal_visible, false)) THEN
    PERFORM public.queue_billing_portal_emails(NEW.cycle_id, NEW.id);
  ELSIF NOT NEW.client_portal_visible
        AND TG_OP = 'UPDATE'
        AND COALESCE(OLD.client_portal_visible, false) THEN
    UPDATE public.billing_email_deliveries
    SET status = 'cancelled', last_error = NULL
    WHERE residue_emission_id = NEW.id
      AND status IN ('pending', 'failed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_residue_portal_email_queue ON public.billing_v2_residue_emissions;
CREATE TRIGGER trg_sync_residue_portal_email_queue
  AFTER INSERT OR UPDATE OF client_portal_visible ON public.billing_v2_residue_emissions
  FOR EACH ROW EXECUTE FUNCTION public.sync_residue_portal_email_queue();

NOTIFY pgrst, 'reload schema';
