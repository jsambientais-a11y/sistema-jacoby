BEGIN;

ALTER TABLE public.finance_bank_accounts
  ADD COLUMN payable_categories text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(payable_categories) <= 30);

ALTER TABLE public.finance_cost_centers
  ADD COLUMN bank_account_id uuid REFERENCES public.finance_bank_accounts(id) ON DELETE RESTRICT;

CREATE INDEX finance_cost_centers_bank ON public.finance_cost_centers (bank_account_id)
  WHERE bank_account_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
