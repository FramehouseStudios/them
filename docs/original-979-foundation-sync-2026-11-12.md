# T-1461 — Preserve original security #979 on landed foundation main

VERIFIED at 2026-11-13 05:22 UTC. This is local integration/component proof;
publication, exact-head hosted gates and genuine non-author approval remain open.

## Preserved source boundary

- Owned worktree: `codex-T1461-979-foundation-sync`, branch
  `codex/T-1461-979-foundation-sync`.
- Original #979: `c508430c6748fb7d4dbbbb759cc9cfc61e3dad3d`.
- Landed main: `bc2b38c0065d744d17682dd1d39270a94f0d5f61`, whose parents retain
  previous main 78b8c94f and original #964 32a8197d. Root verified its human approval/required
  checks and performed that protected merge; this agent did not merge main.
- Local no-ff merge: `85f957c5e25ddd0d527639875364081d253dff8b`, with original #979 c508
  and main bc as its two parents. Merge base: eaa94d0b. Original Dependabot
  `02a403e07592454dc05b87b689b8fc0bbf321c17` and both input heads are verified ancestors.
- No conflicts occurred. All index entries were stage0; the index inventory and
  original/merge ancestry are retained in the private proof. No conflict stages
  needed reconciliation, no source was overwritten, and no history was rewritten.

## Fresh component verification

Cached image `sha256:6dd366fd7162f3415cd7f04af350b4f2df5ee527617847f6c33744a875630366`
ran Node 20.20.2/npm 10.8.2 in a disposable container. The source was frozen from
all 1,390 tracked merged files, copied into the container's executable filesystem,
and byte-checked afterward: zero mismatches. A separate copied npm cache and
empty task-owned user/global npm configs were used. No host environment or
credentials were forwarded; installation/tests used `--network none`, no host
ports, no simulator/native app, no provider/model calls or real environment files.

| Check | Result |
| --- | --- |
| `npm ci --offline --ignore-scripts --no-audit --no-fund` | exit0, fresh install |
| `npm ls --all` | exit0 |
| Installed dependency assertions | multer 2.5.0, Express 4.22.3, body-parser 1.20.9, qs 6.16.2; no override layer |
| Focused installed-dependency/body-parser/multipart checks | 12 passed / 0 failed / 1 skipped, 13 total |
| `npm test` full backend, once | 2,752 passed / 0 failed / 2 skipped, 2,754 total |
| Fresh official npm production audit | exit0; zero findings at every severity |
| D009 against exact landed-main source | five zero deltas |
| `git diff --check` and staged diff check | exit0 |

Focused command: `node --test --test-concurrency=1 tests/fast_uri_security.test.mjs tests/craft_routes_body_parser.test.mjs tests/talk.integration.test.mjs`.
The focused skip is the existing talk preview-header case. Full-suite skips are
that same explicit case and the unconfigured live-Postgres prefix query. Neither
is counted as a pass. There were no verification failures. Initial local Docker
socket read was sandbox-denied; the scoped approved Docker access succeeded
before any test execution. No source/assertion change was used to obtain a pass.

Audit command: `npm audit --omit=dev --package-lock-only --registry=https://registry.npmjs.org --userconfig=/audit/user.npmrc --globalconfig=/audit/global.npmrc --json`.
Only copied package/lock files and empty configs were mounted for that separate
registry-metadata request. No app source, credentials or writer content was sent.
This is a current registry snapshot, not a whole-app security claim.

Canonical D009 command: `GITHUB_BASE_REF=codex/T-984-main-simulator-proof node scripts/check_god_files.mjs --json`.
That existing local origin ref is exact 32a8197d; its entire Git tree 5aee9f28 is verified
identical to main bc. A separate direct byte/hash comparison of all five canonical
protected files against exact bc also passes. No remote-tracking ref was changed.

## Source scope and adversarial review

VERIFIED: both dependency files and the entire backend tree are byte-identical to
original #979 c508. Package SHA-256:9423a24bdf6c28f7e0bbda78fead83984025b40141ecac34c86904ae2bd078cc;
lock SHA-256:506b4bf0a3cb5aa359974fe20f69cc198e37f582077c8f822c0dc7bf52da8ed1.
App runtime, Packages, unit tests, scripts and workflows are byte-identical to
main bc. The candidate as a whole is not main-identical: it retains original979's
dependency correction, two V1 hunks and original security proof document.

Both V1 hunks are retained unchanged. The helper uses the semantic Them tab and
accepts already-selected Them plus existing restored content before resolving a
hit point. Actual navigation still taps, with the original eight-second deadline.
The story-relaunch case additionally asserts selected Them. The helper and whole
story case are byte-identical to c508; reversing only those two original hunks from
the combined V1 file reproduces main bc exactly. No recovery, content, full-draft,
exactly-once, authentication, retry or save/version assertion is weakened. This
source review does not substitute for fresh combined native/hosted proof.

Answered: ancestor preservation, canonical dependency ownership, installed tree,
body/multipart component behavior, current dependency audit and no protected-file
growth. Not covered: combined native iPhone/physical-phone/live-provider behavior,
external export, intended shipping backend or production readiness. Current #979
reviews were empty at 05:22 UTC; agent review is not independent human approval.

## Handoff

Private evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1461-security-foundation-sync-20261112/proof.json`,
with source manifest, exact command driver/status, full/focused logs, audit JSON,
D009/direct-main identities, V1 source comparison and index/ancestry inventory.
Archive verification found zero mismatches across copied artifacts and all 1,390
frozen source files. Temporary evidence remains at
`/private/tmp/them-T1461-security-proof-e9uqhjuo`; nothing was deleted.
Its source/component checkpoint is local merge 85f957c5. Subsequent TASKS/proof-doc
changes contain no runtime/test/package changes and do not justify a suite repeat.

No push, PR/base mutation, direct-main write, remote merge, protection change or
production mutation. Original #979 remains intact and draft. Root owns reviewing
this local descendant, normal original-branch advancement/base targeting and
fresh hosted gates/non-author review. Other worktrees, dirty #973, simulator 81F and
recovery ownership were untouched. Production hold remains. READY FOR CONTINUE.
