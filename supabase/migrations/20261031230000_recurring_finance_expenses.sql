BEGIN;
CREATE TABLE public.finance_recurring_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),
 counterparty text NOT NULL DEFAULT '' CHECK(length(counterparty)<=500),category text NOT NULL DEFAULT '' CHECK(length(category)<=200),
 amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),
 frequency text NOT NULL CHECK(frequency IN ('weekly','fortnightly','monthly','bimonthly','quarterly','semiannual','yearly')),
 start_on date NOT NULL,end_on date CHECK(end_on>=start_on),
 cost_center_id uuid REFERENCES public.finance_cost_centers(id) ON DELETE RESTRICT,bank_account_id uuid REFERENCES public.finance_bank_accounts(id) ON DELETE RESTRICT,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=10000),active boolean NOT NULL DEFAULT true,
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_recurring_center ON public.finance_recurring_expenses(cost_center_id);
CREATE INDEX finance_recurring_bank ON public.finance_recurring_expenses(bank_account_id);
ALTER TABLE public.finance_recurring_expenses ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.finance_recurring_expenses TO authenticated;
GRANT ALL ON public.finance_recurring_expenses TO service_role;
CREATE POLICY recurring_expenses_read ON public.finance_recurring_expenses FOR SELECT TO authenticated USING(public.can_access_sensitive_finance());
CREATE TRIGGER recurring_expenses_updated BEFORE UPDATE ON public.finance_recurring_expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.enterprise_finance_accounts ADD COLUMN recurrence_id uuid REFERENCES public.finance_recurring_expenses(id) ON DELETE RESTRICT,
 ADD COLUMN occurrence_on date,ADD COLUMN recurrence_overridden boolean NOT NULL DEFAULT false,ADD COLUMN recurrence_suppressed boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT finance_recurrence_link CHECK((recurrence_id IS NULL AND occurrence_on IS NULL) OR (recurrence_id IS NOT NULL AND occurrence_on IS NOT NULL AND kind='payable' AND credit_card_id IS NULL));
CREATE UNIQUE INDEX finance_recurrence_occurrence ON public.enterprise_finance_accounts(recurrence_id,occurrence_on) WHERE recurrence_id IS NOT NULL;
CREATE FUNCTION public.finance_recurrence_due(first_on date,frequency text,step_number integer) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE m date;months integer;BEGIN
 IF frequency='weekly' THEN RETURN first_on+step_number*7;END IF;
 IF frequency='fortnightly' THEN RETURN first_on+step_number*15;END IF;
 months:=CASE frequency WHEN 'monthly' THEN 1 WHEN 'bimonthly' THEN 2 WHEN 'quarterly' THEN 3 WHEN 'semiannual' THEN 6 WHEN 'yearly' THEN 12 ELSE NULL END;
 IF months IS NULL OR step_number<0 THEN RAISE EXCEPTION 'Frequência inválida.';END IF;
 m:=(date_trunc('month',first_on)+make_interval(months=>months*step_number))::date;
 RETURN m+least(extract(day from first_on)::integer,extract(day from m+interval '1 month - 1 day')::integer)-1;
END $$;
CREATE FUNCTION public.sync_finance_recurrences(until_on date DEFAULT NULL,target_id uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_recurring_expenses;horizon date:=coalesce(until_on,((now() AT TIME ZONE 'America/Sao_Paulo')::date+interval '12 months')::date);d date;n integer;generated integer:=0;changed integer;BEGIN
 IF NOT (public.can_access_sensitive_finance() OR (auth.uid() IS NULL AND (session_user IN ('postgres','supabase_admin') OR current_setting('role',true)='service_role'))) THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 IF horizon>((now() AT TIME ZONE 'America/Sao_Paulo')::date+interval '24 months')::date THEN RAISE EXCEPTION 'Gere uma previsão de até 24 meses à frente.';END IF;
 FOR r IN SELECT * FROM public.finance_recurring_expenses WHERE target_id IS NULL OR id=target_id FOR UPDATE LOOP
 -- Encerramento/pausa remove apenas ocorrências futuras ainda não pagas.
 UPDATE public.enterprise_finance_accounts SET deleted_at=now(),recurrence_suppressed=true WHERE recurrence_id=r.id AND settled_on IS NULL AND occurrence_on>=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND deleted_at IS NULL AND (NOT r.active OR (r.end_on IS NOT NULL AND occurrence_on>r.end_on));
 IF NOT r.active THEN CONTINUE;END IF;
 n:=0;
 LOOP
 d:=public.finance_recurrence_due(r.start_on,r.frequency,n);EXIT WHEN d>horizon OR (r.end_on IS NOT NULL AND d>r.end_on);
 IF n>5000 THEN RAISE EXCEPTION 'Recorrência extensa demais. Revise o início.';END IF;
 INSERT INTO public.enterprise_finance_accounts(kind,description,counterparty,category,amount_cents,due_on,cost_center_id,bank_account_id,notes,recurrence_id,occurrence_on,created_by)
 VALUES('payable',r.description,r.counterparty,r.category,r.amount_cents,d,CASE WHEN EXISTS(SELECT 1 FROM public.finance_cost_centers WHERE id=r.cost_center_id AND active AND kind IN ('expense','both')) THEN r.cost_center_id ELSE NULL END,CASE WHEN EXISTS(SELECT 1 FROM public.finance_bank_accounts WHERE id=r.bank_account_id AND active) THEN r.bank_account_id ELSE NULL END,r.notes,r.id,d,r.created_by)
 ON CONFLICT(recurrence_id,occurrence_on) WHERE recurrence_id IS NOT NULL DO UPDATE SET deleted_at=NULL,recurrence_suppressed=false
 WHERE enterprise_finance_accounts.recurrence_suppressed AND enterprise_finance_accounts.settled_on IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;generated:=generated+changed;n:=n+1;
 END LOOP;
 END LOOP;RETURN generated;
END $$;
CREATE FUNCTION public.save_finance_recurrence(payload jsonb,target_id uuid DEFAULT NULL,expected_updated_at timestamptz DEFAULT NULL,effective_on date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_recurring_expenses;rid uuid;first_on date:=(payload->>'start_on')::date;last_on date:=nullif(payload->>'end_on','')::date;BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 IF effective_on<(now() AT TIME ZONE 'America/Sao_Paulo')::date OR effective_on>((now() AT TIME ZONE 'America/Sao_Paulo')::date+interval '12 months')::date THEN RAISE EXCEPTION 'As alterações devem começar entre hoje e os próximos 12 meses.';END IF;
 IF nullif(payload->>'cost_center_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_cost_centers WHERE id=(payload->>'cost_center_id')::uuid AND active AND kind IN ('expense','both')) THEN RAISE EXCEPTION 'Selecione um centro de despesas ativo.';END IF;
 IF nullif(payload->>'bank_account_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_bank_accounts WHERE id=(payload->>'bank_account_id')::uuid AND active) THEN RAISE EXCEPTION 'Selecione uma conta bancária ativa.';END IF;
 IF target_id IS NULL THEN
 IF first_on<(now() AT TIME ZONE 'America/Sao_Paulo')::date-interval '5 years' OR first_on>(now() AT TIME ZONE 'America/Sao_Paulo')::date+interval '24 months' THEN RAISE EXCEPTION 'O início deve estar entre cinco anos atrás e 24 meses à frente.';END IF;
 INSERT INTO public.finance_recurring_expenses(description,counterparty,category,amount_cents,frequency,start_on,end_on,cost_center_id,bank_account_id,notes)
 VALUES(trim(payload->>'description'),coalesce(payload->>'counterparty',''),coalesce(payload->>'category',''),(payload->>'amount_cents')::bigint,payload->>'frequency',first_on,last_on,nullif(payload->>'cost_center_id','')::uuid,nullif(payload->>'bank_account_id','')::uuid,coalesce(payload->>'notes','')) RETURNING id INTO rid;
 ELSE
 SELECT * INTO r FROM public.finance_recurring_expenses WHERE id=target_id FOR UPDATE;
 IF NOT FOUND OR r.updated_at IS DISTINCT FROM expected_updated_at THEN RAISE EXCEPTION 'A recorrência mudou. Atualize antes de salvar.';END IF;
 IF r.start_on<>first_on OR r.frequency<>payload->>'frequency' THEN RAISE EXCEPTION 'Para mudar o início ou a frequência, encerre esta série e cadastre outra.';END IF;
 rid:=r.id;
 UPDATE public.finance_recurring_expenses SET description=trim(payload->>'description'),counterparty=coalesce(payload->>'counterparty',''),category=coalesce(payload->>'category',''),amount_cents=(payload->>'amount_cents')::bigint,end_on=last_on,cost_center_id=nullif(payload->>'cost_center_id','')::uuid,bank_account_id=nullif(payload->>'bank_account_id','')::uuid,notes=coalesce(payload->>'notes','') WHERE id=rid;
 SELECT * INTO r FROM public.finance_recurring_expenses WHERE id=rid;
 UPDATE public.enterprise_finance_accounts SET description=r.description,counterparty=r.counterparty,category=r.category,amount_cents=r.amount_cents,cost_center_id=r.cost_center_id,bank_account_id=r.bank_account_id,notes=r.notes
 WHERE recurrence_id=rid AND occurrence_on>=effective_on AND settled_on IS NULL AND NOT recurrence_overridden AND (deleted_at IS NULL OR recurrence_suppressed);
 END IF;
 PERFORM public.sync_finance_recurrences(NULL,rid);RETURN rid;
END $$;
CREATE FUNCTION public.set_finance_recurrence_active(target_id uuid,expected_updated_at timestamptz,is_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_recurring_expenses;BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.finance_recurring_expenses WHERE id=target_id FOR UPDATE;
 IF NOT FOUND OR r.updated_at IS DISTINCT FROM expected_updated_at THEN RAISE EXCEPTION 'A recorrência mudou. Atualize antes de continuar.';END IF;
 UPDATE public.finance_recurring_expenses SET active=is_active WHERE id=target_id;
 PERFORM public.sync_finance_recurrences(NULL,target_id);
END $$;
CREATE FUNCTION public.mark_finance_recurrence_override() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN
 IF TG_OP='INSERT' AND NEW.recurrence_id IS NOT NULL THEN RAISE EXCEPTION 'Cadastre a série em Despesas recorrentes.';END IF;
 IF TG_OP='UPDATE' THEN
 IF NEW.recurrence_id IS DISTINCT FROM OLD.recurrence_id OR NEW.occurrence_on IS DISTINCT FROM OLD.occurrence_on OR NEW.recurrence_suppressed IS DISTINCT FROM OLD.recurrence_suppressed THEN RAISE EXCEPTION 'Vínculo da recorrência não pode ser alterado diretamente.';END IF;
 IF OLD.recurrence_id IS NOT NULL THEN
 NEW.recurrence_overridden:=OLD.recurrence_overridden OR ROW(NEW.description,NEW.amount_cents,NEW.due_on,NEW.counterparty,NEW.category,NEW.cost_center_id,NEW.bank_account_id,NEW.notes,NEW.deleted_at) IS DISTINCT FROM ROW(OLD.description,OLD.amount_cents,OLD.due_on,OLD.counterparty,OLD.category,OLD.cost_center_id,OLD.bank_account_id,OLD.notes,OLD.deleted_at);
 END IF;END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER mark_finance_recurrence_override BEFORE INSERT OR UPDATE ON public.enterprise_finance_accounts FOR EACH ROW EXECUTE FUNCTION public.mark_finance_recurrence_override();
REVOKE ALL ON FUNCTION public.sync_finance_recurrences(date,uuid),public.save_finance_recurrence(jsonb,uuid,timestamptz,date),public.set_finance_recurrence_active(uuid,timestamptz,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_finance_recurrences(date,uuid),public.save_finance_recurrence(jsonb,uuid,timestamptz,date),public.set_finance_recurrence_active(uuid,timestamptz,boolean) TO authenticated,service_role;
-- Job local ao PostgreSQL, sem senha/API externa: renova a janela de previsão.
SELECT cron.schedule('jacoby-finance-recurring-expenses','15 7 * * *',$job$SELECT public.sync_finance_recurrences();$job$);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031230000','recurring_finance_expenses',ARRAY['Recurring expenses, recoverable future occurrences, paid history preservation and daily database schedule']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';COMMIT;
