BEGIN;
-- Opt-in capability only: this migration grants no permission to any account.
CREATE FUNCTION public.can_append_finalized_bulletin_invoice(target_bucket text, target_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE parts text[] := string_to_array(target_path, '/');
BEGIN
  IF auth.uid() IS NULL OR target_bucket <> 'movement-documents'
     OR cardinality(parts) IS DISTINCT FROM 3 OR parts[1] <> 'cycle-invoices'
     OR parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}--[a-z0-9._-]+$'
     OR public.has_role(auth.uid(), 'client'::public.app_role)
     OR NOT public.has_app_permission('billing')
     OR NOT EXISTS (SELECT 1 FROM public.user_permissions access
          WHERE access.user_id = auth.uid() AND 'billing_append_finalized_invoice' = ANY(access.permissions)) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.billing_v2_cycles cycle
    WHERE cycle.id = parts[2]::uuid AND cycle.status = 'closed' AND NOT cycle.is_demo
  ) AND EXISTS (
    SELECT 1 FROM auth.users account LEFT JOIN public.profiles profile ON profile.id = account.id
    WHERE account.id = auth.uid() AND coalesce(profile.is_active, true)
      AND (account.banned_until IS NULL OR account.banned_until <= now())
  );
END $$;
REVOKE ALL ON FUNCTION public.can_append_finalized_bulletin_invoice(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_append_finalized_bulletin_invoice(text,text) TO authenticated;

-- Override only the restrictive INSERT guard. Existing permissive billing policy is still required.
-- UPDATE/DELETE guards, service/finance triggers, publication and email locks remain unchanged.
DROP POLICY IF EXISTS finalized_bulletin_user_file_insert ON storage.objects;
CREATE POLICY finalized_bulletin_user_file_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (CASE WHEN public.can_append_finalized_bulletin_invoice(bucket_id, name) THEN true
    ELSE public.can_change_bulletin_file(bucket_id, name) END);
NOTIFY pgrst, 'reload schema';
COMMIT;
