BEGIN;

CREATE UNIQUE INDEX finance_cost_centers_account_name_unique
  ON public.finance_cost_centers (bank_account_id, lower(trim(name)))
  WHERE bank_account_id IS NOT NULL;
CREATE UNIQUE INDEX finance_cost_centers_general_name_unique
  ON public.finance_cost_centers (lower(trim(name)))
  WHERE bank_account_id IS NULL;
DROP INDEX public.finance_cost_centers_name_unique;

ALTER TABLE public.finance_bank_accounts
  ADD COLUMN account_usage text CHECK (account_usage IN ('personal', 'business'));

NOTIFY pgrst, 'reload schema';

COMMIT;
