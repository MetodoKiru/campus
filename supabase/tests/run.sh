#!/usr/bin/env bash
# Aplica todas las migraciones sobre una base vacía y ejecuta las pruebas RLS.
# Uso: PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres supabase/tests/run.sh
# Nunca lo ejecutes contra la base de producción: borra y recrea la base "kiru_rls_test".
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=kiru_rls_test
psql -v ON_ERROR_STOP=1 -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/supabase_stubs.sql
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -1 -f "$f" 2>&1 | { grep -v NOTICE || true; }
done
output=$(psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/rls_roles_test.sql 2>&1)
echo "$output" | grep -E "ok  |FAIL|ERROR" | sed 's/^.*NOTICE:  //'
if echo "$output" | grep -qE "FAIL|ERROR"; then exit 1; fi
