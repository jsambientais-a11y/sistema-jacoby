BEGIN;

-- NULL inherits the series tags. An empty array explicitly clears them for the occurrence.
ALTER TABLE public.enterprise_finance_accounts
  ADD COLUMN tags text[] CHECK (cardinality(tags) <= 12);
ALTER TABLE public.finance_recurring_expenses
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 12);

CREATE FUNCTION public.save_tagged_payable(
  payload jsonb,
  target_id uuid DEFAULT NULL,
  expected_updated_at timestamptz DEFAULT NULL,
  repeat_options jsonb DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  account_id uuid;
  old_rule uuid;
  rule_id uuid;
  account_tags text[];
  occurrence_date date;
BEGIN
  IF public.can_access_sensitive_finance() IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(payload->'tags') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Informe as etiquetas como uma lista.';
  END IF;

  IF jsonb_array_length(payload->'tags') > 12
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(payload->'tags') item
        WHERE jsonb_typeof(item) <> 'string' OR length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 40
      ) THEN
    RAISE EXCEPTION 'Informe até 12 etiquetas com 1 a 40 caracteres.';
  END IF;

  SELECT coalesce(array_agg(tag ORDER BY tag), '{}'::text[]) INTO account_tags
  FROM (SELECT DISTINCT btrim(value) AS tag FROM jsonb_array_elements_text(payload->'tags')) normalized;

  IF target_id IS NOT NULL THEN
    SELECT recurrence_id INTO old_rule FROM public.enterprise_finance_accounts
    WHERE id = target_id FOR UPDATE;
  END IF;

  account_id := public.save_inline_payable(payload, target_id, expected_updated_at, repeat_options);
  SELECT recurrence_id INTO rule_id FROM public.enterprise_finance_accounts WHERE id = account_id;

  IF old_rule IS NOT NULL AND coalesce((repeat_options->>'enabled')::boolean, false)
      AND repeat_options->>'scope' = 'future' THEN
    SELECT occurrence_on INTO occurrence_date FROM public.enterprise_finance_accounts WHERE id = account_id;
    UPDATE public.enterprise_finance_accounts a
    SET tags = r.tags
    FROM public.finance_recurring_expenses r
    WHERE r.id = old_rule AND a.recurrence_id = r.id AND a.tags IS NULL
      AND r.tags IS DISTINCT FROM account_tags
      AND (
        a.occurrence_on < greatest((now() AT TIME ZONE 'America/Sao_Paulo')::date, occurrence_date)
        OR a.settled_on IS NOT NULL OR a.recurrence_overridden
        OR (a.deleted_at IS NOT NULL AND NOT a.recurrence_suppressed)
      );
  END IF;

  IF rule_id IS NOT NULL AND coalesce((repeat_options->>'enabled')::boolean, false)
      AND (old_rule IS NULL OR repeat_options->>'scope' = 'future') THEN
    UPDATE public.finance_recurring_expenses SET tags = account_tags WHERE id = rule_id;
    IF old_rule IS NULL THEN
      UPDATE public.enterprise_finance_accounts SET tags = NULL WHERE id = account_id;
    END IF;
  ELSE
    UPDATE public.enterprise_finance_accounts SET tags = account_tags WHERE id = account_id;
  END IF;

  RETURN account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_tagged_payable(jsonb, uuid, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tagged_payable(jsonb, uuid, timestamptz, jsonb) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
