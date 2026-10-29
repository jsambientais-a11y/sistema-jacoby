-- ISO compartilhado. Não altera as tabelas de Gestão nem importa dados de navegadores.
BEGIN;
CREATE TABLE public.iso_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state jsonb,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CHECK (state IS NULL OR (jsonb_typeof(state) = 'object' AND octet_length(state::text) <= 10000000))
);
INSERT INTO public.iso_workspaces(id,name) VALUES ('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2','Jacoby ISO');
CREATE TABLE public.iso_members (
  workspace_id uuid NOT NULL REFERENCES public.iso_workspaces(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  access text NOT NULL CHECK (access IN ('viewer','editor')),
  granted_by uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.iso_server_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.iso_workspaces(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  revision bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.iso_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_server_log ENABLE ROW LEVEL SECURITY;
-- Dados são alterados exclusivamente pelas funções abaixo, com controle de revisão.
REVOKE ALL ON public.iso_workspaces, public.iso_members, public.iso_server_log FROM anon, authenticated;
CREATE FUNCTION public.iso_access(p_workspace uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE
 WHEN auth.uid() IS NULL OR public.has_role(auth.uid(),'client'::public.app_role) THEN NULL
 WHEN public.has_role(auth.uid(),'admin'::public.app_role) THEN 'admin'
 ELSE (SELECT m.access FROM public.iso_members m WHERE m.workspace_id=p_workspace AND m.user_id=auth.uid()) END
$$;
CREATE FUNCTION public.iso_open_workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.iso_workspaces; access_level text;
BEGIN
 SELECT * INTO STRICT w FROM public.iso_workspaces WHERE id='a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2';
 access_level:=public.iso_access(w.id);
 IF access_level IS NULL THEN RAISE EXCEPTION 'ISO_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',w.id,'state',w.state,'revision',w.revision,'access',access_level,'updatedAt',w.updated_at);
END $$;
CREATE FUNCTION public.iso_json_valid(value jsonb, spec jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE k text; child jsonb; variant jsonb; matched boolean;
BEGIN
 IF value IS NULL THEN RETURN false; END IF;
 IF spec ? 'anyOf' THEN
  FOR variant IN SELECT jsonb_array_elements(spec->'anyOf') LOOP IF public.iso_json_valid(value,variant) THEN RETURN true; END IF; END LOOP;
  RETURN false;
 END IF;
 IF spec ? 'type' AND jsonb_typeof(value)<>spec->>'type' THEN RETURN false; END IF;
 IF spec ? 'enum' AND NOT (spec->'enum' @> jsonb_build_array(value)) THEN RETURN false; END IF;
 IF jsonb_typeof(value)='object' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(value) AS x(key) WHERE key IN ('__proto__','prototype','constructor')) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(spec->'required','[]'::jsonb)) x(key) WHERE NOT(value ? key)) THEN RETURN false; END IF;
  FOR k,child IN SELECT * FROM jsonb_each(value) LOOP
   IF spec->'properties' ? k THEN IF NOT public.iso_json_valid(child,spec->'properties'->k) THEN RETURN false; END IF;
   ELSIF jsonb_typeof(spec->'additionalProperties')='object' THEN IF NOT public.iso_json_valid(child,spec->'additionalProperties') THEN RETURN false; END IF;
   ELSIF spec->'additionalProperties'='false'::jsonb THEN RETURN false;
   END IF;
  END LOOP;
 ELSIF jsonb_typeof(value)='array' THEN
  IF spec ? 'minItems' AND jsonb_array_length(value)<(spec->>'minItems')::int THEN RETURN false; END IF;
  FOR child IN SELECT jsonb_array_elements(value) LOOP IF spec ? 'items' AND NOT public.iso_json_valid(child,spec->'items') THEN RETURN false; END IF; END LOOP;
 ELSIF jsonb_typeof(value)='string' THEN
  IF spec ? 'pattern' AND (value#>>'{}') !~ (spec->>'pattern') THEN RETURN false; END IF;
 ELSIF jsonb_typeof(value)='number' THEN
  IF spec ? 'minimum' AND value::text::numeric<(spec->>'minimum')::numeric THEN RETURN false; END IF;
  IF spec ? 'maximum' AND value::text::numeric>(spec->>'maximum')::numeric THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.iso_json_valid(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.iso_state_valid(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $validator$ SELECT public.iso_json_valid(value, '{"type":"object","properties":{"audits":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"organization":{"type":"string"},"scheduledFor":{"type":"string"},"type":{"type":"string"},"standards":{"type":"array","items":{"type":"string"}},"scope":{"type":"string"},"objective":{"type":"string"},"processes":{"type":"string"},"statuses":{"type":"object","additionalProperties":{"enum":["pending","in_progress","done"]}},"criteria":{"type":"string"},"auditorRole":{"type":"string"},"hours":{"type":"string"},"schedule":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"start":{"type":"string"},"end":{"type":"string"},"process":{"type":"string"},"auditee":{"type":"string"},"location":{"type":"string"}},"required":["id","start","end","process","auditee","location"],"additionalProperties":false}},"auditees":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"role":{"type":"string"},"email":{"type":"string"}},"required":["id","name","role","email"],"additionalProperties":false}},"room":{"type":"string"},"ppe":{"type":"string"},"escort":{"type":"string"},"logistics":{"type":"string"},"selectedQuestions":{"type":"array","items":{"type":"string"}},"notes":{"type":"object","additionalProperties":{"type":"string"}},"answers":{"type":"object","additionalProperties":{"type":"object","properties":{"status":{"enum":["pending","conforme","parcial","nao_conforme"]},"observation":{"type":"string"},"evidence":{"type":"string"}},"required":["status","observation","evidence"],"additionalProperties":false}},"evidenceRecords":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"evidenceId":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"title":{"type":"string"},"process":{"type":"string"},"status":{"type":"string"},"reference":{"type":"string"},"observation":{"type":"string"}},"required":["id","evidenceId","standard","clause","title","process","status","reference","observation"],"additionalProperties":false}},"removedNcs":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"title":{"type":"string"},"finding":{"type":"string"},"evidence":{"type":"string"},"classification":{"type":"string"},"cause":{"type":"string"},"action":{"type":"string"},"closingEvidence":{"type":"string"},"status":{"type":"string"},"questionId":{"type":"string"}},"required":["id","standard","clause","title","finding","evidence","classification","cause","action","closingEvidence","status"],"additionalProperties":false}},"removedEvidenceRecords":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"evidenceId":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"title":{"type":"string"},"process":{"type":"string"},"status":{"type":"string"},"reference":{"type":"string"},"observation":{"type":"string"}},"required":["id","evidenceId","standard","clause","title","process","status","reference","observation"],"additionalProperties":false}},"ncs":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"title":{"type":"string"},"finding":{"type":"string"},"evidence":{"type":"string"},"classification":{"type":"string"},"cause":{"type":"string"},"action":{"type":"string"},"closingEvidence":{"type":"string"},"status":{"type":"string"},"questionId":{"type":"string"}},"required":["id","standard","clause","title","finding","evidence","classification","cause","action","closingEvidence","status"],"additionalProperties":false}},"plans":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"ncId":{"anyOf":[{"type":"string"},{"type":"null"}]},"title":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"finding":{"type":"string"},"cause":{"type":"string"},"action":{"type":"string"},"responsible":{"type":"string"},"dueDate":{"type":"string"},"status":{"enum":["Aberto","Em andamento","Concluído"]},"closingEvidence":{"type":"string"},"effectiveness":{"type":"string"},"closedOn":{"type":"string"},"createdAt":{"type":"string"}},"required":["id","ncId","title","standard","clause","finding","cause","action","responsible","dueDate","status","closingEvidence","effectiveness","closedOn","createdAt"],"additionalProperties":false}},"report":{"type":"object","properties":{"unit":{"type":"string"},"startDate":{"type":"string"},"endDate":{"type":"string"},"leadAuditor":{"type":"string"},"team":{"type":"string"},"issuer":{"type":"string"},"methodology":{"type":"string"},"strengths":{"type":"string"},"conclusion":{"type":"string"}},"required":[],"additionalProperties":false},"files":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","pattern":"^[a-zA-Z0-9-]+$"},"name":{"type":"string"},"size":{"type":"number","minimum":0},"type":{"type":"string"},"ownerId":{"type":"string"},"addedAt":{"type":"string"}},"required":["id","name","size","type","ownerId","addedAt"],"additionalProperties":false}}},"required":["id","name","organization","scheduledFor","type","standards","scope","objective","processes","statuses","criteria","auditorRole","hours","schedule","auditees","room","ppe","escort","logistics","selectedQuestions","notes"],"additionalProperties":true},"minItems":1},"selectedId":{"type":"string"},"questions":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"process":{"type":"string"},"question":{"type":"string"},"objective":{"type":"string"},"expected":{"type":"string"},"alert":{"type":"string"},"custom":{"type":"boolean"}},"required":["id","standard","clause","process","question","objective","expected","alert"],"additionalProperties":false}},"evidence":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"title":{"type":"string"},"type":{"type":"string"},"risk":{"type":"string"},"description":{"type":"string"},"example":{"type":"string"},"custom":{"type":"boolean"}},"required":["id","standard","clause","title","type","risk","description","example"],"additionalProperties":false}},"customNcs":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"title":{"type":"string"},"finding":{"type":"string"},"evidence":{"type":"string"},"classification":{"type":"string"},"cause":{"type":"string"},"action":{"type":"string"},"closingEvidence":{"type":"string"},"status":{"type":"string"},"questionId":{"type":"string"}},"required":["id","standard","clause","title","finding","evidence","classification","cause","action","closingEvidence","status"],"additionalProperties":false}},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"standard":{"type":"string"},"clause":{"type":"string"},"process":{"type":"string"},"category":{"type":"string"},"body":{"type":"string"},"tip":{"type":"string"}},"required":["id","title","standard","clause","process","category","body","tip"],"additionalProperties":false}},"processes":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"}},"required":["id","name","description"],"additionalProperties":false}},"criteria":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"}},"required":["id","name","description"],"additionalProperties":false}},"favorites":{"type":"array","items":{"type":"string"}},"archivedIds":{"type":"array","items":{"type":"string"}},"archivedAuditIds":{"type":"array","items":{"type":"string"}},"filters":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"values":{"type":"object","additionalProperties":{"type":"string"}}},"required":["id","name","values"],"additionalProperties":false}},"activity":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"at":{"type":"string"},"auditId":{"anyOf":[{"type":"string"},{"type":"null"}]},"action":{"type":"string"},"detail":{"type":"string"}},"required":["id","at","auditId","action","detail"],"additionalProperties":false}},"auditorName":{"type":"string"}},"required":["audits","selectedId"],"additionalProperties":false}'::jsonb) $validator$;
REVOKE ALL ON FUNCTION public.iso_state_valid(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.iso_save_workspace(p_workspace uuid,p_revision bigint,p_state jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.iso_workspaces; a jsonb; f jsonb; file_id text;
BEGIN
 IF coalesce(public.iso_access(p_workspace),'') NOT IN ('admin','editor') THEN
  RAISE EXCEPTION 'ISO_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_state IS NULL OR NOT public.iso_state_valid(p_state) OR jsonb_typeof(p_state) <> 'object' OR octet_length(p_state::text)>10000000
    OR jsonb_typeof(p_state->'audits') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'ISO_INVALID_STATE'; END IF;
 IF jsonb_array_length(p_state->'audits')=0 THEN RAISE EXCEPTION 'ISO_EMPTY_AUDITS'; END IF;
 SELECT * INTO STRICT w FROM public.iso_workspaces WHERE id=p_workspace FOR UPDATE;
 IF w.revision<>p_revision THEN RAISE EXCEPTION 'ISO_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*)<>count(DISTINCT x->>'id') FROM jsonb_array_elements(p_state->'audits') x) THEN RAISE EXCEPTION 'ISO_DUPLICATE_AUDIT'; END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(p_state->'audits') LOOP
  IF (SELECT count(*)<>count(DISTINCT x->>'id') FROM jsonb_array_elements(coalesce(a->'ncs','[]')) x)
     OR (SELECT count(*)<>count(DISTINCT x->>'id') FROM jsonb_array_elements(coalesce(a->'plans','[]')) x) THEN RAISE EXCEPTION 'ISO_DUPLICATE_RECORD'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(a->'plans','[]')) p WHERE p->>'ncId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(a->'ncs','[]')) n WHERE n->>'id'=p->>'ncId')) THEN RAISE EXCEPTION 'ISO_INVALID_NC_LINK'; END IF;
  IF coalesce(a->>'id','')='' THEN RAISE EXCEPTION 'ISO_INVALID_AUDIT'; END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(coalesce(a->'files','[]'::jsonb)) LOOP
   file_id:=f->>'id';
   IF file_id IS NULL OR file_id !~ '^[a-zA-Z0-9-]+$' OR NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='iso-private'
      AND o.name=p_workspace::text||'/'||file_id
   ) THEN RAISE EXCEPTION 'ISO_ATTACHMENT_MISSING'; END IF;
  END LOOP;
 END LOOP;
 UPDATE public.iso_workspaces SET state=p_state, revision=revision+1, updated_at=now(), updated_by=auth.uid() WHERE id=p_workspace;
 INSERT INTO public.iso_server_log(workspace_id,actor_id,action,revision) VALUES(p_workspace,auth.uid(),'save',w.revision+1);
 RETURN w.revision+1;
END $$;
CREATE FUNCTION public.iso_set_member(p_email text,p_access text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid; wid uuid:='a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2';
BEGIN
 IF public.iso_access(wid) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ISO_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_access NOT IN ('viewer','editor','remove') OR p_access IS NULL THEN RAISE EXCEPTION 'ISO_INVALID_ACCESS'; END IF;
 SELECT id INTO target FROM auth.users WHERE lower(email)=lower(trim(p_email));
 IF target IS NULL THEN RAISE EXCEPTION 'ISO_USER_NOT_FOUND'; END IF;
 IF public.has_role(target,'client'::public.app_role) THEN RAISE EXCEPTION 'ISO_CLIENT_NOT_ALLOWED'; END IF;
 IF p_access='remove' THEN DELETE FROM public.iso_members WHERE workspace_id=wid AND user_id=target;
 ELSE INSERT INTO public.iso_members(workspace_id,user_id,access,granted_by) VALUES(wid,target,p_access,auth.uid())
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET access=excluded.access, granted_by=excluded.granted_by; END IF;
 INSERT INTO public.iso_server_log(workspace_id,actor_id,action) VALUES(wid,auth.uid(),'member:'||target::text||':'||p_access);
END $$;
CREATE FUNCTION public.iso_list_members() RETURNS TABLE(email text,access text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF public.iso_access('a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ISO_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.email::text,m.access FROM public.iso_members m JOIN auth.users u ON u.id=m.user_id
 WHERE m.workspace_id='a6a73a1a-0e7f-44c3-b8ce-2c729570a6e2' ORDER BY u.email;
END $$;
REVOKE ALL ON FUNCTION public.iso_access(uuid), public.iso_open_workspace(), public.iso_save_workspace(uuid,bigint,jsonb),public.iso_set_member(text,text),public.iso_list_members() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iso_access(uuid), public.iso_open_workspace(), public.iso_save_workspace(uuid,bigint,jsonb),public.iso_set_member(text,text),public.iso_list_members() TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('iso-private','iso-private',false,20971520);
CREATE POLICY iso_files_read ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='iso-private' AND EXISTS(SELECT 1 FROM public.iso_workspaces w WHERE w.id::text=split_part(storage.objects.name,'/',1) AND public.iso_access(w.id) IS NOT NULL)
);
-- Sem UPDATE/DELETE: anexos imutáveis; restauração cria novas identidades.
CREATE POLICY iso_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='iso-private' AND name ~ '^[a-f0-9-]{36}/[a-zA-Z0-9-]+$' AND EXISTS(
 SELECT 1 FROM public.iso_workspaces w WHERE w.id::text=split_part(storage.objects.name,'/',1) AND public.iso_access(w.id) IN ('admin','editor'))
);
-- RLS consulta somente a identidade de um espaço; o conteúdo continua inacessível diretamente.
GRANT SELECT(id) ON public.iso_workspaces TO authenticated;
CREATE POLICY iso_workspace_identity ON public.iso_workspaces FOR SELECT TO authenticated USING (public.iso_access(id) IS NOT NULL);
-- Registrar somente esta migração; não executar migrações antigas pendentes.
DO $history$ BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
  VALUES('20261029180000','iso_shared_workspace',ARRAY['ISO shared workspace: tables, revision RPC, private storage and permissions'])
  ON CONFLICT(version) DO NOTHING;
 END IF;
END $history$;
NOTIFY pgrst,'reload schema';
COMMIT;
