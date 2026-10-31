BEGIN;
ALTER TABLE public.finance_bank_accounts ADD COLUMN opening_balance_cents bigint CHECK(abs(opening_balance_cents::numeric)<=1000000000000), ADD COLUMN opening_on date CHECK(opening_on<=CURRENT_DATE), ADD CONSTRAINT bank_opening_pair CHECK((opening_balance_cents IS NULL)=(opening_on IS NULL));
COMMENT ON COLUMN public.finance_bank_accounts.opening_balance_cents IS 'Saldo no início do dia opening_on; baixas nesse dia são somadas ao saldo.';
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261031180000','bank_opening_balances',ARRAY['Opening balance and reference date for monthly cash projections']) ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
