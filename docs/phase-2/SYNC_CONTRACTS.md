# M1-B: durable sync contracts

Authority: owner-approved M1-B, local-only on 2026-11-11. No provider account,
real mailbox, hosted migration, push or deployment is authorized. Existing Next.js,
Supabase, credential vault, Gmail MIME helpers and mailparser/ImapFlow are reused.
No new queue, model or autonomous agent is introduced.

## Data and transaction boundary

`private.account_sync` stores the provider cursor, revision, lease ID, monotonic
fence, lease expiry, attempt time, failure count and next retry time. Browser roles
and service role have no direct table access; only service-only public RPCs enter
this boundary. They use SECURITY DEFINER with an empty search path and explicit
schema names. Claim/commit/release validate owner/account; claim also validates
active state and provider/auth kind. Commit rechecks active state.

One page's email rows, attachment metadata, tombstones, reconciliation and checkpoint
are one SQL transaction. A write error rolls back the entire page. The engine never
advances a time-based cursor after a partial fetch or write. A lost commit response
is an uncertain acknowledgement: no immediate replay is attempted inside the run.
A fresh claim reads the database checkpoint and continues. Provider IDs can recur
across accounts, RFC Message-ID can recur across copies, and an IMAP UID can recur
in a new epoch; none is treated as a global email identity.

Identity is `(source_account_id, sync_namespace, original_uid)`:

| Provider | Namespace | UID |
| --- | --- | --- |
| Gmail | `gmail` | Gmail message ID |
| IMAP | `INBOX:<UIDVALIDITY>` | Numeric IMAP UID |
| Legacy mirror | `legacy:<email UUID>` | Retained historical value |

The old `(user_id,message_id)` unique constraint is replaced with provider identity.
An equivalent partial unique index remains for rows with no source account, keeping
the existing unconnected/webhook path's constraint. RFC Message-ID remains metadata.
Upserts preserve row IDs and AI/user annotations. Attachment metadata uses MIME part
keys rather than filename identity, allowing duplicate filenames and stable IDs.

`provider_deleted` is a source tombstone, not a physical delete. Missing/expunged
messages and retired epochs retain their rows and evidence references. A complete
scan reconciles only that owner/account's source mirror. `sync_provider_flags` keeps
the last source read/star/archive/trash values. When an existing local flag differs
from that last source value, replay preserves the local edit until the provider
acknowledges it. Hard source tombstones take precedence. This preserves local intent;
it does not implement provider flag writes or certify exactly-once external effects.
The existing mirror is user-editable under RLS, not an immutable evidence ledger.
M3 must establish its own authoritative evidence/versioning contract.

## Gmail

Read the profile history anchor **before** full listing. Paginate the whole accessible
mailbox, including spam/trash; obtain complete message data and resolve referenced
text MIME body parts. Attached text does not replace the message body. A failed body
part read is a page failure, not a message-deletion tombstone.

Persist full-page tokens and a scan generation. Only after the final list page does
reconciliation retire unseen rows. Continue with history from the pre-list anchor
to catch changes during the scan. History IDs stay decimal strings, never JS numeric
counters. Intermediate history pages retain the original start ID plus page token;
only the final page advances the history anchor.

History records may contain more message IDs than `maxResults`. A bounded worklist
is persisted and drained in chunks; restart does not discard remaining IDs. More
than 5,000 changed IDs in one response triggers one full rebaseline rather than
truncation. Expired history (404) or invalid full-list page tokens (400) may trigger
one full restart per invocation. Other failures stop with the last committed cursor.
A message GET 404 becomes a scoped tombstone; other HTTP failures do not.

## IMAP

Scope in this milestone is the existing **INBOX** mailbox. Open read-only, capture
UIDVALIDITY and a fixed `UIDNEXT - 1` upper bound, then scan ascending UID windows.
Each search spans at most 500 UID positions, fetches at most 50 selected messages,
and persists the last processed position. Do not use newest-N or `n:*` to advance
past an unprocessed backlog. Sparse/empty windows also make bounded progress.

Each subsequent cycle rescans flags and detects expunges. There is no CONDSTORE/
QRESYNC or multi-folder state yet. This is a correctness-oriented fallback with
known re-read cost, not a measured large-mailbox performance solution. New arrivals
above the fixed upper bound are processed next cycle. Changes behind a partial scan
are reconciled in a later cycle; no atomic provider snapshot is claimed.

UIDVALIDITY is checked before and after a page. Changed epochs restart under a new
namespace, and only a completed generation retires old rows. Lazy IMAP body and
attachment reads verify the stored epoch before and after FETCH. Legacy/unknown
namespaces fail closed instead of reading a newly reused UID's content.

## Lease, budget and scheduling

Claim grants a 150-second lease and increments the fence. Active leases suppress
another worker. Every commit checks lease ID, fence, expiry and expected revision;
old workers cannot commit or release a replacement worker's lease. PT409 is the
business conflict code, avoiding the PostgREST 14 retry behavior documented in M1-A.

Defaults: 30-second execution signal, four pages per invocation, at most 50 messages
per page, default 200 message operations per invocation. Callers' `limit` is a total
per-invocation budget capped at 500. Internal page overrides are capped at eight;
tests may lower them. RPCs have a 10-second timeout; provider HTTP/socket operations
have 10-second bounds, and the execution signal aborts active transports. Cleanup/
RPC completion can extend past the execution deadline; this is not an SLA benchmark.

A failure persists exponential retry delay (5 seconds, doubling, capped at 300 seconds).
Successful release resets failure state. No inline provider retry loop is used.
`pending=true` means incomplete work; `busy=true` means a lease or retry delay currently
prevents work. `last_sync_at` changes only after a successful complete cycle. The
`synced` count is processed/upserted messages in this invocation, not newly inserted
rows and not the total mailbox size.

Service-only due-work selection excludes active leases/backoff and prioritizes never
attempted/least recently attempted accounts. Cron takes at most ten accounts. The
multi-account API supplies the server-verified user ID and uses the same fair selection;
request-body user_id is ignored. It leaves remaining work pending when its budget is
used. The existing cron secret gate still runs before database/provider work.

## Forward migration and recovery

`20261111030000_sync_contracts.sql` adds mirror identity/state, missing legacy
`body_fetched`/attachment metadata columns, private sync state and RPCs. It also
qualifies the legacy phishing trigger's helper call so inserts work under the strict
RPC search path. Applied older migrations are not rewritten.

Legacy rows are retained under per-row legacy namespaces because the historical
IMAP UID epoch cannot be proven from old timestamps/UID fields. First sync performs
a complete rebaseline. Old and new rows may coexist until completion; old rows are
then tombstoned, preserving existing IDs/evidence. Existing annotations remain on
the old evidence rows; this is not an automatic annotation merge into new identities.
No claim is made that hosted historical data has been reconciled. Hosted preflight
must inspect actual constraints, duplicates, row counts, references and annotation
mapping before approving a coordinated cutover.

Keep workers stopped during schema/application cutover. The old sync code cannot
run safely against this identity contract. Recover with the new cursor-aware code;
let expired leases be reclaimed, retain committed pages and retry the failed scope.
Do not reconstruct the removed user-wide unique constraint over valid cross-account
copies or roll back by deleting source/evidence rows. No hosted rollback was executed.

## Limits before release

- No real Gmail/IMAP protocol interoperability or credentialed provider calls were
  executed. Native rehearsal uses actual local Auth/PostgREST/DB plus fake provider
  readers; HTTP/IMAP transport seams and actual MIME parsing are separate stub tests.
- IMAP source parsing is capped at 10 MiB per message, 100 attachments, and stored
  bodies at 100k text / 200k HTML characters. Oversized/invalid pages fail visibly and
  retain the checkpoint. Streaming/large-message handling is still required before
  opening real mail; do not quietly skip the blocking message.
- Gmail MIME hydration caps depth at 32, 1,000 parts and 32 external text-body reads.
  File attachment bytes are not ingested; Gmail attachment download remains unimplemented.
- Gmail push/PubSub, IMAP additional folders and optimized flag deltas are not included.
  Provider pagination under continuously changing mailboxes, high load, server-specific
  behavior and recovery timing need real-provider and performance validation.
- Provider send, durable external-send idempotency and uncertain-send reconciliation
  remain M1-C. Existing automatic classification/notification paths were not exercised
  with real LLMs or external services and are not part of these timing claims.
- No AI quality, direct-LLM/agent advantage, market value, production readiness or
  independent penetration-test claim follows from these deterministic synthetic tests.

Evidence: [M1-B local handoff](M1B_LOCAL_HANDOFF.md).
Technical references consulted: [Gmail sync](https://developers.google.com/workspace/gmail/api/guides/sync),
[history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list).
The installed ImapFlow TypeScript declarations were used for API/UID/timeout contracts;
Next's bundled data-security/route documentation was checked before route changes.
