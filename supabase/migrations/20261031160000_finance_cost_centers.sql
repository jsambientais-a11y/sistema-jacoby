BEGIN;
CREATE TABLE public.finance_cost_centers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK(kind IN ('income','expense','both')),
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX finance_cost_centers_name_unique ON public.finance_cost_centers(lower(trim(name)));
ALTER TABLE public.finance_cost_centers ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.finance_cost_centers TO authenticated;
GRANT ALL ON public.finance_cost_centers TO service_role;
CREATE POLICY cost_centers_read ON public.finance_cost_centers FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing'));
CREATE POLICY cost_centers_insert ON public.finance_cost_centers FOR INSERT TO authenticated WITH CHECK (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing') AND created_by=auth.uid());
CREATE POLICY cost_centers_update ON public.finance_cost_centers FOR UPDATE TO authenticated USING (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing')) WITH CHECK (NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing'));
CREATE TRIGGER cost_centers_updated BEFORE UPDATE ON public.finance_cost_centers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.enterprise_finance_accounts ADD COLUMN cost_center_id uuid REFERENCES public.finance_cost_centers(id) ON DELETE RESTRICT;
CREATE INDEX enterprise_finance_cost_center ON public.enterprise_finance_accounts(cost_center_id);
CREATE FUNCTION public.validate_finance_cost_center() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.finance_cost_centers;
BEGIN
 IF NEW.cost_center_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id OR NEW.kind IS DISTINCT FROM OLD.kind) THEN
 SELECT * INTO c FROM public.finance_cost_centers WHERE id=NEW.cost_center_id;
 IF NOT FOUND OR NOT c.active OR (c.kind <> 'both' AND c.kind <> CASE WHEN NEW.kind='payable' THEN 'expense' ELSE 'income' END) THEN
 RAISE EXCEPTION 'Escolha um centro de custo ativo e compatível com receitas ou despesas.';
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_cost_center_validate BEFORE INSERT OR UPDATE ON public.enterprise_finance_accounts FOR EACH ROW EXECUTE FUNCTION public.validate_finance_cost_center();
CREATE FUNCTION public.validate_cost_center_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.kind IS DISTINCT FROM OLD.kind AND EXISTS(SELECT 1 FROM public.enterprise_finance_accounts a WHERE a.cost_center_id=NEW.id AND NEW.kind <> 'both' AND NEW.kind <> CASE WHEN a.kind='payable' THEN 'expense' ELSE 'income' END) THEN
 RAISE EXCEPTION 'Este centro possui contas vinculadas incompatíveis com o novo tipo. Mantenha o tipo ou selecione Ambos.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cost_center_kind_validate BEFORE UPDATE ON public.finance_cost_centers FOR EACH ROW EXECUTE FUNCTION public.validate_cost_center_kind();
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031160000','finance_cost_centers',ARRAY['Revenue and expense cost centers with RLS and account links']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
