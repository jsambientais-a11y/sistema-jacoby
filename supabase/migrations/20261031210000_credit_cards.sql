BEGIN;
CREATE TABLE public.finance_credit_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 bank_label text NOT NULL DEFAULT '' CHECK(length(bank_label)<=120),theme text NOT NULL DEFAULT 'other' CHECK(theme IN ('itau','inter','nubank','santander','bradesco','bb','caixa','other')),
 last_four text NOT NULL DEFAULT '' CHECK(last_four='' OR last_four ~ '^[0-9]{4}$'),
 closing_day integer NOT NULL CHECK(closing_day BETWEEN 1 AND 31),due_day integer NOT NULL CHECK(due_day BETWEEN 1 AND 31),
 limit_cents bigint CHECK(limit_cents>0 AND limit_cents<=1000000000000),bank_account_id uuid REFERENCES public.finance_bank_accounts(id) ON DELETE RESTRICT,
 active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE public.finance_card_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),card_id uuid NOT NULL REFERENCES public.finance_credit_cards(id) ON DELETE RESTRICT,
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),merchant text NOT NULL DEFAULT '' CHECK(length(merchant)<=200),category text NOT NULL DEFAULT '' CHECK(length(category)<=200),
 amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),purchased_on date NOT NULL CHECK(purchased_on<=CURRENT_DATE),
 installments integer NOT NULL CHECK(installments BETWEEN 1 AND 60 AND amount_cents>=installments),first_invoice_month date NOT NULL CHECK(extract(day from first_invoice_month)=1),
 cost_center_id uuid REFERENCES public.finance_cost_centers(id) ON DELETE RESTRICT,notes text NOT NULL DEFAULT '' CHECK(length(notes)<=10000),
 deleted_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.enterprise_finance_accounts
 ADD COLUMN credit_card_id uuid REFERENCES public.finance_credit_cards(id) ON DELETE RESTRICT,
 ADD COLUMN card_purchase_id uuid REFERENCES public.finance_card_purchases(id) ON DELETE RESTRICT,
 ADD COLUMN installment_number integer,
 ADD COLUMN invoice_month date,
 ADD CONSTRAINT finance_card_link_fields CHECK((card_purchase_id IS NULL AND credit_card_id IS NULL AND installment_number IS NULL AND invoice_month IS NULL) OR (card_purchase_id IS NOT NULL AND credit_card_id IS NOT NULL AND installment_number BETWEEN 1 AND 60 AND invoice_month IS NOT NULL AND extract(day from invoice_month)=1 AND kind='payable'));
CREATE UNIQUE INDEX finance_card_installment_unique ON public.enterprise_finance_accounts(card_purchase_id,installment_number) WHERE card_purchase_id IS NOT NULL;
CREATE INDEX finance_card_statement ON public.enterprise_finance_accounts(credit_card_id,invoice_month) WHERE credit_card_id IS NOT NULL;
CREATE INDEX finance_card_purchases_card ON public.finance_card_purchases(card_id,purchased_on);
CREATE INDEX finance_card_default_bank ON public.finance_credit_cards(bank_account_id);
CREATE INDEX finance_card_purchase_center ON public.finance_card_purchases(cost_center_id);
ALTER TABLE public.finance_credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_card_purchases ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.finance_credit_cards TO authenticated;
GRANT SELECT ON public.finance_card_purchases TO authenticated;
GRANT ALL ON public.finance_credit_cards,public.finance_card_purchases TO service_role;
CREATE POLICY credit_cards_read ON public.finance_credit_cards FOR SELECT TO authenticated USING(public.can_access_sensitive_finance());
CREATE POLICY credit_cards_insert ON public.finance_credit_cards FOR INSERT TO authenticated WITH CHECK(public.can_access_sensitive_finance() AND created_by=auth.uid());
CREATE POLICY credit_cards_update ON public.finance_credit_cards FOR UPDATE TO authenticated USING(public.can_access_sensitive_finance()) WITH CHECK(public.can_access_sensitive_finance());
CREATE POLICY card_purchases_read ON public.finance_card_purchases FOR SELECT TO authenticated USING(public.can_access_sensitive_finance());
CREATE TRIGGER credit_cards_updated BEFORE UPDATE ON public.finance_credit_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER card_purchases_updated BEFORE UPDATE ON public.finance_card_purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE FUNCTION public.protect_card_payables() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') AND (NEW.card_purchase_id IS NOT NULL OR (TG_OP='UPDATE' AND OLD.card_purchase_id IS NOT NULL)) THEN RAISE EXCEPTION 'Gerencie este lançamento pela fatura do cartão.';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_card_payables BEFORE INSERT OR UPDATE ON public.enterprise_finance_accounts FOR EACH ROW EXECUTE FUNCTION public.protect_card_payables();
CREATE FUNCTION public.finance_card_date(month_date date,day_number integer) RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (date_trunc('month',month_date)::date + (least(day_number,extract(day from date_trunc('month',month_date)+interval '1 month -1 day')::integer)-1))::date
$$;
CREATE FUNCTION public.save_card_purchase(payload jsonb,target_purchase_id uuid DEFAULT NULL,expected_updated_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.finance_credit_cards; p public.finance_card_purchases; pid uuid; purchase_date date; first_month date; cents bigint; count_parts integer; i integer; part bigint; month_date date; due_date date; old_deleted timestamptz;
BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.finance_credit_cards WHERE id=(payload->>'card_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cartão não encontrado.';END IF;
 IF target_purchase_id IS NOT NULL THEN
 SELECT * INTO p FROM public.finance_card_purchases WHERE id=target_purchase_id FOR UPDATE;
 IF NOT FOUND OR p.updated_at IS DISTINCT FROM expected_updated_at THEN RAISE EXCEPTION 'A despesa mudou em outra sessão. Atualize antes de salvar.';END IF;
 IF p.card_id<>c.id THEN RAISE EXCEPTION 'O cartão desta despesa não pode ser alterado.';END IF;
 IF p.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Restaure a despesa antes de editar.';END IF;
 IF EXISTS(SELECT 1 FROM public.enterprise_finance_accounts WHERE card_purchase_id=p.id AND settled_on IS NOT NULL) THEN RAISE EXCEPTION 'Esta despesa possui fatura paga. Desfaça a baixa da fatura antes de editar.';END IF;
 END IF;
 IF NOT c.active THEN RAISE EXCEPTION 'Reative o cartão antes de lançar ou editar despesas.';END IF;
 cents:=(payload->>'amount_cents')::bigint;count_parts:=(payload->>'installments')::integer;purchase_date:=(payload->>'purchased_on')::date;
 first_month:=date_trunc('month',purchase_date)::date;
 IF purchase_date>public.finance_card_date(first_month,c.closing_day) THEN first_month:=(first_month+interval '1 month')::date;END IF;
 IF c.due_day<=c.closing_day THEN first_month:=(first_month+interval '1 month')::date;END IF;
 IF nullif(payload->>'first_invoice_month','') IS NOT NULL THEN first_month:=date_trunc('month',(payload->>'first_invoice_month')::date)::date;END IF;
 IF public.finance_card_date(first_month,c.due_day)<purchase_date THEN RAISE EXCEPTION 'A primeira fatura não pode vencer antes da compra.';END IF;
 IF nullif(payload->>'cost_center_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_cost_centers WHERE id=(payload->>'cost_center_id')::uuid AND active AND kind IN ('expense','both')) THEN RAISE EXCEPTION 'Escolha um centro de despesas ativo.';END IF;
 IF target_purchase_id IS NULL THEN
 INSERT INTO public.finance_card_purchases(card_id,description,merchant,category,amount_cents,purchased_on,installments,first_invoice_month,cost_center_id,notes)
 VALUES(c.id,trim(payload->>'description'),coalesce(payload->>'merchant',''),coalesce(payload->>'category',''),cents,purchase_date,count_parts,first_month,nullif(payload->>'cost_center_id','')::uuid,coalesce(payload->>'notes','')) RETURNING id INTO pid;
 ELSE
 pid:=p.id;
 UPDATE public.finance_card_purchases SET description=trim(payload->>'description'),merchant=coalesce(payload->>'merchant',''),category=coalesce(payload->>'category',''),amount_cents=cents,purchased_on=purchase_date,installments=count_parts,first_invoice_month=first_month,cost_center_id=nullif(payload->>'cost_center_id','')::uuid,notes=coalesce(payload->>'notes','') WHERE id=pid;
 END IF;
 -- Despesas antigas ficam recuperáveis; as mesmas parcelas são atualizadas sem cópia.
 UPDATE public.enterprise_finance_accounts SET deleted_at=now() WHERE card_purchase_id=pid;
 FOR i IN 1..count_parts LOOP
 part:=cents/count_parts+CASE WHEN i<=cents%count_parts THEN 1 ELSE 0 END;month_date:=(first_month+make_interval(months=>i-1))::date;due_date:=public.finance_card_date(month_date,c.due_day);
 INSERT INTO public.enterprise_finance_accounts(kind,description,counterparty,category,amount_cents,due_on,notes,cost_center_id,bank_account_id,credit_card_id,card_purchase_id,installment_number,invoice_month)
 VALUES('payable',trim(payload->>'description')||' · '||c.name||' · '||i||'/'||count_parts,coalesce(payload->>'merchant',''),coalesce(payload->>'category','Cartão de crédito'),part,due_date,coalesce(payload->>'notes',''),nullif(payload->>'cost_center_id','')::uuid,c.bank_account_id,c.id,pid,i,month_date)
 ON CONFLICT(card_purchase_id,installment_number) WHERE card_purchase_id IS NOT NULL DO UPDATE SET description=EXCLUDED.description,counterparty=EXCLUDED.counterparty,category=EXCLUDED.category,amount_cents=EXCLUDED.amount_cents,due_on=EXCLUDED.due_on,invoice_month=EXCLUDED.invoice_month,cost_center_id=EXCLUDED.cost_center_id,notes=EXCLUDED.notes,deleted_at=NULL;
 END LOOP;RETURN pid;
END $$;
CREATE FUNCTION public.set_card_purchase_deleted(target_purchase_id uuid,expected_updated_at timestamptz,deleted boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.finance_card_purchases;BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.finance_card_purchases WHERE id=target_purchase_id FOR UPDATE;
 IF NOT FOUND OR p.updated_at IS DISTINCT FROM expected_updated_at THEN RAISE EXCEPTION 'A despesa mudou. Atualize antes de continuar.';END IF;
 IF EXISTS(SELECT 1 FROM public.enterprise_finance_accounts WHERE card_purchase_id=p.id AND settled_on IS NOT NULL) THEN RAISE EXCEPTION 'Desfaça a baixa das faturas antes de excluir ou restaurar.';END IF;
 UPDATE public.finance_card_purchases SET deleted_at=CASE WHEN deleted THEN now() ELSE NULL END WHERE id=p.id;
 UPDATE public.enterprise_finance_accounts SET deleted_at=CASE WHEN deleted OR installment_number>p.installments THEN now() ELSE NULL END WHERE card_purchase_id=p.id;
END $$;
CREATE FUNCTION public.settle_card_invoice(target_card_id uuid,target_month date,paid_on date,payment_bank_id uuid,expected_total_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total bigint;BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.finance_credit_cards WHERE id=target_card_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cartão não encontrado.';END IF;
 PERFORM 1 FROM public.enterprise_finance_accounts WHERE credit_card_id=target_card_id AND invoice_month=date_trunc('month',target_month)::date AND deleted_at IS NULL FOR UPDATE;
 SELECT coalesce(sum(amount_cents),0) INTO total FROM public.enterprise_finance_accounts WHERE credit_card_id=target_card_id AND invoice_month=date_trunc('month',target_month)::date AND deleted_at IS NULL;
 IF total<>expected_total_cents OR total=0 THEN RAISE EXCEPTION 'A fatura mudou. Atualize e confira antes da baixa.';END IF;
 IF paid_on IS NOT NULL AND (paid_on>CURRENT_DATE OR payment_bank_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.finance_bank_accounts WHERE id=payment_bank_id AND active)) THEN RAISE EXCEPTION 'Informe uma data até hoje e uma conta bancária ativa.';END IF;
 UPDATE public.enterprise_finance_accounts SET settled_on=paid_on,bank_account_id=CASE WHEN paid_on IS NULL THEN bank_account_id ELSE payment_bank_id END WHERE credit_card_id=target_card_id AND invoice_month=date_trunc('month',target_month)::date AND deleted_at IS NULL AND (paid_on IS NULL OR settled_on IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.save_card_purchase(jsonb,uuid,timestamptz),public.set_card_purchase_deleted(uuid,timestamptz,boolean),public.settle_card_invoice(uuid,date,date,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_card_purchase(jsonb,uuid,timestamptz),public.set_card_purchase_deleted(uuid,timestamptz,boolean),public.settle_card_invoice(uuid,date,date,uuid,bigint) TO authenticated,service_role;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031210000','credit_cards',ARRAY['Credit cards, installment purchases and atomic statement settlement in the existing finance ledger']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';COMMIT;
