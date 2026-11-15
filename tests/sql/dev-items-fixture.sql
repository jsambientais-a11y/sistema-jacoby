\set ON_ERROR_STOP on
-- Disposable PostgreSQL fixture; run only in a new empty local cluster.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TYPE public.app_role AS ENUM ('admin','collaborator','client');
CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.user_permissions(user_id uuid PRIMARY KEY,permissions text[]);
CREATE TABLE public.client_user_links(user_id uuid,client_id uuid);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION public.has_role(target_user uuid,target_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=target_user AND role=target_role)$$;
CREATE FUNCTION public.has_app_permission(required_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT required_permission NOT IN ('finance','movement_settings') AND (public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=auth.uid() AND required_permission=ANY(permissions)))$$;
CREATE TABLE public.tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,title text,status text DEFAULT 'todo',due_date timestamptz,completed_at timestamptz,deleted_at timestamptz,is_demo boolean DEFAULT false,client_document_request boolean DEFAULT false,client_portal_visible boolean DEFAULT false);
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,type text,title text,body text,is_read boolean DEFAULT false,created_at timestamptz DEFAULT now());
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_notifs_select ON public.notifications FOR SELECT TO authenticated USING(user_id=auth.uid());
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_task_read ON public.tasks FOR SELECT TO authenticated USING(NOT public.has_role(auth.uid(),'client') OR EXISTS(SELECT 1 FROM public.client_user_links WHERE client_id=tasks.client_id AND user_id=auth.uid()));
CREATE TABLE public.billing_v2_cycles(id uuid PRIMARY KEY, status text,is_demo boolean DEFAULT false);
ALTER TABLE public.billing_v2_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_cycle_read ON public.billing_v2_cycles FOR SELECT TO authenticated USING(public.has_app_permission('billing'));
CREATE POLICY fixture_cycle_create ON public.billing_v2_cycles FOR INSERT TO authenticated WITH CHECK(public.has_app_permission('billing') AND status='draft');
CREATE POLICY fixture_cycle_update ON public.billing_v2_cycles FOR UPDATE TO authenticated USING(public.has_app_permission('billing')) WITH CHECK(public.has_app_permission('billing'));
GRANT SELECT,INSERT,UPDATE ON public.billing_v2_cycles TO authenticated;
CREATE TABLE public.billing_v2_cycle_services(id uuid PRIMARY KEY,cycle_id uuid REFERENCES public.billing_v2_cycles(id),invoice_pdf_path text);
CREATE TABLE public.billing_v2_movements(id uuid PRIMARY KEY,cycle_id uuid);
CREATE TABLE public.billing_v2_movement_attachments(movement_id uuid,storage_path text);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_billing_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='movement-documents' AND public.has_app_permission('billing'));
CREATE POLICY fixture_billing_select ON storage.objects FOR SELECT TO authenticated USING(public.has_app_permission('billing'));
CREATE POLICY fixture_billing_update ON storage.objects FOR UPDATE TO authenticated USING(public.has_app_permission('billing')) WITH CHECK(public.has_app_permission('billing'));
CREATE POLICY fixture_billing_delete ON storage.objects FOR DELETE TO authenticated USING(public.has_app_permission('billing'));
GRANT USAGE ON SCHEMA public,auth,storage TO authenticated;
GRANT SELECT ON public.tasks,public.client_user_links,public.notifications TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,8) i;
INSERT INTO public.profiles(id) SELECT id FROM auth.users;
INSERT INTO public.user_roles(user_id,role) SELECT id,CASE WHEN right(id::text,1) IN ('2','3','6','7') THEN 'client'::public.app_role ELSE 'collaborator'::public.app_role END FROM auth.users;
INSERT INTO public.user_permissions VALUES
 ('00000000-0000-4000-8000-000000000004',ARRAY['billing','billing_lock_finalized']),
 ('00000000-0000-4000-8000-000000000005',ARRAY['billing','billing_lock_finalized','billing_append_finalized_invoice']),
 ('00000000-0000-4000-8000-000000000003',ARRAY['billing','billing_lock_finalized','billing_append_finalized_invoice']),
 ('00000000-0000-4000-8000-000000000008',ARRAY['billing_append_finalized_invoice']);
INSERT INTO public.client_user_links VALUES
 ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002');
UPDATE public.profiles SET is_active=false WHERE id='00000000-0000-4000-8000-000000000007';
INSERT INTO public.billing_v2_cycles VALUES('20000000-0000-4000-8000-000000000001','closed',false),('20000000-0000-4000-8000-000000000002','draft',false),('20000000-0000-4000-8000-000000000003','closed',true);
