-- Contas operacionais independentes do Faturamento existente. Não movimenta dinheiro.
BEGIN;
CREATE TABLE public.enterprise_finance_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('payable','receivable')),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),
 counterparty text NOT NULL DEFAULT '' CHECK(length(counterparty)<=500),
 category text NOT NULL DEFAULT '' CHECK(length(category)<=200),
 amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),
 due_on date NOT NULL,
 settled_on date CHECK(settled_on<=CURRENT_DATE),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=10000),
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX enterprise_finance_active_due ON public.enterprise_finance_accounts(kind,due_on) WHERE deleted_at IS NULL;
CREATE INDEX enterprise_finance_creator ON public.enterprise_finance_accounts(created_by);
ALTER TABLE public.enterprise_finance_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.enterprise_finance_accounts TO authenticated;
GRANT ALL ON public.enterprise_finance_accounts TO service_role;
CREATE POLICY enterprise_finance_read ON public.enterprise_finance_accounts FOR SELECT TO authenticated USING (
 NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing')
);
CREATE POLICY enterprise_finance_insert ON public.enterprise_finance_accounts FOR INSERT TO authenticated WITH CHECK (
 NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing') AND created_by=auth.uid()
);
CREATE POLICY enterprise_finance_update ON public.enterprise_finance_accounts FOR UPDATE TO authenticated USING (
 NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing')
) WITH CHECK (
 NOT public.has_role(auth.uid(),'client'::public.app_role) AND public.has_app_permission('billing')
);
CREATE TRIGGER enterprise_finance_updated BEFORE UPDATE ON public.enterprise_finance_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DO $history$ BEGIN IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031150000','enterprise_finance_accounts',ARRAY['Operational accounts payable and receivable with soft delete and billing-area RLS']) ON CONFLICT(version) DO NOTHING;
END IF; END $history$;
NOTIFY pgrst,'reload schema';
COMMIT;
