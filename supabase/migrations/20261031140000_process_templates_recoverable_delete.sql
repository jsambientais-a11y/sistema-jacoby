-- Exclusão recuperável: preserva tombstones para caches antigos não recriarem modelos.
BEGIN;
ALTER TABLE public.task_process_templates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.task_process_templates.deleted_at IS 'Exclusão recuperável do modelo; não altera tarefas instanciadas.';
DO $history$ BEGIN IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031140000','process_templates_recoverable_delete',ARRAY['Add recoverable deletion timestamp to process templates']) ON CONFLICT(version) DO NOTHING;
END IF; END $history$;
NOTIFY pgrst,'reload schema';
COMMIT;
