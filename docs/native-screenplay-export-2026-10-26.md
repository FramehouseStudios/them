# Real iPhone Files export — 2026-10-26

## Scope and result

**VERIFIED:** the iPhone export action previously wrote only into the app's
private temporary directory and immediately claimed success. DEBUG UI runs
instead built a synthetic artifact; their FDX fixture contained only the first
scene heading. Neither path proved a usable complete screenplay export.

**VERIFIED:** the updated action uses the real authenticated backend, presents
the native Files exporter, and reports a saved file only after its completion
callback. A real Markdown artifact was saved, opened in Files Quick Look outside
THEM, and compared byte-for-byte against the canonical backend projection.
This is simulator proof, not physical-phone or production proof.

## Implementation and provenance

- Reuse preserved THEM export coordination from `b00d78d`, `3b4d454`, and
  `a754cac`, retaining the current backend transport and authorization code.
  No Hermes implementation, assets, dependency, or agent runtime is imported.
- The document-tools child owns preparation/picker state. Project, document,
  authentication intent, backend URL, and immutable request identity fence
  asynchronous results. Old callbacks cannot close or report success for a new
  export. Leaving during preparation drops late results; cancelling permits
  retry. A dismissed picker without a callback permits an explicit new retry.
- `FileDocument` writes artifact bytes unchanged and sanitizes filenames.
  Remove the unused fake-artifact generator and DEBUG action bypass.
- Google Docs copies the exact draft on iPhone using a local-only clipboard,
  opens through a completion callback, and tells the writer to paste it.
  Opening a URL does not claim to have inserted text into Google Docs.
- A real UI run exposed editor focus leaving the keyboard over export choices.
  Opening Export Copy now calls Studio's existing end-editing owner. No second
  keyboard policy or new state was added to the Studio god view.
- PDF availability and backend behavior are unchanged. No new paid call,
  account, package, public API, provider, or production configuration.

Runtime checkpoints: `d1502ff` native exporter; `cea2a80` exact first-run tutorial
handling in the UI test; final runtime `67e40e28f2be8e9ea3332c855e6f5a883c95de3a`
fixes keyboard coverage. Parent `4e453714345b2eceaa809ed0eccb113304a46988`.

## Evidence and limitations

- Final signed units: **901 passed / 0 failed / 0 skipped**. Includes all 22
  export cases for exact bytes, failures, ownership, preparation, duplicate
  attempts, stale picker callbacks and cancellation/retry. Earlier pre-keyboard
  unit run also passed 901/0/0; it is not substituted for the final result.
- Native export UI: first **0/1/0**, blocked by the fresh simulator's typing
  tutorial; second **0/1/0**, editor keyboard remained over Markdown. Captured
  UI evidence drove the tutorial-helper correction and real end-editing fix.
  Final **1/0/0**, real authenticated backend, cancel, retry, native save, exact
  unchanged draft. Provider counters: **STT 0 / generation 0 / TTS 0**.
- Actual external file `native-export-proof.md`: **103 bytes**, SHA-256
  `a30cbf7cc1bfb414281be3c66dcb9e22904bfc1d8d3a1859b1aab17bdc4a1536`.
  Files Quick Look visibly showed the complete synthetic scene, Élodie,
  astronaut emoji, JOHN and the final dialogue line. The file's bytes equal the
  existing canonical Markdown projection; Markdown intentionally adds markup,
  so this is not an assertion that every export format preserves raw source
  whitespace. FDX/PDF external viewing was not exercised in this pass.
- Existing authenticated integrated writer UI: **1 passed / 0 failed / 0
  skipped** on final source, including actual Files cancellation/save and
  exactly-once server-backed draft restoration after relaunch. Its single
  generation call was intercepted fixture output (STT 0 / generation 1 / TTS 0),
  not live provider or microphone proof.
- macOS scaffold build: **BUILD SUCCEEDED** on final runtime source.
- D009 vs exact saved parent: index 33494, Studio **17345 → 17340**, Root
  14933, bridge 12788, Memory API 10463. Pass; `git diff --check` pass.
- Backend runtime, migrations, dependencies and project settings are unchanged.
  Parent T1175's full pinned Node20 **2971/0/4** remains inherited evidence;
  no redundant fresh backend suite is claimed. The changed local UI producer
  passes `node --check` and runs with intercepted external providers.
- Each signed run erases only task-owned simulator
  `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`; signing remains enabled.

Permanent evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1176-20261026.56jq34kq/`.
Contains 6,326 hash-verified files, zero mismatches; manifest SHA-256
`089d452d808de69eaf74252c04e6984ba7fd8d2aa1af8dcf67ce2973dd817c68`.
The task-created dependency symlink was removed after all jobs completed.

Changed files (all scoped):

- `them/ScreenplayStudioExportSupport.swift`
- `them/ScreenplayStudioDraftToolsViews.swift`
- `them/ScreenplayStudioScreen.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/ScreenplayStudioExportSupportTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `TASKS.md`
- `docs/native-screenplay-export-2026-10-26.md`

## GitHub and next boundary

Scoped branch `codex/T-1176-native-screenplay-export`; original PR647 remains
open/draft at `848e59d040dc935d082beaeb7dc21c51faee4222`, based on
`claude/coverage-follows-draft`. Main remains
`78b8c94f43b4a11f18c2e61df556b9cd7370e735`. No merge, original-head advance,
replacement PR, squash, force-push, protection change, or deployment.

Next: audit bounded public turn-metadata retention against durable prepared/
billed reply recovery before advancing original647, then continue the actual
base chain. Physical iPhone sign-in/voice/rewrite/offline/relaunch/export against
the intended backend remains unproven. Production remains held under the
human's credentials decision. The overall product goal is incomplete.
