# M1-A credential boundary and local maintenance

Scope: owner-authorized local implementation on 2026-11-11. No hosted migration,
provider connection, push, deployment or real mailbox is authorized by this guide.

## Boundary

The existing Next.js/Supabase architecture is retained. Account metadata stays in
`public.source_accounts`. Six secret columns are removed by the forward migration
`20261111020000_credential_vault.sql`. Credentials live in `private.account_credentials`;
legacy packets awaiting conversion live in `private.legacy_account_credentials`.
Neither private schema nor its tables are granted to anon, authenticated or service
role. RLS is enabled with no browser policies. Three public SECURITY DEFINER RPCs
are executable only by service role and have an empty search path and explicit
schema qualification. Read/write RPCs require both owner and account IDs.

Browser clients can read their account metadata with RLS. Next server code verifies
the authenticated owner before invoking the vault. The service role is privileged;
its caller-supplied owner ID is not independent user authentication. Never expose
these RPCs through an endpoint that accepts body user_id as authority. Composite
foreign keys bind private rows to account ownership and cascade account deletion.

`vault.ts`, connection helpers and mail adapters use `server-only`. The pure crypto
module uses Node crypto and accepts an explicit keyring, not client configuration.
OAuth callbacks, IMAP connection creation, Gmail token refresh, SMTP password reads,
IMAP sync/body reads and attachment fetch now use this boundary. The Gmail debug
route reports safe metadata/status only and remains disabled in production.

## Encryption and threat model

Each envelope uses AES-256-GCM, a fresh random 12-byte nonce, 16-byte tag, version,
algorithm and key ID. Additional authenticated data binds purpose, version,
algorithm, key ID, user ID and account ID. Swapping envelopes across owners or
accounts and modifying ciphertext/tag/header fail closed. Payload schemas distinguish
IMAP passwords from Google access/refresh tokens, expiry and scope.

`CREDENTIAL_VAULT_KEYS` is a server-only JSON object of key IDs to exactly 64 hex
characters (32 independent random bytes per key). `CREDENTIAL_VAULT_ACTIVE_KEY`
must identify a configured key. There is no default, truncation or plaintext
fallback. At most eight distinct keys are accepted. Never use the synthetic keys
in test fixtures outside tests; never put keys in NEXT_PUBLIC variables or CLI args.
`.env.example` records configuration shape without usable secrets.

This is application-level envelope encryption with an environment keyring, not a
managed KMS/HSM or Supabase Vault integration. It separates a database dump from
application keys. It does not protect against a compromised application process,
service-role holder plus keys, host administrator, old backups or malicious DB
administration. Private legacy packets still contain historical plaintext OAuth
secrets until conversion succeeds. Key delivery, access auditing, managed storage,
rotation operations and backup retention need hosted review before release.
JavaScript secret strings cannot be reliably erased; temporary decryption buffers
are zeroed on the normal validated path, which is not a memory-forensics guarantee.

## Migration and failure behavior

1. Keep the application and background workers stopped during the schema/application
   cutover. Rehearse only in the disposable local database at this stage.
2. Apply the forward migration: one transaction quarantines old credential fields
   in private storage and drops the public secret columns. Failed SQL rolls back
   the entire transaction. The old application cannot run against the new schema.
3. Inventory pending rows. Explicitly convert a bounded page or a selected account.
   Hot-path reads reject `legacy_pending`; they never decrypt CBC or use plaintext.
4. Conversion verifies an AEAD roundtrip before the atomic compare-and-swap write.
   The private legacy packet is deleted only after successful persistence.

Historical CBC decoding reproduces the original TEXT key padding/truncation, not
hex decoding. Supply the exact old `ENCRYPTION_KEY` only during conversion. Missing
keys, malformed ciphertext, incompatible OAuth families, mixed auth kinds and
ambiguous expiry fail closed and retain the packet for targeted repair/reconnection.
CBC had no authentication: successful decoding cannot retroactively prove the
original value was untampered. Conflicting or unverifiable records require trusted
review or reconnection, never a silent choice of token.

Account creation and encrypted storage are one SQL transaction. A failed credential
write leaves no new metadata account. Existing-account writes lock the parent row
and compare the expected revision. A stale writer receives PT409 (HTTP 409). Do not
use SQLSTATE 40001 for this business conflict: local PostgREST 14 retried it until
timeout, consistent with the [Supabase troubleshooting note](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
Gmail refresh returns a token only after persistence succeeds. Failed refresh/CAS
returns unavailable; provider calls in that flow were mocked, not executed here.
Migration, rotation, restore and token refresh preserve disabled account state.

## Local CLI

Configure only loopback Supabase URL, synthetic service key and synthetic vault
keyring in the invoking local test environment. `npm run test:local-auth` constructs
this environment automatically; no manual real-mail credentials are needed.

```sh
npm run vault:local -- inventory
npm run vault:local -- migrate --user USER_UUID --account ACCOUNT_UUID
npm run vault:local -- migrate --apply --user USER_UUID --account ACCOUNT_UUID
npm run vault:local -- rotate --apply --user USER_UUID --account ACCOUNT_UUID
npm run vault:local -- restore --apply --user USER_UUID --account ACCOUNT_UUID
npm run vault:local -- inventory --after LAST_ACCOUNT_UUID
```

Replace UUID placeholders with actual synthetic fixture IDs. Without `--apply`,
commands inspect status only; dry run does not certify decryptability or a conflict-free
migration. Restore always requires explicit owner/account scope. Hosted URLs are
rejected before requests, redirects are rejected, each HTTP request has a 10-second
timeout, and each invocation processes at most 50 rows with an explicit next cursor.
Outputs contain IDs, states, revisions and key IDs, never credentials or ciphertext.
Per-account errors allow independent rows to finish, with a nonzero exit for failures.
Inventory `ready` means an envelope exists; reading/rotating verifies its integrity.

## Key rotation and recovery

Add a new independent key and select it as active while retaining the old keys.
Run rotation for each page, then scan all inventory pages for both `keyId` and
`backupKeyId`. Retire an old key only when neither references it, and pending
legacy conversions/recovery backups have been assessed. Re-running rotation under
the same active key is a no-op. A write keeps one encrypted previous version;
rotation re-encrypts both current and previous values under the active key.

`restore --apply` swaps the previous and current credentials using a fresh envelope
and revision under the active key. It is encrypted recovery, not a downgrade to
public plaintext columns. It cannot restore a lost encryption key or make expired
or revoked provider tokens valid; no provider verification is claimed. Historical
database backup restore requires a separate reviewed procedure and matching keys.
There is no automatic cleanup TTL for the one prior envelope or conflicted legacy
packets yet. Deletion of the account cascades both private tables.

Never roll back to the credential-reading legacy app or re-create secret columns
on public tables. On failure keep workers closed, retain valid encrypted/private
state and repair the affected account or key configuration. Production cutover,
backup restore, fleet key retirement and external provider verification remain gated.

## Evidence

See [M1-A local handoff](M1A_LOCAL_HANDOFF.md) for actual commands and results.
Synthetic crypto and route tests are not penetration testing or certification.
The real local Auth/PostgREST rehearsal exercises the grants, RPCs and ciphertext
persistence; Google/IMAP/SMTP are never contacted. Gmail sync paging/history and
OAuth send/idempotency remain M1-B/M1-C.

References: [OWASP cryptographic storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html),
[Node crypto](https://nodejs.org/api/crypto.html),
[Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).
