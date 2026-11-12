# Verification record

## Scheduled reply follow-up

On 2026-11-12, 20 browser and Auth checks passed with two loopback Gmail
accounts and three conversations. A simulated Vietnam midnight surfaced
only the due conversation. A moved appointment kept its new date across
restart. A reply delivered during preview was picked up at confirmation and
prevented dispatch. One approved reminder lost both provider and browser
acknowledgements. A restart and three replays preserved one dispatch, one
receipt and one Sent row. Local lint, TypeScript, 241 unit tests, 197
integration tests, 21 SQL checks, 23 reply workflow checks, 25 design checks,
19 platform checks and 31 staging checks passed. See the
[scheduled follow-up handoff](REPLY_FOLLOWUP_LOCAL_HANDOFF.md).

## Reply workflow and follow-up

On 2026-11-12, 23 browser and Auth checks passed with two loopback Gmail
accounts and a production-mode Next build. A server-saved draft reopened in
a new mobile viewport session. After Gmail accepted one reply and both the
provider and browser acknowledgement paths were interrupted, a Next restart
and three replays preserved one dispatch, one receipt and one Sent row.
Inbox ignored three decoys and surfaced the linked reply. The commitment
changed only after a separate approval. Local lint, TypeScript, 241 unit tests,
197 integration tests, 20 SQL groups, 25 design, 19 platform, 41 E2E, 22 daily
and 24 catch-up checks passed. See the [reply workflow handoff](REPLY_WORKFLOW_LOCAL_HANDOFF.md).

## Inbox catch-up after absence

On 2026-11-12, the local catch-up workflow passed 24 checks in a production-mode
Next build. Two loopback Gmail accounts received 126 synthetic messages during
three simulated days. After browser disconnection, one provider socket drop and
a Next process restart, the Inbox showed 132 unique messages and all six
outstanding replies. There were 125 later messages than the critical reply.
Source opening, duplicate approval, acknowledgement, tenant isolation and
zero outbound attempts were verified. Lint, TypeScript, 241 unit tests, 197
integration tests, 19 SQL groups, 22 daily, 25 design, 19 platform and 41 E2E
checks completed locally. See the [catch-up handoff](INBOX_CATCHUP_LOCAL_HANDOFF.md).

Latest: [M6-G Commitment Intelligence evaluation](M6G_LOCAL_HANDOFF.md).
Previous: [M6-F adversarial security rehearsal](#m6-f-adversarial-security-rehearsal),
[M6-E Gmail consent](#m6-e-gmail-consent),
[M6-D Codex preview and purchasing journey](M6D_LOCAL_HANDOFF.md),
[M6-B local staging, recovery and alert evidence](M6B_LOCAL_HANDOFF.md),
[M6-A local performance and platform evidence](M6A_LOCAL_HANDOFF.md),
[M5-B local AI Operator verification and undo evidence](M5B_LOCAL_HANDOFF.md),
[M5-A local AI Operator evidence](M5A_LOCAL_HANDOFF.md),
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

## M6-C SMTP and IMAP destination controls

The server checks SMTP and IMAP destinations during account setup and on every
connection from stored settings, including sync, lazy bodies, attachments and
SMTP send. SMTP allows implicit TLS on 465 and requires STARTTLS on 587 and
2525. IMAP allows implicit TLS on 993 and requires STARTTLS on 143. TLS 1.2 or
later and a valid certificate for the configured DNS name or IP are required.

Both DNS address families are checked before the application opens a socket. A
disallowed address in either answer blocks the connection. The application
passes one vetted numeric address to the mail driver, preferring IPv4 when
present, and preserves the configured DNS name for SNI and certificate checks.
Attachment downloads query the source account by ID and authenticated owner
because the existing email schema has no PostgREST relationship to that table.

Local runs on macOS, Node 24.14.1, npm 11.11.0 and Next.js 16.4.6 used synthetic
credentials, DNS answers and mail. Wire tests made actual TCP and TLS
connections to loopback fixtures. They tested mixed DNS answers, zero socket
attempts on denied targets, a simulated rebinding answer on re-resolution,
mandatory STARTTLS, wrong certificate names, untrusted certificates and
credential use only after TLS. Local Auth checked that a denied SMTP send
keeps a replayable terminal receipt and a denied IMAP sync preserves its
cursor and message rows. It also covered source-account setup and stored-account
body and attachment reads, including an attachment linked to a foreign account.

| Command | Observed result |
| --- | --- |
| `npm run lint` | Exit 0, zero errors and 91 existing warnings |
| `npm run typecheck` | Exit 0 |
| `npm run test:unit` | Exit 0, 236/236 |
| `npm run test:integration` | Exit 0, 190/190, including 15 mail wire cases |
| `npm run test:db` | Exit 0, 16 groups |
| `npm run test:local-auth -- --m6c` | Exit 0, [88 checks](evidence/m6c-auth-run.json) |
| `npm run test:staging -- --m6c` | Exit 0, [31 checks](evidence/m6c-staging-run.json), including the production-mode Next build and local recovery |
| `npm run build` | Exit 0 with synthetic configuration and 89/89 static pages generated. Existing Sentry import deprecation remains. |

M6-C required no database migration. If the application change is reverted,
keep outbound mail connections disabled until the destination checks are restored.
The security gate remains closed. Hosted network routing, real-provider
interoperability and large-message or folder support still require separate evidence.

The harnesses removed their temporary certificates, archives, database files,
containers and networks. The existing `.next` output was reused. `docker image
prune -f` reclaimed 0 B.

## M6-D purchasing journey

Verified locally on macOS 27.2, Node 24.14.1, Next.js 16.4.6 and Chrome
157.0.8103.52. Both modes use the same synthetic seed in separate environments.
The E2E run used `inboxai-m6d-e2e` and `.next-build` while the manual preview
continued on port `55300` with the same build ID and containers before and after the run.

| Command or observation | Observed result |
| --- | --- |
| `npm run test:e2e` | Exit 0, 24 checks including 14 Auth checks and 10 browser scenarios. The harness completed a production-mode Next build. [Run report](../../test-results/m6d/report.json) |
| `npm run preview:e2e` | Logged in with the synthetic buyer in the Codex desktop browser and saw the schedule-change email under **Cần xử lý**. Restart seeded a new unread, unarchived source row. Ctrl+C removed the fixture containers, networks and temporary certificate directory. |
| `npm run test:local-auth -- --m6c` | Exit 0, 88 regression checks |
| `npm run test:unit` and `npm run test:integration` | Exit 0, 236 and 190 tests respectively |
| `npm run lint` and `npm run typecheck` | Exit 0. Lint reported 91 existing warnings and zero errors. |

The browser run used the production routes, real local GoTrue and PostgreSQL,
and a TLS SMTP fixture that handed mail to Mailpit. The app received synthetic
inbound rows through the fixture seed. The automatic journey used a desktop
viewport and the second tenant check used a mobile viewport. The real-mailbox
and production security gate remains closed.

## M6-E Gmail consent

Both connection entry points request `gmail.readonly` and `userinfo.email`.
Settings requests `gmail.send` separately with Google's incremental authorization
option. The signed PKCE transaction binds the logged-in user, account and
credential revision. Updating the encrypted credential requires a verified
matching Google identity and explicit read and send scopes. If Google omits a
new refresh token, the existing refresh token must return both scopes before
the app saves the grant. An explicit read reconnect returns the app to read-only.
Existing credentials with recorded legacy scopes remain readable.

When a Gmail response explicitly denies sending scope, the app records the
rejected send and disables sending on the matching credential. A complete
provider revocation also interrupts reading. Gmail `gmail.readonly` remains a
restricted scope. The applicability of Google verification and security
assessment stays open. [Google incremental authorization and revocation](https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth),
[Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes)

`npm run test:e2e` runs the purchasing journey and the Gmail consent scenarios
on production-mode Next.js, local GoTrue, PostgREST and PostgreSQL, Mailpit and
Chrome. The Gmail provider fixture checks PKCE, treats authorization codes as
single-use and returns synthetic scopes and mail. Its HTTP requests stay on
loopback. The test exercises the production application routes and the real local
encrypted vault. There is no database migration in M6-E.

Run on 2026-11-12 with macOS 27.2, Node 24.14.1, Next.js 16.4.6 and Chrome
157.0.8103.52. The dedicated E2E run used port `57300`. The earlier purchasing
preview on `55300` retained the same `.next` build ID and returned HTTP 200.

| Command | Observed result |
| --- | --- |
| `npm run test:e2e` | Exit 0. 35 checks: 14 Auth/database, 10 purchasing journey and 11 Gmail consent. The same command completed the optimized Next.js build. [Local report](../../test-results/m6d/report.json) |
| `npm run lint` | Exit 0, 0 errors and 91 existing warnings. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0, 236 tests across 19 files. |
| `npm run test:integration` | Exit 0, 191 tests across 15 files. |
| `npm run test:design -- --isolated` | Exit 0, 25 checks including desktop, tablet, mobile, dark mode and axe on sampled Inbox states. [Local report](../../test-results/m6d/design-run.json) |

An early test followed Google's authorization redirect with the synthetic OAuth
client ID and Google rejected it as `invalid_client`. The final run intercepts
the first navigation before redirecting, blocks browser egress with an explicit
loopback-only proxy bypass and routes server requests to the local fixture.
The full revocation test waits through the existing sync retry backoff before
checking reconnect and deduplication. Real Google interoperability and hosted
verification remain open.

Both harness runs removed their isolated containers and networks. The generated
`.next-build` output was removed after the last check. `docker image prune -f`
reclaimed 0 B.

## M6-F adversarial security rehearsal

Reproduced three findings against synthetic data before repairing them.

| Finding | Repair and regression evidence |
| --- | --- |
| Mail HTML retained remote and app-relative image sources, CSS and application class names. The sanitizer also appended an inline error handler after sanitizing. | Sanitize the DOM, remove email-supplied styles and active markup, retain embedded raster images and safe links. Chrome observes no request to local or remote tracking probes. Two sanitizer unit tests cover the markup and image policy. |
| The attachment endpoint returned arbitrary MIME bytes inline under the app origin. | Download with `application/octet-stream`, sandbox, `nosniff` and `private, no-store`. Explicit inline previews require a supported raster MIME type and matching bytes. HTML, SVG and PDF remain available as downloads. Integration runs the actual handler with synthetic MIME and a stubbed IMAP transport. |
| The behavior tracker used a service-role email lookup by ID alone. The second tenant received HTTP 200 for a foreign email ID. | Bind the lookup to the authenticated owner before writing behavior or reputation. Reuse the owned sender result for domain tracking. The browser run tests foreign and anonymous denial and the owner's domain log in PostgreSQL. |

The browser fixture uses local GoTrue, PostgREST, PostgreSQL, Chrome and Mailpit.
It checks private email detail, attachment list and download access, copied
citation URLs and Operator plan access with two synthetic tenants and an anonymous
session. The owner sees the invoice amount recorded in the fixture, while Ask Inbox ignores an
instruction to invent a different amount. The fixture attempts an unapproved
execution, foreign target selection and an expanded execution request. It checks
the final database flags and journal and compares send requests, send receipts
and SMTP captures before and after the scenario. The tests cover the current
deterministic Ask Inbox and Operator paths. No model provider call is exercised.

OSV-Scanner 2.7.1 matched `package-lock.json` offline against the public npm
snapshot dated `2026-11-11 21:48:35 UTC` (generation `1794433714913331`, SHA-256
`d94f621c3ef2c1a786197a0a157c61520c926f3277f103910f10f8e21764e11b`). The
scan extracted 908 packages and exited 1 with two Moderate advisories and zero
High or Critical findings in that snapshot. The lockfile remained unchanged.
`glob@13.0.7` is pulled by Sentry's bundler plugins. `minimatch@10.2.6` is
pulled by that `glob` version and TypeScript ESLint. The listed fixes require
major upgrades. Both findings remain open for compatible parent upgrades.
[Offline scanner mode](https://google.github.io/osv-scanner/usage/offline-mode/),
[glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
[minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249),
[Local scan](../../test-results/m6f/osv.json)

Native dependencies, container images, hosted configuration and real-provider
behavior are outside this run. This evidence leaves the real-mailbox and
production gate closed.

Local run on 2026-11-12 with macOS 27.2, Node 24.14.1, Next.js 16.4.6 and Chrome
157.0.8103.52. The existing preview on `55300` was served by the earlier build.

| Command | Observed result |
| --- | --- |
| `npm run lint` | Exit 0. Zero errors and 91 existing warnings. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0. 238 tests across 20 files. |
| `npm run test:integration` | Exit 0. 197 tests across 16 files. |
| `npm run test:e2e` | Exit 0. 41 checks, including six adversarial security checks. The harness completed a production-mode Next build. [Local report](../../test-results/m6f/e2e-report.json) |
| `npm run test:design -- --isolated` | Exit 0. 25 checks across desktop, tablet, mobile and dark mode. [Local report](../../test-results/m6f/design-report.json) |
| OSV-Scanner `scan source --offline --lockfile package-lock.json` | Exit 1. Two Moderate npm advisories. [Local report](../../test-results/m6f/osv.json) |

The isolated containers and networks, `.next-build`, OSV snapshot and scanner
binary were removed. Local logs and JSON evidence were retained. Docker image
prune reclaimed 0 B. The M6-D preview returned HTTP 200 with its original build ID.
