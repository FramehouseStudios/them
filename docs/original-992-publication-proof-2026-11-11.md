# Original #992 — coherent recovery publication checkpoint

## 1. Verified results

Candidate: `codex/T-1375-original-992-boundary`, runtime source
`e98f051a7acf3277bf28b55811f9a2ca89f6ff94`. This documentation commit changes
no runtime source. Original #992 head `db26ccc3` and actual parent `12b6b193`
remain ancestors; no original history was rewritten.

The minimum coherent recovery continuation captures queued-restoration origin
before debounce, protects the current dirty page when an earlier queued save
conflicts, retains divergent local copies separately, and requires explicit
review/selection before sending a chosen copy. Selection alone sends nothing.
Unconfirmed and superseded saves retain their source copies; full replay
identity is required before recognizing a superseded selected save.

ATLAS extracted conflict decision controls and the complete screenplay-version
mutation response contract into their canonical child files. Compressed API
fields/parameters and the removed separator were restored to normal formatting.
The model's member order, types, Decodable identity and isolation are preserved.
No gate limit changed and no PostgreSQL migration was imported.

### Publication proof

Environment: Xcode 26.3 (17C529), iPhone 17 Pro/iOS 26.2, task-owned simulator
`81F0FF38-9DAD-4011-907B-357DFADD094C`. Each native proof starts erased, with
normal simulator signing enabled. No signing-disable flag was used for tests.

| Check | Actual result | Scope |
| --- | --- | --- |
| Full backend, Node 20.20.2, external network disabled | 3,042 passed / 0 failed / 5 skipped | Disposable storage; backend tree `2c40a5c3d1022c583462ad71014c0e173fed1ee8`, unchanged by the final Swift extraction |
| Full signed themTests | 1,499 passed / 0 failed / 0 skipped | Exact runtime source e98f051a |
| Integrated writer/create/save/export/relaunch UI | 1 passed / 0 failed / 0 skipped | Exact runtime source; authenticated local backend and mocked model response |
| Raw audio/transcript/page/save/relaunch UI | 1 passed / 0 failed / 0 skipped | Exact runtime source; authenticated local backend and mocked ASR/model/TTS |
| macOS scaffold | BUILD SUCCEEDED | Exact runtime source, them-macOS-scaffold scheme, unsigned compile only |
| D009 and diff check | Passed | Actual parent origin/codex/T-1311-placeholder-context = 12b6b193 |

Final writer workflow observed mocked chat=1. Raw-audio workflow observed mocked
ASR=1, chat=2, TTS=23. These are explicitly synthetic provider calls, not live
Clementine quality, physical microphone or production evidence. Local backends
require user authentication and use disposable identities and storage.

Earlier checkpoint `6c5f2416` separately passed 3/0/0 interactive cases: unchanged
conflict/relaunch, lost selected-save acknowledgement and retry, and superseded
selected save with a fresh choice. These results predate the contract-only move;
they are not represented as additional final-source runs. The final full unit
bundle and two essential UI workflows above cover the extracted contract.
Zora's bounded read-only review at d78ed0cf found no new critical defect in the
examined custody transitions, text retention or selected-copy identity checks;
it is neither an exhaustive audit nor an independent human approval.

D009 actual parent -> final candidate:

| File | Parent | Candidate | Delta |
| --- | ---: | ---: | ---: |
| backend/index.js | 33502 | 33502 | 0 |
| ScreenplayStudioScreen.swift | 17236 | 17221 | -15 |
| RootExperienceView.swift | 14749 | 14749 | 0 |
| ScreenplayLiveDraftBridge.swift | 12770 | 12770 | 0 |
| BackendMemoryAPI.swift | 10450 | 10429 | -21 |

## 2. Actual failures and skips

- Initial macOS invocation used the iOS-only `them` scheme and exited 70 before
  compilation. The correct scaffold scheme was then used successfully; this
  setup error was not a source/compiler failure.
- Four backend tests skipped for absent task-owned PostgreSQL configuration:
  wallet settlement, literal prefix query, talk idempotency, and metadata
  restart/cleanup. These are unproven by this run, not counted as passes.
- One backend live page-sync test skipped because TALK_TEST_PAGE_SYNC_LIVE was
  off. No fresh paid-call authorization was requested or consumed.
- The initial Studio +1 D009 failure and the compressed API formatting are
  corrected by the two scoped extractions. No failing check was suppressed.

## 3. Changed files

This checkpoint adds this proof document and integrates ATLAS commit e98f051a:
`them/BackendMemoryAPI.swift` and new
`them/BackendScreenplayVersionMutationResponse.swift`. The earlier Studio
extraction is recorded separately in atlas-conflict-controls-proof-2026-11-11.md.
The rest of the candidate preserves the previously recorded recovery work.
The untracked backend/node_modules link is excluded from staging.

## 4. GitHub state before publication

Original #992 remains an open draft at db26ccc3, based on original #991
12b6b193. Its old hosted backend/D009 checks pass and old Quality Gate fails.
A normal descendant push requires fresh hosted checks and independent review;
this report does not claim that they passed or that main was updated.
Main was freshly verified at 78b8c94f. No protection change or deployment was
performed. Open #993 is the actual next child, head 033910f9, based on #992.

## 5. Remaining gaps

Later multi-worker lifetime ownership, server CAS and uncertain-delivery fence
work remains separately preserved and must not be presented as solved here.
The narrow candidate is not a release-ready or production-safe declaration.
The complete physical-iPhone journey remains unproven against the explicitly
identified intended shipping backend https://api.them.io. This checkpoint does
not recheck that host's availability. Production remains held under the human's
App Store-credentials decision. No paid model calls or secrets were exposed.

## 6. Next task

Normally advance original #992 only after checking its unchanged remote head
and actual base, record fresh hosted checks, and stop at the first failure.
Only after this boundary holds, reconcile original #993 by its actual base.
READY FOR CONTINUE.
