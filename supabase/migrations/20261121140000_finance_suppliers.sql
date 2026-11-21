BEGIN;

CREATE TABLE public.finance_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX finance_suppliers_name_unique ON public.finance_suppliers (lower(name));

ALTER TABLE public.finance_suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_suppliers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.finance_suppliers TO authenticated;
GRANT ALL ON public.finance_suppliers TO service_role;

CREATE POLICY finance_suppliers_read ON public.finance_suppliers
  FOR SELECT TO authenticated USING (public.can_access_sensitive_finance());
CREATE POLICY finance_suppliers_insert ON public.finance_suppliers
  FOR INSERT TO authenticated WITH CHECK (public.can_access_sensitive_finance());

NOTIFY pgrst, 'reload schema';

COMMIT;
