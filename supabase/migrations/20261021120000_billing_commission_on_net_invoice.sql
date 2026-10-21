-- Mantém a base original do BM e os valores históricos. Apenas uma conferência
-- explícita com líquido informado passa a usar a nova base percentual.
BEGIN;

ALTER TABLE public.billing_receivable_tracking
  ADD COLUMN net_invoice_amount NUMERIC(14,2)
    CHECK (net_invoice_amount >= 0);

-- A coluna continua calculada no banco: o navegador não envia comissão pronta.
ALTER TABLE public.billing_receivable_tracking DROP COLUMN commission_amount;
ALTER TABLE public.billing_receivable_tracking
  ADD COLUMN commission_amount NUMERIC(14,2) GENERATED ALWAYS AS (
    CASE WHEN rule_type = 'percent'
      THEN ROUND(COALESCE(net_invoice_amount, base_amount_snapshot) * rule_value / 100, 2)
      ELSE ROUND(rule_value, 2)
    END
  ) STORED;

CREATE FUNCTION public.require_billing_net_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.rule_type = 'percent' AND NEW.net_invoice_amount IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Informe o valor líquido da nota fiscal para calcular o percentual.';
    ELSIF NEW.rule_type IS DISTINCT FROM OLD.rule_type
       OR NEW.rule_value IS DISTINCT FROM OLD.rule_value
       OR NEW.base_amount_snapshot IS DISTINCT FROM OLD.base_amount_snapshot
       OR NEW.net_invoice_amount IS DISTINCT FROM OLD.net_invoice_amount THEN
      RAISE EXCEPTION 'Informe o valor líquido da nota fiscal para recalcular o percentual.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER billing_receivable_tracking_require_net
BEFORE INSERT OR UPDATE ON public.billing_receivable_tracking
FOR EACH ROW EXECUTE FUNCTION public.require_billing_net_invoice();

NOTIFY pgrst, 'reload schema';
COMMIT;
