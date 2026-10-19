-- Conferência financeira de cada serviço/comissão do BM. Mantém os lançamentos
-- manuais separados dos valores automáticos, que podem ser recalculados pelo BM.
CREATE TABLE public.billing_receivable_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.billing_v2_cycles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('rental', 'exchange', 'treatment', 'service')),
  outsourced_company_id UUID REFERENCES public.outsourced_companies(id) ON DELETE RESTRICT,
  source_key TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('percent', 'fixed')),
  rule_value NUMERIC(14,4) NOT NULL CHECK (rule_value >= 0),
  base_amount_snapshot NUMERIC(14,2) NOT NULL CHECK (base_amount_snapshot >= 0),
  commission_amount NUMERIC(14,2) GENERATED ALWAYS AS (
    CASE WHEN rule_type = 'percent'
      THEN ROUND(base_amount_snapshot * rule_value / 100, 2)
      ELSE ROUND(rule_value, 2)
    END
  ) STORED,
  invoice_number TEXT,
  invoice_issued_on DATE,
  invoice_due_on DATE,
  expected_basis TEXT NOT NULL DEFAULT 'issue' CHECK (expected_basis IN ('issue', 'due', 'manual')),
  expected_on DATE,
  received_on DATE,
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, category, source_key),
  CHECK (source_key = COALESCE(outsourced_company_id::text, 'jacoby')),
  CHECK (rule_type <> 'percent' OR rule_value <= 100)
);

CREATE INDEX billing_receivable_tracking_cycle_idx ON public.billing_receivable_tracking (cycle_id);
CREATE INDEX billing_receivable_tracking_expected_idx ON public.billing_receivable_tracking (expected_on);

CREATE OR REPLACE FUNCTION public.prepare_billing_receivable_tracking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  cycle_row public.billing_v2_cycles%ROWTYPE;
  source_exists BOOLEAN;
BEGIN
  SELECT * INTO cycle_row FROM public.billing_v2_cycles WHERE id = NEW.cycle_id;
  IF NOT FOUND OR cycle_row.is_demo OR cycle_row.status <> 'closed' THEN
    RAISE EXCEPTION 'O lançamento deve pertencer a um BM real e finalizado.';
  END IF;

  IF NEW.source_key <> COALESCE(NEW.outsourced_company_id::text, 'jacoby') OR
     (cycle_row.issuer_type = 'jacoby' AND NEW.outsourced_company_id IS NOT NULL) OR
     (cycle_row.issuer_type = 'outsourced' AND
       (NEW.outsourced_company_id IS NULL OR NEW.outsourced_company_id IS DISTINCT FROM cycle_row.outsourced_company_id)) THEN
    RAISE EXCEPTION 'O emissor do lançamento não corresponde ao BM.';
  END IF;

  IF cycle_row.issuer_type = 'jacoby' AND NEW.category = 'service' THEN
    SELECT EXISTS (SELECT 1 FROM public.billing_v2_cycle_services
      WHERE cycle_id = NEW.cycle_id) INTO source_exists;
  ELSIF cycle_row.issuer_type = 'jacoby' AND NEW.category = 'rental' THEN
    SELECT EXISTS (SELECT 1 FROM public.billing_v2_placements
      WHERE cycle_id = NEW.cycle_id) INTO source_exists;
  ELSIF cycle_row.issuer_type = 'jacoby' THEN
    SELECT EXISTS (SELECT 1 FROM public.billing_v2_movements
      WHERE cycle_id = NEW.cycle_id AND confirmed) INTO source_exists;
  ELSIF NEW.category = 'service' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.billing_v2_cycle_services
      WHERE cycle_id = NEW.cycle_id AND outsourced_company_id = NEW.outsourced_company_id
    ) INTO source_exists;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.outsourced_movement_commissions
      WHERE cycle_id = NEW.cycle_id AND outsourced_company_id = NEW.outsourced_company_id
        AND source_type = NEW.category
    ) INTO source_exists;
  END IF;
  IF NOT source_exists THEN
    RAISE EXCEPTION 'Não há lançamentos desta categoria e empresa no BM informado.';
  END IF;

  IF NEW.expected_basis = 'issue' THEN
    NEW.expected_on := CASE WHEN NEW.invoice_issued_on IS NULL THEN NULL
      ELSE (date_trunc('month', NEW.invoice_issued_on::timestamp) + interval '1 month 9 days')::date END;
  ELSIF NEW.expected_basis = 'due' THEN
    NEW.expected_on := CASE WHEN NEW.invoice_due_on IS NULL THEN NULL
      ELSE (date_trunc('month', NEW.invoice_due_on::timestamp) + interval '1 month 9 days')::date END;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER billing_receivable_tracking_prepare
BEFORE INSERT OR UPDATE ON public.billing_receivable_tracking
FOR EACH ROW EXECUTE FUNCTION public.prepare_billing_receivable_tracking();

GRANT SELECT, INSERT, UPDATE ON public.billing_receivable_tracking TO authenticated;
ALTER TABLE public.billing_receivable_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_receivable_tracking_billing_manage ON public.billing_receivable_tracking
FOR ALL TO authenticated
USING (public.has_app_permission('billing'))
WITH CHECK (public.has_app_permission('billing'));

NOTIFY pgrst, 'reload schema';
