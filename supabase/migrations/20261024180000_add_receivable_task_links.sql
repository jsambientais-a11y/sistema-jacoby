-- Vínculo opcional entre um recebível da aba Financeiro e uma tarefa da Gestão de Projetos.
-- receivable_key é o lançamento do Faturamento: <ciclo>:<categoria>:<terceirizada ou "jacoby">.
CREATE TABLE IF NOT EXISTS public.receivable_task_links (
  receivable_key text PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receivable_task_links_task_idx ON public.receivable_task_links(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivable_task_links TO authenticated;
GRANT ALL ON public.receivable_task_links TO service_role;
ALTER TABLE public.receivable_task_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receivable_task_links_billing_manage ON public.receivable_task_links;
CREATE POLICY receivable_task_links_billing_manage ON public.receivable_task_links FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));

NOTIFY pgrst, 'reload schema';
