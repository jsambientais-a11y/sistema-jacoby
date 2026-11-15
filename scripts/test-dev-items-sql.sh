#!/usr/bin/env bash
set -eu
# Never consumes a database URL. Only a new private Unix-socket cluster is used.
for executable in initdb pg_ctl psql; do command -v "$executable" >/dev/null || { echo "Missing local PostgreSQL executable: $executable" >&2; exit 1; }; done
jacoby_test_dir=$(mktemp -d "${TMPDIR:-/tmp}/jacoby-dev-items-pg.XXXXXX")
cleanup() {
  pg_ctl -D "$jacoby_test_dir/data" -m fast stop >/dev/null 2>&1 || true
  rm -rf -- "$jacoby_test_dir"
}
trap cleanup EXIT
initdb -D "$jacoby_test_dir/data" -A trust --no-locale > "$jacoby_test_dir/init.log" 2>&1
pg_ctl -D "$jacoby_test_dir/data" -l "$jacoby_test_dir/server.log" -o "-k '$jacoby_test_dir' -h '' -p 55437" start >/dev/null
psql -h "$jacoby_test_dir" -p 55437 -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1 \
 -f tests/sql/dev-items-fixture.sql \
 -f supabase/migrations/20261103233000_lock_finalized_bulletins_per_user.sql \
 -f supabase/migrations/20261115120000_task_document_request_notifications.sql \
 -f supabase/migrations/20261115121000_allow_scoped_finalized_invoice_append.sql \
 -f tests/sql/dev-items-assertions.sql
