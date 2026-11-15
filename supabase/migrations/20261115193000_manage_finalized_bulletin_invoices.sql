BEGIN;
CREATE FUNCTION public.can_manage_finalized_bulletin_invoices(target_cycle uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.has_app_permission('billing') AND NOT public.has_role(auth.uid(),'client'::public.app_role)
 AND EXISTS(SELECT 1 FROM public.user_permissions p WHERE p.user_id=auth.uid() AND 'billing_manage_finalized_invoices'=ANY(p.permissions))
 AND EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=auth.uid() AND p.is_active AND (u.banned_until IS NULL OR u.banned_until<=now()))
 AND EXISTS(SELECT 1 FROM public.billing_v2_cycles c WHERE c.id=target_cycle AND c.status='closed' AND NOT c.is_demo);
$$;
CREATE FUNCTION public.finalized_invoice_path_cycle(target_path text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE parts text[]:=string_to_array(target_path,'/'); resolved_cycle uuid;
BEGIN
 IF cardinality(parts) IS DISTINCT FROM 3 OR parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR coalesce(parts[3],'')='' THEN RETURN NULL; END IF;
 IF parts[1]='cycle-invoices' THEN resolved_cycle:=parts[2]::uuid;
 ELSIF parts[1]='service-invoices' THEN SELECT s.cycle_id INTO resolved_cycle FROM public.billing_v2_cycle_services s WHERE s.id=parts[2]::uuid;
 ELSE RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.billing_v2_cycle_services s WHERE s.invoice_pdf_path=target_path AND s.cycle_id IS DISTINCT FROM resolved_cycle)
 OR EXISTS(SELECT 1 FROM public.billing_v2_movement_attachments a WHERE a.storage_path=target_path) THEN RETURN NULL; END IF;
 RETURN resolved_cycle;
END $$;
CREATE FUNCTION public.can_manage_finalized_invoice_file(target_bucket text,target_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT target_bucket='movement-documents' AND public.can_manage_finalized_bulletin_invoices(public.finalized_invoice_path_cycle(target_path));
$$;
REVOKE ALL ON FUNCTION public.can_manage_finalized_bulletin_invoices(uuid),public.finalized_invoice_path_cycle(text),public.can_manage_finalized_invoice_file(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_finalized_bulletin_invoices(uuid),public.can_manage_finalized_invoice_file(text,text) TO authenticated;
DROP POLICY finalized_bulletin_user_file_insert ON storage.objects;
CREATE POLICY finalized_bulletin_user_file_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(CASE WHEN public.can_manage_finalized_invoice_file(bucket_id,name) OR public.can_append_finalized_bulletin_invoice(bucket_id,name) THEN true ELSE public.can_change_bulletin_file(bucket_id,name) END);
DROP POLICY finalized_bulletin_user_file_delete ON storage.objects;
CREATE POLICY finalized_bulletin_user_file_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(CASE WHEN public.can_manage_finalized_invoice_file(bucket_id,name) THEN true ELSE public.can_change_bulletin_file(bucket_id,name) END);
CREATE OR REPLACE FUNCTION public.guard_finalized_bulletin_user_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_cycle uuid;new_cycle uuid; old_row jsonb;new_row jsonb;
BEGIN

 IF TG_TABLE_NAME='billing_v2_cycle_services' AND TG_OP='UPDATE' THEN
   IF public.can_manage_finalized_bulletin_invoices(OLD.cycle_id)
   AND (to_jsonb(NEW)-ARRAY['invoice_pdf_path','invoice_pdf_name','updated_at'])=(to_jsonb(OLD)-ARRAY['invoice_pdf_path','invoice_pdf_name','updated_at'])
   AND (NEW.invoice_pdf_path IS NULL OR (
     public.finalized_invoice_path_cycle(NEW.invoice_pdf_path)=OLD.cycle_id AND EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='movement-documents' AND name=NEW.invoice_pdf_path)))
   AND (OLD.invoice_pdf_path IS NULL OR public.finalized_invoice_path_cycle(OLD.invoice_pdf_path)=OLD.cycle_id)
   THEN RETURN NEW; END IF;
 END IF;
 IF NOT public.has_finalized_bulletin_lock() THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='billing_v2_cycles' THEN
   IF old_row->>'status'='closed' THEN
     RAISE EXCEPTION 'Seu acesso permite somente consulta de BMs finalizados. Você pode editar os BMs abertos.' USING ERRCODE='42501';
   END IF;
 ELSIF TG_TABLE_NAME='billing_v2_movement_attachments' THEN
   SELECT cycle_id INTO old_cycle FROM public.billing_v2_movements WHERE id=(old_row->>'movement_id')::uuid;
   SELECT cycle_id INTO new_cycle FROM public.billing_v2_movements WHERE id=(new_row->>'movement_id')::uuid;
 ELSE
   old_cycle:=(old_row->>'cycle_id')::uuid;new_cycle:=(new_row->>'cycle_id')::uuid;
 END IF;
 PERFORM public.assert_bulletin_user_editable(old_cycle);
 IF new_cycle IS DISTINCT FROM old_cycle THEN PERFORM public.assert_bulletin_user_editable(new_cycle);END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
