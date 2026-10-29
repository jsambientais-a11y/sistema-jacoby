-- Restrições adicionais protegem o bucket ISO mesmo se existirem políticas permissivas globais de Storage.
BEGIN;
CREATE POLICY iso_guard_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
 bucket_id<>'iso-private' OR EXISTS(SELECT 1 FROM public.iso_workspaces w WHERE w.id::text=split_part(storage.objects.name,'/',1) AND public.iso_access(w.id) IS NOT NULL)
);
CREATE POLICY iso_guard_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
 bucket_id<>'iso-private' OR (name ~ '^[a-f0-9-]{36}/[a-zA-Z0-9-]+$' AND EXISTS(SELECT 1 FROM public.iso_workspaces w WHERE w.id::text=split_part(storage.objects.name,'/',1) AND public.iso_access(w.id) IN ('admin','editor')))
);
CREATE POLICY iso_guard_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'iso-private') WITH CHECK(bucket_id<>'iso-private');
CREATE POLICY iso_guard_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'iso-private');
CREATE POLICY iso_guard_anon ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id<>'iso-private') WITH CHECK(bucket_id<>'iso-private');
DO $history$ BEGIN IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261029181500','iso_storage_guard',ARRAY['ISO restrictive storage guards']) ON CONFLICT(version) DO NOTHING;
END IF; END $history$;
NOTIFY pgrst,'reload schema';
COMMIT;
