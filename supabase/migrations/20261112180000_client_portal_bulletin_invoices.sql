BEGIN;

CREATE FUNCTION public.can_view_portal_bulletin_client(target_client uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE WHEN public.has_role(auth.uid(), 'client'::public.app_role)
    THEN EXISTS (
        SELECT 1 FROM public.client_user_links link
        JOIN auth.users account ON account.id = link.user_id
        LEFT JOIN public.profiles profile ON profile.id = link.user_id
        WHERE link.user_id = auth.uid() AND link.client_id = target_client
          AND coalesce(profile.is_active, true)
          AND (account.banned_until IS NULL OR account.banned_until <= now())
      )
    ELSE public.has_app_permission('billing') END;
$$;
REVOKE ALL ON FUNCTION public.can_view_portal_bulletin_client(uuid) FROM PUBLIC;

-- The attachment belongs to the complete BM, not to a filtered emission.
CREATE FUNCTION public.can_read_portal_bulletin_invoice(target_path text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  parts text[] := string_to_array(target_path, '/');
  target_id uuid;
BEGIN
  IF cardinality(parts) IS DISTINCT FROM 3
     OR parts[1] NOT IN ('cycle-invoices', 'service-invoices')
     OR parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR parts[3] = '' THEN
    RETURN false;
  END IF;

  target_id := parts[2]::uuid;
  IF parts[1] = 'service-invoices' THEN
    SELECT service.cycle_id INTO target_id
    FROM public.billing_v2_cycle_services service
    WHERE service.id = target_id AND service.invoice_pdf_path = target_path;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.billing_v2_cycles cycle
    WHERE cycle.id = target_id AND cycle.status = 'closed' AND cycle.client_portal_visible
      AND public.can_view_portal_bulletin_client(cycle.client_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_read_portal_bulletin_invoice(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_portal_bulletin_invoice(text) TO authenticated;

CREATE POLICY jacoby_portal_published_bulletin_invoice_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'movement-documents' AND public.can_read_portal_bulletin_invoice(name));

-- Legacy Storage policies must not grant broader access to invoice paths.
CREATE POLICY jacoby_portal_bulletin_invoice_scope ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id <> 'movement-documents'
    OR split_part(name, '/', 1) NOT IN ('cycle-invoices', 'service-invoices')
    OR NOT public.has_role(auth.uid(), 'client'::public.app_role)
    OR public.can_read_portal_bulletin_invoice(name)
  );

-- A filtered publication reveals only its own residue. For a full BM use the
-- residues actually included in its PDF (placements and confirmed movements).
CREATE FUNCTION public.jacoby_portal_bulletin_residues(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH visible_cycles AS (
    SELECT id, status = 'closed' AND client_portal_visible AS whole
    FROM public.billing_v2_cycles
    WHERE client_id = p_client_id
      AND public.can_view_portal_bulletin_client(p_client_id)
  ), entries AS (
    SELECT c.id AS cycle_id, p.waste_residue_id, true AS in_full_bm
    FROM visible_cycles c JOIN public.billing_v2_placements p ON p.cycle_id = c.id
    WHERE c.whole
    UNION
    SELECT c.id, m.waste_residue_id, true
    FROM visible_cycles c JOIN public.billing_v2_movements m ON m.cycle_id = c.id
    WHERE c.whole AND m.confirmed
    UNION
    SELECT c.id, e.waste_residue_id, false
    FROM visible_cycles c JOIN public.billing_v2_residue_emissions e ON e.cycle_id = c.id
    WHERE e.client_portal_visible
  ), grouped AS (
    SELECT e.cycle_id,
           jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'inFullBm', e.in_full_bm)
                     ORDER BY r.name, r.id, e.in_full_bm) AS residues
    FROM entries e JOIN public.waste_residues r ON r.id = e.waste_residue_id
    WHERE r.client_id = p_client_id
    GROUP BY e.cycle_id
  )
  SELECT coalesce(jsonb_object_agg(cycle_id, residues), '{}'::jsonb) FROM grouped;
$$;
REVOKE ALL ON FUNCTION public.jacoby_portal_bulletin_residues(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jacoby_portal_bulletin_residues(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
