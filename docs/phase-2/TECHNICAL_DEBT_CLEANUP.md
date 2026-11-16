# Technical-debt cleanup, 2026-11-16

Scope: pending evidence-request follow-through and visual signals, followed by
maintenance on `codex/technical-debt-cleanup` from `origin/main` at `f85081f`.
The owner authorized commit and push. No main merge, deployment, hosted settings
change, real mailbox or real delivery is authorized.

## Changes and evidence

- Removed 92 lint warnings at the existing rule baseline. Removed unused imports,
  parameters, unreachable callbacks and three mail-list components with no callers.
  Removed their unused `@tanstack/react-virtual` dependency. Named default API
  export objects without changing their exports. CI now uses `--max-warnings=0`.
- Bound Action Items, Smart Reply, Reply Assistant and action-filter reads to their
  source with cancellation. Late responses cannot populate a different email.
  Failed Action Item PATCH requests roll back the optimistic status. Unit tests
  exercise delayed A/B responses, cancellation and an actual rejected HTTP status.
- Mobile reader state resets through keyed component identity. Briefing filters
  use an SSR-safe external-store subscription with validated session-storage data.
  Tests cover hydration snapshots, type changes, clearing and malformed storage.
- Replaced unsupported ARIA description attributes with described-by references.
  Image components preserve direct browser loading (`unoptimized`) for avatars
  and authenticated attachment previews; no server image proxy was introduced.
- Upgraded Sentry to 11.12.0, used its typed config entry point and current
  sourcemap controls. Removed the obsolete profiling setting; no profiling
  integration was installed. Local builds use no Sentry upload token.
- Resolved the observed npm audit findings: 11 moderate before cleanup, zero in
  the final scan. Sentry removes the vulnerable glob chain. A narrowly scoped
  `typescript-estree@8.72.2` override selects minimatch 11.0.7; its named API and
  allowlist matching are smoke-tested. No `npm audit fix --force` was used.
  [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
  [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- CI runs on authorized `codex/**` branch pushes, rejects moderate audit findings,
  and adds the isolated visual and platform checks to the existing Chrome job.
  The tracked Render configuration remains `autoDeploy: false`.

## Deliberately deferred work

The optional eslint-config-next 16.4.6 / React Hooks 7.1.1 probe surfaced roughly
30 additional compiler and lifecycle migration errors in legacy screens. This
task retains eslint-config-next 16.0.8 and explicitly pins React Hooks 7.0.1,
the rule version already in the starting lockfile. No rule was disabled. The
two lifecycle errors exposed by removing dead code were fixed through the keyed
reader and external-store hook. Migrating the newer rule set remains a separate
refactor requiring lifecycle regression coverage; zero warnings here does not
mean that migration has been completed.

Parallel legacy classifier/search paths remain until equivalent behavior is
verified. This task does not claim global architectural debt elimination,
measured AI superiority or readiness for real email. Hosted configuration,
Google verification, provider interoperability and the remaining security gate
still need their own evidence. The scoped override must be reconsidered on a
TypeScript ESLint upgrade; CI audit remains mandatory.

## Verification and rollback

See the current [verification record](VERIFICATION.md) for exact commands,
counts, initial failures and final results. Logs are retained locally in
`test-results/technical-debt/`, outside Git. Unit assertions, SQL assertion groups,
synthetic Chrome scenarios and real-provider evidence are distinct.

The checkpoint also includes the forward evidence-request migration and the
previously requested visual signals. See [evidence-request behavior and
acceptance](PURCHASE_EVIDENCE_REQUESTS.md) and [visual signals](VISUAL_SIGNALS.md).
Do not rewrite applied migrations. Before any eventual hosted rollout, preserve
the database and use an explicit forward repair for migrated state; a source-code
revert alone does not undo the new private RPC wrappers or stored requests.
For the disposable local fixture, recreation from the migration chain is the
rollback. Dependency rollback restores both manifest and lockfile together.
