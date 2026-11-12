# Ordered PR plan

These are reviewable PR scopes, not claims that remote PRs were created.
Keep M0 on the assigned branch. Stage/commit small scopes; do not merge to main.

Owner steering on 2026-11-11 narrowed the current handoff to **local only**.
M0-E local evidence is recorded in M0E_LOCAL_HANDOFF.md. Remote PRs/CI and hosted
settings remain deferred, not passed. M1-A was explicitly authorized locally and is recorded in M1A_LOCAL_HANDOFF.md;
the real-mail/production gate remains closed throughout.

| PR | Dependencies | Scope | Acceptance criteria |
| --- | --- | --- | --- |
| M0-A audit and authority | none | AGENTS, standard, map/debt/risk, baseline logs | Source SHA, coverage limits, missing documents resolved from owner, no invented PASS |
| M0-B request security | M0-A | OAuth/PKCE, cron, reply ownership, settings tenant binding, webhook verification | Forged/missing/expired/cross-user state rejected before token exchange; all cron methods fail closed; foreign reply never sends; body cannot choose tenant |
| M0-C database boundaries | M0-A | privilege escalation/RPC/RLS reference controls | Anonymous + two authenticated tenants tested on local PG; own access works, foreign read/write/reference fails; upgrade caveats documented |
| M0-D reproducible quality | M0-B,C | runner, CI, dependency/lint/build baseline repair | npm ci, lint, typecheck, unit, route integration, SQL integration, build; no production secrets or network mail; failures block gate |
| M0-E baseline handoff | M0-D | residual audit/remediation and isolated deployment rehearsal | Baseline request/tenant checks and CI verified; real-mail gate stays closed while vault/sync and staging remain unverified; no production-readiness claim |
| M1-A credential boundary | M0-E | vault, AEAD/key version/rotation, server-only credential reads | No credential readable by anon/authenticated direct table API; legacy migration and rollback tested |
| M1-B sync contracts | M1-A | Gmail initial paging/history, IMAP UIDVALIDITY/UID, retry/lease/checkpoints | No omission on overflow/history expiry/restart; two accounts and duplicate delivery converge; failed writes never advance cursor |
| M1-C sending | M1-A,B | Gmail OAuth send / SMTP, scoped request idempotency | Retries cannot double-send; uncertain provider outcomes reconciled; tenant tests and sandbox provider evidence |
| M2-A design system | M1-C | tokens, Inter/Lucide, primitives, states | Exact owner palette/grid, keyboard/focus/contrast, desktop/tablet/mobile snapshots, bundle baseline |
| M2-B Action Inbox | M2-A | contextual ranking, reasons, corrections and evidence | Ranking reasons cite actual sources, user corrections persist, urgent exceptions visible, synthetic/held-out comparisons |
| M3-A commitment ledger | M2-B | persistent owner/due/status/evidence + change history | Deadline changes update identity rather than duplicate; ambiguous/conflicting evidence explicit; two-tenant constraints |
| M3-B commitment UX | M3-A | owed/waiting/overdue workflows and history | Sources accessible; completion requires evidence or user confirmation; measurable reduction in reconstruction effort |
| M3-C commitment detection | M3-B | detect cited promises and changes for confirmation | No write on scan or preview; source and version checks; unlinked changes stay outside the ledger |
| M4-A retrieval | M3-A | tenant-scoped metadata/keyword/semantic retrieval | Cross-account allowed scope only; index isolation/deletion, held-out recall and latency measured |
| M4-B Ask Inbox | M4-A | cited synthesis, structured amounts/dates, abstention | Important conclusions linked to source/version; contradictions visible; adversarial unsupported claims rejected |
| M5-A execution contracts | M4-B | plans, preview, immutable scope/approval, audit/idempotency | Stale or expanded plan needs new approval; email content cannot grant authority; concurrent/replayed requests safe |
| M5-B verify/undo | M5-A | local read-back, reversible flag changes and outcome audit | Read-back confirms persisted outcome, undo restores exact prior flags only on unchanged scope, verification and undo are recorded. Provider verification is pending an approved provider write scope. |
| M6-A hardening | M5-B | performance, e2e, a11y and native shells | Defined representative datasets/devices and budgets; measured results, regression tests and accessible workflows |
| M6-B staging | M6-A | isolated staging, migration rehearsal, observability/recovery | Synthetic/consented data policy, least privilege, rollback/restore rehearsal; production deploy remains separate authorization |
| M6-C mail destination controls | M1-B, M1-C, M6-B | shared SMTP/IMAP destination validation, pinned DNS, mandatory TLS | Invalid or private targets never open a socket. TLS verifies the configured identity. Stored targets follow the same policy and rejected operations preserve send receipts and sync checkpoints. Verify locally with synthetic DNS, TLS and mail fixtures. |
| M6-D purchasing journey | M6-C | shared synthetic data for an interactive Codex preview and a Playwright journey | The buyer reviews a cited priority, confirms a changed commitment, compares delivery dates across inboxes, and approves, verifies and undoes an archive. Compose delivers only to Mailpit. A second user cannot access the buyer's email or plan. Restart reseeds the local fixture. |
| M6-E Gmail consent | M1-A, M1-C, M6-D | read-only connection, account-bound incremental send consent and local browser rehearsal | Verify initial scopes, consent denial, partial grants, wrong identity, full and send-only denial, replay, and reconnect. Reject sends before dispatch when send permission is absent. Keep the real-mailbox gate closed. |
| M6-F adversarial security rehearsal | M6-C, M6-D, M6-E | hostile email and attachment handling, two-tenant access tests, scoped dependency scan | Hostile mail cannot execute code or fetch tracking resources. Active attachments download, owned raster preview still works, and other tenants or anonymous callers cannot access protected resources or mutate another plan. Record findings and dated npm advisory evidence. |

For every PR record what changed, why, test commands/outcomes, remaining risk,
and rollback. Database forward migrations should not be reversed by dropping data.
Security failures must remain closed even if rolling application code back.

## M1-A local review units

These are local commit/PR drafts, not remote PRs.

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M1-A1 | M0-E | AEAD, keyring, private schema/RPC, bounded local CLI | Tampering/scope swap rejected, no public secrets/grants, atomic writes, safe conflict code, encrypted backup rotation/restore |
| M1-A2 | M1-A1 | OAuth/IMAP/attachment/send/refresh consumers | Server-only scoped reads, refresh preservation, persistence failure closed, no raw provider exception leakage in changed credential paths |
| M1-A3 | M1-A1,A2 | SQL upgrade + native Auth/PostgREST rehearsal and handoff | Synthetic legacy conversion/quarantine, concurrent CAS, key retirement/restore, bounded pages, regression/build evidence |

Review/rollback procedure and exact remaining limits: CREDENTIAL_VAULT.md. These
units form one coordinated schema/application cutover; do not deploy individual
intermediate commits against a live database. Hosted cutover remains unauthorized.

## M1-B local review units

M1-B was authorized locally after M1-A. No remote PR or deployment is created.

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M1-B0 | M1-A | Private lease/checkpoint RPCs, provider identity, atomic page commits | Tenant/grants, rollback, CAS/fencing, source tombstones, preserved annotations |
| M1-B1 | M1-B0 | Gmail full/history paging, durable history worklist, body normalization | Overflow/restart, final-page anchor, expired history, failed fetch/write do not advance progress |
| M1-B2 | M1-B0 | IMAP INBOX epoch/ascending UID scan and reconciliation | UID backlog, reset/mid-page reset, flags/expunge, duplicate MIME filenames, lazy-read epoch guard |
| M1-B3 | M1-B1,B2 | Fair account dispatch, bounded runs, synthetic native rehearsal | One active worker, stale worker rejected, uncertain commit recovery, account/tenant isolation and pending state |

Local source commits group the shared contracts/providers before wiring callers, then
add native rehearsal and evidence. Schema/application cutover is coordinated across
these units. See SYNC_CONTRACTS.md for explicit support limits and rollback notes.
## M1-C local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M1-C1 | M1-A,B | Private send ledger and atomic Sent projection | Same key dispatches once, mismatched payload conflicts, tenant checks and finalization rollback |
| M1-C2 | M1-C1 | Gmail MIME, SMTP TLS and Compose status | Provider outcomes classified, browser retries keep key, Sent evidence resolves only exact Gmail matches |
| M1-C3 | M1-C2 | Local Auth/PostgREST rehearsal and fault injection | Concurrent requests, missing acknowledgements, partial SMTP acceptance and replay verified |

The [local handoff](M1C_LOCAL_HANDOFF.md) records evidence and provider limitations.

## M2-A local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M2-A1 | M1-C | CSS tokens, self-hosted Inter, accessible primitives | Exact light palette and spacing, common focus and dialog behavior, dark theme persists |
| M2-A2 | M2-A1 | Dashboard shell, Inbox, reading and Compose reference surfaces | Current navigation and selected mail use straight 2 px rules, desktop split and narrow single pane, loading/empty/error/offline states distinct |
| M2-A3 | M2-A2 | Synthetic browser rehearsal and bundle report | Screenshots at desktop/tablet/mobile, keyboard/touch cases, sampled axe results, before/after build evidence and explicit verification limits |

See [the local M2-A handoff](M2A_LOCAL_HANDOFF.md). M2-B uses the Inbox
components to expose contextual ranking, source evidence and corrections.

## M2-B local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M2-B1 | M2-A | Ranking, bounded evidence and saved priority | Read state independent of priority, low-priority incidents visible, receipt suppression, tenant checks, reset and replay |
| M2-B2 | M2-B1 | Inbox list and source dialog across viewports | Reason links open scoped mail, saved choices survive reload, failed loads retry, same-account feedback affects ordering |
| M2-B3 | M2-B2 | Local verification and comparative evidence | Fresh and upgrade SQL, Auth/PostgREST and browser runs, false positives and misses documented |

The [M2-B handoff](M2B_LOCAL_HANDOFF.md) records behavior and evaluation limits.
M3-A owns persistent commitment identity, revisions and lifecycle evidence.

## M3-A local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M3-A1 | M2-B | Private ledger, immutable revisions and evidence anchors | One stable identity, atomic head and revision, replay-safe writes, quote and tenant validation |
| M3-A2 | M3-A1 | Authenticated list, detail, create, revise and review API | Unknown owner and deadlines retained, concurrent edits rejected, conflicting evidence preserves confirmed state |
| M3-A3 | M3-A2 | Fresh and upgrade verification | Local SQL and HTTP prove source links, tenant isolation, revision history and source unavailability |

See the [M3-A handoff](M3A_LOCAL_HANDOFF.md) for the API contract. M3-B
consumes it for commitment tracking and review workflows.

## M3-B local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M3-B1 | M3-A | Tenant-owned groups, deadline boundaries and pagination | Exact counts, UTC+7 date-only boundary, expired instants, linked addresses and scoped cursors |
| M3-B2 | M3-B1 | Commitment screen, history and source navigation | Direct links, five visible states including unknown/closed, responsive details and keyboard focus |
| M3-B3 | M3-B2 | Evidence-backed confirmation and local rehearsal | Preview before writing, stale version blocked, retries keep their key and completion appears in the closed group |

See the [M3-B handoff](M3B_LOCAL_HANDOFF.md) for browser evidence and scope.

## M3-C local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M3-C1 | M3-A | Tenant-scoped email scan and evidence-bound confirmation | Bounded cursor pages, source checks inside the ledger transaction, replay and duplicate-source protection |
| M3-C2 | M3-C1, M3-B | Explicit pledge and change detection with in-app review | Exact evidence, safe linking, previous and proposed values, explicit confirmation |
| M3-C3 | M3-C2 | Local synthetic rehearsal | Two tenants, stale source, competing approvals, accessible review, stable receipt on retry |

See the [M3-C handoff](M3C_LOCAL_HANDOFF.md) for the supported language and verification.

## M4-A local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M4-A1 | M3-A | Tenant-scoped filters, keyword index and embedding lifecycle | Account ownership, bounded writes, source deletion and edits, literal evidence |
| M4-A2 | M4-A1 | Local multilingual encoding and hybrid ranking | Verified local assets, exact lexical matches retained, explicit fallback and visible indexing scope |
| M4-A3 | M4-A2 | Ask Inbox search surface and local evidence | Accessible filters, source opening and return, held-out keyword comparison, recorded misses and latency |

See the [M4-A handoff](M4A_LOCAL_HANDOFF.md) for setup and local verification.

## M4-B local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M4-B1 | M4-A | Exact reference evidence and authenticated citation checks | Read-only scoped snapshots, correct case boundaries, deleted and changed sources reported |
| M4-B2 | M4-B1 | Structured synthesis for dates and money | Verbatim evidence per value, explicit missing or ambiguous fields, alternatives preserved on disagreement |
| M4-B3 | M4-B2 | Ask email surface and local verification | Responsive source navigation, synthetic contradictions and abstention, same-rule single-email comparison |

See the [M4-B handoff](M4B_LOCAL_HANDOFF.md) for supported questions and verification.

## M5-A local review units

| Unit | Dependency | Scope | Acceptance |
| --- | --- | --- | --- |
| M5-A1 | M4-B | Scoped plan snapshot and frozen approval | Explicit owned IDs, cap and expiry, typed action allowlist, cross-tenant and stale requests refused |
| M5-A2 | M5-A1 | Transactional local execution and audit | One receipt per plan, duplicate and concurrent retries, all-or-nothing changes and recorded outcomes |
| M5-A3 | M5-A2 | Operator preview, selection, approval and history | Preview opens source, selected set visible at approval, execution is separate, lost-response retry and mobile rehearsal |

See the [M5-A handoff](M5A_LOCAL_HANDOFF.md) for local scope and verification.

## M5-B local review units

| Unit | Depends on | Scope | Acceptance |
| --- | --- | --- | --- |
| M5-B1 | M5-A2 | Transactional read-back, outcome journal and scoped undo | Fresh and upgrade paths, exact false/null restoration, no writes on drift, tenant isolation, idempotent receipt and rollback if audit fails |
| M5-B2 | M5-B1, M5-A3 | Verification status, confirmation and undo receipt | Preview shows every approved email and its prior state, retries preserve the request key, and reload preserves the recorded outcome |

See the [M5-B handoff](M5B_LOCAL_HANDOFF.md) for local evidence and remaining provider coverage.

## M6-A local review units

| Unit | Depends on | Scope | Acceptance |
| --- | --- | --- | --- |
| M6-A1 | M5-B | Production-mode Inbox benchmark and dashboard request reduction | Two accounts and 600 synthetic emails. Same briefing counts and keyboard access within a declared local payload and timing budget. |
| M6-A2 | M6-A1 | Reading focus, touch target and Capacitor shell integration | Email opening and return preserve focus on the three web sizes. Verify native behavior with simulator evidence and record untested device or assistive-technology coverage. |

See the [M6-A handoff](M6A_LOCAL_HANDOFF.md) for measurements, fixtures and release limitations.

## M6-B local review units

| Unit | Depends on | Scope | Acceptance |
| --- | --- | --- | --- |
| M6-B1 | M6-A | Local staging and an independent recovery database | Local Docker socket, loopback gateway, internal service network, synthetic credentials and mail sink |
| M6-B2 | M6-B1 | Forward migrations, archive verification and recovery | Restore both snapshots, roll back a failed migration, reject corrupt bytes, preserve Auth, vault access boundaries and source evidence |
| M6-B3 | M6-B2 | Dependency outage, alert delivery and application cutover | Real outage triggers a single redacted alert, restored services clear it, ownership and anonymous access are checked after cutover |

See the [M6-B handoff](M6B_LOCAL_HANDOFF.md) for commands and local evidence.
