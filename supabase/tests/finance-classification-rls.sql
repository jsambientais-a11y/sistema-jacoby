BEGIN;
CREATE TEMP TABLE classification_context AS SELECT
 (SELECT user_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1) admin_id,
 (SELECT user_id FROM public.user_roles WHERE role='client' ORDER BY user_id LIMIT 1) client_id,
 (SELECT id FROM public.billing_v2_cycles ORDER BY id LIMIT 1) cycle_id,
 (SELECT count(*) FROM public.billing_receivable_tracking) tracking;
GRANT SELECT ON classification_context TO authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT admin_id::text FROM classification_context),true);
SET LOCAL ROLE authenticated;
DO $$DECLARE inc uuid; exp uuid; bank uuid; account uuid; cyc uuid; BEGIN
 INSERT INTO public.finance_cost_centers(name,kind) VALUES('Homologação receita rollback','income') RETURNING id INTO inc;
 INSERT INTO public.finance_cost_centers(name,kind) VALUES('Homologação despesa rollback','expense') RETURNING id INTO exp;
 INSERT INTO public.finance_bank_accounts(name) VALUES('Homologação banco rollback') RETURNING id INTO bank;
 INSERT INTO public.enterprise_finance_accounts(kind,description,amount_cents,due_on,cost_center_id,bank_account_id) VALUES('receivable','Homologação rollback',150000,current_date,inc,bank) RETURNING id INTO account;
 BEGIN UPDATE public.enterprise_finance_accounts SET cost_center_id=exp WHERE id=account;RAISE EXCEPTION 'Expense center accepted for income';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Expense center accepted for income' THEN RAISE;END IF;END;
 SELECT cycle_id INTO cyc FROM classification_context;
 INSERT INTO public.finance_receipt_details(entry_id,cycle_id,cost_center_id,bank_account_id) VALUES(cyc::text||':service:homologacao-rollback',cyc,inc,bank);
 IF NOT EXISTS(SELECT 1 FROM public.finance_receipt_details WHERE entry_id=cyc::text||':service:homologacao-rollback' AND cost_center_id=inc AND bank_account_id=bank) THEN RAISE EXCEPTION 'Receipt classification missing';END IF;
 BEGIN UPDATE public.finance_cost_centers SET kind='expense' WHERE id=inc;RAISE EXCEPTION 'Incompatible kind change allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Incompatible kind change allowed' THEN RAISE;END IF;END;
 UPDATE public.finance_bank_accounts SET active=false WHERE id=bank;
 UPDATE public.finance_cost_centers SET active=false WHERE id=inc;
 UPDATE public.enterprise_finance_accounts SET settled_on=current_date WHERE id=account;
 BEGIN INSERT INTO public.enterprise_finance_accounts(kind,description,amount_cents,due_on,bank_account_id) VALUES('receivable','Inválido',100,current_date,bank);RAISE EXCEPTION 'Inactive bank accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Inactive bank accepted' THEN RAISE;END IF;END;
 BEGIN INSERT INTO public.finance_cost_centers(name,kind) VALUES(' HOMOLOGAÇÃO RECEITA ROLLBACK ','both');RAISE EXCEPTION 'Duplicate center accepted';EXCEPTION WHEN unique_violation THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT client_id::text FROM classification_context),true);
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.finance_receipt_details) OR EXISTS(SELECT 1 FROM public.finance_cost_centers) OR EXISTS(SELECT 1 FROM public.finance_bank_accounts) THEN RAISE EXCEPTION 'Client can read finance classification';END IF;
 BEGIN INSERT INTO public.finance_cost_centers(name,kind) VALUES('Cliente inválido','both');RAISE EXCEPTION 'Client can write centers';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO public.finance_bank_accounts(name) VALUES('Cliente inválido');RAISE EXCEPTION 'Client can write banks';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO public.finance_receipt_details(entry_id,cycle_id) SELECT cycle_id::text||':service:client-test',cycle_id FROM classification_context;RAISE EXCEPTION 'Client can classify receipts';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$BEGIN IF (SELECT tracking FROM classification_context)<>(SELECT count(*) FROM public.billing_receivable_tracking) THEN RAISE EXCEPTION 'Billing changed';END IF;END $$;
ROLLBACK;
SELECT 'PASS: receitas/despesas, bancos, recebimentos, histórico, duplicidade e RLS; sem dados de teste persistidos' result;
