BEGIN;
CREATE TABLE public.finance_bank_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX finance_bank_name_unique ON public.finance_bank_accounts(lower(trim(name)));
ALTER TABLE public.finance_bank_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.finance_bank_accounts TO authenticated;
GRANT ALL ON public.finance_bank_accounts TO service_role;
CREATE POLICY bank_read ON public.finance_bank_accounts FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing'));
CREATE POLICY bank_insert ON public.finance_bank_accounts FOR INSERT TO authenticated WITH CHECK (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing') AND created_by=auth.uid());
CREATE POLICY bank_update ON public.finance_bank_accounts FOR UPDATE TO authenticated USING (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing')) WITH CHECK (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing'));
CREATE TRIGGER bank_updated BEFORE UPDATE ON public.finance_bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.enterprise_finance_accounts ADD COLUMN bank_account_id uuid REFERENCES public.finance_bank_accounts(id) ON DELETE RESTRICT;
CREATE INDEX finance_manual_bank ON public.enterprise_finance_accounts(bank_account_id);
CREATE TABLE public.finance_receipt_details (
 entry_id text PRIMARY KEY CHECK(length(entry_id) BETWEEN 1 AND 500),
 cycle_id uuid NOT NULL REFERENCES public.billing_v2_cycles(id) ON DELETE RESTRICT,
 cost_center_id uuid REFERENCES public.finance_cost_centers(id) ON DELETE RESTRICT,
 bank_account_id uuid REFERENCES public.finance_bank_accounts(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 CHECK(split_part(entry_id,':',1)=cycle_id::text)
);
CREATE INDEX finance_receipt_center ON public.finance_receipt_details(cost_center_id);
CREATE INDEX finance_receipt_bank ON public.finance_receipt_details(bank_account_id);
CREATE INDEX finance_receipt_cycle ON public.finance_receipt_details(cycle_id);
ALTER TABLE public.finance_receipt_details ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.finance_receipt_details TO authenticated;
GRANT ALL ON public.finance_receipt_details TO service_role;
CREATE POLICY receipt_details_read ON public.finance_receipt_details FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing'));
CREATE POLICY receipt_details_insert ON public.finance_receipt_details FOR INSERT TO authenticated WITH CHECK (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing') AND created_by=auth.uid());
CREATE POLICY receipt_details_update ON public.finance_receipt_details FOR UPDATE TO authenticated USING (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing')) WITH CHECK (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing'));
CREATE TRIGGER receipt_details_updated BEFORE UPDATE ON public.finance_receipt_details FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE FUNCTION public.validate_finance_receipt_details() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.cost_center_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id) AND NOT EXISTS(SELECT 1 FROM public.finance_cost_centers WHERE id=NEW.cost_center_id AND active AND kind IN ('income','both')) THEN
 RAISE EXCEPTION 'Escolha um centro ativo para receitas.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_details_validate BEFORE INSERT OR UPDATE ON public.finance_receipt_details FOR EACH ROW EXECUTE FUNCTION public.validate_finance_receipt_details();
CREATE FUNCTION public.validate_finance_bank() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.bank_account_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id) AND NOT EXISTS(SELECT 1 FROM public.finance_bank_accounts WHERE id=NEW.bank_account_id AND active) THEN
 RAISE EXCEPTION 'Escolha uma conta bancária ativa.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_bank_validate BEFORE INSERT OR UPDATE ON public.finance_receipt_details FOR EACH ROW EXECUTE FUNCTION public.validate_finance_bank();
CREATE TRIGGER manual_bank_validate BEFORE INSERT OR UPDATE ON public.enterprise_finance_accounts FOR EACH ROW EXECUTE FUNCTION public.validate_finance_bank();
CREATE OR REPLACE FUNCTION public.validate_cost_center_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.kind IS DISTINCT FROM OLD.kind AND (
 EXISTS(SELECT 1 FROM public.enterprise_finance_accounts a WHERE a.cost_center_id=NEW.id AND NEW.kind <> 'both' AND NEW.kind <> CASE WHEN a.kind='payable' THEN 'expense' ELSE 'income' END)
 OR (NEW.kind='expense' AND EXISTS(SELECT 1 FROM public.finance_receipt_details WHERE cost_center_id=NEW.id))) THEN
 RAISE EXCEPTION 'Este centro possui contas vinculadas incompatíveis com o novo tipo. Mantenha o tipo ou selecione Ambos.';
 END IF;
 RETURN NEW;
END $$;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031170000','finance_banks_receipt_details',ARRAY['Bank registry and optional receipt classification without changing billing values']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
