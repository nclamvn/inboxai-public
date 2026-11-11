# Real mailbox / production gate: CLOSED

No real email, external send, production deploy, main merge or live migration has
been authorized in this task. Passing local tests does not open this gate.

Required evidence before proposing a supervised real-mailbox test:
- [x] Request-security fixes pass local adversarial unit/route integration tests.
- [x] Fresh and synthetic local upgrade migrations, two-tenant/anonymous SQL boundaries verified; hosted deployed-schema rehearsal remains pending.
- [x] Local synthetic server credential vault, AEAD rotation/restore and no browser credential visibility verified (M1A_LOCAL_HANDOFF.md).
- [ ] Hosted key management, deployed-schema/backup cutover and credential migration/retirement reviewed and rehearsed.
- [ ] No unresolved applicable critical/high dependency or application vulnerabilities.
- [ ] Gmail scope minimization and OAuth verification/security-assessment applicability checked.
- [x] Synthetic local sync checkpoints, duplicate/retry/concurrency/fencing behavior verified (M1B_LOCAL_HANDOFF.md).
- [ ] Real-provider sync interoperability, large-message/folder support, Gmail send/idempotency and uncertain-send reconciliation verified.
- [ ] CI lint/typecheck/tests/build succeed; required checks and branch protection confirmed remotely.
- [ ] Isolated staging, synthetic data, redacted telemetry and incident/recovery procedure verified.
- [ ] Explicit owner authorization for the particular supervised mailbox test.

M0 only establishes the baseline and closes identified paths. Vault/sync release
requirements span M1; this is a data-use gate, not a claim M0 implements M1.
