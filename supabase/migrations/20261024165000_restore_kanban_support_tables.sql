-- Recria no banco as tabelas de apoio da Gestão de Projetos que existiam nas
-- migrações de junho mas não estavam presentes neste projeto Supabase.
-- Idempotente: pode ser executada de novo sem duplicar nada nem apagar dados.

-- Ordem das colunas e dos cards por usuário (Kanban).
CREATE TABLE IF NOT EXISTS public.user_column_order (
  user_id uuid NOT NULL,
  column_id uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, column_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_column_order TO authenticated;
GRANT ALL ON public.user_column_order TO service_role;
ALTER TABLE public.user_column_order ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uco_own ON public.user_column_order;
CREATE POLICY uco_own ON public.user_column_order FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_task_order (
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);
CREATE INDEX IF NOT EXISTS user_task_order_user_idx ON public.user_task_order(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_task_order TO authenticated;
GRANT ALL ON public.user_task_order TO service_role;
ALTER TABLE public.user_task_order ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uto_own ON public.user_task_order;
CREATE POLICY uto_own ON public.user_task_order FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Preferências do quadro (campos do card, orientação do Kanban).
CREATE TABLE IF NOT EXISTS public.board_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  field_order jsonb NOT NULL DEFAULT '["tags","description","assignee","priority","status","due","subtasks","comments","attachments","interruptions"]'::jsonb,
  hidden_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  interruption_color text NOT NULL DEFAULT '#ef4444',
  kanban_orientation text NOT NULL DEFAULT 'vertical',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.board_preferences ADD COLUMN IF NOT EXISTS kanban_orientation text NOT NULL DEFAULT 'vertical';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_preferences TO authenticated;
GRANT ALL ON public.board_preferences TO service_role;
ALTER TABLE public.board_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own prefs" ON public.board_preferences;
CREATE POLICY "own prefs" ON public.board_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS board_preferences_updated_at ON public.board_preferences;
CREATE TRIGGER board_preferences_updated_at BEFORE UPDATE ON public.board_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Interrupções registradas nas tarefas; tasks.interruptions guarda a contagem.
CREATE TABLE IF NOT EXISTS public.task_interruptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_interruptions_task_id_idx ON public.task_interruptions(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_interruptions TO authenticated;
GRANT ALL ON public.task_interruptions TO service_role;
ALTER TABLE public.task_interruptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_interruptions_select ON public.task_interruptions;
CREATE POLICY task_interruptions_select ON public.task_interruptions FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));
DROP POLICY IF EXISTS task_interruptions_write ON public.task_interruptions;
CREATE POLICY task_interruptions_write ON public.task_interruptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_view_task(task_id));
DROP POLICY IF EXISTS task_interruptions_update ON public.task_interruptions;
CREATE POLICY task_interruptions_update ON public.task_interruptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS task_interruptions_delete ON public.task_interruptions;
CREATE POLICY task_interruptions_delete ON public.task_interruptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS task_interruptions_updated_at ON public.task_interruptions;
CREATE TRIGGER task_interruptions_updated_at BEFORE UPDATE ON public.task_interruptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_task_interruptions_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tid uuid;
BEGIN
  tid := COALESCE(NEW.task_id, OLD.task_id);
  UPDATE public.tasks SET interruptions = (SELECT count(*) FROM public.task_interruptions WHERE task_id = tid) WHERE id = tid;
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.sync_task_interruptions_count() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS task_interruptions_count_aiud ON public.task_interruptions;
CREATE TRIGGER task_interruptions_count_aiud
  AFTER INSERT OR DELETE OR UPDATE ON public.task_interruptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_interruptions_count();

-- Status personalizados: tabela vazia (sem status padrão) para não mudar a tela;
-- a coluna tasks.status_id é usada pela importação de ATA.
CREATE TABLE IF NOT EXISTS public.task_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_statuses TO authenticated;
GRANT ALL ON public.task_statuses TO service_role;
ALTER TABLE public.task_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_statuses_select_all ON public.task_statuses;
CREATE POLICY task_statuses_select_all ON public.task_statuses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS task_statuses_admin_write ON public.task_statuses;
CREATE POLICY task_statuses_admin_write ON public.task_statuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS trg_task_statuses_u ON public.task_statuses;
CREATE TRIGGER trg_task_statuses_u BEFORE UPDATE ON public.task_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS status_id uuid REFERENCES public.task_statuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_status_id_idx ON public.tasks(status_id);

NOTIFY pgrst, 'reload schema';
