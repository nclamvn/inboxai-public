# Verification record

## Recipient suggestions and sending identity

Compose, Reply and Forward share a keyboard-accessible recipient picker for
To and Cc. It searches up to 160 recent visible outbound messages from the
selected sending account and ranks by frequency and recency. It returns up
to eight addresses, with the full address shown even when names collide.
When Sent contains only an address, an inbound message in the same account
can supply the display name. The lookup uses synchronized mail and supports
Vietnamese names with and without diacritics. Manual address entry remains
available.

Changing the sending account keeps the entered addresses and shows a review
notice. Every new message now uses the existing server draft and approval
flow. The preview displays the saved sender, recipients and content.
Approval binds those fields to that draft revision. An uncertain send resumes by draft ID and checks the
same receipt. When the earlier composer left a matching receipt key in the
tab, the new composer checks it without requesting a second dispatch.

The synthetic Chrome scenario used two loopback Gmail accounts and two
InboxAI users. It distinguished matching Vietnamese names by their full
addresses, kept To while switching accounts and checked Cc against the
new account. Chrome and Next restarted before verifying the saved From,
To and Cc. Both the Gmail acknowledgement and the browser response were
dropped. The same receipt was recovered with one provider dispatch and
one Sent row. The second user could not retrieve either mailbox's
suggestions or read the original draft.

On 2026-11-13, `npm run test:compose-recipients` exited 0 with 20
checks in Chrome 157, with the local Next.js 16.4.6 production-mode
build, Node 24.14.1 and PostgreSQL 16 on macOS arm64. Desktop keyboard
and mobile touch selection worked. The three captured views had zero
axe violations or horizontal overflow. TypeScript, 245 unit tests,
200 integration tests and 31 SQL checks passed. Lint reported 92 warnings
and zero errors. The design, platform, staging, compose attachments,
offline reply, scheduled send and full purchasing/security browser
runs passed 29, 19, 31, 21, 20, 21 and 41 checks respectively.

[Chrome checks](../../test-results/compose-recipients/report.json) ·
[Workflow evidence](../../test-results/compose-recipients/workflow.json) ·
[Two people with the same name](../../test-results/compose-recipients/01-nguoi-trung-ten.png) ·
[Recovered draft](../../test-results/compose-recipients/02-ban-nhap-khoi-phuc.png)

## Actionable notifications

The Inbox and dashboard bell open a list of current work from tracked
replies, due follow-ups, the commitment ledger and Gmail reconnect state.
Each item links to the corresponding email, review, follow-up or OAuth
flow. Viewing records an owner-scoped receipt. Resolving the work updates
the original workflow and removes the item from the next list. A new
Gmail revocation receives a fresh notification identity. The list reuses
the existing bounded reply and commitment views and opens in the web app.

The Chrome journey closes the browser before background sync, injects a
reply and a proposed deadline change, advances the follow-up date, and
revokes one of the two loopback Gmail accounts. After a restart, it
checks four actionable items and excludes 48 promotional emails. It
drops the mark-seen acknowledgement after the database commits, then
reloads and syncs again. The same four IDs and one view receipt survive.
The journey follows the source links, resolves the reply, reschedules
the follow-up, approves the ledger revision, reconnects Gmail and
switches to a second InboxAI user in the same Chrome context.

On 2026-11-13, `npm run test:action-notifications` passed 20 checks in
Chrome 157 on macOS arm64 with Node 24.14.1, PostgreSQL 16 and the
local production-mode Next.js 16.4.6 build. The flow recorded zero
additional Gmail dispatches, no page errors, and no axe violations or
horizontal overflow on the three captured screens. Lint exited 0
with 91 existing warnings. TypeScript, 245 unit tests, 200 integration
tests and 30 SQL checks passed. The isolated design and platform runs
passed 29 and 19 checks. Isolated staging passed 31 checks, including
backup and restore. The reply-followup and reply-workflow regressions
passed 20 and 23 checks.

[Chrome checks](../../test-results/action-notifications/report.json) ·
[Workflow evidence](../../test-results/action-notifications/workflow.json) ·
[Desktop](../../test-results/action-notifications/01-reopen.png) ·
[Seen and still actionable](../../test-results/action-notifications/02-seen-still-open.png) ·
[Mobile](../../test-results/action-notifications/03-mobile.png)

## GitHub Actions attachment authorization regression

The GitHub Actions run for `82c7a46` passed seven of eight jobs. The
local Auth rehearsal expected an English error for a cross-tenant source
account after the attachment endpoint began returning the Vietnamese
message. The rehearsal now asserts both the HTTP 400 and the current
message. [Original CI run](https://github.com/nclamvn/inboxai-public/actions/runs/43218515860)

On 2026-11-12, `npm run test:local-auth -- --isolated-auth` exited 0
with 88 checks and a production-mode Next.js build on macOS arm64 with
Node 24.14.1 and PostgreSQL 16. The isolated option reuses the alternate
loopback ports so the rehearsal can run alongside an existing local
session. Lint and TypeScript exited 0, with 91 existing lint warnings.
All 245 unit tests, 200 integration tests and 29 SQL checks passed.
[Local Auth report](../../test-results/local-auth/report.json)

## Offline reading and reply recovery

On 2026-11-12, `npm run test:offline-reply` exited 0 with 20 checks
using Chrome 157 and PostgreSQL 16. The scenario used two loopback Gmail
accounts with the same message ID and subject. It saved one email explicitly,
edited its reply with the network disabled, closed Chrome and reopened the same browser
profile while still offline. The correct passphrase recovered the selected
email and reply. The other account's email stayed outside the offline store.
The browser cached only the static shell. The device stored mail and draft
content in an authenticated, encrypted IndexedDB vault scoped to one user.

On reconnect, Chrome displayed the divergent device and server drafts side
by side. Selecting the device version left the server unchanged until the
user opened the send preview. Gmail received zero sends before approval.
The Gmail fixture accepted one reply from the selected account. After the
provider acknowledgement and browser response were both dropped, verification
recovered the same receipt and replay issued no second dispatch. Signing out
locked the open offline tab and cleared the stored copies. A second admitted
InboxAI user could not reopen the previous user's draft or read its API data.
Three sampled screens had zero axe violations or horizontal overflow. The
final Chrome run recorded no uncaught page errors.

Offline coverage includes saved email text and reply text with To and Cc.
Attachments are available online. Each browser restart requires the separate
offline passphrase. The server reply workflow owns preview, approval and
dispatch. This milestone adds no database migration.

`npm run lint` exited 0 with 91 existing warnings. `npm run typecheck`,
`npm run test:unit` (245 tests), `npm run test:integration` (200 tests),
`npm run test:db` (29 SQL checks), and the local Next.js 16.4.6
production-mode build passed on macOS arm64 with Node 24.14.1.
`npm run test:design -- --isolated` and
`npm run test:platform -- --isolated` passed 29 and 19 checks.
`npm run test:staging -- --isolated` and `npm run test:reply-workflow`
passed 31 and 23 checks.

[Chrome checks](../../test-results/offline-reply/report.json) ·
[Workflow evidence](../../test-results/offline-reply/workflow.json) ·
[Recovered email and draft](../../test-results/offline-reply/01-offline-after-restart.png) ·
[Draft comparison](../../test-results/offline-reply/02-conflict.png) ·
[Send receipt](../../test-results/offline-reply/03-sent-once.png)

## Search across synced mail and attachments

On 2026-11-12, `npm run test:mail-lookup` passed 22 checks with Chrome
157, Node 24.14.1, PostgreSQL 16 and a production-mode Next.js 16.4.6
build on macOS arm64. Two Gmail accounts on loopback delivered 220
messages. Both target emails had 218 newer messages ahead of them.
The primary search found the older subject without accents. A filename shared by the two
accounts yielded two downloads with different verified bytes. Opening
the exact source, downloading and returning preserved the query,
mailbox, attachment filter and manual category. Chrome went offline
during a new search and restored the same results on retry. Pagination
returned all 24 tied timestamps exactly once. Foreign account filters,
foreign attachment downloads and deleted search matches were rejected.
The mobile reader returned to the same query. Three sampled screens had
zero axe violations or horizontal overflow. The fixture made no
provider label changes or sends.

The search covers synchronized, non-deleted mail and matches attachment
names, subject, sender and indexed body text. The filename index uses
PostgreSQL `pg_trgm`. Ask Inbox continues to provide its own search and
answer workflow. SQL covered the stored Sent file ID, mirrored
attachment deduplication, literal percent signs, effective category and
ownership boundaries.

Lint, TypeScript, 241 unit tests, 200 integration tests, 29 SQL checks
and the local production build passed. Lint reported 91 existing warnings.
Design, platform, local staging and Action Inbox passed 29, 19, 31
and 42 checks respectively.
[Chrome report](../../test-results/mail-lookup/report.json) ·
[Workflow and download hashes](../../test-results/mail-lookup/workflow.json)

## Personal sender rules

On 2026-11-12, `npm run test:personal-mail-rules` passed 22 checks on
macOS arm64 with Chrome 157, Node 24.14.1, PostgreSQL 16 and a
production-mode Next.js 16.4.6 build. Two Gmail fixtures on loopback
delivered 112 initial messages and 118 by the end. Preview found a match
outside the Inbox page without writing a rule. A new matching message
invalidated that preview. Confirmation survived response loss, and a
restart and Gmail history replay preserved unique emails and labels.
The same sender and Gmail message ID in another account remained scoped
to that account. Urgent alerts stayed visible alongside promotion labels.
Undo survived response loss, removed six rule labels, preserved one manual
correction and stopped applying the rule to new arrivals. Mobile verified
a future-only rule. Four sampled screens passed axe and overflow checks.
The Gmail fixture received zero label modifications or sends.

From the Inbox reader, open **Đổi nhãn**, choose a label, and save the
single email or preview a sender rule. The preview can include up to 200
existing eligible Inbox emails. **Quy tắc** in the Inbox opens the undo
receipt. A rule uses the exact normalized sender address in one Gmail
account. Rule labels are local to InboxAI and leave the automatic
classification available for undo. A same-label manual choice is still a
manual correction. SQL also verified tenant isolation and restoration of
a baseline changed after confirmation.

Lint, TypeScript, 241 unit tests, 200 integration tests, 28 SQL checks and
the local production build passed. Lint reported 91 existing warnings.
Design, platform, local staging and Action Inbox regressions passed 29,
19, 31 and 42 checks respectively.
[Chrome report](../../test-results/personal-mail-rules/report.json) ·
[Workflow evidence](../../test-results/personal-mail-rules/workflow.json)

## Message category and priority colors

On 2026-11-12, `npm run test:design -- --isolated` passed 29 checks in
Chrome 157 with synthetic email and a production-mode Next.js 16.4.6
build. Desktop, tablet, mobile and dark Inbox displayed five distinct
label fills for important, urgent, transaction, promotion and newsletter
mail. The 20 sampled label pairs measured 5.78:1 to 8.37:1 contrast.
An abnormal transaction displayed both its category and urgency, while
the routine receipt retained only its category. Split reading kept both
labels visible. The sampled views had no axe violations or horizontal
overflow. [Chrome design evidence](../../test-results/m6d/design/browser.json)

Lint, TypeScript, 241 unit tests, 200 integration tests and the
production build passed on macOS arm64 with Node 24.14.1. Lint reported
91 existing warnings. The platform suite passed 19 checks. The
conversation regression passed 29 checks after preserving toolbar
label contrast during loading, with one dispatch and one Sent row
after lost acknowledgement and a restart.

## Inbox and Sent conversation reader

On 2026-11-12, `npm run test:inbox-conversation` passed 29 local Chrome
checks with two loopback Gmail accounts, PostgreSQL 16 and a production-mode
Next.js 16.4.6 build on macOS arm64 and Node 24.14.1. Matching subjects and
Gmail thread IDs stayed separate across accounts. An accepted outbound
reply appeared in Sent and the same conversation before the next Gmail
history sync. After provider and browser acknowledgements were dropped,
a Next restart and replay recovered one receipt, one provider dispatch
and one Sent row. The commitment links opened both the newer reply and
the earlier source, retaining the selected message. A 26-message fixture
verified paging, a pinned older source and denied access for foreign
and anonymous readers. Chrome sampled nine screens across desktop, tablet and mobile with
zero axe violations, page errors and horizontal overflow. The mobile
reader retained the selected source while navigating the conversation.

Lint, TypeScript, 241 unit tests, 200 integration tests, and 27 SQL checks
passed. Lint reported 91 existing warnings. The design, platform, reply
workflow and local staging suites passed 25, 19, 23 and 31 checks.
[Local conversation handoff](INBOX_CONVERSATION_LOCAL_HANDOFF.md) ·
[Chrome report](../../test-results/inbox-conversation/report.json)

## Workspace color and status cues

On 2026-11-12, local Chrome with synthetic data verified the selected
navigation tint and 2px indicator on desktop, tablet, mobile and dark
Inbox. Navy marks priority and navigation. Amber identifies pending
work, red indicates a failure or connection that requires attention,
green indicates confirmation, and teal distinguishes transaction mail.
State labels remain visible. The ten sampled foreground/background token
pairs had calculated contrast ratios from 6.13:1 to 8.13:1.

Local production-mode builds, lint, TypeScript, 241 unit and 200
integration tests passed on macOS arm64 with Node 24.14.1 and Next.js
16.4.6. Lint reported 91 existing warnings. The design, platform, Gmail
reconnect, scheduled send and local staging suites passed 25, 19, 20,
21 and 31 checks.
Chrome sampled light and dark Outbox states with zero axe violations
or horizontal overflow.
[Inbox design evidence](../../test-results/m6d/design/browser.json) ·
[Outbox dark](../../test-results/scheduled-send/04-trang-thai-mobile-toi.png)

## Gmail reconnection and catch-up

On 2026-11-12, `npm run test:gmail-reconnect` passed 20 checks on macOS
arm64 with Node 24.14.1, Chrome 157, PostgreSQL 16 and a local production-mode
Next.js build. Independent workers ran on loopback with two synthetic Gmail
accounts. Background sync ingested both accounts while Chrome was closed.
A transient failure preserved the checkpoint and retried. A revoked refresh
grant suspended only the affected account and blocked scheduled mail before
dispatch. Selecting the other mailbox or a mismatched Google subject changed
neither credential. Correct consent preserved the account ID and checkpoint,
retrieved missing mail without a full resync or duplicate, and opened the
exact cited commitment reply. Two Next restarts preserved progress. After
Gmail accepted a resumed scheduled send and dropped the acknowledgement,
the worker found the same Message-ID in Sent. The fixture observed one
provider send and one durable receipt. Five sampled screens had no axe
violations or horizontal overflow.

Lint, TypeScript, 241 unit tests, 200 integration tests and 26 SQL checks
passed. Lint reported 91 existing warnings. SQL verified that stale
authorization could neither replace the grant nor let an old sync worker
alter the retained checkpoint. Design, platform and local staging passed
25, 19 and 31 checks. The general E2E, scheduled send and Inbox catch-up
regressions passed 41, 21 and 24 checks. The general E2E confirmed that
the existing Settings read consent also restores sync after revocation.
The loopback worker rejected a non-local destination before connecting.
See the [local Gmail reconnect handoff](GMAIL_RECONNECT_LOCAL_HANDOFF.md) and
[Chrome results](../../test-results/gmail-reconnect/report.json).

## Scheduled Gmail send

On 2026-11-12, `npm run test:scheduled-send` passed 21 local checks on macOS
arm64, Node 24.14.1, Next.js 16.4.6, Chrome 157 and PostgreSQL 16. The test used
production-mode Next, two loopback Gmail accounts and controlled browser and
database clocks. Of three approved schedules, two dispatched with Chrome
closed and one was cancelled and reopened as an editable draft. No send
started before its due time. A lost browser acknowledgement replayed the
same approval. Two worker processes competed for a single job. After Gmail
accepted it and dropped the response, the next worker found the same
Message-ID in Sent after a Next restart. The provider recorded exactly two
send calls, with the expected Gmail reply thread and attachment bytes.
Three sampled screens had no axe violations or horizontal overflow. SQL
covered the expired-worker lease and cross-tenant and premature-send fences.

Lint, TypeScript, 241 unit tests, 199 integration tests, 25 SQL checks and
the local production-mode build exited 0. Lint reported 91 existing warnings.
Design, platform and local staging passed 25, 19 and 31 checks.
The attachment, reply and Inbox snooze regressions passed 21, 23 and 20 checks.
The loopback worker rejected a non-local destination before connecting. See the
[local scheduled-send handoff](SCHEDULED_SEND_LOCAL_HANDOFF.md) and
[Chrome results](../../test-results/scheduled-send/report.json).

## Email snooze and scheduled Inbox return

On 2026-11-12, `npm run test:email-snoozes` exited 0 on macOS arm64 with
Node 24.14.1, Next.js 16.4.6, Chrome 157 and PostgreSQL 16. The production-mode
build and 20 browser/Auth checks used two loopback Gmail accounts with
matching subject and provider message ID. Cancellation restored only the
selected message. After a move lost its browser acknowledgement, a Next
restart preserved the new deadline and version. At the database deadline,
the open mobile Inbox returned the older message once on its first page.
The Gmail-archived message stayed out. The run recorded zero provider
writes or sends, and sampled desktop and mobile screens had zero axe
violations. PostgreSQL verified replay, stale cancellation and exact
deadline visibility.

Lint exited 0 with 91 existing warnings. TypeScript, 241 unit tests, 199
integration tests and 24 SQL checks passed. Design, platform, Gmail triage,
E2E and staging exited 0 with 25, 19, 25, 41 and 31 checks. See the
[email snooze handoff](EMAIL_SNOOZES_LOCAL_HANDOFF.md) for local commands and
browser evidence.

## Bidirectional Gmail Inbox triage and undo

On 2026-11-12, `npm run test:gmail-triage` exited 0 on macOS arm64 with
Node 24.14.1, Next.js 16.4.6, Chrome 157 and PostgreSQL 16. A production-mode
build and 25 browser/Auth checks passed using two loopback Gmail accounts.
An archive affected the two selected messages even though the provider IDs
were identical. After both acknowledgements were dropped and Next restarted,
read-back verified the second archive with zero additional Gmail writes.
After an external label changed away and back, undo rejected that message
and restored the other. Label history from Gmail also refreshed InboxAI.
The sampled desktop and mobile screens had zero axe violations.

Lint exited 0 with 91 existing warnings. TypeScript, 241 unit tests, 199
integration tests and 23 SQL checks passed. The design, platform, attachment,
general E2E and staging suites exited 0 with 25, 19, 21, 41 and 31 checks.
See the [Gmail triage handoff](GMAIL_TRIAGE_LOCAL_HANDOFF.md) for commands,
local evidence and the limits of provider verification.

## Compose, reply and forward attachments

On 2026-11-12 on macOS 27.2 arm64, Node 24.14.1, Chrome 157 and Next.js
16.4.6, `npm run test:compose-attachments` exited 0 with a production-mode
build and 21 browser/Auth checks. Two loopback Gmail accounts sent three
messages. Browser downloads from Sent matched all three original byte
sequences after sync. Forwarding selected only the second of two equal-name
and equal-size attachments, and approval of an edited selection was denied.
Losing both acknowledgements and restarting Next preserved one dispatch
for the forwarded message. Anonymous and foreign tenant download probes
were denied. The audited screens had zero axe violations.

Lint exited 0 with 91 existing warnings. TypeScript, 241 unit tests, 199
integration tests and 22 SQL checks passed. Local reply and scheduled follow-up
regressions passed 23 and 20 checks. Design, platform, E2E and staging passed
25, 19, 41 and 31 checks. Each command exited 0. See the
[attachment workflow handoff](COMPOSE_ATTACHMENTS_LOCAL_HANDOFF.md) for the
commands, local artifacts and validation limits.

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
