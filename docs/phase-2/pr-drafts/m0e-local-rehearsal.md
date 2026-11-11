# Draft: real local Auth and migration rehearsal

Depends on the verified-signup change. Local review draft only; no remote PR exists.

Add a disposable GoTrue/PostgREST/PostgreSQL/SMTP-capture fixture and exercise the
real Next signup and callback. Test native bypass denial, email confirmation,
JWT/RLS isolation, existing-data upgrade preservation and administrator grant/revoke.
Keep all identities synthetic and all mail inside the internal network.

Acceptance: the recorded 14 service scenarios pass; database role/concurrency tests
pass; owned containers/networks and temporary database directories are removed.
The workflow includes a future rehearsal job but no deployment step or repository
secrets. It has not executed remotely under the owner's local-only instruction.
