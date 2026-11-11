#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Only a dedicated local disposable database is permitted. Never link Supabase.
task_pg_dir=""
cleanup() {
  if [[ -n "$task_pg_dir" ]]; then
    "$task_pg_bin/pg_ctl" -D "$task_pg_dir/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$task_pg_dir"
  fi
}
trap cleanup EXIT
if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  task_pg_bin="$(pg_config --bindir)"
  task_pg_dir="$(mktemp -d "$PWD/.codex-db-test-XXXXXX")"
  "$task_pg_bin/initdb" -D "$task_pg_dir/data" --auth=trust --username=postgres >/dev/null
  # Unix socket only: test service is never exposed on a network interface.
  "$task_pg_bin/pg_ctl" -D "$task_pg_dir/data" -l "$task_pg_dir/server.log" \
    -o "-F -k $task_pg_dir -c listen_addresses=''" -w start >/dev/null
  "$task_pg_bin/createdb" -h "$task_pg_dir" -U postgres inboxai_security_test
  export TEST_DATABASE_URL="postgresql://postgres@/inboxai_security_test?host=$task_pg_dir"
else
  node - <<'JS'
const u = new URL(process.env.TEST_DATABASE_URL);
if (!['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.pathname !== '/inboxai_security_test') {
  throw new Error('TEST_DATABASE_URL must be the dedicated local inboxai_security_test database');
}
JS
fi

psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/bootstrap.sql
for task_migration in supabase/migrations/*.sql; do
  echo "Applying $task_migration"
  psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$task_migration"
done
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/tenant-isolation.sql
