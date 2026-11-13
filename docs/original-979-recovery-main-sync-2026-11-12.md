# Original #979 on the landed recovery foundation — T-1465

## Completed and source boundary

Original security head `6c912cfa269560a215cc646aa4875014d31a144b` is preserved
through local no-ff merge `6f7913c6365e38697f051dd6446e250c0137565f` with exact
protected main `71c637d886a9edd6a183048cd2feea0d00bfb143`. Main has parents
`bc2b38c0065d744d17682dd1d39270a94f0d5f61` and published recovery head
`c2fab4c1f680c7a5da6387500c91f2b9296f720b`; its tree is byte-identical to c2.
Original Dependabot `02a403e0`, security `c508430c` and every follow-up remain
ancestors. Original PR body and all seven follow-up commits were reviewed;
its discussion timeline was empty at the read. No replacement PR or history rewrite.

Only TASKS.md and V1SmokeUITests.swift required manual reconciliation. Six index
stage blobs and both full conflict outputs were backed up and rehashed before a
three-hunk contextual patch. TASKS retains both conflict blocks verbatim.
The final documentation commit adds this record and an additive task entry.

Production app sources under `them/`, unit sources under `themTests/`, Packages,
scripts and workflows match exact main71 byte for byte. The two dependency files
match original9796c byte for byte: Express4.22.3, body-parser1.20.9, qs6.16.2 and
Multer2.5.0, with no obsolete overrides. The backend diff from main contains only
package.json and package-lock.json. Parent recovery, request-generation and actor
fences are inherited intact.

## Root integration issue and retained tests

Main generalized `revealStudioAppliedMemory` into the existing
`revealStudioPartnerContent(identifier:in:)`, shared by pending-question and memory
content. The original security helper used a `memory` local, so blindly taking its
conflict side would leave an undefined identifier in the generalized helper.
The two conflict hunks retain the original selected-Them/content readiness and
nonempty-frame/hit guards, adapting only both `memory.exists` references to the
canonical `content.exists`. The helper is exactly the original979 function after
its existing canonical signature/content lookup adaptation. Eight-second deadline,
real taps and polling interval are unchanged. No parallel helper was introduced.

All 41 main UI test identities remain. Forty test sections match main exactly;
the remaining story-relaunch test matches main after removing only original979's
additional selected-Them assertion. All existing recovery, authorization, content
and exactly-once assertions remain. The candidate V1 diff against main consists
of the original selected-Them assertion plus the adapted shared-helper hunk.
The V1 file therefore has a combined-source proof boundary beyond the parent's
native evidence.

## Fresh verification

After root's separate native checkpoint was terminal, one task-owned disposable
container ran the cached image
`sha256:6dd366fd7162f3415cd7f04af350b4f2df5ee527617847f6c33744a875630366`.
It used Node20.20.2/npm10.8.2, `--pull never --network none --cpus 2`, no host
ports, no forwarded host credentials, a private copy of the validated npm cache,
two fresh empty npm configs and dummy provider configuration. All 1,408 tracked
files were frozen before execution; the input mount was read-only and tests ran
from a separate executable tmpfs copy. Both worktree and frozen files matched all
recorded hashes afterward: zero mismatches. No Apple native or provider call.

| Command/check | Result |
| --- | --- |
| `g++ --version` | exit0; backend fixture compiler available |
| `npm ci --offline --ignore-scripts --no-audit --no-fund` | exit0 |
| `npm ls --all` and installed-version assertions | exit0; exact versions above, no overrides |
| `node --test --test-concurrency=1 tests/fast_uri_security.test.mjs tests/craft_routes_body_parser.test.mjs tests/talk.integration.test.mjs` | 12 passed /0 failed /1 skipped, 13 total |
| `npm test` — full backend, once | 2,758 passed /0 failed /2 skipped, 2,760 total |
| `xcrun swiftc -frontend -parse themUITests/V1SmokeUITests.swift` | exit0; source parse only |
| Working/staged `git diff --check` | exit0 |
| Canonical `node scripts/check_god_files.mjs --json` | exit0 against exact71; five zero deltas |

The focused skip is `talk page-write responses expose preview headers and
authoritative sync payload`, explicitly skipped without a logged reason.
The full-suite skips are that case and the live-Postgres prefix query because
`DATABASE_URL` is unconfigured. Neither skip is a pass. All five command stages
and the container exited0. One earlier read-only Docker metadata query hit the
sandbox socket restriction; scoped escalation resolved it before any tests.
There was no failed test execution or rerun.

The canonical D009 gate used only temporary local ref
`refs/remotes/origin/codex/T-1465-base-main` at exact71, removed with an expected-SHA
lease afterward. Existing tracking refs and GitHub refs were not moved.
Static gate Node was v26.7.0; backend proof Node was v20.20.2.

The previous official production dependency audit's zero findings are inherited
from identical6c package/lock bytes. No fresh registry audit or network call was
made for this integration. This is bounded dependency evidence.

## Evidence, GitHub status and next task

Complete task-private receipts, original stages, conflict outputs, exact commands,
source manifests and logs are retained at
`/private/tmp/them-T1465-979-recovery-sync-_c2j6s3_/`.

- Component receipt SHA256: `323f4748a3fa89e2f06bf2e2aabd6d8390ba6511595f3113d4f0e0cf1de58095`.
- Full backend log SHA256: `8acf370d37fe1b6a5141330c1b7e4ad9608361d7e395588e35db6e490aebc141`.
- Focused log SHA256: `2c6a48819ad9cadb28c47733eb508d6c569ba0e63e912ffcf2d3097b5db2de07`.
- Preserved-stage receipt SHA256: `97c80657ef2f4924e934679138e61b33308f7f73cef8ba0f13c105cba393eba9`.
- Hunk patch SHA256: `150533c938dc220a3beb69e29525e9559a845f771527e18469e820ca572cc692`.

Published6c's hosted success and main71/c2's hosted native709/0/0, V1 32/0/9,
writer1/0/0, recovery2/0/0, voice1/0/0 and Mac build success remain exact-head
inherited evidence. Recovery counts there are enforced by the producer's strict
summary guard, with the second CLI selector forwarded despite its absence from
the primary display line. They establish neither fresh combined-candidate native
behavior nor real401-to-refresh under the published automation override. Root's
local-only auth fixture and unresolved prior reconnect freeze stay separate.

Original #979 remains draft at published6c. This work changes no GitHub state,
main, protection, production, other worktree or existing archive. Root alone
reviews and normally advances the original branch, then obtains fresh exact-head
hosted checks and genuine independent human review. Human approval of904c2 does
not approve979. Orb, Clementine, production hold and real-phone limits remain.

Next active task: root review of this preserving candidate, then original-branch
publication and fresh combined hosted proof. READY FOR CONTINUE.
