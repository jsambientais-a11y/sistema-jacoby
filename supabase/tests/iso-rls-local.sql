BEGIN;
INSERT INTO auth.users(id,email) VALUES
('00000000-0000-0000-0000-000000000001','admin@test.invalid'),
('00000000-0000-0000-0000-000000000002','editor@test.invalid'),
('00000000-0000-0000-0000-000000000003','viewer@test.invalid'),
('00000000-0000-0000-0000-000000000004','client@test.invalid'),
('00000000-0000-0000-0000-000000000005','outsider@test.invalid');
INSERT INTO public.user_roles VALUES
('00000000-0000-0000-0000-000000000001','admin'),
('00000000-0000-0000-0000-000000000004','client');
CREATE TEMP TABLE iso_test_state(state jsonb);
GRANT SELECT ON iso_test_state TO authenticated,anon;
INSERT INTO iso_test_state VALUES ('{
  "audits": [
    {
      "id": "audit-test",
      "name": "Teste automatizado ISO",
      "organization": "Empresa fictícia",
      "scheduledFor": "",
      "type": "Interna",
      "standards": [],
      "scope": "",
      "objective": "",
      "processes": "",
      "statuses": {},
      "criteria": "",
      "auditorRole": "Auditor líder",
      "hours": "0",
      "schedule": [],
      "auditees": [],
      "room": "",
      "ppe": "",
      "escort": "",
      "logistics": "",
      "selectedQuestions": [],
      "notes": {},
      "answers": {},
      "evidenceRecords": [],
      "ncs": [],
      "plans": [],
      "files": []
    }
  ],
  "selectedId": "audit-test",
  "questions": [],
  "evidence": [],
  "customNcs": [],
  "prompts": [],
  "processes": [],
  "criteria": [],
  "favorites": [],
  "archivedIds": [],
  "archivedAuditIds": [],
  "filters": [],
  "activity": [],
  "auditorName": ""
}
'::jsonb);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT public.iso_set_member('editor@test.invalid','editor');
SELECT public.iso_set_member('viewer@test.invalid','viewer');
DO $$BEGIN
 IF public.iso_open_workspace()->>'access'<>'admin' THEN RAISE EXCEPTION 'admin access failed'; END IF;
 BEGIN PERFORM public.iso_set_member('client@test.invalid','editor');RAISE EXCEPTION 'client grant allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ISO_CLIENT_NOT_ALLOWED' THEN RAISE; END IF; END;
 BEGIN PERFORM state FROM public.iso_workspaces;RAISE EXCEPTION 'direct state read allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.iso_workspaces SET state='{}';RAISE EXCEPTION 'direct write allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
DO $$BEGIN
 BEGIN PERFORM public.iso_open_workspace();RAISE EXCEPTION 'outsider allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.iso_set_member('outsider@test.invalid','editor');RAISE EXCEPTION 'self grant allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
DO $$BEGIN
 BEGIN PERFORM public.iso_open_workspace();RAISE EXCEPTION 'client allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $$BEGIN
 IF public.iso_open_workspace()->>'access'<>'viewer' THEN RAISE EXCEPTION 'viewer read failed'; END IF;
 BEGIN PERFORM public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',0,(SELECT state FROM iso_test_state));RAISE EXCEPTION 'viewer wrote state';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('iso-private','a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2/file-test');RAISE EXCEPTION 'viewer uploaded';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $$DECLARE revision bigint; s jsonb; BEGIN
 SELECT state INTO s FROM iso_test_state;
 revision:=public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',0,s);
 IF revision<>1 THEN RAISE EXCEPTION 'editor save failed'; END IF;
 BEGIN PERFORM public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',0,s);RAISE EXCEPTION 'stale overwrite allowed';EXCEPTION WHEN serialization_failure THEN NULL;END;
 BEGIN PERFORM public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',1,'{"audits":[{"id":"broken"}]}');RAISE EXCEPTION 'invalid state accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ISO_INVALID_STATE' THEN RAISE;END IF;END;
 BEGIN PERFORM public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',1,jsonb_set(s,'{audits}',(s->'audits')||(s->'audits')));RAISE EXCEPTION 'duplicate audit accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ISO_DUPLICATE_AUDIT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',1,jsonb_set(s,'{audits,0,future}', '{"nested":[{"constructor":{"danger":true}}]}'::jsonb));RAISE EXCEPTION 'nested dangerous data accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ISO_INVALID_STATE' THEN RAISE;END IF;END;
 s:=jsonb_set(s,'{audits,0,files}','[{"id":"file-test","name":"teste.txt","type":"text/plain","size":4,"ownerId":"audit-test","addedAt":"now"}]');
 BEGIN PERFORM public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',1,s);RAISE EXCEPTION 'missing attachment accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ISO_ATTACHMENT_MISSING' THEN RAISE;END IF;END;
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('iso-private','a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2/file-test','{"size":4}');
 revision:=public.iso_save_workspace('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2',1,s);
 IF revision<>2 THEN RAISE EXCEPTION 'attachment link failed'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='iso-private')<>1 THEN RAISE EXCEPTION 'editor cannot read file'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $$BEGIN IF (SELECT count(*) FROM storage.objects WHERE bucket_id='iso-private')<>1 THEN RAISE EXCEPTION 'viewer cannot read file';END IF;END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
DO $$BEGIN IF (SELECT count(*) FROM storage.objects WHERE bucket_id='iso-private')<>0 THEN RAISE EXCEPTION 'client reads file';END IF;END $$;
SET LOCAL ROLE anon;
DO $$BEGIN BEGIN PERFORM public.iso_open_workspace();RAISE EXCEPTION 'anonymous reads ISO';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;
DO $$BEGIN IF (SELECT count(*) FROM public.iso_server_log WHERE action='save')<>2 THEN RAISE EXCEPTION 'server log mismatch';END IF;END $$;
ROLLBACK;
SELECT 'ISO permission, CAS, validation, attachments and server log: PASS' AS result;
