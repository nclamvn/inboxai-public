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
if (!['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.pathname !== '/inboxai_security_test' || u.search) {
  throw new Error('TEST_DATABASE_URL must be the dedicated local inboxai_security_test database');
}
JS
fi

psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/bootstrap.sql
for task_migration in supabase/migrations/*.sql; do
  if [[ "$task_migration" == "supabase/migrations/20261111020000_credential_vault.sql" ]]; then
    psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/credential-upgrade.sql
  fi
  if [[ "$task_migration" == "supabase/migrations/20261111090000_ask_inbox.sql" ]]; then
    psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v seed_ask_mail=true -f tests/db/ask-inbox-upgrade.sql
  fi
  if [[ "$task_migration" == "supabase/migrations/20261112010000_operator_outcomes.sql" ]]; then
    psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v seed_operator_legacy=true -f tests/db/operator-outcomes-upgrade.sql
  fi
  if [[ "$task_migration" == "supabase/migrations/20261112020000_commitment_lifecycle.sql" ]]; then
    psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v seed_commitment_legacy=true -f tests/db/commitment-lifecycle-upgrade.sql
  fi
  echo "Applying $task_migration"
  psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$task_migration"
  if [[ "$task_migration" == "supabase/migrations/20261111090000_ask_inbox.sql" ]]; then
    psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v seed_ask_mail=false -f tests/db/ask-inbox-upgrade.sql
  fi
  if [[ "$task_migration" == "supabase/migrations/20261112010000_operator_outcomes.sql" ]]; then
    psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v seed_operator_legacy=false -f tests/db/operator-outcomes-upgrade.sql
  fi
  if [[ "$task_migration" == "supabase/migrations/20261112020000_commitment_lifecycle.sql" ]]; then
    psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v seed_commitment_legacy=false -f tests/db/commitment-lifecycle-upgrade.sql
  fi
done
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/tenant-isolation.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/registration.sql
node scripts/test-registration-concurrency.mjs
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/credential-vault.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/sync-contracts.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/mail-send.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/scheduled-mail.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/gmail-reconnect.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/action-inbox.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/commitment-ledger.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/commitment-board.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/commitment-detection.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/commitment-attention.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/commitment-catchup.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/reply-workflow.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/compose-attachments.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/gmail-triage.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/email-snoozes.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/ask-inbox.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/ask-inbox-answer.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/operator-plans.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/operator-outcomes.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/personal-mail-rules.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/mail-lookup.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/action-notifications.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/compose-recipient-history.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/draft-continuity.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/db/offline-compose.sql
