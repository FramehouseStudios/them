# Studio live-drive port — 2026-09-19

Base main `647e01fc`; branch `codex/T-studio-live-drive-port`.
Cherry-picked #480 commits `a8d86f5` and `acb7877` with attribution.
Independent of other ports; no backend cue-linter change (#477/#597) included.

Preserves action pronouns during paste normalization, accepts terse dialogue
with parentheticals, loads frameworks before a project exists, and adapts
integrity actions to narrow widths. Review corrections give banner text its
own full-width row, use dark text on pale Remove buttons, and set the craft
loading guard before the first await to prevent overlapping loads.

## Verification

- Full signed iOS suite: **621 passed, zero failures**, including formatter
  regressions and actual SwiftUI banner rendering at 320 and 390 points.
- Dedicated simulator `5B4C66EB-791B-416C-87E9-80D92E1A5CE3`, explicitly erased
  before each run; Xcode 26.3/iOS 26.2. Final log: `/tmp/them-live-drive-ios-contrast.log`.
- Final images inspected at both widths: labels readable, no vertical wrapping;
  Remove contrast corrected after inspecting the initial render. Component
  renders use the paper surface, not a claim of physical-device interaction.
  Attachments: `/private/tmp/them-live-drive-snapshots-contrast/manifest.json`.
- Full backend, Node 26: **2,738 passed, one failed, two skipped**. Unchanged
  ops-health features-map test failed with `UND_ERR_SOCKET` on localhost.
- Full backend comparison, Node 24.19.0: **2,739 passed, zero failed, two skipped**.
  Both used `TEST_SPAWN_BACKEND=1 node --test --test-concurrency=1 --test-timeout=60000 tests/*.test.mjs`.
  Logs: `/tmp/them-live-drive-backend.log`, `/tmp/them-live-drive-backend-node24.log`.
  Root cause of the first socket failure remains unproven; do not hide it.
- God-file gate and `git diff --check`: passed, zero tracked god-file growth.
- Authenticated default quality gate: **exit 1**, `knowledge_betrayal_recovery`
  **0.586 < 0.720**; no thresholds changed. Later stages did not run.
  Log: `/tmp/them-live-drive-quality.log`.

Keep draft pending full quality-gate proof, live craft/interaction verification,
and Claude re-proof. A human merges. No deployment or physical-phone install.
