BEGIN;

CREATE FUNCTION public.correct_card_payment_date(
  target_card_id uuid,
  target_month date,
  previous_paid_on date,
  corrected_paid_on date,
  expected_payment_cents bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  payment_total bigint;
BEGIN
  IF public.can_access_sensitive_finance() IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501';
  END IF;

  IF previous_paid_on IS NULL OR corrected_paid_on IS NULL OR
      corrected_paid_on > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Informe uma data de pagamento até hoje.';
  END IF;

  PERFORM 1 FROM public.finance_credit_cards WHERE id = target_card_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartão não encontrado.'; END IF;

  PERFORM 1 FROM public.enterprise_finance_accounts
  WHERE credit_card_id = target_card_id AND invoice_month = target_month
    AND deleted_at IS NULL FOR UPDATE;

  SELECT sum(amount_cents) INTO payment_total FROM public.enterprise_finance_accounts
  WHERE credit_card_id = target_card_id AND invoice_month = target_month
    AND deleted_at IS NULL AND settled_on = previous_paid_on;

  IF payment_total IS NULL OR payment_total IS DISTINCT FROM expected_payment_cents THEN
    RAISE EXCEPTION 'O pagamento mudou. Atualize a fatura antes de corrigir a data.';
  END IF;

  UPDATE public.enterprise_finance_accounts SET settled_on = corrected_paid_on
  WHERE credit_card_id = target_card_id AND invoice_month = target_month
    AND deleted_at IS NULL AND settled_on = previous_paid_on;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_card_payment_date(uuid, date, date, date, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_card_payment_date(uuid, date, date, date, bigint) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
