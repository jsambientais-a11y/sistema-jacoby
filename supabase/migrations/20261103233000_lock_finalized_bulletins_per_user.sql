-- Optional restriction: keeps existing areas and open-BM editing unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.has_finalized_bulletin_lock()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=auth.uid() AND 'billing_lock_finalized'=ANY(permissions));
$$;
REVOKE ALL ON FUNCTION public.has_finalized_bulletin_lock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_finalized_bulletin_lock() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.assert_bulletin_user_editable(target_cycle uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_status text;
BEGIN
 IF NOT public.has_finalized_bulletin_lock() OR target_cycle IS NULL THEN RETURN; END IF;
 -- Shares the parent row lock with finalization: a concurrent edit cannot
 -- race with a transition to closed.
 SELECT status INTO current_status FROM public.billing_v2_cycles WHERE id=target_cycle FOR UPDATE;
 IF current_status='closed' THEN
   RAISE EXCEPTION 'Seu acesso permite somente consulta de BMs finalizados. Você pode editar os BMs abertos.' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_bulletin_user_editable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_bulletin_user_editable(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_finalized_bulletin_user_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_cycle uuid;new_cycle uuid; old_row jsonb;new_row jsonb;
BEGIN
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
REVOKE ALL ON FUNCTION public.guard_finalized_bulletin_user_changes() FROM PUBLIC;

DO $$DECLARE item record;BEGIN
 FOR item IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name)
 WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND
 ((c.column_name='cycle_id' AND (c.table_name LIKE 'billing_v2_%' OR c.table_name LIKE 'billing_email_%'))
 OR (c.table_name='billing_v2_cycles' AND c.column_name='id')
 OR (c.table_name='billing_v2_movement_attachments' AND c.column_name='movement_id'))
 LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS guard_finalized_bulletin_user_changes ON public.%I',item.table_name);
 EXECUTE format('CREATE TRIGGER guard_finalized_bulletin_user_changes BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_bulletin_user_changes()',item.table_name);
 END LOOP;
END $$;

-- Storage paths are also checked, so files cannot be changed behind the UI.
CREATE OR REPLACE FUNCTION public.can_change_bulletin_file(target_bucket text,target_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE first_part text:=split_part(target_path,'/',1); second_part text:=split_part(target_path,'/',2); target_cycle uuid; item record;
BEGIN
 IF NOT public.has_finalized_bulletin_lock() OR target_bucket<>'movement-documents' THEN RETURN true;END IF;
 IF first_part='cycle-invoices' AND second_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
 target_cycle:=second_part::uuid;
 ELSIF first_part='service-invoices' AND second_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
 SELECT cycle_id INTO target_cycle FROM public.billing_v2_cycle_services WHERE id=second_part::uuid;
 ELSIF first_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
 SELECT cycle_id INTO target_cycle FROM public.billing_v2_movements WHERE id=first_part::uuid;
 END IF;
 PERFORM public.assert_bulletin_user_editable(target_cycle);
 FOR item IN
 SELECT m.cycle_id FROM public.billing_v2_movement_attachments a JOIN public.billing_v2_movements m ON m.id=a.movement_id WHERE a.storage_path=target_path
 UNION SELECT cycle_id FROM public.billing_v2_cycle_services WHERE invoice_pdf_path=target_path
 LOOP PERFORM public.assert_bulletin_user_editable(item.cycle_id);END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.can_change_bulletin_file(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_change_bulletin_file(text,text) TO authenticated,service_role;
DROP POLICY IF EXISTS finalized_bulletin_user_file_insert ON storage.objects;
DROP POLICY IF EXISTS finalized_bulletin_user_file_update ON storage.objects;
DROP POLICY IF EXISTS finalized_bulletin_user_file_delete ON storage.objects;
CREATE POLICY finalized_bulletin_user_file_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.can_change_bulletin_file(bucket_id,name));
CREATE POLICY finalized_bulletin_user_file_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.can_change_bulletin_file(bucket_id,name)) WITH CHECK(public.can_change_bulletin_file(bucket_id,name));
CREATE POLICY finalized_bulletin_user_file_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(public.can_change_bulletin_file(bucket_id,name));
NOTIFY pgrst,'reload schema';
COMMIT;
