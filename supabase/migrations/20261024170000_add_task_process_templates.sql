-- Modelos de processos da Gestão de Projetos compartilhados pela equipe.
-- Antes ficavam apenas no navegador de quem criou; agora valem em qualquer computador.
CREATE TABLE IF NOT EXISTS public.task_process_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  template jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_process_templates TO authenticated;
GRANT ALL ON public.task_process_templates TO service_role;
ALTER TABLE public.task_process_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_process_templates_tasks_manage ON public.task_process_templates;
CREATE POLICY task_process_templates_tasks_manage ON public.task_process_templates FOR ALL TO authenticated
  USING (public.has_app_permission('tasks'))
  WITH CHECK (public.has_app_permission('tasks'));

DROP TRIGGER IF EXISTS task_process_templates_updated_at ON public.task_process_templates;
CREATE TRIGGER task_process_templates_updated_at BEFORE UPDATE ON public.task_process_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
