-- Painel financeiro mensal.
-- 1) Recebimento dos BMs emitidos pela própria Jacoby: vencimento e baixa.
ALTER TABLE public.billing_v2_cycles
  ADD COLUMN IF NOT EXISTS payment_due_date DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS received_on DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_v2_cycles_payment_status_check') THEN
    ALTER TABLE public.billing_v2_cycles
      ADD CONSTRAINT billing_v2_cycles_payment_status_check CHECK (payment_status IN ('pending', 'received'));
  END IF;
END $$;

-- 2) Materiais comprados do cliente (sucata): quando o BM é da Jacoby, a Jacoby
-- paga o cliente pelo material, então o valor é saída no fluxo, não cobrança.
ALTER TABLE public.waste_residues
  ADD COLUMN IF NOT EXISTS jacoby_pays_client BOOLEAN NOT NULL DEFAULT false;

UPDATE public.waste_residues SET jacoby_pays_client = true
WHERE upper(btrim(name)) LIKE 'SUCATA%' AND NOT jacoby_pays_client;

CREATE OR REPLACE FUNCTION public.jacoby_default_residue_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND upper(btrim(NEW.name)) LIKE 'SUCATA%' THEN
    NEW.jacoby_pays_client := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jacoby_waste_residues_default_purchase ON public.waste_residues;
CREATE TRIGGER jacoby_waste_residues_default_purchase
  BEFORE INSERT ON public.waste_residues
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_default_residue_purchase();

-- 3) Sucata vendida à Eliana: ela paga o cliente e repassa R$ 0,10/kg à Jacoby,
-- sem retenção. Locação e troca não geram comissão para ela.
INSERT INTO public.outsourced_commission_templates (
  outsourced_company_id, tax_withholding_rate, rental_commission_rate, exchange_commission_rate, active
)
SELECT id, 0, 0, 0, true
FROM public.outsourced_companies
WHERE COALESCE(trade_name, '') ILIKE '%ELIANA%' OR legal_name ILIKE '%ELIANA%'
ON CONFLICT (outsourced_company_id) DO NOTHING;

INSERT INTO public.outsourced_treatment_commission_template_rates (
  commission_template_id, residue_name, outsourced_treatment_rate, jacoby_treatment_rate
)
SELECT template.id, rate.residue_name, 0, 0.10
FROM public.outsourced_commission_templates template
JOIN public.outsourced_companies company ON company.id = template.outsourced_company_id
CROSS JOIN (VALUES ('SUCATA MISTA'), ('SUCATA'), ('SUCATA - MSC')) AS rate(residue_name)
WHERE COALESCE(company.trade_name, '') ILIKE '%ELIANA%' OR company.legal_name ILIKE '%ELIANA%'
ON CONFLICT (commission_template_id, residue_name) DO NOTHING;

-- Recalcula as comissões dos BMs da Eliana já finalizados.
DO $$
DECLARE
  target UUID;
BEGIN
  FOR target IN
    SELECT cycle.id FROM public.billing_v2_cycles cycle
    JOIN public.outsourced_companies company ON company.id = cycle.outsourced_company_id
    WHERE cycle.status = 'closed'
      AND (COALESCE(company.trade_name, '') ILIKE '%ELIANA%' OR company.legal_name ILIKE '%ELIANA%')
  LOOP
    PERFORM public.sync_outsourced_cycle_commissions(target);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
