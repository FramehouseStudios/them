# Original #625 billing preservation — T-1474

## Target and exact history

DECIDED by the current assignment: prepare a local preserving merge of original
#625 `25d7383651167f26777b1da79e1d6d466f2aec6f` with exact original979 parent
`2ea2042220e6f440ab9d6552f8f4059e5af71880`. Original #625 remains the source
PR; no replacement, squash, public-history rewrite, publication or main merge.

The complete current #625 body was read through the GitHub connector before
reconciliation. Its base was `codex/T-984-main-simulator-proof` at `5faa43d6`;
its current head was `25d73836`. All counts in that body are historical proof,
not fresh results for this merge.

Worktree: `/Users/halfmutantfilms/io.them-worktrees/codex-T1474-empty-billing-preservation`.
Branch: `codex/T-1474-empty-billing-preservation`.
Binary source criteria: retain original billing behavior/tests and incoming
recovery/security behavior, preserve both commit histories, and do not grow
any canonical protected file versus exact main `71c637d886a9edd6a183048cd2feea0d00bfb143`.
Root retains runtime verification and all GitHub/publication decisions.

## Why the original capability is still needed

VERIFIED by source comparison: exact2ea still commits the non-stream wallet
callback before provider HTTP/JSON/non-empty validation, accepts an empty
quality-gate replacement, treats short-film supplier raw JSON as draft text,
and directly settles usage in the adapter callback before response outcome.
The three original625 runtime files contain all four existing corrections.
They were preserved byte-for-byte in merge654c30b1; the separately attributed
quality-acceptance follow-up below changes only the existing owner-mutation guard.
No new billing implementation was invented.

- `backend/lib/talk_generate.js`: retain non-empty original output when the
  quality stage returns empty; reject empty final output; only propose
  non-stream usage after HTTP, JSON and non-empty validation.
- `backend/lib/clementine/short_film_lane.js`: validate provider HTTP status
  and decode normalized supplier content rather than saving its JSON envelope.
- `backend/lib/clementine/page_lane_adapter.js`: generation proposes usage;
  response finish/close/throw settles at most once. HTTP errors,
  `error*`, `asked_repeat`, `continue_listening`, no proposed usage and
  incomplete delivery release the hold.

Important distinction: the direct generation regression deliberately retains
non-empty prose and invokes `commitWallet(123)`. The production adapter now
interprets that as proposed usage. The existing real handler/HTTP regressions
prove that rejected empty/prose replies become `error_recovered` without an
authoritative page and without charging. Do not claim every prose result is
rejected by the generation stage alone.

## Contextual reconciliation and preservation

The sole conflicts were TASKS and three V1 UI-test helper hunks. All conflict
stages1/2/3, both pre-resolution working files, merge output and hashes are
retained at `/private/tmp/them-t1474-conflict-stages-nm003mzf` on this computer.
This is local retention, not an off-device backup.

Both task-history blocks are retained. The V1 conflicts retain incoming2ea's
canonical bounded hittability wait and viewport-before-activation helper.
All41 incoming UI test identities remain. The original625 UI contributions
are also retained: richer inspector/To Page failure geometry, keyboard typing
tutorial handling, and the stronger automatically-reachable loaded-prompt
assertion. These are inherited original work, not a new UI implementation.
Production Swift/Packages, workflows, scripts, dependencies, backend index
and existing backend modules outside the original three billing files remain
byte-identical to incoming2ea. Original proof documents are retained as history.

## Current static verification only

VERIFIED at preserving merge654c30b1: six syntax checks, all exit0, using
`node --check` on the three runtime files and three original regression/helper
files. All six then matched original62525d. The follow-up adds the guard and
two cases below; its two changed JS files also pass syntax checks, exit0,
without executing any module/test. Static preservation receipt:
`/private/tmp/them-t1474-conflict-stages-nm003mzf/static-proof.json`.

VERIFIED explicit exact-main71 D009 comparison using the file list extracted
from canonical `scripts/check_god_files.mjs:GOD_FILES`:

| File | main71 | Candidate | Delta |
| --- | ---: | ---: | ---: |
| backend/index.js | 33626 | 33626 | 0 |
| them/ScreenplayStudioScreen.swift | 17416 | 17416 | 0 |
| them/RootExperienceView.swift | 15112 | 15112 | 0 |
| them/ScreenplayLiveDraftBridge.swift | 12915 | 12915 | 0 |
| them/BackendMemoryAPI.swift | 10865 | 10865 | 0 |

Local `origin/main` was stale at `bc2b38c0`, so the default script was not
misrepresented as exact-main71 proof. No baseline refs were modified. The
historical33626 index count remains correct at this boundary; do not edit
unrelated lines to manufacture the later33603 target.

`git diff --check`: exit0 after contextual reconciliation and note creation.
No backend tests, npm/container, simulator/native tests/build, services, live
providers, GitHub mutations or production probes were run in this lane.

## Existing focused before/after proof for Jarvis

Use the same tests in isolated tracked-source snapshots under pinned Node20.20.2
with locked dependencies, external networking disabled and disposable test
data. Never copy/read a real `.env`. For the BEFORE snapshot at exact2ea,
overlay only these unchanged original625 test files from this candidate:

- `backend/tests/empty_generation_billing.test.mjs`
- `backend/tests/talk_empty_billing.integration.test.mjs`
- `backend/tests/helpers/billing_provider_stub.mjs`

From each snapshot's backend directory, the identical focused command is:

```sh
node --test --test-concurrency=1 tests/empty_generation_billing.test.mjs tests/talk_empty_billing.integration.test.mjs
```

For the smallest real-handler boundary separately:

```sh
node --test --test-concurrency=1 tests/talk_empty_billing.integration.test.mjs
```

The HTTP file exercises actual `/talk`, supplier and handler with synthetic
provider transport, authenticated disposable account, saved project/history/
wallet comparisons and backend restart. It also has real HTTP recovery-status
checks and event-level duplicate lifecycle controls. The provider stub rejects
unexpected requests. It is not a live quality/microphone/physical disconnect proof.

Broader existing production-stage compatibility command after the focused fix:

```sh
node --test --test-concurrency=1 tests/talk_generate_stage.test.mjs tests/short_film_lane.test.mjs tests/talk_supplier_glue.test.mjs tests/empty_generation_billing.test.mjs tests/talk_empty_billing.integration.test.mjs
```

Record actual fresh failures/skips/counts. Old22/33/2774 results are inherited
and must not be relabeled as this merge's proof. Root decides subsequent full
backend/signed-unit/essential-UI and hosted integration boundaries.

## Conditional short-film owner side effect found in original source

VERIFIED source ordering: `talk_generate.js:103-128` retains non-empty prose
when the quality gate rejects it with `ok:false, reply:""`. If a caller also
supplies `req.clementine.screenplayOwnerRecord` or `req.screenplayOwnerRecord`,
lines145-175 can append that prose and invoke its optional committer before
`talk_handler.js:4339-4378` later rejects the result. The store reuses the
owner's existing active project (`short_film_store.js:107-121`), so this
conditional path is not limited to a throwaway project.

Repository-wide source search found no current production assignment of those
request owner/committer fields. `index.js:31956` injects the canonical committer
into screenplay route mounting, not the talk request. The adapter reconstructs
`req.clementine` without these fields and the handler does not attach them.
Therefore a shipping `/talk` overwrite is not established by this finding.
The owner-injected helper capability nevertheless needed a guard before it is
wired into production; billing release alone cannot undo a premature version.
The scoped follow-up below adds that guard without wiring the capability.

The real HTTP tests explicitly enable short-film beta and submit a parseable
15-page/John-Sally-Sam page request. Source wiring selects Page and forwards
that transcript to generation. Their provider marker is generic rather than
a unique short-film execution marker, and no owner-context injector is present.
They therefore do not cover the owner-side-effect block. Existing owner-injected
direct generation tests cover empty/throw/cancel, not retained non-empty prose.

## Additional scoped T-1474 quality-acceptance correction

DECIDED by the root's explicit follow-up assignment, separate from the original
625 fix: `shortFilmDraftAccepted` starts false and becomes true only when the
existing gate returns `ok === true` and a nonempty accepted reply. The eager
owner/version/committer block now also requires that verdict. Null, rejection
and throw cannot authorize project mutation. Original retained-output and
proposed-usage behavior remain unchanged; the real handler stays authoritative.
No owner context was connected, public error envelope changed, or new store added.

Two additive actual `runTalkGenerate` regressions use a correctly shaped active
owner created by canonical short-film project/version factories:

- rejected nonempty prose plus rejected repair leaves full owner, versions,
  active IDs, persisted copy and committer untouched, while retaining the
  original625 reply/proposed-usage contract;
- the existing accepted offline screenplay fixture appends and commits exactly
  once and preserves the original saved version, including explicit UTF8 bytes.

All original test source remains identical after removing the single additive
factory import; the two cases are appended. Source/tests-before copies and hashes:
`/private/tmp/them-t1474-conflict-stages-nm003mzf/owner-guard-before/`.
Two-file syntax and original-test preservation receipt:
`/private/tmp/them-t1474-conflict-stages-nm003mzf/owner-guard-static.json`.
Host syntax tool was Node26.7.0, not the required Node20 runtime gate.

For a decisive BEFORE result, root should use exact preserving merge654c30b1
(runtime byte-identical original62525d) in an isolated tracked-source snapshot,
overlay ONLY the new `backend/tests/empty_generation_billing.test.mjs`, and run:

```sh
node --test --test-concurrency=1 --test-name-pattern='^quality-rejected short-film prose cannot mutate a supplied active owner$' tests/empty_generation_billing.test.mjs
```

The source predicts failure at the untouched-owner/committer boundary; this
child did not run it and does not claim an observed failure. Then run the
same new negative test and the complete focused commands above against the
after candidate under pinned Node20.20.2. Retain the actual before/after
counts, including name-filter skips. Existing original HTTP tests remain intact.

This follow-up guards quality acceptance before eager owner mutation. It does
not create an atomic transaction spanning later handler/TTS/delivery stages;
that is outside this bounded change and the owner hook remains unwired in
current production. No runtime success or shipping reachability is claimed.

## Adversarial review and limitations

- Source addressed: provider rejection/invalid JSON/empty replies cannot
  propose a non-stream charge; empty gate output does not erase valid output.
  Original regression bodies and recovery follow-up are unchanged.
- Source addressed: success finish followed by close/finish cannot settle
  twice; disconnect/throw/recovery releases the proposed reservation. Native
  network interruption and delivery acknowledgement remain unproved.
- Source compatibility: no auth/project owner resolver or HTTP mount changed.
  With REQUIRE_USER_AUTH=true, the canonical auth middleware protects `/talk`
  and screenplay routes before handler execution; authenticated identity wins
  over the adapter's legacy body fallback. Existing real HTTP test enforces
  auth and rejects anonymous project access, but is not a cross-user security
  certification or production configuration proof.
- Source compatibility: existing `createTalkFailureError` and handler recovery
  envelopes remain the owner; no new public error format or endpoint was added.
- Not covered: process crash while reservations are in-flight, asynchronous
  wallet persistence failure, distributed/process-local settlement, arbitrary
  callback ordering outside the existing finish/close/throw contract, complete
  project-isolation negative cases, live provider quality, physical phone or
  production migration/restore. HTTP finish is not client save acknowledgement.

Production hold, independent review and all required hosted checks remain.
The separate main Autosave red and real-auth intermittent freeze are not fixed
or cleared by this billing merge. No product completion claim.

Continue status: READY FOR CONTINUE — Jarvis reviews the preserving candidate
and scoped follow-up, obtains the new-negative before result, then runs the
focused after/real-handler proof before publication.
