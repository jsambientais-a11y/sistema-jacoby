BEGIN;
-- One current portal notice per task and linked login. Repeated saves do not fan out notices.
CREATE UNIQUE INDEX IF NOT EXISTS task_document_request_notice_unique
  ON public.notifications(task_id, user_id) WHERE type = 'document_request';

CREATE OR REPLACE FUNCTION public.sync_task_document_request_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active_request boolean;
BEGIN
  active_request := NEW.client_id IS NOT NULL AND NEW.client_document_request
    AND NEW.client_portal_visible AND NEW.deleted_at IS NULL
    AND NOT coalesce(NEW.is_demo, false) AND NEW.completed_at IS NULL
    AND coalesce(NEW.status::text, 'todo') <> 'done';
  IF NOT active_request THEN
    DELETE FROM public.notifications WHERE task_id = NEW.id AND type = 'document_request';
    RETURN NEW;
  END IF;
  -- Preserve read state on unrelated/repeated saves. The task row serializes concurrent updates.
  IF TG_OP = 'UPDATE' AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id
    AND OLD.client_document_request AND OLD.client_portal_visible
    AND OLD.deleted_at IS NULL AND NOT coalesce(OLD.is_demo, false)
    AND OLD.completed_at IS NULL AND coalesce(OLD.status::text, 'todo') <> 'done'
    AND OLD.title IS NOT DISTINCT FROM NEW.title AND OLD.due_date IS NOT DISTINCT FROM NEW.due_date THEN
    RETURN NEW;
  END IF;
  DELETE FROM public.notifications WHERE task_id = NEW.id AND type = 'document_request';
  INSERT INTO public.notifications(user_id, task_id, type, title, body)
    SELECT DISTINCT link.user_id, NEW.id, 'document_request', 'Documento pendente',
      NEW.title || CASE WHEN NEW.due_date IS NULL THEN ''
        ELSE ' · Prazo: ' || to_char(NEW.due_date, 'DD/MM/YYYY') END
    FROM public.client_user_links link
    JOIN auth.users account ON account.id = link.user_id
    LEFT JOIN public.profiles profile ON profile.id = link.user_id
    WHERE link.client_id = NEW.client_id
      AND public.has_role(link.user_id, 'client'::public.app_role)
      AND coalesce(profile.is_active, true)
      AND (account.banned_until IS NULL OR account.banned_until <= now())
    ON CONFLICT (task_id, user_id) WHERE type = 'document_request' DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_task_document_request_notifications() FROM PUBLIC;
DROP TRIGGER IF EXISTS task_document_request_notifications ON public.tasks;
CREATE TRIGGER task_document_request_notifications
  AFTER INSERT OR UPDATE OF client_id, client_document_request, client_portal_visible,
    status, completed_at, deleted_at, is_demo, title, due_date ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_document_request_notifications();

-- Even if a login is unlinked later, an old notice must not expose the previous client's task.
CREATE POLICY task_document_request_notice_scope ON public.notifications
  AS RESTRICTIVE FOR SELECT TO authenticated USING (
    type <> 'document_request' OR EXISTS (
      SELECT 1 FROM public.tasks task JOIN public.client_user_links link ON link.client_id = task.client_id
      WHERE task.id = notifications.task_id AND link.user_id = auth.uid()
        AND task.client_document_request AND task.client_portal_visible
        AND task.deleted_at IS NULL AND NOT coalesce(task.is_demo, false)
        AND task.completed_at IS NULL AND coalesce(task.status::text, 'todo') <> 'done'
    )
  );
NOTIFY pgrst, 'reload schema';
COMMIT;
