BEGIN;
CREATE FUNCTION public.can_replace_finalized_bulletin_invoice(target_bucket text,target_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE parts text[]:=string_to_array(target_path,'/'); target_cycle uuid;
BEGIN
 IF auth.uid() IS NULL OR target_bucket IS DISTINCT FROM 'movement-documents'
 OR cardinality(parts) IS DISTINCT FROM 3 OR parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR public.has_role(auth.uid(),'client'::public.app_role) OR NOT public.has_app_permission('billing')
 OR NOT EXISTS(SELECT 1 FROM public.user_permissions p WHERE p.user_id=auth.uid() AND 'billing_replace_finalized_invoice'=ANY(p.permissions))
 OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=auth.uid() AND p.is_active AND (u.banned_until IS NULL OR u.banned_until<=now()))
 THEN RETURN false; END IF;
 IF parts[1]='cycle-invoices' THEN target_cycle:=parts[2]::uuid;
 ELSIF parts[1]='service-invoices' THEN
 SELECT cycle_id INTO target_cycle FROM public.billing_v2_cycle_services WHERE id=parts[2]::uuid AND invoice_pdf_path=target_path;
 ELSE RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.billing_v2_cycles c WHERE c.id=target_cycle AND c.status='closed' AND NOT c.is_demo)
 AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=target_bucket AND o.name=target_path)
 AND NOT EXISTS(SELECT 1 FROM public.billing_v2_cycle_services s WHERE s.invoice_pdf_path=target_path AND s.cycle_id<>target_cycle)
 AND NOT EXISTS(SELECT 1 FROM public.billing_v2_movement_attachments a WHERE a.storage_path=target_path);
END $$;
REVOKE ALL ON FUNCTION public.can_replace_finalized_bulletin_invoice(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_replace_finalized_bulletin_invoice(text,text) TO authenticated;
CREATE POLICY finalized_invoice_scoped_replace ON storage.objects FOR UPDATE TO authenticated
 USING(public.can_replace_finalized_bulletin_invoice(bucket_id,name))
 WITH CHECK(public.can_replace_finalized_bulletin_invoice(bucket_id,name));
DROP POLICY finalized_bulletin_user_file_update ON storage.objects;
CREATE POLICY finalized_bulletin_user_file_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(CASE WHEN public.can_replace_finalized_bulletin_invoice(bucket_id,name) THEN true ELSE public.can_change_bulletin_file(bucket_id,name) END)
 WITH CHECK(CASE WHEN public.can_replace_finalized_bulletin_invoice(bucket_id,name) THEN true ELSE public.can_change_bulletin_file(bucket_id,name) END);
CREATE FUNCTION public.guard_scoped_invoice_file_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.has_finalized_bulletin_lock() AND public.can_replace_finalized_bulletin_invoice(OLD.bucket_id,OLD.name)
 AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id OR NEW.name IS DISTINCT FROM OLD.name) THEN
 RAISE EXCEPTION 'A substituição deve manter o nome e o vínculo do arquivo.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_scoped_invoice_file_identity() FROM PUBLIC;
CREATE TRIGGER guard_scoped_invoice_file_identity BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.guard_scoped_invoice_file_identity();
NOTIFY pgrst,'reload schema';
COMMIT;
