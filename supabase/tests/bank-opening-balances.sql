BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.user_roles WHERE role='admin' LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$DECLARE row_id uuid; BEGIN
 INSERT INTO public.finance_bank_accounts(name,opening_balance_cents,opening_on) VALUES('Saldo teste rollback',-150025,current_date) RETURNING id INTO row_id;
 IF NOT EXISTS(SELECT 1 FROM public.finance_bank_accounts WHERE id=row_id AND opening_balance_cents=-150025) THEN RAISE EXCEPTION 'Saldo não persistiu';END IF;
 UPDATE public.finance_bank_accounts SET opening_balance_cents=0 WHERE id=row_id;
 BEGIN UPDATE public.finance_bank_accounts SET opening_on=null WHERE id=row_id;RAISE EXCEPTION 'Referência ausente aceita';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN UPDATE public.finance_bank_accounts SET opening_on=current_date+1 WHERE id=row_id;RAISE EXCEPTION 'Data futura aceita';EXCEPTION WHEN check_violation THEN NULL;END;
 UPDATE public.finance_bank_accounts SET opening_balance_cents=null,opening_on=null WHERE id=row_id;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: saldo negativo, zero, referência, validações e limpeza transacional' result;
