# Verification record

Latest: [M5-B local AI Operator verification and undo evidence](M5B_LOCAL_HANDOFF.md).
Previous: [M5-A local AI Operator evidence](M5A_LOCAL_HANDOFF.md),
[M4-B local Ask Inbox answer evidence](M4B_LOCAL_HANDOFF.md),
[M4-A local Ask Inbox evidence](M4A_LOCAL_HANDOFF.md),
[M3-C local commitment detection evidence](M3C_LOCAL_HANDOFF.md),
[M3-B local commitment workflow evidence](M3B_LOCAL_HANDOFF.md) and
[M3-A local Commitment Ledger evidence](M3A_LOCAL_HANDOFF.md).
Previous: [M2-B local Action Inbox evidence](M2B_LOCAL_HANDOFF.md).
Previous: [M2-A local design system evidence](M2A_LOCAL_HANDOFF.md).
Previous: [M1-C local send evidence](M1C_LOCAL_HANDOFF.md).
Previous: [M1-B local sync evidence](M1B_LOCAL_HANDOFF.md).
Previous: [M1-A local credential vault evidence](M1A_LOCAL_HANDOFF.md). The M0 record
below is historical; M1-A removes the public secret columns described as pending there.

# M0 verification and handoff

This is the original M0 baseline record. The subsequent local-only M0-E work,
updated test counts and real local Auth evidence are in [M0E_LOCAL_HANDOFF.md](M0E_LOCAL_HANDOFF.md).

Date: 2026-11-11 (Asia/Ho_Chi_Minh). Source baseline: `240d9e1`.
Branch: `phase2/m0-security-baseline-20261111`.
Verified implementation commit: `2230c63` (preceded by audit `0a05e64` and
dependency/React baseline `b423a0a`). The final evidence commit changes documentation only.

**Outcome: local security baseline implemented and verified within the scope below.
Production and real-mail readiness: NOT READY.** Remote CI, deployed configuration
and production data have not been inspected or certified. M1-M6 are not implemented.

## Actual checks

Local environment: macOS arm64, Node 24.14.1, npm 11.11.0, PostgreSQL 16.14.
Disk free before installs/builds: 48-50 GiB, above the required 10 GB floor.

| Command / evidence | Baseline | Final observed result |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Original lock installed successfully | Exit 0, 752 installed packages; lockfile reproduced |
| `npm run lint` | Exit 1: 27 errors, 109 warnings | Exit 0: 0 errors, 106 warnings; no rules disabled |
| `npm run typecheck` | Exit 0 | Exit 0 |
| `npm test` | Exit 1: no script | Vitest added; final split suites below cover 126 distinct test cases |
| `npm run test:unit` | No configured runner | Exit 0: 45/45, 6 files |
| `npm run test:integration` | No configured runner | Exit 0: 81/81, 4 files; mocked DB/providers at route boundaries |
| `npm run test:db` | No harness | Exit 0: all 8 legacy migrations + new forward migration applied on disposable local PostgreSQL; anonymous/two-tenant SQL scenarios passed |
| `npm run build` | Exit 1 without configuration: eager clients require credentials | Exit 0 with explicit synthetic build-only environment; Next 16.4.6 compilation, typechecking and prerender completed |
| `npm audit --json` | 77 findings: 6 critical, 27 high, 40 moderate, 4 low | 11 moderate, 0 high/critical; JSON audit itself remains nonzero for moderate findings |
| `npm audit --audit-level=high` | High/critical baseline | Exit 0, with the 11 moderate findings still reported |
| `git diff --check` | Clean initial tree | Exit 0 |

Final logs: [installation](evidence/m0-install.log), [lint](evidence/m0-lint.log),
[TypeScript](evidence/m0-typecheck.log), [unit](evidence/m0-unit.log),
[route integration](evidence/m0-integration.log), [PostgreSQL](evidence/m0-db-tests.log),
[build](evidence/m0-build.log), [audit](evidence/m0-npm-audit.json),
[audit severity gate](evidence/m0-audit-gate.log).
Baseline logs are retained separately. Counts are not added across overlapping runs.

## Implemented behavior and evidence boundaries

- Both Google authorization entry points issue random state, signed HTTP-only
  browser transactions and PKCE S256. Both callbacks require matching authenticated
  user/browser/flow, reject forged/missing/expired/future state before exchange,
  clear transaction cookies on completion and avoid false success on persistence failure.
  Token exchange is mocked; Google consent, provider enforcement and native browser
  cookie behavior have not been tested live. Clearing browser cookies is not a
  durable server nonce ledger; authorization-code single use also relies on Google.
- All five cron endpoints, including method aliases, reject missing configuration
  with 503 and bad/missing credentials with 401 before privileged work. The cost
  aggregator now uses an authorized service client rather than scheduler cookies.
  The worker rejects missing URL/secret and no longer defaults to an old live host.
- Foreign reply and sending-account IDs cannot reach SMTP. Settings bodies cannot
  override user_id/id or submit arbitrary fields. Tests exercise the actual route
  handlers with synthetic records and mocked SMTP/DB, not real mail delivery.
- Admin authorization uses server-managed `app_metadata.role`, not fixed emails
  or email suffixes. Whitelist route tests verify denied and allowed roles. **Rollout
  requires provisioning the legitimate administrator's role through a trusted
  administrative channel; do not reintroduce an email fallback.**
- Real local PostgreSQL tests exercise RLS reads, foreign insert/update/delete,
  cross-tenant source/evidence references, profile self-promotion and primary-account
  RPC checks, while confirming own operations still work. Auth functions/roles are
  a minimal Supabase contract stub. This is not a full Supabase/GoTrue deployment,
  PostgREST test or proof of safety for every SQL table/RPC.
- Resend verification uses the actual SDK and raw-body Svix signatures; valid,
  malformed, tampered, stale and future synthetic signatures are tested locally.
  Event-ID deduplication and actual inbound payload retrieval remain M1 work.
- Production Gmail debug access is disabled and token prefixes removed. Legacy
  credential columns remain readable to their owning authenticated tenant until
  M1 replaces this boundary. **The database tests do not prove a credential vault.**
- Frontend baseline repairs cover conditional hook order, media subscriptions,
  hydration/effect cascades, inline component identity, toast callback ordering and
  timer cleanup. jsdom tests cover key affected behaviors. No visual redesign,
  browser/device certification or full accessibility audit is claimed.

Runtime coverage gaps: compact-list selection/remount behavior and toast auto-dismiss
timing have static lint/type/build coverage but no dedicated browser regression test
in this change. Their end-to-end UI fixtures remain M2/M6 work. Sentry/performance
type-only edits are verified by TypeScript and lint rather than artificial unit tests.
The historical classifier/allocation custom runners were not counted or executed:
some require provider/DB context and others mirror local constants. No classifier
accuracy or AI product advantage is inferred from the new security suite.

## Reproduce build without secrets

Use the synthetic values in `.github/workflows/ci.yml`, especially
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` and explicit dummy keys, then run
`npm run build`. No `.env.local` or production credentials were created or loaded
for this verification. Building does not prove runtime provider or database health.
The existing eager client initialization still requires valid configuration shape;
removing every eager client belongs to the staged boundary refactor.

`npm run test:db` creates a disposable Unix-socket-only PostgreSQL instance under
the repository and removes it in an EXIT trap. CI instead uses the dedicated
local `inboxai_security_test` database. The script rejects remote database URLs.

## Remaining work and gate

M0 remote handoff is still pending: the workflow is authored, but no push, PR,
GitHub Actions run or branch-protection verification happened. PR scopes and
dependencies are recorded in IMPLEMENTATION_PLAN; they are not remote PR claims.
The workflow does not deploy, consumes no repository secrets and keeps checks blocking.
Render auto-deploy is disabled in the proposed blueprint only; actual hosted
settings remain unknown. The 106 lint warnings and 11 moderate audit findings are
tracked debt, not ignored or relabeled as zero issues.

Before real mail, resolve credential vault/AEAD rotation, token/schema conventions,
paginated/history/IMAP cursor durability, send idempotency, signup email verification,
rate/admission policy, OAuth scope/verification obligations, deployed-schema upgrade
rehearsal and isolated staging. Preserve the four pillars and design standard.
The original Library concept images were not supplied, and pixel matching has not
been attempted. Market/AI quality/latency/cost and direct LLM/agent comparisons
remain unmeasured, appropriate to later product validation rather than M0 mocks.

Do not undo hardening to recover from rollout problems. Keep cron/webhook failing
closed; repair missing configuration. Rehearse admin metadata provisioning and
database upgrade on staging before rollout. No data-dropping rollback is provided.

## Disk and safety record

No project copy, venv or dependency directory was created outside the repository.
Disposable `.codex-db-test-*` PostgreSQL directories were stopped and deleted after
each test run, including the initial failed run. Only the existing standard `.next`
build output was used. No Docker build/prune, real email, production deployment,
production database migration or modification of main occurred.

Technical references checked during implementation:
[OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Resend verification](https://resend.com/docs/webhooks/verify-webhooks-requests),
[Nodemailer 10 requirements](https://nodemailer.com/),
[Sharp changelog](https://sharp.pixelplumbing.com/changelog/).
