BEGIN;

ALTER TABLE public.iso_workspaces
  ADD COLUMN client_id uuid UNIQUE REFERENCES public.clients(id);

DO $$
DECLARE target_client uuid;
BEGIN
  -- Confirma um único cadastro antes de gravar o vínculo permanente.
  SELECT c.id INTO STRICT target_client
  FROM public.clients c
  WHERE EXISTS (
    SELECT 1 FROM unnest(ARRAY[c.name, c.trade_name, c.legal_name]) AS n(value)
    WHERE regexp_replace(lower(n.value), '[^a-z0-9]', '', 'g') IN (
      'transpacce', 'transpacceltda', 'transportadoratranspacce', 'transportadoratranspacceltda'
    )
  );
  INSERT INTO public.iso_workspaces (name, client_id) VALUES ('Transpacce ISO', target_client);
EXCEPTION
  WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Confirme o cadastro único da Transpacce antes de ativar o ISO.';
END
$$;

-- O vínculo usado para autorização só pode ser alterado pelos fluxos administrativos.
-- Políticas restritivas também se aplicam quando existe uma regra legada permissiva.
CREATE POLICY iso_client_link_insert_guard ON public.client_user_links
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY iso_client_link_update_guard ON public.client_user_links
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY iso_client_link_delete_guard ON public.client_user_links
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE FUNCTION public.iso_client_workspace_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT w.id
  FROM public.iso_workspaces w
  JOIN public.client_user_links l ON l.client_id = w.client_id
  JOIN auth.users u ON u.id = l.user_id
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE l.user_id = auth.uid()
    AND public.has_role(auth.uid(), 'client'::public.app_role)
    AND coalesce(p.is_active, true)
    AND (u.banned_until IS NULL OR u.banned_until <= now())
$$;

CREATE OR REPLACE FUNCTION public.iso_access(p_workspace uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN w.client_id IS NOT NULL THEN
      CASE WHEN w.id = public.iso_client_workspace_id() THEN 'editor' END
    WHEN public.has_role(auth.uid(), 'client'::public.app_role) THEN NULL
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN 'admin'
    ELSE (SELECT m.access FROM public.iso_members m WHERE m.workspace_id = w.id AND m.user_id = auth.uid())
  END
  FROM public.iso_workspaces w
  WHERE w.id = p_workspace
$$;

CREATE OR REPLACE FUNCTION public.iso_open_workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  workspace_id uuid := 'a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2';
  w public.iso_workspaces;
  access_level text;
BEGIN
  IF public.has_role(auth.uid(), 'client'::public.app_role) THEN
    workspace_id := public.iso_client_workspace_id();
  END IF;
  access_level := public.iso_access(workspace_id);
  IF access_level IS NULL THEN
    RAISE EXCEPTION 'ISO_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT w FROM public.iso_workspaces WHERE id = workspace_id;
  RETURN jsonb_build_object(
    'id', w.id, 'state', w.state, 'revision', w.revision,
    'access', access_level, 'updatedAt', w.updated_at
  );
END
$$;

REVOKE ALL ON FUNCTION public.iso_client_workspace_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iso_client_workspace_id() TO authenticated;

DO $$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
    VALUES ('20261112170000', 'transpacce_iso_workspace', ARRAY['Private ISO workspace bound to the Transpacce portal'])
    ON CONFLICT (version) DO NOTHING;
  END IF;
END
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
