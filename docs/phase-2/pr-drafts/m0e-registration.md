# Draft: verified signup and shared admission limits

Depends on the M0 security baseline. Local review draft only; no remote PR exists.

Public signup previously used the admin API to auto-confirm arbitrary email addresses
and counted only one page of users. Signup now uses normal email verification with
PKCE, validates provider configuration, and fails closed if registration is disabled.
The database serializes admission, enforces the cap even through direct Auth calls,
preserves revoked memberships, and stores only hashed rate-limit identifiers.

Acceptance: missing configuration/unsafe confirmation settings cannot create an
application session; external redirects are rejected; a verified admitted account
can reach Inbox; ten concurrent inserts cannot overrun the final slot; user input
cannot grant admin rights. Verification details and remaining limits are in
`../M0E_LOCAL_HANDOFF.md`. Vault/native Auth abuse controls remain release gates.

Rollout: forward migration defaults closed. Rehearse against a synthetic local or
isolated staging database. Existing users/roles must not be automatically promoted.
Do not recover by restoring auto-confirm or disabling the admission trigger.
