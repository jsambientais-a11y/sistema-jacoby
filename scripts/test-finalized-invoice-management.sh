#!/bin/bash
set -eu
cd "$(dirname "$0")/.."
d=$(mktemp -d /tmp/jacoby-replace-pg.XXXXXX)
trap 'pg_ctl -D "$d/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$d"' EXIT
initdb -D "$d/data" -A trust --no-locale > "$d/init.log" 2>&1
pg_ctl -D "$d/data" -l "$d/server.log" -o "-k '$d' -h '' -p 55439" start >/dev/null
psql -h "$d" -p 55439 -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1 -f tests/sql/finalized-invoice-fixture.sql -f supabase/migrations/20261103233000_lock_finalized_bulletins_per_user.sql -f supabase/migrations/20261115121000_allow_scoped_finalized_invoice_append.sql -f supabase/migrations/20261115190000_scoped_finalized_invoice_replacement.sql -f supabase/migrations/20261115193000_manage_finalized_bulletin_invoices.sql -f tests/sql/finalized-invoice-management.sql
