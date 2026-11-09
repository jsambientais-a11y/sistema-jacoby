-- Adds opt-in 15-day rules. Keeps the current default and every existing record untouched.
BEGIN;
ALTER TABLE public.billing_receivable_tracking
  DROP CONSTRAINT billing_receivable_tracking_expected_basis_check;
ALTER TABLE public.billing_receivable_tracking
  ADD CONSTRAINT billing_receivable_tracking_expected_basis_check
    CHECK (expected_basis IN ('issue','due','manual','issue_15','due_15'));

CREATE OR REPLACE FUNCTION public.prepare_billing_receivable_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  cycle_row public.billing_v2_cycles%ROWTYPE;
  source_exists BOOLEAN;
  preserve_expected BOOLEAN := false;
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
  -- Preserve previously saved dates unless the timing rule or its anchor changes.
  IF TG_OP = 'UPDATE' AND NEW.expected_basis = OLD.expected_basis THEN
    preserve_expected :=
      (NEW.expected_basis IN ('issue','issue_15') AND NEW.invoice_issued_on IS NOT DISTINCT FROM OLD.invoice_issued_on)
      OR (NEW.expected_basis IN ('due','due_15') AND NEW.invoice_due_on IS NOT DISTINCT FROM OLD.invoice_due_on);
  END IF;
  IF preserve_expected THEN
    NEW.expected_on := OLD.expected_on;
  ELSIF NEW.expected_basis = 'issue_15' THEN
    NEW.expected_on := NEW.invoice_issued_on + 15;
  ELSIF NEW.expected_basis = 'due_15' THEN
    NEW.expected_on := NEW.invoice_due_on + 15;
  ELSIF NEW.expected_basis = 'issue' THEN
    NEW.expected_on := CASE WHEN NEW.invoice_issued_on IS NULL THEN NULL
      ELSE (date_trunc('month', NEW.invoice_issued_on::timestamp) + interval '1 month 9 days')::date END;
  ELSIF NEW.expected_basis = 'due' THEN
    NEW.expected_on := CASE WHEN NEW.invoice_due_on IS NULL THEN NULL
      ELSE (date_trunc('month', NEW.invoice_due_on::timestamp) + interval '1 month 9 days')::date END;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
