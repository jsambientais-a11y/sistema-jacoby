BEGIN;

CREATE FUNCTION public.prepare_recurring_billing_bulletins(target_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan public.billing_v2_recurring_bulletins;
  generated integer;
BEGIN
  IF NOT coalesce(public.can_access_sensitive_finance(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO plan FROM public.billing_v2_recurring_bulletins WHERE id=target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Série não encontrada.'; END IF;
  IF plan.next_on IS NULL OR plan.stopped_at IS NOT NULL THEN RETURN 0; END IF;

  generated := public.generate_recurring_billing_bulletins(
    plan.id, public.finance_recurrence_due(plan.first_on, 'monthly', plan.repetitions - 1)
  );
  IF EXISTS (SELECT 1 FROM public.billing_v2_recurring_bulletins WHERE id=target_id AND next_on IS NOT NULL) THEN
    RAISE EXCEPTION 'Não foi possível preparar a série. Confira os serviços e o emissor do modelo.';
  END IF;
  RETURN generated;
END;
$$;

CREATE FUNCTION public.copy_previous_recurring_bulletin_values(target_cycle_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan public.billing_v2_recurring_bulletins;
  target public.billing_v2_cycles;
  source public.billing_v2_cycles;
  source_id uuid;
  occurrence_date date;
  updated_count integer;
  inserted_count integer;
BEGIN
  IF NOT coalesce(public.can_access_sensitive_finance(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT p.* INTO plan FROM public.billing_v2_recurring_bulletin_occurrences o
  JOIN public.billing_v2_recurring_bulletins p ON p.id=o.schedule_id
  WHERE o.cycle_id=target_cycle_id FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este BM não pertence a uma série.'; END IF;

  SELECT * INTO target FROM public.billing_v2_cycles WHERE id=target_cycle_id FOR UPDATE;
  IF NOT FOUND OR target.status<>'draft' THEN
    RAISE EXCEPTION 'Abra o BM para edição antes de copiar valores.';
  END IF;
  PERFORM public.assert_bulletin_user_editable(target.id);

  SELECT scheduled_on INTO occurrence_date FROM public.billing_v2_recurring_bulletin_occurrences
  WHERE cycle_id=target.id;
  IF occurrence_date=plan.first_on THEN
    source_id := plan.source_cycle_id;
  ELSE
    SELECT cycle_id INTO source_id FROM public.billing_v2_recurring_bulletin_occurrences
    WHERE schedule_id=plan.id AND scheduled_on<occurrence_date
    ORDER BY scheduled_on DESC LIMIT 1;
  END IF;

  SELECT * INTO source FROM public.billing_v2_cycles WHERE id=source_id FOR SHARE;
  IF NOT FOUND OR source.id=target.id OR source.client_id<>target.client_id
    OR source.issuer_type<>target.issuer_type
    OR source.outsourced_company_id IS DISTINCT FROM target.outsourced_company_id THEN
    RAISE EXCEPTION 'O BM anterior está indisponível ou tem outro emissor.';
  END IF;
  PERFORM 1 FROM public.billing_v2_cycle_services WHERE cycle_id=source.id FOR SHARE;
  IF NOT EXISTS (
    SELECT 1 FROM public.billing_v2_cycle_services s WHERE s.cycle_id=source.id AND s.amount>0
    AND s.outsourced_company_id IS NOT DISTINCT FROM target.outsourced_company_id
  ) THEN RAISE EXCEPTION 'Preencha os valores do BM anterior antes de copiar.'; END IF;

  UPDATE public.billing_v2_cycle_services t
  SET unit_amount=s.unit_amount, amount=round(coalesce(t.quantity, 1)*s.unit_amount, 2)
  FROM public.billing_v2_cycle_services s
  WHERE s.cycle_id=source.id AND t.cycle_id=target.id AND s.waste_service_id=t.waste_service_id
    AND s.outsourced_company_id IS NOT DISTINCT FROM target.outsourced_company_id
    AND s.outsourced_company_id IS NOT DISTINCT FROM t.outsourced_company_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  INSERT INTO public.billing_v2_cycle_services(
    cycle_id,waste_service_id,outsourced_company_id,quantity,unit_amount,amount
  )
  SELECT target.id,s.waste_service_id,s.outsourced_company_id,s.quantity,s.unit_amount,s.amount
  FROM public.billing_v2_cycle_services s
  WHERE s.cycle_id=source.id AND s.outsourced_company_id IS NOT DISTINCT FROM target.outsourced_company_id
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_v2_cycle_services t
      WHERE t.cycle_id=target.id AND t.waste_service_id=s.waste_service_id
        AND t.outsourced_company_id IS NOT DISTINCT FROM s.outsourced_company_id
    );
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN updated_count + inserted_count;
END;
$$;

CREATE FUNCTION public.finalize_reviewed_recurring_billing_bulletins(target_id uuid, reviewed_values jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  plan public.billing_v2_recurring_bulletins;
  occurrence record;
  reviewed record;
  service_total numeric;
  finalized_count integer := 0;
BEGIN
  IF NOT coalesce(public.can_access_sensitive_finance(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(reviewed_values) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Confira os valores antes de finalizar.';
  END IF;
  IF jsonb_array_length(reviewed_values) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Confira os valores antes de finalizar.';
  END IF;
  SELECT * INTO plan FROM public.billing_v2_recurring_bulletins WHERE id=target_id FOR UPDATE;
  IF NOT FOUND OR plan.next_on IS NOT NULL THEN
    RAISE EXCEPTION 'Prepare a sequência antes de finalizar.';
  END IF;

  FOR occurrence IN
    SELECT o.scheduled_on,c.id,c.bulletin_number,c.issuer_type,c.outsourced_company_id
    FROM public.billing_v2_recurring_bulletin_occurrences o
    JOIN public.billing_v2_cycles c ON c.id=o.cycle_id
    WHERE o.schedule_id=plan.id AND c.status='draft' AND NOT c.is_demo
    ORDER BY o.scheduled_on
    FOR UPDATE OF c
  LOOP
    SELECT * INTO reviewed FROM jsonb_to_recordset(reviewed_values)
      AS r(cycle_id uuid, service_total numeric, expected_amount numeric)
    WHERE r.cycle_id=occurrence.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'A sequência mudou. Confira novamente os BMs em edição.'; END IF;
    PERFORM public.assert_bulletin_user_editable(occurrence.id);
    PERFORM 1 FROM public.billing_v2_cycle_services WHERE cycle_id=occurrence.id FOR UPDATE;
    SELECT sum(s.amount) INTO service_total FROM public.billing_v2_cycle_services s
    WHERE s.cycle_id=occurrence.id
      AND s.outsourced_company_id IS NOT DISTINCT FROM occurrence.outsourced_company_id;

    IF coalesce(service_total,0)<=0 OR (occurrence.issuer_type='outsourced' AND occurrence.outsourced_company_id IS NULL) THEN
      RAISE EXCEPTION 'Preencha os serviços e confira o emissor do BM #% antes de finalizar.', occurrence.bulletin_number;
    END IF;
    IF service_total IS DISTINCT FROM reviewed.service_total THEN
      RAISE EXCEPTION 'O valor do BM #% mudou. Confira a sequência novamente.', occurrence.bulletin_number;
    END IF;
    IF reviewed.expected_amount IS NULL OR reviewed.expected_amount<=0 OR reviewed.expected_amount>9999999999.99
      OR reviewed.expected_amount<>round(reviewed.expected_amount,2)
      OR (occurrence.issuer_type='jacoby' AND reviewed.expected_amount<>service_total) THEN
      RAISE EXCEPTION 'Confira o valor a receber do BM #%.', occurrence.bulletin_number;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.billing_receivable_tracking t
      WHERE t.cycle_id=occurrence.id AND t.category='service'
        AND t.source_key=coalesce(occurrence.outsourced_company_id::text,'jacoby')
    ) THEN
      RAISE EXCEPTION 'O BM #% já tem uma previsão. Confira e finalize esse BM individualmente.', occurrence.bulletin_number;
    END IF;

    UPDATE public.billing_v2_cycles SET status='closed',finalized_at=now() WHERE id=occurrence.id;
    INSERT INTO public.billing_receivable_tracking(
      cycle_id,category,outsourced_company_id,source_key,rule_type,rule_value,
      base_amount_snapshot,expected_basis,expected_on,recurring_forecast
    ) VALUES (
      occurrence.id,'service',occurrence.outsourced_company_id,
      coalesce(occurrence.outsourced_company_id::text,'jacoby'),
      'fixed',reviewed.expected_amount,service_total,'manual',occurrence.scheduled_on,true
    );
    finalized_count := finalized_count + 1;
  END LOOP;

  IF finalized_count<>jsonb_array_length(reviewed_values) THEN
    RAISE EXCEPTION 'A sequência mudou. Confira novamente os BMs em edição.';
  END IF;
  RETURN finalized_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_recurring_billing_bulletins(uuid),
  public.copy_previous_recurring_bulletin_values(uuid),
  public.finalize_reviewed_recurring_billing_bulletins(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_recurring_billing_bulletins(uuid),
  public.copy_previous_recurring_bulletin_values(uuid),
  public.finalize_reviewed_recurring_billing_bulletins(uuid,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
