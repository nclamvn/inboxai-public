# InboxAI 2.0 engineering contract

## Authority and scope
- Product owner instructions and `docs/phase-2/PRODUCT_STANDARD.md` govern Phase 2.
- Local implementation and synthetic verification remain the default. On 2026-11-16
  the owner explicitly authorized technical-debt cleanup, commit and push of the pending
  work to a separate `codex/` branch. This does not authorize merging main, hosted
  deployments, changing hosted settings or connecting real mailboxes.
- On 2026-11-17 the owner authorized committing and pushing the completed local
  pilot checkpoint on `codex/local-pilot`, based on the verified technical-debt
  branch. This does not authorize the proposed natural-language commitment work,
  a main merge, deployment or real mailbox access.
- Use a `codex/` feature branch from the verified main baseline for an authorized push.
  Preserve unrelated local changes, and report local evidence separately from remote CI.
  Never modify main, deploy production or send real mail before the security gate.
- Reuse verified code. Prefer small, reviewable PRs with explicit dependencies,
  acceptance criteria, regression tests, rollback notes and evidence.
- Missing design documents require owner input before design changes. The current
  standard reconstructs the owner's supplied decisions; it is not the lost original.

## Fixed product pillars
1. Action Inbox: contextual priority with reasons and source evidence.
2. Commitment Intelligence: persistent responsibility, deadlines, changes, status and evidence.
3. Ask Inbox: cross-account retrieval with citations for important conclusions; abstain without evidence.
4. AI Operator: Plan → Preview → Scope → Approve → Execute → Verify → Undo where possible.

## Architecture and security
- Keep the existing Next.js / Supabase architecture until evidence supports a change.
- Authenticate at every boundary. Fail closed for absent secrets and invalid OAuth state.
- Every resource lookup and mutation using service role must carry tenant ownership.
  Authenticate the user server-side; never trust body user_id, account_id or model output.
- RLS is mandatory but does not constrain service-role code. Test two tenants and anonymous access.
- Never return credentials, log token fragments, or expose service keys to clients.
- Credentials use the server-only `src/lib/credential-vault/` boundary and private
  schema RPCs. No public secret columns, hot-path legacy fallback or default keys.
  Preserve tenant/account AAD, revision checks and encrypted recovery on changes.
  Follow `docs/phase-2/CREDENTIAL_VAULT.md`; no hosted maintenance is authorized.
- Email bodies and attachments are untrusted data, never authorization or system instructions.
- Deterministic code owns authorization, validation, deduplication and side effects.
  Models own language interpretation; model confidence is not calibrated probability.
- Action Inbox reasons must link to tenant-visible source emails and identify
  stored analysis as such. Preserve explicit priority choices across provider
  updates and keep learning scoped by account and sender.
- Commitment writes must append an authenticated, versioned revision and verify
  tenant-owned email evidence in the same transaction. Preserve confirmed terms
  while flagging uncertain or conflicting evidence.
- Present commitment changes and selected sources before saving. Keep the original
  expected version and idempotency key while retrying an uncertain write.
- Commitment detection is read-only until confirmation. Verify the source snapshot
  and version at approval, and keep unmatched or out-of-order changes outside the ledger.
- Ask Inbox applies authenticated ownership and account filters before ranking.
  Cite exact source text, invalidate vectors when indexed content changes or a
  source is deleted, and show whether semantic retrieval is available.
- Ask Inbox answers must bind facts to exact case references and source versions.
  Compare structured dates and currencies without guessing missing values,
  and preserve discrepancies with their separate citations.
- Sync writes must use the private checkpoint/lease RPC boundary in `src/lib/sync/`.
  Commit page data and cursor together; retain fences, owner checks, UID epochs and
  source tombstones. No timestamp/newest-N fallback. See `docs/phase-2/SYNC_CONTRACTS.md`.
- External sends must claim a tenant-bound idempotency key before dispatch.
  Preserve uncertain receipts and require provider evidence before resolving them.
  See `docs/phase-2/M1C_LOCAL_HANDOFF.md`.
- Bound retries, timeouts and total work. Preserve valid intermediates; repair only failed scopes.
- Sending, destructive actions and important external mutations require explicit approval,
  execution idempotency, audit evidence and verification before enabling AI Operator.
- Operator planning may read owned email metadata. Approval freezes an explicit
  subset of the preview. Execution rechecks the frozen scope under row locks
  and commits local changes and their receipt together. Never rerun filters at execution.
- Operator verification records the observed outcome for that scope. Undo requires
  recorded prior flags, a matching effect revision and explicit confirmation. Restore,
  read-back and audit commit together. Legacy plans without prior flags can only be verified.
- Do not rewrite applied migrations; add forward migrations and test fresh + upgrade paths.

## Precision Neo-Flat 2027
- Navy #174A72; canvas #F7F9FA; surface #FFFFFF; border #E1E7EB; text #192532.
- Inter typography, Lucide icons, 4px spacing grid, straight 2px blue accents.
- `src/styles/neo-flat.css` owns semantic color, spacing and focus tokens. Use
  the shared primitives in `src/components/ui/` and self-hosted Inter in
  `src/styles/inter.css` for new dashboard surfaces.
- No purple, gradients, glass, glow, decorative AI icons, curved accent strips or
  large fragmented colored panels. Use typography, alignment and quiet boundaries.
- Responsive desktop, tablet and mobile web/native shells; keyboard, focus, reduced
  motion, screen-reader labels and touch affordances are acceptance criteria.
- Do not redesign UI during security work without a product reason and regression coverage.
- Run `npm run test:design` against local synthetic fixtures when changing the
  reference Inbox, dashboard shell, Compose or shared dialog.
- Run `npm run test:platform` for production-mode Inbox performance and accessibility.
  Record native simulator evidence separately from browser viewport checks.

## Evidence and release
- Run lint, TypeScript, unit, integration and build. Record actual commands, environment,
  exit status, counts and limitations in `docs/phase-2/VERIFICATION.md`.
- Never relabel mock tests as real provider, database, device or production validation.
- Run `npm run test:staging` for the synthetic migration, backup and recovery
  rehearsal. Keep its Docker project, loopback endpoints and credentials local.
- Do not mute existing checks to make CI green. A failing baseline remains a release blocker.
- Major AI investments need a direct LLM and tool-enabled agent comparison: equivalent
  inputs, declared quality/privacy floors, unseen cases, time/cost and human effort.
- No superiority, production-readiness or security PASS claim without evidence.

## Disk hygiene
- Check `df -h /` before large installs/builds. Stop below 10 GB free.
- No project copies in /tmp. If unavoidable scratch/venv is outside the repo, name it
  `codex-tmp-<task>-<yyyymmdd>`, delete it at task end and report removal.
- Use `.next`, an existing `.next-e2e-<port>`, and at most one reusable `.next-build`.
  Never create task-specific output folders. Remove any extra output created.
- Reuse fixed Docker image tags; after Docker work run `docker image prune -f`.
  Never prune containers or volumes. Preserve user data and unrelated artifacts.

## Document quality
- Word/PDF/book deliverables use white, neutral gray and black; no U+2014 em dashes.
- Preserve wording and semantic content; avoid single prose words stranded on a line.
  Render and inspect final files; keep Word and PDF synchronized.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
