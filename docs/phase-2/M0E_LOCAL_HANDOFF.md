# M0-E local handoff, 2026-11-11

Owner steering: **local only until verified**. No push, remote PR, remote CI run,
hosted migration or deployment was performed. Local PR drafts are review material.
Implementation commits: `fb54205` (signup/admission) and `26f978d` (local rehearsal).

## Outcome and boundaries

Registration no longer auto-confirms arbitrary addresses through the admin API.
It now validates input, checks the Auth server's email-confirmation configuration,
uses regular PKCE signup, returns a verification-required outcome, and refuses an
unexpected immediate session. Signup and preflight are closed by default through
both `SIGNUP_ENABLED` and a server-managed database policy.

The database admission trigger also protects direct Auth API user creation. Capacity
is enforced under a shared row lock, not a paginated or racy `listUsers` count.
Whitelist/approved-request admission is supported, and explicit revocation wins.
New admitted accounts receive existing application membership so verified signup
can actually reach Inbox. Legacy memberships and administrator roles are not backfilled.

Next signup/preflight attempts use shared PostgreSQL counters: 20 attempts per IP
bucket per 15 minutes and 6 per email per hour. Both endpoints count. Identifiers
are HMAC hashes. Forwarded chains are ignored; an operator may explicitly trust an
overwritten single-IP header, otherwise requests share a conservative IP bucket.
This does not replace native GoTrue rate limits/CAPTCHA for direct Auth calls.

Auth callbacks use the configured app origin, reject external `next` destinations
and log only an error classification. Signup UI now explains verification and keeps
the waitlist path. No design-system restyling was included.

## Evidence

| Check | Observed result | Provenance |
| --- | --- | --- |
| Unit | 49 passed | Vitest; includes schema/rate identifiers and signup UI |
| Route integration | 108 passed | Actual handlers, mocked DB/Auth boundary; includes callback redirects |
| PostgreSQL | Passed | 10 versioned migrations from empty database; anonymous/two-tenant/RPC/admission scenarios |
| Concurrent capacity | Passed | 10 separate PostgreSQL clients compete for one slot; exactly one accepted |
| Local Auth rehearsal | 14 passed | Real GoTrue 2.197.0, PostgREST 14.18, Next dev, PostgreSQL and Mailpit capture sink |
| TypeScript | Exit 0 | Full repository typecheck |
| Lint | Exit 0, 0 errors / 106 warnings | No rules disabled |
| Build | Exit 0 | Synthetic configuration; no provider credentials |
| Dependency audit | 11 moderate, 0 high/critical | Actual npm audit; high severity gate exits 0 |

The 14 service scenarios include pre-upgrade profile preservation, native signup
bypass denial, no session before confirmation, password-login rejection before
verification, an email delivered to the internal capture sink, real PKCE callback,
Inbox access, actual JWT/RLS email isolation, anonymous denial, server provisioning
of an admin role, and denial immediately after revocation. These scenarios are not
duplicated into the Vitest count, and are not hosted-staging or live-mail evidence.
This is HTTP protocol integration, not browser/device e2e, Gmail OAuth verification
or actual delivery to a real mailbox. The Next test process receives an allowlist
of basic OS environment values plus synthetic keys, not inherited provider secrets.

Fixtures initially failed on Auth schema ownership, a Docker internal-network port
assumption and confirmation URL handling. Those fixture problems were repaired;
the recorded final rehearsal starts clean and passes. The app callback's configured
origin and redirect behavior are additionally covered by regression tests.

Logs: [unit](evidence/m0e-unit.log), [routes](evidence/m0e-integration.log),
[database/concurrency](evidence/m0e-db.log), [local Auth scenarios](evidence/m0e-local-auth.json),
[local Auth run](evidence/m0e-local-auth.log), [images](evidence/m0e-local-images.json),
[typecheck](evidence/m0e-typecheck.log), [lint](evidence/m0e-lint.log),
[build](evidence/m0e-build.log), [audit](evidence/m0e-audit-after.json).

## Debt disposition

The retained [warning inventory](evidence/m0e-warning-triage.json) records:

| Class | Count | Disposition |
| --- | --- | --- |
| Unused variables/imports | 86 | Low priority cleanup alongside owning module changes; avoid unrelated deletion in security work |
| Missing hook dependencies | 6 | M2 functional tests for action refresh, reply analysis, detail state and smart replies before changing dependencies; blind dependency insertion can create repeated effects |
| Raw image elements | 4 | M2/M6 image sizing, loading and performance work |
| Virtualizer compiler compatibility | 1 | Compiler skips incompatible memoization; validate large-list behavior in M2/M6 |
| Anonymous default exports | 8 | Low priority naming cleanup |
| Unused lint directive | 1 | Low priority cleanup |

The 11 moderate package findings represent transitive reports rooted in two
advisories, not 11 independent application exploits:

- [glob cancellation/traversal](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4):
  Sentry build-plugin chain. Treat build resource usage as a real CI risk. Existing
  CI jobs are time bounded. Upgrade the Sentry build integration in a dedicated
  compatibility PR; do not force a major SDK upgrade without behavior checks.
- [minimatch amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249):
  TypeScript ESLint/glob tooling chain. Bounded CI duration limits damage but is not
  a patch. Update lint tooling with regression evidence before public release.

Captured dependency trees are retained beside the audit. This scope assessment
does not prove the packages unreachable in every possible runtime configuration.
No suppression, forced override or zero-vulnerability claim was introduced.

## Reproduce locally

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:db
docker compose -f tests/local-auth/compose.yml pull
npm run test:local-auth
```

The Auth harness accepts no hosted URL or production credentials. Its fixed
synthetic identities use `.test`, and database/Auth/REST/mail run on an internal
network without internet egress. An HTTP-only gateway publishes loopback ports;
it has no mail relay. PostgreSQL data is tmpfs. The harness tears down its own five
containers/two networks and refuses to replace a pre-existing test project. It
reuses `.next`; there are no task-specific build folders or project copies.
All test-owned containers/networks and `.codex-db-test-*` directories were removed.
`docker image prune -f` was run; it reclaimed 0 B. No volume/container prune was used.
Use the synthetic build environment from CI for `npm run build`.

The new CI job is authored for future use but was **not run on GitHub**, respecting
the local-only instruction. The existing local database harness now rejects URL
query overrides that could redirect a nominally local connection elsewhere.

## Gate and next work

**Local M0-E: READY with tracked debt. Real-mail/production gate: CLOSED.**
This is enough local evidence to begin M1-A credential-vault work. It is not a
release approval. Remaining obligations include the vault/rotation boundary,
native Auth rate/CAPTCHA configuration, hosted configuration and migration
rehearsal, remote required checks/branch protection, durable sync and send
idempotency. The main branch was observed without protection during the initial
read-only inspection; nothing was changed remotely.

Do not enable registration in a real environment from this report alone. Both
application and database policy default closed, and `mailer_autoconfirm=false`
is checked before application signup. Remote public Auth configuration must still
be verified independently; a local test cannot certify it.

Administrator bootstrap must target an already verified account UUID through a
trusted administrative channel and merge server-managed app metadata. Never infer
the role from an email, accept it from signup data, or change profile.is_admin to
grant access. The local harness proves grant/revoke against its own synthetic
account only. No legacy user was assigned new privileges.

References: [Supabase signup](https://supabase.com/docs/reference/javascript/auth-signup),
[Auth settings implementation](https://github.com/supabase/auth/blob/master/internal/api/settings.go),
[Supabase self-hosted component versions](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml).
