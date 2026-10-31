BEGIN;
CREATE TEMP TABLE restricted_context AS SELECT (SELECT count(*) FROM public.billing_v2_cycles) cycles, (SELECT count(*) FROM public.billing_receivable_tracking) tracking;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='b2f6e43d-ce24-4de2-a770-0548793cc180' AND email='jacoby@master.com') OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id='9f04a62f-dba4-4cbb-918d-96e848ab0c16' AND email='reinan3323@gmail.com') THEN RAISE EXCEPTION 'Target account mismatch';END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','b2f6e43d-ce24-4de2-a770-0548793cc180',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN
 IF NOT public.has_app_permission('finance') OR NOT public.has_app_permission('movement_settings') THEN RAISE EXCEPTION 'Juliana locked out';END IF;
 INSERT INTO public.enterprise_finance_accounts(kind,description,amount_cents,due_on) VALUES('payable','Atrasado teste transacional rollback',10000,current_date-3);
 IF NOT EXISTS(SELECT 1 FROM public.enterprise_finance_accounts WHERE description='Atrasado teste transacional rollback' AND settled_on IS NULL AND due_on<current_date) THEN RAISE EXCEPTION 'Owner cannot see overdue payables';END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','9f04a62f-dba4-4cbb-918d-96e848ab0c16',true);
DO $$BEGIN IF NOT public.has_app_permission('finance') OR NOT public.has_app_permission('movement_settings') THEN RAISE EXCEPTION 'Reinan locked out';END IF;IF NOT EXISTS(SELECT 1 FROM public.enterprise_finance_accounts WHERE description='Atrasado teste transacional rollback') THEN RAISE EXCEPTION 'Reinan cannot read finance';END IF;END $$;
RESET ROLE;
-- Testa todos os usuários reais, inclusive clientes e equipe com billing.
DO $$DECLARE u record; expected_billing boolean; t text; n bigint; BEGIN
 FOR u IN SELECT id FROM auth.users WHERE id NOT IN ('b2f6e43d-ce24-4de2-a770-0548793cc180','9f04a62f-dba4-4cbb-918d-96e848ab0c16') LOOP
 PERFORM set_config('request.jwt.claim.sub',u.id::text,true);
 expected_billing:=public.has_role(u.id,'admin'::public.app_role) OR EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=u.id AND 'billing'=ANY(permissions));
 SET LOCAL ROLE authenticated;
 IF public.has_app_permission('finance') OR public.has_app_permission('movement_settings') THEN RAISE EXCEPTION 'Restricted access allowed to %',u.id;END IF;
 IF public.has_app_permission('billing') IS DISTINCT FROM expected_billing THEN RAISE EXCEPTION 'Operational BM permission changed';END IF;
 FOREACH t IN ARRAY ARRAY['enterprise_finance_accounts','finance_cost_centers','finance_bank_accounts','finance_receipt_details','billing_receivable_tracking','outsourced_movement_commissions','outsourced_commission_settings'] LOOP
 EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;IF n<>0 THEN RAISE EXCEPTION 'Financial read leak on % for %',t,u.id;END IF;
 END LOOP;
 BEGIN INSERT INTO public.enterprise_finance_accounts(kind,description,amount_cents,due_on) VALUES('payable','Bloqueado',100,current_date);RAISE EXCEPTION 'Unauthorized financial write';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO public.waste_equipment_options(option_type,name) VALUES('vehicle_model','Bloqueado');RAISE EXCEPTION 'Unauthorized config write';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 END LOOP;
END $$;
-- Mesmo outro admin não entra por bypass da política antiga.
INSERT INTO public.user_roles(user_id,role) VALUES('a6fd10de-33d6-45c3-b423-9290dad107ea','admin') ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claim.sub','a6fd10de-33d6-45c3-b423-9290dad107ea',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN IF public.has_app_permission('finance') OR public.has_app_permission('movement_settings') OR EXISTS(SELECT 1 FROM public.enterprise_finance_accounts) THEN RAISE EXCEPTION 'Another admin bypassed owner restriction';END IF;END $$;
RESET ROLE;
DO $$BEGIN IF (SELECT cycles FROM restricted_context)<>(SELECT count(*) FROM public.billing_v2_cycles) OR (SELECT tracking FROM restricted_context)<>(SELECT count(*) FROM public.billing_receivable_tracking) THEN RAISE EXCEPTION 'Billing data changed';END IF;END $$;
ROLLBACK;
SELECT 'PASS: Juliana/Reinan liberados; demais contas bloqueadas; outro admin não contorna; Boletim preservado; rollback completo' result;
