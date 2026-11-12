BEGIN;

CREATE TABLE public.billing_v2_recurring_bulletins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_cycle_id uuid REFERENCES public.billing_v2_cycles(id) ON DELETE SET NULL,
  source_number bigint NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.client_branches(id) ON DELETE RESTRICT,
  issuer_type text NOT NULL CHECK (issuer_type IN ('jacoby', 'outsourced')),
  outsourced_company_id uuid REFERENCES public.outsourced_companies(id) ON DELETE RESTRICT,
  first_on date NOT NULL,
  repetitions integer NOT NULL CHECK (repetitions BETWEEN 1 AND 60),
  generated_count integer NOT NULL DEFAULT 0 CHECK (generated_count BETWEEN 0 AND repetitions),
  next_on date,
  service_templates jsonb NOT NULL DEFAULT '[]',
  last_cycle_number bigint,
  last_error text,
  stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX billing_v2_recurring_bulletins_one_active_source
  ON public.billing_v2_recurring_bulletins(source_cycle_id)
  WHERE stopped_at IS NULL AND next_on IS NOT NULL;
CREATE INDEX billing_v2_recurring_bulletins_due
  ON public.billing_v2_recurring_bulletins(next_on)
  WHERE stopped_at IS NULL AND next_on IS NOT NULL;

CREATE TABLE public.billing_v2_recurring_bulletin_occurrences (
  schedule_id uuid NOT NULL REFERENCES public.billing_v2_recurring_bulletins(id) ON DELETE CASCADE,
  scheduled_on date NOT NULL,
  cycle_id uuid UNIQUE REFERENCES public.billing_v2_cycles(id) ON DELETE SET NULL,
  PRIMARY KEY (schedule_id, scheduled_on)
);

ALTER TABLE public.billing_v2_recurring_bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_v2_recurring_bulletin_occurrences ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_v2_recurring_bulletins TO authenticated;
CREATE POLICY billing_recurring_bulletins_finance_read
  ON public.billing_v2_recurring_bulletins FOR SELECT TO authenticated
  USING (public.can_access_sensitive_finance());

-- Used by pg_cron and the scheduling RPC only. No client can run the job on demand.
CREATE FUNCTION public.sync_recurring_billing_bulletins(target_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan public.billing_v2_recurring_bulletins;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  month_start date;
  new_cycle_id uuid;
  new_number bigint;
  created_count integer := 0;
BEGIN
  FOR plan IN
    SELECT * FROM public.billing_v2_recurring_bulletins
    WHERE stopped_at IS NULL AND next_on <= today
      AND (target_id IS NULL OR id = target_id)
    ORDER BY next_on, id
    FOR UPDATE SKIP LOCKED
  LOOP
    WHILE plan.next_on <= today LOOP
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
REVOKE ALL ON FUNCTION public.sync_recurring_billing_bulletins(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_recurring_billing_bulletin(
  source_id uuid, first_date date, occurrence_count integer, copy_services boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  model public.billing_v2_cycles;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  templates jsonb := '[]';
  schedule_id uuid;
BEGIN
  IF NOT coalesce(public.can_access_sensitive_finance(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';
  END IF;
  IF first_date IS NULL OR first_date < today OR first_date > (today + interval '12 months')::date
    OR occurrence_count IS NULL OR occurrence_count NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Escolha uma data entre hoje e os próximos 12 meses e de 1 a 60 boletins.';
  END IF;
  SELECT * INTO model FROM public.billing_v2_cycles WHERE id = source_id FOR UPDATE;
  IF NOT FOUND OR model.is_demo OR (model.issuer_type='outsourced' AND model.outsourced_company_id IS NULL) THEN
    RAISE EXCEPTION 'Escolha um BM de um cliente real com emissor válido.';
  END IF;
  PERFORM public.assert_bulletin_user_editable(model.id);
  IF EXISTS (
    SELECT 1 FROM public.billing_v2_recurring_bulletins
    WHERE source_cycle_id=model.id AND stopped_at IS NULL AND next_on IS NOT NULL
  ) THEN RAISE EXCEPTION 'Já existe uma recorrência ativa para este BM.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.billing_v2_recurring_bulletin_occurrences occurrence
    JOIN public.billing_v2_recurring_bulletins plan ON plan.id=occurrence.schedule_id
    WHERE plan.source_number=model.bulletin_number
      AND occurrence.scheduled_on>=date_trunc('month',first_date)::date
      AND occurrence.scheduled_on<(date_trunc('month',first_date)+interval '1 month')::date
  ) THEN
    RAISE EXCEPTION 'Este modelo já gerou um BM recorrente para o mês escolhido.';
  END IF;

  IF copy_services THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'waste_service_id', s.waste_service_id, 'outsourced_company_id', s.outsourced_company_id,
      'quantity', coalesce(s.quantity, 1), 'unit_amount', s.unit_amount, 'amount', s.amount
    ) ORDER BY s.id), '[]') INTO templates
    FROM public.billing_v2_cycle_services s WHERE s.cycle_id = model.id;
    IF templates = '[]' THEN RAISE EXCEPTION 'Este BM não tem serviços para copiar.'; END IF;
  END IF;

  INSERT INTO public.billing_v2_recurring_bulletins(
    source_cycle_id, source_number, client_id, branch_id, issuer_type, outsourced_company_id,
    first_on, repetitions, next_on, service_templates, created_by
  ) VALUES (
    model.id, model.bulletin_number, model.client_id, model.branch_id, model.issuer_type,
    model.outsourced_company_id, first_date, occurrence_count, first_date, templates, auth.uid()
  ) RETURNING id INTO schedule_id;

  IF first_date = today THEN PERFORM public.sync_recurring_billing_bulletins(schedule_id); END IF;
  RETURN schedule_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe uma recorrência ativa para este BM.';
END;
$$;

CREATE FUNCTION public.stop_recurring_billing_bulletin(target_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce(public.can_access_sensitive_finance(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';
  END IF;
  UPDATE public.billing_v2_recurring_bulletins
  SET stopped_at=now(), next_on=NULL, last_error=NULL
  WHERE id=target_id AND next_on IS NOT NULL AND stopped_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta série já foi encerrada ou concluída.'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_recurring_billing_bulletin(uuid,date,integer,boolean),
  public.stop_recurring_billing_bulletin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_recurring_billing_bulletin(uuid,date,integer,boolean),
  public.stop_recurring_billing_bulletin(uuid) TO authenticated;

-- Production cron uses UTC: 10:00 UTC = 07:00 in São Paulo (UTC-3).
SELECT cron.schedule('jacoby-recurring-billing-bulletins', '0 10 * * *',
  'SELECT public.sync_recurring_billing_bulletins();');
NOTIFY pgrst, 'reload schema';

COMMIT;
