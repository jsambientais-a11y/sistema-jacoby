BEGIN;
ALTER TABLE public.finance_card_purchases ADD COLUMN import_key text CHECK(import_key IS NULL OR length(import_key) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX finance_card_import_key ON public.finance_card_purchases(card_id,import_key) WHERE import_key IS NOT NULL;
CREATE FUNCTION public.import_card_invoice(target_card_id uuid,target_month date,items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; key text; pid uuid; added integer:=0; skipped integer:=0; amount bigint;BEGIN
 IF NOT public.can_access_sensitive_finance() THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Importe entre 1 e 500 despesas por vez.';END IF;
 PERFORM 1 FROM public.finance_credit_cards WHERE id=target_card_id AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cartão não encontrado ou desativado.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
 key:=item->>'import_key';IF key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Identificador de importação inválido.';END IF;
 IF EXISTS(SELECT 1 FROM public.finance_card_purchases WHERE card_id=target_card_id AND import_key=key) THEN skipped:=skipped+1;CONTINUE;END IF;
 amount:=(item->>'amount_cents')::bigint;
 pid:=public.save_card_purchase(item||jsonb_build_object('card_id',target_card_id,'first_invoice_month',date_trunc('month',target_month)::date,'installments',1,'amount_cents',amount));
 UPDATE public.finance_card_purchases SET import_key=key WHERE id=pid;added:=added+1;
 END LOOP;
 RETURN jsonb_build_object('added',added,'skipped',skipped);
END $$;
REVOKE ALL ON FUNCTION public.import_card_invoice(uuid,date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_card_invoice(uuid,date,jsonb) TO authenticated,service_role;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031220000','card_invoice_import',ARRAY['Atomic credit card statement import with per-card deduplication and review']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';COMMIT;
