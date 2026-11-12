BEGIN;

GRANT SELECT ON public.billing_v2_recurring_bulletin_occurrences TO authenticated;
CREATE POLICY billing_recurring_occurrences_finance_read
  ON public.billing_v2_recurring_bulletin_occurrences FOR SELECT TO authenticated
  USING (public.can_access_sensitive_finance());

ALTER TABLE public.billing_receivable_tracking
  ADD COLUMN recurring_forecast boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.generate_recurring_billing_bulletins(target_id uuid, through_on date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan public.billing_v2_recurring_bulletins;
  month_start date;
  new_cycle_id uuid;
  new_number bigint;
  created_count integer := 0;
BEGIN
  FOR plan IN
    SELECT * FROM public.billing_v2_recurring_bulletins
    WHERE stopped_at IS NULL AND next_on <= through_on
      AND (target_id IS NULL OR id = target_id)
    ORDER BY next_on, id
    FOR UPDATE SKIP LOCKED
  LOOP
    WHILE plan.next_on <= through_on LOOP
      BEGIN
        month_start := date_trunc('month', plan.next_on)::date;
        INSERT INTO public.billing_v2_cycles(
          client_id, branch_id, issuer_type, outsourced_company_id,
          period_start, period_end, status, client_portal_visible
        )
        VALUES (plan.client_id, plan.branch_id, plan.issuer_type, plan.outsourced_company_id,
          month_start, (month_start + interval '1 month - 1 day')::date, 'draft', false)
        RETURNING id, bulletin_number INTO new_cycle_id, new_number;

        INSERT INTO public.billing_v2_cycle_services(
          cycle_id, waste_service_id, outsourced_company_id, quantity, unit_amount, amount
        )
        SELECT new_cycle_id, service.waste_service_id, service.outsourced_company_id,
          service.quantity, service.unit_amount, service.amount
        FROM jsonb_to_recordset(plan.service_templates) AS service(
          waste_service_id uuid, outsourced_company_id uuid, quantity numeric, unit_amount numeric, amount numeric
        );

        INSERT INTO public.billing_v2_recurring_bulletin_occurrences(schedule_id, scheduled_on, cycle_id)
        VALUES(plan.id, plan.next_on, new_cycle_id);

        UPDATE public.billing_v2_recurring_bulletins
        SET generated_count = plan.generated_count + 1,
            next_on = CASE WHEN plan.generated_count + 1 < plan.repetitions
              THEN public.finance_recurrence_due(plan.first_on, 'monthly', plan.generated_count + 1) END,
            last_cycle_number = new_number,
            last_error = NULL
        WHERE id = plan.id
        RETURNING * INTO plan;
        created_count := created_count + 1;
      EXCEPTION WHEN OTHERS THEN
        -- The subtransaction rolls back both the draft and its lines; one
        -- invalid template cannot prevent the other schedules from running.
        RAISE LOG 'BM recurrence % failed: % (%)', plan.id, SQLERRM, SQLSTATE;
        UPDATE public.billing_v2_recurring_bulletins
        SET last_error = 'Não foi possível gerar o BM. Confira se os cadastros do modelo ainda existem.'
        WHERE id = plan.id;
        EXIT;
      END;
    END LOOP;
  END LOOP;
  RETURN created_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_recurring_billing_bulletins(uuid,date) FROM PUBLIC, anon, authenticated;

-- Preserve the existing cron signature and its due-date behavior.
CREATE OR REPLACE FUNCTION public.sync_recurring_billing_bulletins(target_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.generate_recurring_billing_bulletins(target_id, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
$$;

CREATE FUNCTION public.finalize_recurring_billing_bulletins(
  target_id uuid, through_on date, expected_amount numeric
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan public.billing_v2_recurring_bulletins;
  occurrence record;
  service_total numeric;
  finalized_count integer := 0;
BEGIN
  IF NOT coalesce(public.can_access_sensitive_finance(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';
  END IF;
  IF expected_amount IS NULL OR expected_amount <= 0 OR expected_amount > 9999999999.99
     OR expected_amount <> round(expected_amount, 2) THEN
    RAISE EXCEPTION 'Informe um valor a receber válido com até duas casas decimais.';
  END IF;

  SELECT * INTO plan FROM public.billing_v2_recurring_bulletins WHERE id=target_id FOR UPDATE;
  IF NOT FOUND OR through_on IS NULL OR through_on < plan.first_on
     OR through_on > public.finance_recurrence_due(plan.first_on,'monthly',plan.repetitions-1) THEN
    RAISE EXCEPTION 'Selecione uma data válida da série.';
  END IF;

  IF plan.next_on <= through_on AND plan.stopped_at IS NULL THEN
    PERFORM public.generate_recurring_billing_bulletins(plan.id, through_on);
    SELECT * INTO plan FROM public.billing_v2_recurring_bulletins WHERE id=target_id;
    IF plan.next_on <= through_on THEN
      RAISE EXCEPTION 'Não foi possível gerar a sequência. Confira os serviços e o emissor do modelo.';
    END IF;
  END IF;

  FOR occurrence IN
    SELECT o.scheduled_on, c.id, c.bulletin_number, c.issuer_type, c.outsourced_company_id
    FROM public.billing_v2_recurring_bulletin_occurrences o
    JOIN public.billing_v2_cycles c ON c.id=o.cycle_id
    WHERE o.schedule_id=plan.id AND o.scheduled_on<=through_on AND c.status='draft' AND NOT c.is_demo
    ORDER BY o.scheduled_on
    FOR UPDATE OF c
  LOOP
    PERFORM public.assert_bulletin_user_editable(occurrence.id);
    SELECT sum(s.amount) INTO service_total
    FROM public.billing_v2_cycle_services s
    WHERE s.cycle_id=occurrence.id
      AND s.outsourced_company_id IS NOT DISTINCT FROM occurrence.outsourced_company_id;

    IF coalesce(service_total,0)<=0 OR
       (occurrence.issuer_type='outsourced' AND occurrence.outsourced_company_id IS NULL) THEN
      RAISE EXCEPTION 'O BM #% precisa ter serviços com valor e um emissor válido antes de ser finalizado em série.', occurrence.bulletin_number;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.billing_receivable_tracking t
      WHERE t.cycle_id=occurrence.id AND t.category='service'
        AND t.source_key=coalesce(occurrence.outsourced_company_id::text,'jacoby')
    ) THEN
      RAISE EXCEPTION 'O BM #% já tem uma previsão financeira registrada. Confira e finalize esse BM individualmente.', occurrence.bulletin_number;
    END IF;

    UPDATE public.billing_v2_cycles
    SET status='closed', finalized_at=now()
    WHERE id=occurrence.id;

    INSERT INTO public.billing_receivable_tracking(
      cycle_id,category,outsourced_company_id,source_key,rule_type,rule_value,
      base_amount_snapshot,expected_basis,expected_on,recurring_forecast
    ) VALUES (
      occurrence.id,'service',occurrence.outsourced_company_id,
      coalesce(occurrence.outsourced_company_id::text,'jacoby'),
      'fixed',expected_amount,service_total,'manual',occurrence.scheduled_on,true
    );

    finalized_count := finalized_count + 1;
  END LOOP;

  RETURN finalized_count;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_recurring_billing_bulletins(uuid,date,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_recurring_billing_bulletins(uuid,date,numeric) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
