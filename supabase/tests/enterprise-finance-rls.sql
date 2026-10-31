-- Homologação transacional: não deixa contas fictícias nem altera BMs.
BEGIN;
SET LOCAL statement_timeout='12s';
CREATE TEMP TABLE finance_test_context AS SELECT
 (SELECT user_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1) AS admin_id,
 (SELECT user_id FROM public.user_roles WHERE role='client' ORDER BY user_id LIMIT 1) AS client_id,
 (SELECT count(*) FROM public.billing_v2_cycles) AS cycles,
 (SELECT count(*) FROM public.billing_receivable_tracking) AS tracking;
GRANT SELECT ON finance_test_context TO authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT admin_id::text FROM finance_test_context),true);
SET LOCAL ROLE authenticated;
DO $$DECLARE row_id uuid; current_row public.enterprise_finance_accounts; BEGIN
 INSERT INTO public.enterprise_finance_accounts(kind,description,amount_cents,due_on) VALUES('payable','Homologação transacional — não persistir',150000,current_date) RETURNING id INTO row_id;
 UPDATE public.enterprise_finance_accounts SET settled_on=current_date WHERE id=row_id;
 SELECT * INTO current_row FROM public.enterprise_finance_accounts WHERE id=row_id;
 IF current_row.amount_cents<>150000 OR current_row.settled_on<>current_date OR current_row.created_by<>auth.uid() THEN RAISE EXCEPTION 'Save/settle failed';END IF;
 UPDATE public.enterprise_finance_accounts SET settled_on=null,description='Homologação editada',deleted_at=now() WHERE id=row_id;
 SELECT * INTO current_row FROM public.enterprise_finance_accounts WHERE id=row_id;
 IF current_row.deleted_at IS NULL OR current_row.settled_on IS NOT NULL THEN RAISE EXCEPTION 'Soft delete/reopen failed';END IF;
 UPDATE public.enterprise_finance_accounts SET deleted_at=null WHERE id=row_id;
 BEGIN INSERT INTO public.enterprise_finance_accounts(kind,description,amount_cents,due_on) VALUES('payable','Inválido',-100,current_date);RAISE EXCEPTION 'Negative amount accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN UPDATE public.enterprise_finance_accounts SET settled_on=current_date+1 WHERE id=row_id;RAISE EXCEPTION 'Future settlement accepted';EXCEPTION WHEN check_violation THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT client_id::text FROM finance_test_context),true);
DO $$BEGIN
 IF (SELECT count(*) FROM public.enterprise_finance_accounts)<>0 THEN RAISE EXCEPTION 'Client reads internal finance';END IF;
 BEGIN INSERT INTO public.enterprise_finance_accounts(kind,description,amount_cents,due_on) VALUES('receivable','Cliente não autorizado',100,current_date);RAISE EXCEPTION 'Client wrote finance';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
DO $$BEGIN
 IF (SELECT count(*) FROM public.enterprise_finance_accounts)<>0 THEN RAISE EXCEPTION 'Unprivileged account reads finance';END IF;
 BEGIN INSERT INTO public.enterprise_finance_accounts(kind,description,amount_cents,due_on) VALUES('payable','Sem autorização',100,current_date);RAISE EXCEPTION 'Unprivileged account wrote finance';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$BEGIN IF (SELECT cycles FROM finance_test_context)<>(SELECT count(*) FROM public.billing_v2_cycles) OR (SELECT tracking FROM finance_test_context)<>(SELECT count(*) FROM public.billing_receivable_tracking) THEN RAISE EXCEPTION 'Billing data changed';END IF;END $$;
ROLLBACK;
SELECT 'PASS: CRUD/baixa/exclusão recuperável/validação/RLS; faturamento preservado' AS result;
