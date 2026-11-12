BEGIN;

CREATE FUNCTION public.delete_payable_recurrence(target_id uuid, expected_updated_at timestamptz)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rule public.finance_recurring_expenses;
  removed integer;
BEGIN
  IF NOT coalesce(public.can_access_sensitive_finance(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501';
  END IF;

  -- Usa o mesmo bloqueio da sincronização antes de desvincular as ocorrências.
  SELECT * INTO rule
  FROM public.finance_recurring_expenses WHERE id = target_id FOR UPDATE;

  IF NOT FOUND OR rule.updated_at IS DISTINCT FROM expected_updated_at THEN
    RAISE EXCEPTION 'A recorrência mudou. Atualize antes de continuar.';
  END IF;
  IF rule.credit_card_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta série pertence a um cartão de crédito.';
  END IF;

  UPDATE public.enterprise_finance_accounts
  SET deleted_at = now()
  WHERE recurrence_id = rule.id AND settled_on IS NULL AND deleted_at IS NULL;
  GET DIAGNOSTICS removed = ROW_COUNT;

  -- Pagamentos mantêm a baixa. Ocorrências excluídas podem voltar como contas avulsas.
  UPDATE public.enterprise_finance_accounts
  SET recurrence_id = NULL, occurrence_on = NULL,
      recurrence_overridden = false, recurrence_suppressed = false
  WHERE recurrence_id = rule.id;

  DELETE FROM public.finance_recurring_expenses WHERE id = rule.id;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_payable_recurrence(uuid, timestamptz) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_payable_recurrence(uuid, timestamptz) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('payable-attachments', 'payable-attachments', false, 15728640);

CREATE FUNCTION public.can_access_payable_attachment(object_name text, require_active boolean)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT coalesce(public.can_access_sensitive_finance(), false)
    AND object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}--[a-zA-Z0-9._-]{1,180}$'
    AND EXISTS (
      SELECT 1 FROM public.enterprise_finance_accounts a
      WHERE a.id = CASE
          WHEN split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(object_name, '/', 1)::uuid
        END
        AND a.kind = 'payable' AND a.credit_card_id IS NULL
        AND (NOT require_active OR a.deleted_at IS NULL)
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_payable_attachment(text, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_payable_attachment(text, boolean) TO authenticated;

CREATE POLICY payable_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payable-attachments');
CREATE POLICY payable_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payable-attachments');
CREATE POLICY payable_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payable-attachments');

CREATE POLICY payable_attachments_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (CASE WHEN bucket_id = 'payable-attachments' THEN public.can_access_payable_attachment(name, false) ELSE true END);
CREATE POLICY payable_attachments_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (CASE WHEN bucket_id = 'payable-attachments' THEN public.can_access_payable_attachment(name, true) ELSE true END);
CREATE POLICY payable_attachments_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (CASE WHEN bucket_id = 'payable-attachments' THEN public.can_access_payable_attachment(name, false) ELSE true END);
CREATE POLICY payable_attachments_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'payable-attachments') WITH CHECK (bucket_id <> 'payable-attachments');
CREATE POLICY payable_attachments_anon_guard ON storage.objects AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id <> 'payable-attachments') WITH CHECK (bucket_id <> 'payable-attachments');

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '20261112160000',
  'payable_series_deletion_and_attachments',
  ARRAY['Delete payable recurrence series and restrict private payable attachments']
)
ON CONFLICT (version) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
