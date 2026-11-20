# Temporary, application-owned picomatch security backports

These are **not official upstream fixed releases**. On 2026-11-18 npm latest was
4.0.7; GHSA-fc5q-39xc-vjpf / CVE-2026-112366 had no patched release. All published
versions through 4.0.7 were affected. Downgrading Vitest or suppressing audit does
not remediate the parser. This checkpoint uses distinct private package identities
and source-visible tarballs, never impersonates an upstream release and never runs
an install script. MIT licenses and upstream attribution are retained.

## Origin and patch

Sources were extracted from official npm 2.3.2 and 4.0.7 archives after checking
their SHA-512 integrities against the previous lockfile. `picomatch-upstream-v*.json`
records every original file hash. Only `package.json` and `lib/parse.js` differ.
`picomatch-manifest.json` binds backport source hashes and release archive bytes.

The parser repair is based on the approach in upstream proposals
[267](https://github.com/micromatch/picomatch/pull/267)
(head d9a3f12faf186860cfc86c2834c41f38701152f2) and
[268](https://github.com/micromatch/picomatch/pull/268) (head e2e3342c62828b2e37a1cfbdc7e0e30355a30c9e).
These proposals remain unmerged; InboxAI owns this qualified backport and its risks.

For a single flat branch containing an actual wildcard, separator-free repetition
is redundant: preserve the parser's inner tokens and drop the outer unbounded
quantifier. A star extglob becomes optional. Literal slash-delimited repetitions
remain unchanged outside bash mode. Complex unsafe bodies use the parser's existing
fail-closed literalization. Additional hardening checks character classes against
both separators (including ranges such as `[.-0]`) and prevents the existing
`maxExtglobRecursion:false` option from disabling this repair.

**Compatibility limits:** complex wildcard repetitions, raw-regex bodies and
separator-crossing bash repetitions can now be literalized. Repeated capture group
contents can differ, although matching remains equivalent for the flattened subset.
This is not a claim of universal glob equivalence or freedom from all ReDoS.
Do not use these forks as an unrestricted hostile-pattern execution service.

## Evidence and regression gate

- Original upstream suites, run using the BDD adapter
  `tests/security/run-picomatch-upstream.mjs`: 1,972 v2 and 1,983 v4 tests, zero
  failures. Checkouts were official tags 2.3.2 (81cba8d4b767cab3cb29d26eb4f691eed75b73b2)
  and 4.0.7 (6bb40679c218cefba5d4e9662408c5fdf699a8bb), with backported `lib/`
  copied over. No upstream assertions were removed. Adapter executes suite/test
  hooks sequentially, including Windows path-separator emulation.
- Frozen matcher comparisons captured from original installed official packages
  before replacement: 29 patterns x 6 options x 789 inputs x 2 versions.
  The only permitted difference is `+(a/*)` with `bash:true`, explicitly tested
  as fail-closed. The other 272,994 booleans must match original digests.
- 15 adversarial patterns x 8 options x 2 long inputs x 2 versions, bounded in
  child processes. Negative control proves the old nested quantifier times out.
- `npm run audit:picomatch` verifies source and archive hashes, **every installed
  copy** and lock entry, then runs regressions and fetches public npm advisories
  for the **original identities/versions**. Network/schema failure, a new advisory
  or any drift in the covered advisory fails the gate. A covered advisory is
  accepted only with exact source identity and passing security tests.
- `npm audit --audit-level=moderate` remains mandatory and unmodified. Its zero
  findings alone cannot certify a private fork; the supplemental gate is required.

To rerun original suites, clone the exact official tag into an ignored artifact
directory, copy corresponding vendor `lib/*.js` into its `lib/`, then run
`node tests/security/run-picomatch-upstream.mjs <checkout>`. Delete that test
checkout afterward. No upstream dev installation or project copy is required.

## Distribution and retirement

Tarballs are generated with `npm pack ./vendor/picomatch-vN --ignore-scripts`.
Overrides use this repository's immutable source-commit raw URLs, with lockfile
SHA-512 integrity. This avoids npm 11's incorrect parent-relative resolution of
local override targets. No external fork maintainer or mutable branch is trusted.
Installed tarballs must reproduce every checked source file hash.

Once an official maintained fixed release exists, inspect its fix, rerun these
regressions and full application/Chrome gates, and replace these forks with it.
Remove private packages and supplemental exception together. Reverting to vulnerable
published versions reopens the blocker; never bypass either audit gate to roll back.

## Official withdrawal verified, 2026-11-20

GitHub [withdrew this advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
on 2026-11-18T15:38:56Z, with metadata updated on November 19. The npm bulk
endpoint now returns `{}` for these original versions. That changes advisory
classification; it does not make the independently reproduced regex behavior or
our local regression results disappear.

The supplemental gate now accepts an empty npm result **only after** an independent
public GitHub API request verifies the exact GHSA, CVE, withdrawal timestamp,
original npm package and affected version range. Missing/active/mismatched metadata,
API failure and unknown npm advisories still fail closed. Source/archive/installed
integrity, bounded exploit tests and the original npm audit remain mandatory.
Backport archives and dependency URLs are unchanged in the UI milestone; retirement
is a separate dependency review, not an implicit removal during UI work.

The CI audit uses its read-only workflow token for the exact public GitHub
advisory endpoint. This avoids reliance on the runner IP's unauthenticated
quota. The token is scoped to that step and that HTTPS request, with redirects
disabled. Local runs can set `INBOXAI_ADVISORY_TOKEN` for the same lookup.
