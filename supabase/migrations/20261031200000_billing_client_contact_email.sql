BEGIN;
-- A prévia e a fila usam a mesma fonte; cadastro do cliente não exige login no portal.
CREATE FUNCTION public.billing_portal_email_recipients(target_cycle_id uuid)
RETURNS TABLE(recipient_email text,recipient_user_id uuid,recipient_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
 WITH cycle AS (SELECT client_id,issuer_type,outsourced_company_id FROM public.billing_v2_cycles WHERE id=target_cycle_id),
 candidates AS (
 SELECT lower(trim(u.email::text)) email,u.id user_id,'client'::text kind,1 priority
 FROM cycle c JOIN public.client_user_links l ON l.client_id=c.client_id JOIN auth.users u ON u.id=l.user_id
 UNION ALL
 SELECT lower(trim(v.value)),NULL::uuid,'client'::text,2
 FROM cycle c JOIN public.clients cl ON cl.id=c.client_id
 CROSS JOIN LATERAL regexp_split_to_table(cl.email,'[,;[:space:]]+') v(value)
 UNION ALL
 SELECT lower(trim(v.value)),NULL::uuid,'outsourced'::text,3
 FROM cycle c JOIN public.outsourced_companies co ON co.id=c.outsourced_company_id AND co.active AND c.issuer_type='outsourced'
 CROSS JOIN LATERAL regexp_split_to_table(co.email,'[,;[:space:]]+') v(value)
 )
 SELECT DISTINCT ON (email) email,user_id,kind FROM candidates
 WHERE email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 ORDER BY email,priority,user_id;
$$;
REVOKE ALL ON FUNCTION public.billing_portal_email_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_portal_email_recipients(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.queue_billing_portal_emails(target_cycle_id uuid,target_residue_emission_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE affected integer:=0; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.billing_v2_cycles WHERE id=target_cycle_id) THEN RETURN 0;END IF;
 IF target_residue_emission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.billing_v2_residue_emissions WHERE id=target_residue_emission_id AND cycle_id=target_cycle_id) THEN RAISE EXCEPTION 'Emissão não pertence ao boletim.';END IF;
 -- Mudanças de cadastro não deixam tentativas pendentes para um contato antigo.
 UPDATE public.billing_email_deliveries d SET status='cancelled',last_error=NULL
 WHERE d.cycle_id=target_cycle_id AND d.residue_emission_id IS NOT DISTINCT FROM target_residue_emission_id AND d.status IN ('pending','failed')
 AND NOT EXISTS(SELECT 1 FROM public.billing_portal_email_recipients(target_cycle_id) r WHERE r.recipient_email=lower(trim(d.recipient_email)));
 INSERT INTO public.billing_email_deliveries(delivery_key,cycle_id,residue_emission_id,recipient_user_id,recipient_email,recipient_type)
 SELECT COALESCE((SELECT d.delivery_key FROM public.billing_email_deliveries d WHERE d.cycle_id=target_cycle_id AND d.residue_emission_id IS NOT DISTINCT FROM target_residue_emission_id AND lower(trim(d.recipient_email))=r.recipient_email ORDER BY d.created_at LIMIT 1),CASE WHEN target_residue_emission_id IS NULL THEN 'cycle:'||target_cycle_id::text ELSE 'residue:'||target_residue_emission_id::text END
 ||CASE WHEN r.recipient_user_id IS NOT NULL THEN ':user:'||r.recipient_user_id::text
 WHEN r.recipient_type='outsourced' THEN ':outsourced:'||(SELECT outsourced_company_id::text FROM public.billing_v2_cycles WHERE id=target_cycle_id)||':email:'||md5(r.recipient_email)
 ELSE ':client-contact:email:'||md5(r.recipient_email) END),
 target_cycle_id,target_residue_emission_id,r.recipient_user_id,r.recipient_email,r.recipient_type
 FROM public.billing_portal_email_recipients(target_cycle_id) r
 WHERE NOT EXISTS(SELECT 1 FROM public.billing_email_deliveries d WHERE d.cycle_id=target_cycle_id AND d.residue_emission_id IS NOT DISTINCT FROM target_residue_emission_id AND lower(trim(d.recipient_email))=r.recipient_email AND d.status IN ('pending','sending','sent'))
 ON CONFLICT(delivery_key) DO UPDATE SET recipient_email=EXCLUDED.recipient_email,recipient_user_id=EXCLUDED.recipient_user_id,recipient_type=EXCLUDED.recipient_type,
 status=CASE WHEN billing_email_deliveries.status IN ('cancelled','failed') THEN 'pending' ELSE billing_email_deliveries.status END,
 next_attempt_at=CASE WHEN billing_email_deliveries.status IN ('cancelled','failed') THEN now() ELSE billing_email_deliveries.next_attempt_at END,
 last_error=CASE WHEN billing_email_deliveries.status IN ('cancelled','failed') THEN NULL ELSE billing_email_deliveries.last_error END;
 GET DIAGNOSTICS affected=ROW_COUNT;RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.queue_billing_portal_emails(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_billing_portal_emails(uuid,uuid) TO service_role;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031200000','billing_client_contact_email',ARRAY['Unify preview and delivery recipients including client registration email, with deduplication']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
