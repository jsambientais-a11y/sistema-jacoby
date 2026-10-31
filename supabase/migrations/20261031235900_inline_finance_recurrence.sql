BEGIN;
ALTER TABLE public.finance_recurring_expenses ADD COLUMN credit_card_id uuid REFERENCES public.finance_credit_cards(id) ON DELETE RESTRICT,ADD COLUMN card_first_invoice_month date,ADD COLUMN generate_from date;
ALTER TABLE public.finance_recurring_expenses ADD CONSTRAINT recurring_card_month CHECK((credit_card_id IS NULL AND card_first_invoice_month IS NULL) OR (credit_card_id IS NOT NULL AND card_first_invoice_month IS NOT NULL AND frequency NOT IN ('weekly','fortnightly')));
CREATE INDEX recurring_card ON public.finance_recurring_expenses(credit_card_id);
ALTER TABLE public.finance_card_purchases ADD COLUMN recurrence_id uuid REFERENCES public.finance_recurring_expenses(id) ON DELETE RESTRICT,ADD COLUMN occurrence_on date,ADD COLUMN recurrence_suppressed boolean NOT NULL DEFAULT false;
ALTER TABLE public.finance_card_purchases DROP CONSTRAINT finance_card_purchases_purchased_on_check;
ALTER TABLE public.finance_card_purchases ADD CONSTRAINT card_purchase_date_check CHECK(purchased_on<=CURRENT_DATE OR recurrence_id IS NOT NULL);
CREATE UNIQUE INDEX card_recurring_purchase ON public.finance_card_purchases(recurrence_id,occurrence_on) WHERE recurrence_id IS NOT NULL;
ALTER TABLE public.enterprise_finance_accounts DROP CONSTRAINT finance_recurrence_link;
ALTER TABLE public.enterprise_finance_accounts ADD CONSTRAINT finance_recurrence_link CHECK((recurrence_id IS NULL AND occurrence_on IS NULL) OR (recurrence_id IS NOT NULL AND occurrence_on IS NOT NULL AND kind='payable'));
CREATE OR REPLACE FUNCTION public.sync_finance_recurrences(until_on date DEFAULT NULL,target_id uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_recurring_expenses;c public.finance_credit_cards;horizon date:=coalesce(until_on,((now() AT TIME ZONE 'America/Sao_Paulo')::date+interval '12 months')::date);today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;d date;im date;pid uuid;n integer;step_months integer;generated integer:=0;changed integer;center uuid;bank uuid;BEGIN
 IF NOT (public.can_access_sensitive_finance() OR (auth.uid() IS NULL AND (session_user IN ('postgres','supabase_admin') OR current_setting('role',true)='service_role'))) THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 IF horizon>(today+interval '24 months')::date THEN RAISE EXCEPTION 'Gere uma previsão de até 24 meses à frente.';END IF;
 FOR r IN SELECT * FROM public.finance_recurring_expenses WHERE target_id IS NULL OR id=target_id FOR UPDATE LOOP
 UPDATE public.enterprise_finance_accounts SET deleted_at=now(),recurrence_suppressed=true WHERE recurrence_id=r.id AND settled_on IS NULL AND occurrence_on>=today AND deleted_at IS NULL AND (NOT r.active OR (r.end_on IS NOT NULL AND occurrence_on>r.end_on));
 UPDATE public.finance_card_purchases p SET deleted_at=now(),recurrence_suppressed=true WHERE p.recurrence_id=r.id AND p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.enterprise_finance_accounts a WHERE a.card_purchase_id=p.id AND a.recurrence_suppressed);
 IF NOT r.active THEN CONTINUE;END IF;
 center:=CASE WHEN EXISTS(SELECT 1 FROM public.finance_cost_centers WHERE id=r.cost_center_id AND active AND kind IN ('expense','both')) THEN r.cost_center_id ELSE NULL END;
 bank:=CASE WHEN EXISTS(SELECT 1 FROM public.finance_bank_accounts WHERE id=r.bank_account_id AND active) THEN r.bank_account_id ELSE NULL END;
 IF r.credit_card_id IS NOT NULL THEN SELECT * INTO c FROM public.finance_credit_cards WHERE id=r.credit_card_id FOR UPDATE;IF NOT c.active THEN CONTINUE;END IF;END IF;
 n:=0;
 LOOP
 d:=public.finance_recurrence_due(r.start_on,r.frequency,n);EXIT WHEN d>horizon OR (r.end_on IS NOT NULL AND d>r.end_on);IF n>5000 THEN RAISE EXCEPTION 'Recorrência extensa demais.';END IF;IF r.generate_from IS NOT NULL AND d<r.generate_from THEN n:=n+1;CONTINUE;END IF;
 IF r.credit_card_id IS NULL THEN
 INSERT INTO public.enterprise_finance_accounts(kind,description,counterparty,category,amount_cents,due_on,cost_center_id,bank_account_id,notes,recurrence_id,occurrence_on,created_by)
 VALUES('payable',r.description,r.counterparty,r.category,r.amount_cents,d,center,bank,r.notes,r.id,d,r.created_by)
 ON CONFLICT(recurrence_id,occurrence_on) WHERE recurrence_id IS NOT NULL DO UPDATE SET deleted_at=NULL,recurrence_suppressed=false WHERE enterprise_finance_accounts.recurrence_suppressed AND enterprise_finance_accounts.settled_on IS NULL;
 ELSE
 step_months:=(extract(year from d)::integer-extract(year from r.start_on)::integer)*12+extract(month from d)::integer-extract(month from r.start_on)::integer;
 im:=(r.card_first_invoice_month+make_interval(months=>step_months))::date;
 INSERT INTO public.finance_card_purchases(card_id,description,merchant,category,amount_cents,purchased_on,installments,first_invoice_month,cost_center_id,notes,created_by,recurrence_id,occurrence_on)
 VALUES(c.id,r.description,r.counterparty,r.category,r.amount_cents,d,1,im,center,r.notes,r.created_by,r.id,d)
 ON CONFLICT(recurrence_id,occurrence_on) WHERE recurrence_id IS NOT NULL DO UPDATE SET deleted_at=CASE WHEN finance_card_purchases.recurrence_suppressed THEN NULL ELSE finance_card_purchases.deleted_at END,recurrence_suppressed=false WHERE finance_card_purchases.recurrence_suppressed RETURNING id INTO pid;
 IF pid IS NULL THEN SELECT id INTO pid FROM public.finance_card_purchases WHERE recurrence_id=r.id AND occurrence_on=d;END IF;
 -- Uma exclusão individual não deve recriar compra nem lançamento.
 IF NOT EXISTS(SELECT 1 FROM public.finance_card_purchases WHERE id=pid AND deleted_at IS NOT NULL) THEN
 INSERT INTO public.enterprise_finance_accounts(kind,description,counterparty,category,amount_cents,due_on,cost_center_id,bank_account_id,notes,recurrence_id,occurrence_on,created_by,credit_card_id,card_purchase_id,installment_number,invoice_month)
 VALUES('payable',r.description||' · '||c.name||' · 1/1',r.counterparty,r.category,r.amount_cents,public.finance_card_date(im,c.due_day),center,bank,r.notes,r.id,d,r.created_by,c.id,pid,1,im)
 ON CONFLICT(recurrence_id,occurrence_on) WHERE recurrence_id IS NOT NULL DO UPDATE SET deleted_at=NULL,recurrence_suppressed=false WHERE enterprise_finance_accounts.recurrence_suppressed AND enterprise_finance_accounts.settled_on IS NULL;
 END IF;
 END IF;
 GET DIAGNOSTICS changed=ROW_COUNT;generated:=generated+changed;n:=n+1;
 END LOOP;
 END LOOP;RETURN generated;
END $$;
-- Cria a regra a partir do lançamento já salvo, antes de gerar as próximas.
CREATE FUNCTION public.create_inline_finance_rule(payload jsonb,first_on date,card_id uuid DEFAULT NULL,first_month date DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 IF first_on<today-interval '5 years' OR first_on>today+interval '24 months' THEN RAISE EXCEPTION 'Revise a data inicial da recorrência.';END IF;
 INSERT INTO public.finance_recurring_expenses(description,counterparty,category,amount_cents,frequency,start_on,end_on,cost_center_id,bank_account_id,notes,credit_card_id,card_first_invoice_month,generate_from)
 VALUES(trim(payload->>'description'),coalesce(payload->>'counterparty',''),coalesce(payload->>'category',''),(payload->>'amount_cents')::bigint,payload->>'frequency',first_on,nullif(payload->>'end_on','')::date,nullif(payload->>'cost_center_id','')::uuid,nullif(payload->>'bank_account_id','')::uuid,coalesce(payload->>'notes',''),card_id,first_month,today) RETURNING id INTO rid;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.create_inline_finance_rule(jsonb,date,uuid,date) FROM PUBLIC;
CREATE FUNCTION public.save_inline_payable(payload jsonb,target_id uuid DEFAULT NULL,expected_updated_at timestamptz DEFAULT NULL,repeat_options jsonb DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.enterprise_finance_accounts;r public.finance_recurring_expenses;aid uuid;rid uuid;enabled boolean:=coalesce((repeat_options->>'enabled')::boolean,false);today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;values_json jsonb;BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 IF target_id IS NOT NULL THEN SELECT * INTO a FROM public.enterprise_finance_accounts WHERE id=target_id FOR UPDATE;IF NOT FOUND OR a.updated_at IS DISTINCT FROM expected_updated_at THEN RAISE EXCEPTION 'O lançamento mudou. Atualize antes de salvar.';END IF;IF a.kind<>'payable' OR a.credit_card_id IS NOT NULL OR a.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Este lançamento não pode ser convertido aqui.';END IF;END IF;
 IF a.recurrence_id IS NOT NULL THEN
 SELECT * INTO r FROM public.finance_recurring_expenses WHERE id=a.recurrence_id FOR UPDATE;
 IF (NOT enabled OR repeat_options->>'scope'='future') AND r.updated_at IS DISTINCT FROM (repeat_options->>'rule_updated_at')::timestamptz THEN RAISE EXCEPTION 'A série mudou. Atualize antes de salvar.';END IF;
 IF NOT enabled THEN
 PERFORM public.set_finance_recurrence_active(r.id,r.updated_at,false);
 -- Parar a repetição mantém o lançamento que a pessoa está editando.
 UPDATE public.enterprise_finance_accounts SET deleted_at=NULL,recurrence_suppressed=false,recurrence_overridden=true WHERE id=a.id;
 ELSIF repeat_options->>'scope'='future' THEN
 values_json:=payload||jsonb_build_object('start_on',r.start_on,'frequency',r.frequency,'end_on',repeat_options->>'end_on');
 PERFORM public.save_finance_recurrence(values_json,r.id,r.updated_at,greatest(today,a.occurrence_on));
 IF NOT r.active THEN SELECT * INTO r FROM public.finance_recurring_expenses WHERE id=r.id;PERFORM public.set_finance_recurrence_active(r.id,r.updated_at,true);END IF;
 RETURN a.id;
 END IF;
 END IF;
 IF target_id IS NULL THEN
 INSERT INTO public.enterprise_finance_accounts(kind,description,counterparty,category,amount_cents,due_on,cost_center_id,bank_account_id,notes)
 VALUES('payable',trim(payload->>'description'),coalesce(payload->>'counterparty',''),coalesce(payload->>'category',''),(payload->>'amount_cents')::bigint,(payload->>'due_on')::date,nullif(payload->>'cost_center_id','')::uuid,nullif(payload->>'bank_account_id','')::uuid,coalesce(payload->>'notes','')) RETURNING id INTO aid;
 ELSE
 aid:=a.id;
 UPDATE public.enterprise_finance_accounts SET description=trim(payload->>'description'),counterparty=coalesce(payload->>'counterparty',''),category=coalesce(payload->>'category',''),amount_cents=(payload->>'amount_cents')::bigint,due_on=(payload->>'due_on')::date,cost_center_id=nullif(payload->>'cost_center_id','')::uuid,bank_account_id=nullif(payload->>'bank_account_id','')::uuid,notes=coalesce(payload->>'notes',''),recurrence_overridden=CASE WHEN recurrence_id IS NOT NULL THEN true ELSE recurrence_overridden END WHERE id=aid;
 END IF;
 IF enabled AND a.recurrence_id IS NULL THEN
 rid:=public.create_inline_finance_rule(payload||jsonb_build_object('frequency',repeat_options->>'frequency','end_on',repeat_options->>'end_on'),(payload->>'due_on')::date);
 UPDATE public.enterprise_finance_accounts SET recurrence_id=rid,occurrence_on=due_on,recurrence_overridden=false WHERE id=aid;
 PERFORM public.sync_finance_recurrences(NULL,rid);
 END IF;
 RETURN aid;
END $$;
CREATE FUNCTION public.save_inline_card_purchase(payload jsonb,target_id uuid DEFAULT NULL,expected_updated_at timestamptz DEFAULT NULL,repeat_options jsonb DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.finance_card_purchases;r public.finance_recurring_expenses;c public.finance_credit_cards;pid uuid;rid uuid;enabled boolean:=coalesce((repeat_options->>'enabled')::boolean,false);paid boolean;stopped boolean:=false;today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;rule_json jsonb;BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.finance_credit_cards WHERE id=(payload->>'card_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cartão não encontrado.';END IF;
 IF target_id IS NOT NULL THEN SELECT * INTO p FROM public.finance_card_purchases WHERE id=target_id FOR UPDATE;IF NOT FOUND OR p.updated_at IS DISTINCT FROM expected_updated_at OR p.card_id<>c.id OR p.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'A despesa mudou. Atualize antes de salvar.';END IF;END IF;
 IF enabled AND NOT c.active AND p.recurrence_id IS NULL THEN RAISE EXCEPTION 'Reative o cartão antes de criar uma repetição.';END IF;
 IF enabled AND (payload->>'installments')::integer<>1 THEN RAISE EXCEPTION 'Repetição é diferente de parcelamento. Use uma parcela para repetir esta despesa.';END IF;
 IF enabled AND (repeat_options->>'frequency') IN ('weekly','fortnightly') THEN RAISE EXCEPTION 'No cartão, escolha frequência mensal ou maior.';END IF;
 IF p.recurrence_id IS NOT NULL THEN
 SELECT * INTO r FROM public.finance_recurring_expenses WHERE id=p.recurrence_id FOR UPDATE;
 IF (NOT enabled OR repeat_options->>'scope'='future') AND r.updated_at IS DISTINCT FROM (repeat_options->>'rule_updated_at')::timestamptz THEN RAISE EXCEPTION 'A série mudou. Atualize antes de salvar.';END IF;
 IF NOT enabled THEN
 PERFORM public.set_finance_recurrence_active(r.id,r.updated_at,false);
 UPDATE public.finance_card_purchases SET deleted_at=NULL,recurrence_suppressed=false WHERE id=p.id;
 UPDATE public.enterprise_finance_accounts SET deleted_at=NULL,recurrence_suppressed=false,recurrence_overridden=true WHERE card_purchase_id=p.id;
 stopped:=true;SELECT * INTO p FROM public.finance_card_purchases WHERE id=p.id;
 ELSIF repeat_options->>'scope'='future' THEN
 rule_json:=payload||jsonb_build_object('counterparty',coalesce(payload->>'merchant',''),'start_on',r.start_on,'frequency',r.frequency,'end_on',repeat_options->>'end_on','bank_account_id',c.bank_account_id);
 PERFORM public.save_finance_recurrence(rule_json,r.id,r.updated_at,greatest(today,p.occurrence_on));
 -- O detalhamento das compras acompanha as mesmas ocorrências financeiras.
 UPDATE public.finance_card_purchases cp SET description=trim(payload->>'description'),merchant=coalesce(payload->>'merchant',''),category=coalesce(payload->>'category',''),amount_cents=(payload->>'amount_cents')::bigint,cost_center_id=nullif(payload->>'cost_center_id','')::uuid,notes=coalesce(payload->>'notes','')
 WHERE cp.recurrence_id=r.id AND cp.occurrence_on>=greatest(today,p.occurrence_on) AND NOT EXISTS(SELECT 1 FROM public.enterprise_finance_accounts a WHERE a.card_purchase_id=cp.id AND (a.settled_on IS NOT NULL OR a.recurrence_overridden));
 IF NOT r.active THEN SELECT * INTO r FROM public.finance_recurring_expenses WHERE id=r.id;PERFORM public.set_finance_recurrence_active(r.id,r.updated_at,true);END IF;
 RETURN p.id;
 END IF;
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.enterprise_finance_accounts WHERE card_purchase_id=p.id AND settled_on IS NOT NULL) INTO paid;
 IF paid THEN
 IF stopped THEN RETURN p.id;END IF;
 IF NOT enabled OR p.recurrence_id IS NOT NULL THEN RAISE EXCEPTION 'Desfaça a baixa para editar esta compra. Use esta e próximas para alterar somente futuras.';END IF;
 IF p.amount_cents<>(payload->>'amount_cents')::bigint OR p.description<>trim(payload->>'description') OR p.purchased_on<>(payload->>'purchased_on')::date THEN RAISE EXCEPTION 'A compra paga deve manter os dados originais ao criar a repetição.';END IF;
 pid:=p.id;
 ELSIF p.recurrence_id IS NOT NULL AND p.purchased_on>today THEN
 -- Ocorrência prevista: permite ajuste individual sem fingir uma nova compra real.
 UPDATE public.finance_card_purchases SET description=trim(payload->>'description'),merchant=coalesce(payload->>'merchant',''),category=coalesce(payload->>'category',''),amount_cents=(payload->>'amount_cents')::bigint,cost_center_id=nullif(payload->>'cost_center_id','')::uuid,notes=coalesce(payload->>'notes','') WHERE id=p.id;
 UPDATE public.enterprise_finance_accounts SET description=trim(payload->>'description')||' · '||c.name||' · 1/1',counterparty=coalesce(payload->>'merchant',''),category=coalesce(payload->>'category',''),amount_cents=(payload->>'amount_cents')::bigint,cost_center_id=nullif(payload->>'cost_center_id','')::uuid,notes=coalesce(payload->>'notes',''),recurrence_overridden=true WHERE card_purchase_id=p.id;
 pid:=p.id;
 ELSE
 pid:=public.save_card_purchase(payload,target_id,CASE WHEN stopped THEN p.updated_at ELSE expected_updated_at END);
 IF p.recurrence_id IS NOT NULL THEN UPDATE public.enterprise_finance_accounts SET recurrence_overridden=true WHERE card_purchase_id=pid;END IF;
 END IF;
 IF enabled AND p.recurrence_id IS NULL THEN
 rule_json:=payload||jsonb_build_object('counterparty',coalesce(payload->>'merchant',''),'bank_account_id',c.bank_account_id,'frequency',repeat_options->>'frequency','end_on',repeat_options->>'end_on');
 SELECT * INTO p FROM public.finance_card_purchases WHERE id=pid;
 rid:=public.create_inline_finance_rule(rule_json,p.purchased_on,c.id,p.first_invoice_month);
 UPDATE public.finance_card_purchases SET recurrence_id=rid,occurrence_on=purchased_on WHERE id=pid;
 UPDATE public.enterprise_finance_accounts SET recurrence_id=rid,occurrence_on=p.purchased_on,recurrence_overridden=false WHERE card_purchase_id=pid;
 PERFORM public.sync_finance_recurrences(NULL,rid);
 END IF;
 RETURN pid;
END $$;
REVOKE ALL ON FUNCTION public.save_inline_payable(jsonb,uuid,timestamptz,jsonb),public.save_inline_card_purchase(jsonb,uuid,timestamptz,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_inline_payable(jsonb,uuid,timestamptz,jsonb),public.save_inline_card_purchase(jsonb,uuid,timestamptz,jsonb) TO authenticated,service_role;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031235900','inline_finance_recurrence',ARRAY['Inline payable and credit card recurrence with existing-entry conversion and single invoice totals']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';COMMIT;
