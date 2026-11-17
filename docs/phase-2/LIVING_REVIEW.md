# Cam kết sống 3: rà soát ít nhiễu, ghi nhớ quyết định

Local synthetic milestone, authorized 2026-11-17. No push, deploy, hosted changes or real mail. Extends `LIVING_COVERAGE.md`; preserves both previous evidence packages.

## User outcome

Review a proposed responsibility or a changed deadline with its exact source, accept an ordinary field correction, or dismiss with a reason. Reopening the same evidence must not require another decision. Explicit undo returns it to review without changing the ledger. A genuinely new email or changed source/effect remains reviewable. Approval always requires current conversation and ledger versions.

The default list presents eligible proposals and confirmed receipts. An explicit secondary section retains unsupported/uncertain candidates, and another retains dismissals with their reason, review version and undo. Moving unsupported candidates out of the default queue is a presentation change, never credited as an extraction precision improvement.

## Smallest implementation

Reuse the existing single local Qwen3-4B inference, strict six-field extraction, deterministic dates, owned Gmail scope, ledger and ordinary-field corrections. There is no additional runtime reviewer or agent call. Before closing or updating a commitment, require a source expression supporting that change type. Plain forwarded headers join existing quoted-email boundaries. Support the previously missed numeric `hạn … tháng … năm …` form and abstain when multiple relative dates compete.

These expressions are conservative evidence floors, not universal semantic proofs. Unsupported phrasing stays inspectable and can reduce recall. Requests, tentative conditions, missing owners and conflicting dates remain distinct from firm evidence.

## Review memory and authority

`20261117030000_living_review_memory.sql` is a forward migration. It adds a private append-only review history with tenant, evidence key, sequential version, action, reason, request key, frozen command and timestamp. RLS and revoked direct access apply to clients and service role. Only authenticated RPCs read or change the owner's decisions.

A review identity binds account/thread scope, decisive/original owned email identities and fingerprints, exact quote, kind, certainty and proposed owner/date. Display title, model version and mutable event index do not determine memory. It does not mute a sender or future conversation. Byte changes conservatively invalidate the identity, including edits that may ultimately be cosmetic. A new decisive email has a new identity. Unchanged original evidence retains its dismissal when a later change arrives.

The RPC locks the conversation and request, checks fresh source snapshot, expected decision and ledger versions, and rejects decisions for already confirmed proposals. Lost acknowledgements replay the original command and receipt before freshness checks. Changed commands, old tabs and stale-source undo fail closed. Confirming a dismissed proposal is blocked until explicit restore. Review actions never append commitment revisions; only separately approved ledger writes do.

Client retries freeze the payload and idempotency key after the first attempt. No optimistic dismissal is shown after a transport failure. A browser restart recovers acknowledged server state through an authenticated read. This is not an offline local database for the Living page: a cold load still needs the local server. Model unavailability does not erase persisted analyses or review decisions.

If a dismissed original promise later acquires a real change, the new change remains visible. The reviewer can restore the original and confirm it before applying the change. Undo does not delete, reopen or rewrite a confirmed commitment.

## Frozen evaluation

`tests/eval/living-review/FROZEN.json` locks 60 new conversations, 52 gold events, two synthetic Gmail accounts and the protocol before v3 inference changes. Previous v2 cases are development data. `legacy/` preserves the five pre-v3 inference modules with SHA-256 checks. Candidate inference files lock before the first held-out model request.

Targets: precision at least 98%, strict recall at least 90%. Match source, origin, item, kind, applicable owner/date and exact source quote containing the task anchor. Report raw candidates, secondary candidates and default actionable proposals separately. Score before user dismissal. Compare frozen v2, v3, direct local LLM and read-only tool agent with the same factual mail corpus; declare different prompts, preprocessing, calls and tokens. Agent has a maximum of two read batches and three model calls.

Labels and simulated reviewers are assistant-authored, not independently annotated. Scripted source opens, field changes, wall time and reopens are not human cognitive effort. Equal-model local timing is subject to warm-cache/load/thermal variance; `cache_prompt:false` is a request flag, not an independently verified cold-backend condition. No hosted API cost, actual user retention, independent semantic entailment or production safety certification is inferred.

## Acceptance and repeatability

- `npm run living:model -- --prepare-only`: verify cached model/runtime hashes.
- `npm run living:model`: start fixed loopback inference.
- `npm run bench:living-review`: resumable four-method evaluation with candidate lock; preserve failures.
- `npm run test:living-review`: production build, real local auth/database/RLS, actual Chrome desktop/mobile inference and interruptions, then review-memory journey.
- `npm run preview:living-review`: fresh disposable synthetic preview at `http://127.0.0.1:57300/commitments/living`.
- Unit, integration, TypeScript, lint, SQL, design/platform and local staging rehearsal are recorded in `VERIFICATION.md` with actual outcomes.

The test fixture uses the existing `.next-build` and `inboxai-m6d-e2e` Docker project. Do not run preview and a rebuilding acceptance process together. Fixture teardown destroys its synthetic database; application/Chrome restart inside the fixture preserves it. Back up a preview before replacing it. The previous preview backup is local, ignored and contains no real mail.

Rollback: disable the local-only feature flag or return to the previous inference code while preserving the additive review table. Do not drop audit records or rewrite applied migrations. Old cached analyses remain labeled with their original model version. Real mail and deployment security gates stay closed.

## Measured result

Measured on 2026-11-17, Mac M1 Max / 32 GiB, Qwen3-4B-Instruct-2507 Q4_K_M and llama.cpp b12242. The frozen candidate met both proposed quality floors **on this synthetic protocol**. This is not a claim that the raw LLM never makes mistakes.

| Method | Correct / eligible | Precision | Strict recall | Model calls | Total seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| v2 | 50/60 | 83.33% | 96.15% | 60 | 304.9 |
| pipeline | 52/52 | 100.00% | 100.00% | 60 | 353.2 |
| direct | 37/59 | 62.71% | 71.15% | 60 | 304.6 |
| agent | 33/51 | 64.71% | 63.46% | 120 | 424.6 |
| product | 52/52 | 100.00% | 100.00% | 60 | 304.8 |

`pipeline` is CLI v3; `product` is the actual Chrome/API repeat. Input digests match for all 60 actual API scopes. Raw v3 candidates: 68, of which 16 remain secondary/unsupported. V2 raw candidates: 67, of which 7 are secondary. Eligible false proposals fall from 10 to 0 and missed strict events from 2 to 0 on this corpus. Raw negative-conversation attention remains 6/20 for both; the default queue is quieter, but secondary work is not erased or credited as better extraction.

V3 CLI inference is 15.8% slower and consumes 11.4% more tokens than v2. The API repeat has different timing boundaries and warm/load conditions. No general speed or total-human-effort advantage is asserted. Direct/agent prompts use English and a nine-field output contract, versus the product's Vietnamese six-field contract plus deterministic derivation; the frozen v2 is the closer architectural comparison. This is a comparison of the tested configurations, not attribution to one component or a model-family ranking.

Actual Chrome 157 acceptance: 29 groups, 60 conversations / 83 mails on alternating desktop/mobile viewports, 52 oracle-assisted corpus approvals and no external sends. The additional interruption stories exercise stale source and ledger versions, lost acknowledgement, Next and Chrome restart, source continuity, persisted dismissal, offline undo and new evidence. Mobile viewport evidence is not a physical native-device test.

The isolated review-memory story records four explicit decisions, one actual source opening, zero field edits and three reopen cycles: zero repeated reviews for the dismissed proposal versus three for the equivalent not-dismissed proposal in the other account. This is a paired memory ablation with a simulated relevance decision, not a measured v2 UI user study or cognitive-effort estimate. Undo leaves the ledger alone; two separate later approvals create ledger versions 1 and 2.

Final checks and targeted preview evidence are linked from `VERIFICATION.md`. The broad Chrome run precedes render corrections (shared Button icon props, omission of before/after on confirmed receipts, and a shrinking header/search input with scroll-preserving focus) and stronger full-subject binding in review identity. Visual inspection of the first preview found nested horizontal clipping despite zero axe/root-overflow failures; that first preview evidence is retained. Final preview assertions additionally check the header, main frame, containing frame and review heading for clipping and hidden horizontal scroll. Shared design/platform suites were rerun after the header correction. These do not change the frozen inference candidate. Final unit/SQL checks, the upgraded recovery rehearsal and the final Chrome preview cover the changed paths; the 60-case run is not relabeled as an exact final-render snapshot.

Known limits: the earlier development corpus still exposed unsupported indirect/unclear-year formulations; the new synthetic success does not establish general Vietnamese coverage. Review identity deliberately includes exact canonical quote and factual effect, so changed quote boundaries may require a new decision. The source-fingerprint budget is inherited from bounded mail analysis; full subject is additionally bound. Human relevance and semantic review remain unmeasured. Real Gmail/OAuth, native devices and production security are outside this local milestone.
