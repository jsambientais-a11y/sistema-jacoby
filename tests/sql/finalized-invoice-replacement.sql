\set ON_ERROR_STOP on
ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
INSERT INTO storage.objects(bucket_id,name) VALUES('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.pdf');
UPDATE public.user_permissions SET permissions=array_append(permissions,'billing_replace_finalized_invoice') WHERE user_id='00000000-0000-4000-8000-000000000005';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
SET ROLE authenticated;
DO $$BEGIN
 IF NOT public.can_replace_finalized_bulletin_invoice('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.pdf') THEN RAISE EXCEPTION 'replacement blocked'; END IF;
 UPDATE storage.objects SET metadata='{"replaced":true}' WHERE bucket_id='movement-documents';
 IF NOT FOUND THEN RAISE EXCEPTION 'No replacement'; END IF;
 BEGIN UPDATE storage.objects SET name='cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--other.pdf'; RAISE EXCEPTION 'Rename allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM storage.objects; RAISE EXCEPTION 'Delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE billing_v2_cycles SET status='draft' WHERE id='20000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Reopen allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SET ROLE authenticated;
DO $$BEGIN
 IF public.can_replace_finalized_bulletin_invoice('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001--nota.pdf') THEN RAISE EXCEPTION 'Other account permitted'; END IF;
 BEGIN UPDATE storage.objects SET metadata='{}'; RAISE EXCEPTION 'Other account replaced'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: replacement only; rename/delete/reopen and other account blocked';
