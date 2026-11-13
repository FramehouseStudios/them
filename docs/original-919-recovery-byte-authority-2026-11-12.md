# Original #919 — exact save and conflict authority, 2026-11-12

## Completed

VERIFIED: preserving merges `c0fc5bc0` and `b262b50c` retain original #919
`510b7c68`, the proven original #904 runtime `7adcf46e`, and published parent
`ce89f996`. The only textual conflict was the additive TASKS ledger; both
histories and all original task entries were retained. Product auto-merges
were treated as unproved until the checkpoint below.

Local runtime fix `6c4c5d3950668c6c0ea3b261f6231810892fbec7` protects byte-only
edits, unresolved conflict copies and their original bases. It is not a main
merge or production deployment. Before/after file hashes establish that the
native runs and this commit have identical application and unit sources.

## Files changed by the root fix

- `them/ScreenplayDraftSaveOutbox.swift`
- `them/ScreenplayStudioPersistencePolicies.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/ScreenplayDraftSaveOutboxTests.swift`
- `themTests/ScreenplayStudioDraftRecoveryTests.swift`

## Root issues fixed

Swift String equality treats composed and decomposed Unicode as equivalent.
That equivalence is insufficient evidence that these exact writer bytes were
saved. The shared pure UTF-8 comparator now owns equality for completion,
publisher deduplication, normalized enqueue coalescence, raw hydration guards
and async Load Server's newer-edit check. Existing CRLF/outer-whitespace
normalization in completion/enqueue remains; this is not a claim that every
raw-whitespace path is now exact.

Ordinary receipts no longer discard independent parked conflict copies or
rebase their original versions. Explicit Keep Mine still supersedes the
chosen older chain. Metadata acknowledgement can retire the exact matching
copy while retaining independent unresolved copies and compacting active
retries. An actor-local expected-entry check rejects snapshot drift before
mutation. Existing persistence rollback remains transactional.

Known project-scoped conflicts block ordinary metadata hydration, including
a recheck after the queue await. Explicit Load Server and Keep Mine remain
connected. No new persistence framework, provider call, product state or
Root/Studio god-view state was added.

## Verification

- Before production changes: signed tests **0 passed /5 failed /0 skipped**,
  native exit65. These are actual assertion failures, not compile failures:
  Unicode completion, queued Unicode hydration, stale matching metadata,
  metadata deleting another conflict, and ordinary receipt deleting a conflict.
- After: full signed themTests **714/0/0**, native exit0. The original five
  bodies remain byte-identical. Actual finalized xcresult cases also confirm
  publisher byte deduplication and four review controls: immutable parked
  base, stale snapshot rejection with positive acknowledgement, separate NFC/
  NFD save intents with exact duplicate coalescence, and an edit while Load
  Server's fetch is suspended. Ten changed-risk cases passed individually.
- Native signing remained on; the runner erased only task-owned simulator
  `81F0FF38-9DAD-4011-907B-357DFADD094C`, iPhone17Pro/iOS26.2, Xcode26.3.
- macOS scaffold compile: **exit0**, separate owned derived data. This is not
  interactive macOS or physical-device proof.
- D009: all five deltas **0** against actual fetched original #904 `ce89f996`.
  `backend/index.js` stays33,626 under the accepted early-stack exception.
  Swift parse and `git diff --check` pass.
- Backend production/test sources, lockfile, scripts, workflows, packages and
  project are byte-identical to published original #904. Its full Node20.20.2
  backend result **2758/0/2** is inherited, not a new T1449 full backend run.
  Skips: real PostgreSQL case without DATABASE_URL; explicit preview/sync case.
- Full V1: **36 passed /0 failed /6 skipped**,42total, native exit0.
  Finalized case outcomes verify offline reconnect, expired-auth/conflict
  relaunch/Keep Mine, uninterrupted caret-following typing and page/prompt
  keyboard focus. The voice-fault case is also included in this full class.
  Skips: three cross-platform fixtures, integrated writer (separate canonical
  run), two-device live draft and writer-block rescue. No skip counts as pass.
  Controlled Node API egress guard blocked0 attempts; no provider key loaded.
- Canonical authenticated writer/create/save/export/relaunch: **1/0/0**,
  native exit0. Producer-retained native bundle and summary are preserved;
  known Node API egress attempts blocked0 and controlled fallback requests0.
  Export feedback/filename is covered; exported payload/external opening,
  real microphone input and live model quality are not established.

Private before/after bundles, original merge stages, file hashes, invocation
records, failures, role reviews and terminal summaries are retained under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1449-919-recovery-authority-20261112/`. Tests use controlled
DEBUG input and owned authenticated loopback fixtures with dummy provider
keys and known API egress checks. Those fences are not universal OS network
isolation. No new paid model call was made.

## GitHub and deployment boundary

Fresh checks at the start of this checkpoint: main `78b8c94f`; original #964
head `97501321` targets main; original #904 head `ce89f996` targets #964;
original #919 remote head remains `510b7c68`, targeting #904. The API's cached
#919 base SHA still names909; the actual base branch is ce. Both parent
backend/D009 jobs passed; complete Quality Gates and current-head genuine
non-author reviews are still required before landing. #964's old approval
was dismissed; #904 has no review. No approval is submitted by an agent.

VERIFIED public health at2026-11-13 02:32:48UTC: `api.them.io/healthz` returns
302 to a parked-domain destination. Production remains held under the
human's App Store-credentials decision. No account, DNS, secret or production
configuration was changed.

## Next active task and continue status

Local checkpoint is complete. Publish only by normal preserving advancement
of original #919; require fresh hosted checks and independent review before
landing. Then preserve original #923 `0ea0a2ed`: two recovery-contract test files,
27 additions/one deletion. Original #973 `aa729e79` is a distinct transport
security boundary and must be reviewed separately. Both are actual children
of original #919; numeric order is not used as dependency evidence.

Actual participants: Jarvis implemented/executed; Zora independently challenged
only the changed recovery seam; Luna checked current topology/CI/reviews and
next children. Einstein, Howard and Alfred idle: no duplicate audit, workflow
fix or imaginary meeting/review. No agent substitutes for independent human
GitHub approval.

The real microphone, complete live Clementine response, intended shipping
backend, physical-phone recovery journey and exported payload opened outside
THEM remain unproved. Local fixture results do not clear those gaps. Preserve
Clementine, the orb, established aesthetic, flexible120-page three-act advice
and all unrelated work. Goal remains active. READY FOR CONTINUE.
