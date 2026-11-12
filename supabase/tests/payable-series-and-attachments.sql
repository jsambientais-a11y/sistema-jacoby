BEGIN;
SELECT set_config('request.jwt.claim.sub', 'b2f6e43d-ce24-4de2-a770-0548793cc180', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  series_id uuid;
  series_version timestamptz;
  paid_id uuid;
  overdue_id uuid;
  next_id uuid;
  file_name text;
  removed integer;
BEGIN
  series_id := public.save_finance_recurrence(jsonb_build_object(
    'description', 'Série de teste', 'amount_cents', 5000, 'frequency', 'monthly',
    'start_on', current_date - 40
  ));
  SELECT updated_at INTO series_version FROM public.finance_recurring_expenses WHERE id = series_id;
  SELECT id INTO STRICT overdue_id FROM public.enterprise_finance_accounts
    WHERE recurrence_id = series_id AND occurrence_on = current_date - 40;
  SELECT id INTO STRICT paid_id FROM public.enterprise_finance_accounts
    WHERE recurrence_id = series_id ORDER BY occurrence_on OFFSET 1 LIMIT 1;
  SELECT id INTO STRICT next_id FROM public.enterprise_finance_accounts
    WHERE recurrence_id = series_id AND occurrence_on > current_date ORDER BY occurrence_on LIMIT 1;
  UPDATE public.enterprise_finance_accounts SET settled_on = current_date WHERE id = paid_id;

  file_name := overdue_id || '/' || gen_random_uuid() || '--nota.xml';
  INSERT INTO storage.objects(bucket_id, name) VALUES ('payable-attachments', file_name);
  PERFORM set_config('request.jwt.claim.sub', 'a6fd10de-33d6-45c3-b423-9290dad107ea', true);

  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'payable-attachments' AND name = file_name) THEN
    RAISE EXCEPTION 'Colaborador leu anexo financeiro.';
  END IF;
  BEGIN
    INSERT INTO storage.objects(bucket_id, name) VALUES ('payable-attachments', next_id || '/' || gen_random_uuid() || '--privado.pdf');
    RAISE EXCEPTION 'Colaborador anexou arquivo.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_payable_recurrence(series_id, series_version);
    RAISE EXCEPTION 'Colaborador excluiu a série.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', 'b2f6e43d-ce24-4de2-a770-0548793cc180', true);

  BEGIN
    PERFORM public.delete_payable_recurrence(series_id, series_version - interval '1 second');
    RAISE EXCEPTION 'Versão desatualizada excluiu a série.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'A recorrência mudou. Atualize antes de continuar.' THEN RAISE; END IF;
  END;

  removed := public.delete_payable_recurrence(series_id, series_version);
  IF removed < 2 OR (SELECT count(*) FROM public.enterprise_finance_accounts
    WHERE id IN (overdue_id, next_id) AND deleted_at IS NOT NULL AND recurrence_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'A exclusão não abrangeu contas vencidas e futuras.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enterprise_finance_accounts
    WHERE id = paid_id AND settled_on = current_date AND deleted_at IS NULL AND amount_cents = 5000 AND recurrence_id IS NULL) THEN
    RAISE EXCEPTION 'A baixa paga não foi preservada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_recurring_expenses WHERE id = series_id)
    OR public.sync_finance_recurrences(NULL, series_id) <> 0 THEN
    RAISE EXCEPTION 'A série excluída ainda pode gerar contas.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'payable-attachments' AND name = file_name) THEN
    RAISE EXCEPTION 'Anexo da conta excluída ficou inacessível.';
  END IF;
  BEGIN
    INSERT INTO storage.objects(bucket_id, name) VALUES ('payable-attachments', overdue_id || '/' || gen_random_uuid() || '--novo.pdf');
    RAISE EXCEPTION 'Conta excluída aceitou novo anexo.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.enterprise_finance_accounts SET deleted_at = NULL WHERE id = overdue_id;
  IF NOT EXISTS (SELECT 1 FROM public.enterprise_finance_accounts
    WHERE id = overdue_id AND deleted_at IS NULL AND recurrence_id IS NULL) THEN
    RAISE EXCEPTION 'Conta não pôde ser restaurada como avulsa.';
  END IF;
  DELETE FROM storage.objects WHERE bucket_id = 'payable-attachments' AND name = file_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anexo não pôde ser excluído.'; END IF;
END;
$$;
ROLLBACK;
