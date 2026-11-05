-- Religa o aviso de "adicionado como colaborador". A migration 20260724130000
-- criou este gatilho, mas ele não existe no banco publicado: ninguém recebia o aviso.
CREATE OR REPLACE FUNCTION public.notify_task_collaborator_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := COALESCE(NEW.added_by, auth.uid());
  actor_name text;
  task_title text;
BEGIN
  -- Não cria uma notificação quando a própria pessoa se adiciona.
  IF NEW.collaborator_id = actor THEN RETURN NEW; END IF;

  -- Versões anteriores da tela recriam a lista inteira a cada salvamento. Sem esta
  -- checagem, todo colaborador seria avisado de novo sempre que a tarefa fosse salva.
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.collaborator_id
      AND task_id = NEW.task_id
      AND type = 'collaborator_assignment'
      AND NOT is_read
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email) INTO actor_name
  FROM public.profiles WHERE id = actor;
  SELECT title INTO task_title FROM public.tasks WHERE id = NEW.task_id;

  INSERT INTO public.notifications (user_id, task_id, type, title, body)
  VALUES (
    NEW.collaborator_id,
    NEW.task_id,
    'collaborator_assignment',
    'Você foi adicionado como colaborador',
    COALESCE(actor_name, 'Alguém') || ' adicionou você como colaborador em: ' || COALESCE(task_title, 'uma tarefa')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_collaborator_added ON public.task_collaborators;
CREATE TRIGGER trg_notify_task_collaborator_added
AFTER INSERT ON public.task_collaborators
FOR EACH ROW EXECUTE FUNCTION public.notify_task_collaborator_added();
