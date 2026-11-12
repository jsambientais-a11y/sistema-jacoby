-- Execute após iso-bootstrap-local.sql, as migrações ISO e o cadastro fictício da Transpacce.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('20000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('20000000-0000-4000-8000-000000000002', 'transpacce@example.test'),
  ('20000000-0000-4000-8000-000000000003', 'outro-cliente@example.test'),
  ('20000000-0000-4000-8000-000000000004', 'equipe-transpacce@example.test');
INSERT INTO public.user_roles VALUES
  ('20000000-0000-4000-8000-000000000001', 'admin'),
  ('20000000-0000-4000-8000-000000000002', 'client'),
  ('20000000-0000-4000-8000-000000000003', 'client'),
  ('20000000-0000-4000-8000-000000000004', 'client');
INSERT INTO public.client_user_links VALUES
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001');

CREATE TEMP TABLE transpacce_fixture AS
SELECT id, null::jsonb AS state FROM public.iso_workspaces
WHERE client_id = '10000000-0000-4000-8000-000000000001';
GRANT SELECT ON transpacce_fixture TO authenticated;
UPDATE transpacce_fixture SET state = :'fixture'::jsonb;

INSERT INTO storage.objects(bucket_id,name)
VALUES ('iso-private','a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2/internal-file');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
DO $$
DECLARE w uuid; doc jsonb;
BEGIN
  SELECT id, state INTO STRICT w, doc FROM transpacce_fixture;
  IF public.iso_client_workspace_id() IS DISTINCT FROM w
    OR public.iso_open_workspace()->>'id' IS DISTINCT FROM w::text
    OR public.iso_open_workspace()->>'access' IS DISTINCT FROM 'editor' THEN
    RAISE EXCEPTION 'A conta Transpacce não abriu seu ISO de edição';
  END IF;
  IF public.iso_access('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2') IS NOT NULL THEN
    RAISE EXCEPTION 'Cliente recebeu acesso ao ISO interno';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='iso-private') THEN
    RAISE EXCEPTION 'Cliente leu anexo interno';
  END IF;
  INSERT INTO storage.objects(bucket_id,name) VALUES ('iso-private',w::text||'/evidence-test');
  doc := jsonb_set(doc,'{audits,0,files}',
    jsonb_build_array(jsonb_build_object('id','evidence-test','name','evidencia.txt','size',4,
      'type','text/plain','ownerId',doc#>>'{audits,0,id}','addedAt','2026-11-12')));
  IF public.iso_save_workspace(w,0,doc) <> 1 THEN RAISE EXCEPTION 'Gravação falhou'; END IF;
  IF public.iso_open_workspace()#>>'{state,audits,0,files,0,id}' IS DISTINCT FROM 'evidence-test' THEN
    RAISE EXCEPTION 'Anexo não foi vinculado à auditoria';
  END IF;
  BEGIN
    PERFORM public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',0,doc);
    RAISE EXCEPTION 'Cliente gravou no ISO interno';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
DO $$
BEGIN
  IF public.iso_open_workspace()#>>'{state,audits,0,files,0,id}' IS DISTINCT FROM 'evidence-test'
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='iso-private') <> 1 THEN
    RAISE EXCEPTION 'Outra conta da mesma empresa não recebeu as auditorias e anexos';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
DO $$
DECLARE w uuid;
BEGIN
  SELECT id INTO STRICT w FROM transpacce_fixture;
  IF public.iso_client_workspace_id() IS NOT NULL OR public.iso_access(w) IS NOT NULL
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='iso-private') THEN
    RAISE EXCEPTION 'Outro cliente recebeu dados da Transpacce';
  END IF;
  BEGIN
    PERFORM public.iso_open_workspace();
    RAISE EXCEPTION 'Outro cliente abriu ISO diretamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.client_user_links
    SET client_id = '10000000-0000-4000-8000-000000000001'
    WHERE user_id=auth.uid();
  IF FOUND THEN RAISE EXCEPTION 'Outro cliente modificou seu próprio vínculo'; END IF;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name) VALUES ('iso-private',w::text||'/unauthorized');
    RAISE EXCEPTION 'Outro cliente enviou anexo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
DO $$
BEGIN
  IF public.iso_open_workspace()->>'id' IS DISTINCT FROM 'a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2'
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='iso-private') <> 1 THEN
    RAISE EXCEPTION 'ISO interno foi alterado ou recebeu arquivo da Transpacce';
  END IF;
END $$;

RESET ROLE;
UPDATE auth.users SET banned_until = now() + interval '1 day'
WHERE id = '20000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
DO $$
BEGIN
  IF public.iso_client_workspace_id() IS NOT NULL
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='iso-private') THEN
    RAISE EXCEPTION 'Conta bloqueada conservou acesso';
  END IF;
END $$;

ROLLBACK;
