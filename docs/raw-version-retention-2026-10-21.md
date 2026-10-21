# T-1104 — Save original screenplay bytes, not a normalized approximation

October 21, 2026. Parent `0209b96967e98c400536edf5a4bae53cf8b2b864`.
Branch `codex/T-1104-raw-version-retention`.
Runtime/test checkpoint `2c401de55f68b801dfa26c2b23e4ec733b0a0e4b`.

## Reproduced root causes and correction

VERIFIED through real authenticated index.js HTTP, not a fake handler asserting
itself: the original version endpoint changed leading/trailing whitespace and
CRLF; a changed-byte retry under the same request ID was incorrectly200/replayed.
New regression before correction: **0 pass /2 fail /0 skip**. Node20.20.2,
network-disabled container, frozen tracked public source and isolated stores.

Jarvis decision: preserve the writer's source at its existing owners, not add a
new format/persistence layer. The backend now stores the original String and
uses exact String equality for replay identity. Trimming only tests emptiness;
blank documents still400/draft_required. Root's initial project promotion now
sends and fingerprints the original draft, not its trimmed presence-check copy.
BackendMemoryAPI, stored-version normalization and serialization already retain
input and were not changed. Derived scoring/rendering can still normalize their
own input; saved words are no longer that derived copy.

Existing 201 save/200 replay/409 conflict contracts and error/status vocabulary
remain. Changed whitespace, CRLF/LF or NFC/NFD bytes cannot receive an exact
replay receipt. Existing already-normalized stored versions cannot recover their
lost bytes by this change; a raw retry against such an old receipt may409 rather
than falsely acknowledge equality. Preserve the local recovery copy and use the
existing conflict/retry path. No destructive migration or silent old-text rewrite.

## Connected verification and honest limits

- Corrected actual-handler focused **2/0/0**: save receipt and GET are byte-equal;
  backend graceful stop/restart restores the same text/version; exact replay
  makes no duplicate version; changed bytes409; foreign writer404 without draft
  disclosure; blank validation remains400. This is real JSON-adapter persistence,
  not a live Postgres claim or a blanket security certification.
- Full **Node20.20.2 backend2900/0/2** (2902 total). Skips: real-Postgres prefix
  query without DATABASE_URL and pre-existing talk-preview case. Neither waived.
- Full signed **themTests840/0/0**, erased task-owned iPhone17Pro/iOS26.2(23C54),
  `7F1A14C1-B379-4417-AFE9-331810CD9CD3`. Normal signing; macOS scaffold builds.
- First native promotion UI **0/1/0**: its NSArgumentDomain multiline fixture
  supplied only Title:, so the actual app created a dated project from that
  truncated input. Screenshot/failed bundle retained. Not a successful journey,
  not a claim that production restoration truncated the complete source.
- Corrected only DEBUG UITestLaunchConfiguration's fixture seam: Base64 UTF-8
  goes into the existing typed owner-scoped store after credential seeding.
  Requires --ui-testing and nonempty owner; malformed Base64/UTF-8 does not
  overwrite a draft. No new writer, restore algorithm or production bypass.
  Focused signed **3/0/0**, then macOS rebuilt successfully.
- Corrected current signed authenticated promotion UI **1/0/0**: restore a full
  unbound title-page/script fixture; Root itself creates/saves the project using
  source studio_first_turn_auto_create; multiline writer title WALL_E After
  Midnight wins over in-scene Title text; exact UTF-8 CRLF/trailing whitespace/
  decomposed accent survive both server and app; terminate/reopen WITHOUT the
  fixture override; same bytes and one project/one version remain. Host Node
  backend24.19.0 for this UI run, separate from Node20 full gate. No chat/STT/TTS
  provider calls (counts0/0/0), no API credits or physical microphone proof.
- Byte comparisons use raw JSON draft fields, not the UI test's trimming
  stringValue metadata helper. Time-out project diagnostics no longer dump the
  entire response (including ephemeral test-session metadata).
- D009/diff and Node syntax checks pass. Five monitored counts unchanged versus
  parent: index33557, Studio17337, Root14963, bridge12934, MemoryAPI10845.
  Existing/imported actor/Sendable warnings remain, not suppressed.

Exact-source distinction: the full backend/native snapshot preceded only later
DEBUG fixture/tests. Comparing every changed committed path to that snapshot
finds exactly UITestLaunchConfiguration.swift, UITestDraftRestoreSeedTests.swift
and V1SmokeUITests.swift. No subsequent production runtime delta. Current focused
fixture/UI and final macOS proof cover those differences; no unchanged full
backend/840-test rerun and no claim of a single843-test full run.

## Files and retained proof

- `backend/lib/screenplay_projects_routes.js`
- `backend/tests/screenplay_raw_version.integration.test.mjs`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `them/RootExperienceView.swift`
- `them/UITestLaunchConfiguration.swift`
- `themTests/UITestDraftRestoreSeedTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md` and this report

Permanent folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1104-20261021.9GQF6d/`
Contains committed-source/full-suite-source/red-source archives, exact manifest
and patch, all actual red/green logs, signed bundles and captured screenshot.
Only public tracked source was frozen; ignored env files/secrets were excluded.

Visual inspection confirms the writer title and one-page paper are present.
It also exposes presentation debt: literal Fountain title metadata appears on
editor paper and the saved-age label says “in0sec.” T-1106 tracks that alongside
the original #80 presentation/element-authority decision. This screenshot is not
proof of final polished screenplay/title-page rendering or professional format.

## Next: asynchronous creation authority, before the feature stack resumes

T-1105 must reproduce and close the existing Root lifecycle risks: planned merge
promotion at playback start, a version call before an intermediate auth/document
recheck, and final binding that checks user ID/project presence but not generation
or current draft bytes. Use the current document/auth/committed-write owners,
not another state framework. The happy reopen check does NOT prove crash-atomic
project creation, late-response cancellation, account transitions, orphan cleanup
or interrupted two-step creation. Those remain explicit, not silently certified.

Actual next original remains #648 `210c5ef0`, based on preserved #647; do not skip
its original body/follow-ups or overwrite any original head. No main merge,
force push, replacement PR, review bypass, deployment or secret mutation. The
production credential hold and real-phone/core-loop gaps remain. Goal active;
THEM is not complete.
