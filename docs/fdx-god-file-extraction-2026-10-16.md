# T-963 — Final Draft encoding leaves the networking god file

Parent `2d4b337f8a3e0d8ad7d3762ae5ea7e5014d7c2a5` / draft #945.
Branch `codex/T-963-fdx-encoder-extraction`.

## Capability and reliability

`BackendMemoryAPI` owned screenplay parsing as well as transport, session and
error handling. Move only its FDX document/scene request encoder into pure
`ScreenplayFDXRequestPayload`. Keep the networking facade and every auth,
endpoint, response, filename and error rule in place. Delete the inline parser;
one production call uses the new owner. Mechanical reconstruction of the moved
body verified exact equality after static/entry-name normalization.

The before-move characterization exposed a separate proof gap at the same
export boundary: `ScreenplayStudioExportSupport` always synthesized an artifact
under `--ui-testing`, even with live backend transport. The old writer UI test
therefore did not demonstrate backend export. Preserve isolated stubs only for
stub/default/unknown UI-test modes; explicit live/backend modes use the real
export closure. Normal iPhone release routing is unchanged.

Strengthen the existing authenticated writer UI journey to opt into live mode
and export both Markdown and FDX. The FDX assertion requires the backend's
space-preserving filename, deliberately distinct from the hyphenated stub.
Local unit coverage also checks that the backend closure's actual bytes reach
the written file, not a generated substitute.

## Recorded proof

- VERIFIED before move: signed export HTTP tests **13 passed / 0 failed /
  0 skipped**, erased task-owned iPhone17Pro iOS26.2,
  `/tmp/them-963-export-before.xcresult`.
- VERIFIED extraction-only checkpoint: signed HTTP + pure encoder tests
  **17/0/0**, `/tmp/them-963-export-after.xcresult`. This is before the later
  live-routing correction; do not cite it as proof of that correction.
- VERIFIED pinned Node20.20.2, Docker `--network none`, FDX/Fountain/format
  route contracts **60/0/0**, `/tmp/them-963-export-backend.log`.
- VERIFIED final signed live-routing units after correcting the test's iPhone
  destination assumption: **27 passed / 0 failed / 0 skipped**,
  `/tmp/them-963-export-final-v2.xcresult`.
- VERIFIED strengthened authenticated writer/export/relaunch workflow:
  **1 passed / 0 failed / 0 skipped**,
  `/tmp/them-963-live-export-writer.xcresult`. The actual iPhone app creates and
  saves its project, exports real Markdown and FDX, then restores its saved
  words after relaunch. Provider counters were ASR0/chat0/TTS0; no model call.
- VERIFIED macOS scaffold Debug build succeeded with the established local
  ad-hoc signing configuration; `/tmp/them-963-macos.log`. Not release-signing
  or macOS UI execution proof.
- D009 versus T-962: BackendMemoryAPI **10836 -> 10717 (-119)**; Studio17405,
  Root15004, bridge12925 and backend/index33557 unchanged. Diff check passes.

The 120-scene request fixture checks every scene, action, cue, parenthetical,
transition and exact dialogue UTF-8, including decomposed Unicode and XML
metacharacters. It is not a measured 120-page screenplay, live generation,
dramatic-quality assessment, or printing/pagination proof.

## Deliberately not changed / remaining risk

This is one export capability extraction, not a god-file rewrite. No new auth,
persistence, transport or architectural framework. No paid model calls, original
head rewrite, main push or production deployment. Orb and Clementine unchanged.

Existing text-inferred FDX classification is characterized, not redesigned;
the explicit editor-marker versus text-inference decision (#80), dual-dialogue
parity, printed layout, real-phone external-file opening, and full-length
generation remain separate unproven product work. A UI filename plus HTTP
contract is not proof that an external screenplay application opened the file.
Full backend and full iOS suites are deferred to an integration checkpoint;
only the scoped results above were executed for this extraction.

## Retained failure, not a passing retry

The first final unit run executed **26 passed / 1 failed / 0 skipped** in
`/tmp/them-963-export-final.xcresult`. The new backend-byte file assertion used
a requested navigator subdirectory, but the existing iPhone implementation
explicitly ignores that macOS preference and writes to its temporary directory.
The backend callback did run. Correct the test to read the existing iPhone
destination, use a unique owned filename, and retain the exact-byte assertion;
do not change product routing to satisfy a mistaken test assumption.
The corrected run is `/tmp/them-963-export-final-v2.xcresult`, **27/0/0**.
Neither run proves sharing/opening the temporary artifact outside THEM.

Private evidence directory:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-963-20261016.6IilEg/`.

## Files changed

`them/BackendMemoryAPI.swift`, `them/ScreenplayFDXRequestPayload.swift`,
`them/ScreenplayStudioExportSupport.swift`, `them/ScreenplayStudioScreen.swift`,
`themTests/BackendMemoryScreenplayExportTests.swift`,
`themTests/ScreenplayFDXRequestPayloadTests.swift`,
`themTests/ScreenplayStudioExportSupportTests.swift`,
`themUITests/V1SmokeUITests.swift`, `TASKS.md`, this manifest, and the existing
`docs/engineering/god-file-strangler.md` ownership checkpoint.
