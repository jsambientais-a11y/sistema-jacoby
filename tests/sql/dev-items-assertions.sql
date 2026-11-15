\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label;END IF;END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
INSERT INTO public.tasks(id,client_id,title) VALUES('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Solicitação fictícia');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM notifications),'internal task creates no notice');
UPDATE tasks SET client_document_request=true,client_portal_visible=true;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM notifications),'active linked logins only');
CREATE TEMP TABLE first_notices AS SELECT id FROM notifications;
UPDATE notifications SET is_read=true;
UPDATE tasks SET title=title,client_document_request=true;
SELECT pg_temp.assert_true((SELECT count(*)=2 AND bool_and(is_read) FROM notifications) AND (SELECT count(*)=2 FROM notifications n JOIN first_notices f USING(id)),'repeat save preserves read state and IDs');
UPDATE tasks SET due_date='2026-11-23 12:00Z';
SELECT pg_temp.assert_true((SELECT count(*)=2 AND bool_and(NOT is_read) FROM notifications),'deadline change replaces notice without duplicates');
UPDATE tasks SET client_id='10000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(user_id='00000000-0000-4000-8000-000000000003') FROM notifications),'client switch removes former client notices');
UPDATE tasks SET client_portal_visible=false;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM notifications),'cancel visibility removes notice');
UPDATE tasks SET client_portal_visible=true,status='done';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM notifications),'completed request not notified');
UPDATE tasks SET status='todo';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM notifications),'reopened request notified');
UPDATE tasks SET deleted_at=now();
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM notifications),'trash cancels notice');
UPDATE tasks SET deleted_at=null,is_demo=true;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM notifications),'demo not notified');
UPDATE tasks SET is_demo=false;
DELETE FROM client_user_links WHERE user_id='00000000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM notifications),'unlinked client cannot read stale notice');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
SELECT pg_temp.assert_true(public.can_append_finalized_bulletin_invoice('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.png'),'scoped append capability');
SELECT pg_temp.assert_true(NOT public.can_append_finalized_bulletin_invoice('movement-documents','service-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.png'),'service path not granted');
SELECT pg_temp.assert_true(NOT public.can_append_finalized_bulletin_invoice('task-attachments','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.png'),'other bucket not granted');
SELECT pg_temp.assert_true(NOT public.can_append_finalized_bulletin_invoice('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000003/40000000-0000-4000-8000-000000000001--nota.png'),'demo not granted');
SELECT pg_temp.assert_true(NOT public.can_append_finalized_bulletin_invoice('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/nested/nota.png'),'nested or invalid path not granted');
SET ROLE authenticated;
INSERT INTO storage.objects(bucket_id,name) VALUES('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.png');
DO $$BEGIN
 BEGIN UPDATE storage.objects SET name=replace(name,'nota.png','outra.png');RAISE EXCEPTION 'FAIL: replacement allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM storage.objects;RAISE EXCEPTION 'FAIL: deletion allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM storage.objects),'append stored, replace/delete blocked');
DO $$BEGIN
 BEGIN UPDATE billing_v2_cycles SET status='draft' WHERE status='closed';RAISE EXCEPTION 'FAIL: reopening allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
SELECT pg_temp.assert_true(NOT public.has_app_permission('finance'),'append does not grant finance');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SET ROLE authenticated;
DO $$BEGIN
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002--negada.png');RAISE EXCEPTION 'FAIL: unapproved append allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true(NOT public.can_append_finalized_bulletin_invoice('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.png'),'client denied even with invalidly assigned flags');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000008',false);
SELECT pg_temp.assert_true(NOT public.can_append_finalized_bulletin_invoice('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.png'),'flag alone does not grant billing');
\echo 'PASS: task document notifications and scoped invoice append SQL integration'

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SET ROLE authenticated;
INSERT INTO public.billing_v2_cycles VALUES('20000000-0000-4000-8000-000000000004','draft',false);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.billing_v2_cycles WHERE id='20000000-0000-4000-8000-000000000004' AND status='draft'),'locked billing collaborator can create a new draft without append permission');
DO $$BEGIN
 BEGIN UPDATE public.billing_v2_cycles SET status='draft' WHERE id='20000000-0000-4000-8000-000000000001';RAISE EXCEPTION 'FAIL: existing closed BM was unlocked';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
RESET ROLE;
\echo 'PASS: operational BM creation remains distinct from finalized invoice append'

-- Apply the exact narrow grant to an existing fictitious collaborator, twice.
-- This exercises idempotency and preservation without using production identities/data.
CREATE TEMP TABLE permissions_before_grant AS
 SELECT permissions FROM public.user_permissions WHERE user_id='00000000-0000-4000-8000-000000000004';
UPDATE public.user_permissions
 SET permissions=CASE WHEN 'billing_append_finalized_invoice'=ANY(permissions)
   THEN permissions ELSE array_append(permissions,'billing_append_finalized_invoice') END
 WHERE user_id='00000000-0000-4000-8000-000000000004';
UPDATE public.user_permissions
 SET permissions=CASE WHEN 'billing_append_finalized_invoice'=ANY(permissions)
   THEN permissions ELSE array_append(permissions,'billing_append_finalized_invoice') END
 WHERE user_id='00000000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true((SELECT access.permissions=before.permissions||ARRAY['billing_append_finalized_invoice']::text[]
 FROM public.user_permissions access CROSS JOIN permissions_before_grant before
 WHERE access.user_id='00000000-0000-4000-8000-000000000004'),'grant adds exactly one capability and remains idempotent');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SET ROLE authenticated;
INSERT INTO storage.objects(bucket_id,name) VALUES('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000004--nova-nota.png');
DO $$BEGIN
 BEGIN UPDATE storage.objects SET name=replace(name,'nova-nota.png','troca.png') WHERE name LIKE '%nova-nota.png';RAISE EXCEPTION 'FAIL: narrow grant allowed replacement';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM storage.objects WHERE name LIKE '%nova-nota.png';RAISE EXCEPTION 'FAIL: narrow grant allowed deletion';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.billing_v2_cycles SET status='draft' WHERE id='20000000-0000-4000-8000-000000000001';RAISE EXCEPTION 'FAIL: narrow grant allowed reopening';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
RESET ROLE;
SELECT pg_temp.assert_true(NOT public.has_app_permission('finance'),'narrow grant still denies finance');
\echo 'PASS: idempotent narrow grant preserves current accesses and finalized-BM restrictions'
