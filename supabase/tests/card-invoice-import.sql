BEGIN;
SELECT set_config('request.jwt.claim.sub','b2f6e43d-ce24-4de2-a770-0548793cc180',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE card uuid; m date:=(date_trunc('month',current_date)+interval '1 month')::date; items jsonb; result jsonb; before_count integer; BEGIN
 INSERT INTO public.finance_credit_cards(name,closing_day,due_day) VALUES('Importação teste rollback',25,5) RETURNING id INTO card;
 items:=jsonb_build_array(jsonb_build_object('import_key','file:test:1','description','Compra A','amount_cents',10001,'purchased_on',current_date),jsonb_build_object('import_key','file:test:2','description','Compra B 02/10','amount_cents',2500,'purchased_on',current_date));
 result:=public.import_card_invoice(card,m,items);
 IF (result->>'added')::integer<>2 OR (SELECT sum(amount_cents) FROM public.enterprise_finance_accounts WHERE credit_card_id=card AND deleted_at IS NULL)<>12501 THEN RAISE EXCEPTION 'Bulk import mismatch';END IF;
 IF (SELECT count(DISTINCT invoice_month) FROM public.enterprise_finance_accounts WHERE credit_card_id=card)<>1 OR EXISTS(SELECT 1 FROM public.finance_card_purchases WHERE card_id=card AND installments<>1) THEN RAISE EXCEPTION 'Import invented future installments';END IF;
 result:=public.import_card_invoice(card,m,items);
 IF (result->>'added')::integer<>0 OR (result->>'skipped')::integer<>2 THEN RAISE EXCEPTION 'Duplicate file imported';END IF;
 SELECT count(*) INTO before_count FROM public.finance_card_purchases WHERE card_id=card;
 BEGIN PERFORM public.import_card_invoice(card,m,jsonb_build_array(jsonb_build_object('import_key','file:partial:1','description','Valid row','amount_cents',100,'purchased_on',current_date),jsonb_build_object('import_key','file:partial:2','description','Invalid row','amount_cents',-100,'purchased_on',current_date)));RAISE EXCEPTION 'Invalid batch accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 IF (SELECT count(*) FROM public.finance_card_purchases WHERE card_id=card)<>before_count THEN RAISE EXCEPTION 'Batch partially persisted';END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','a6fd10de-33d6-45c3-b423-9290dad107ea',true);
DO $$BEGIN BEGIN PERFORM public.import_card_invoice(gen_random_uuid(),current_date,'[]');RAISE EXCEPTION 'Collaborator can import';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;ROLLBACK;
SELECT 'PASS: importação atômica, deduplicação, mês único, sem parcelas futuras inventadas, RLS; nenhum dado fictício persistido' result;
