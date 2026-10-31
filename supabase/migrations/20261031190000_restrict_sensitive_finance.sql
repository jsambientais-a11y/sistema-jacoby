BEGIN;
-- Não muda a permissão billing: ela continua alimentando Boletim de Medição.
CREATE FUNCTION public.can_access_sensitive_finance() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IN ('b2f6e43d-ce24-4de2-a770-0548793cc180'::uuid,'9f04a62f-dba4-4cbb-918d-96e848ab0c16'::uuid)
 AND public.has_role(auth.uid(),'admin'::public.app_role)
 AND NOT public.has_role(auth.uid(),'client'::public.app_role)
$$;
REVOKE ALL ON FUNCTION public.can_access_sensitive_finance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_sensitive_finance() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.has_app_permission(required_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN required_permission IN ('finance','movement_settings') THEN public.can_access_sensitive_finance()
 ELSE public.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=auth.uid() AND required_permission=ANY(permissions)) END
$$;
-- Políticas restritivas impedem que permissões antigas ou um novo administrador
-- liberem as áreas financeiras por outra política permissiva.
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['enterprise_finance_accounts','finance_cost_centers','finance_bank_accounts','finance_receipt_details','billing_receivable_tracking','outsourced_movement_commissions','outsourced_commission_settings','outsourced_treatment_commission_rates','outsourced_commission_templates','outsourced_treatment_commission_template_rates'] LOOP
 EXECUTE format('CREATE POLICY sensitive_finance_owners_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_sensitive_finance()) WITH CHECK (public.can_access_sensitive_finance())',t);
 END LOOP;
 -- Catálogos podem continuar sendo lidos para lançar BMs. Alterações exigem
 -- acesso a Configurações de movimentação, mesmo se houver política admin antiga.
 FOREACH t IN ARRAY ARRAY['waste_equipment','waste_equipment_options','waste_residues','waste_residue_types','waste_services','waste_client_billing_settings','waste_client_service_rates','waste_client_service_rate_overrides'] LOOP
 EXECUTE format('CREATE POLICY movement_config_insert_owner ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_access_sensitive_finance())',t);
 EXECUTE format('CREATE POLICY movement_config_update_owner ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_access_sensitive_finance()) WITH CHECK (public.can_access_sensitive_finance())',t);
 EXECUTE format('CREATE POLICY movement_config_delete_owner ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_access_sensitive_finance())',t);
 END LOOP;
END $$;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031190000','restrict_sensitive_finance',ARRAY['Restrict finance and movement settings to confirmed Juliana and Reinan account IDs; preserve operational billing access']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
