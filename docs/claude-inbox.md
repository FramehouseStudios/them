# Claude Inbox

Short handoff for the Claude/support lane. Read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, and `docs/coordination.json`. Codex owns this file per
`AGENTS.md`; the support lane created it on 2026-09-05 because `AGENTS.md` and
`docs/README.md` referenced it and it did not exist.

Start with:

```bash
node scripts/agent_next.mjs --role=support
node scripts/coordination_state.mjs read
```

## Current Snapshot (2026-09-05)

Merged this week: #416 live typing between devices, #417 sprint security
rescue, #418 two-device UI smoke, #419 Quality Gate de-flake, #421 resilient
cross-device live drafts. GitHub Actions is running again after the
2026-09-03 billing block.

Open, in order of what unblocks launch:

| PR | Owner | Gate | What it needs |
| --- | --- | --- | --- |
| [#424](https://github.com/FramehouseStudios/them/pull/424) | support | tier 3, human merge | Boot-level IAP fail-closed (D011), `knowledge_cards.json` shipped in the image, `MUSE_MODEL` knob. Local suite 2518/0 fail; GitHub checks green, Quality Gate pending. After merge, set the four `APP_STORE_*` values in Render or production boot refuses by design. |
| [#425](https://github.com/FramehouseStudios/them/pull/425) | support | stacked on #423 | Six V1 smoke fixes. Lands after #423. |
| [#423](https://github.com/FramehouseStudios/them/pull/423) | support | needs rebase | Carries Codex's 41 unpushed keychain commits; conflicting with main until `codex/T-ios-keychain-token-migration` lands. |
| [#422](https://github.com/FramehouseStudios/them/pull/422) | codex | tier 3, human | Authenticated first-run resume. |
| [#420](https://github.com/FramehouseStudios/them/pull/420) | support | draft | Quality Gate PR-cost reduction; human decides on opt-in iOS smokes. |

Human-owned before launch: `render-app-store-secrets` blocker; the
`v1-release-preflight-config` blocker (Team ID, release token,
`scripts/run_release_preflight.sh` with the quality gate on); accept or reject
the D001 and D011 entries in `docs/proposed-decisions.md`.

Branch hygiene: `claude/pii-safe-request-logs` is a stale sprint snapshot cut
before #417. Its PII redaction is on main as #372, its backend work landed via
#417, and its three newest commits moved to #424. Do not merge main into it
(nine conflicting files including `backend/index.js`). Delete only after a
salvage audit of its iOS tree and human clearance.

Known local hazard: the main checkout on the release Mac carries ~411
untracked iCloud conflict copies named `<file> 2.<ext>` (TASKS.md T01). The
Xcode project uses synchronized folder groups, so the ` 2.swift` copies are
compiled and break the iOS build. Human-owned cleanup; not ignored by
`.gitignore` on main.

## What the support lane does next

1. Nothing net-new until #424 is merged and the Render secrets exist.
2. Backend-only follow-ups when asked: the D008 golden-set eval for
   `muse-spark-1.3` once a Meta key is provided; client handling of the
   fail-closed IAP credit path.
3. Keep every claim verified by a local run; paste the summary line.

## Talk → ghost → print demo branch (2026-09-05)

`claude/talk-ghost-print-demo`, cut from main `c2b8022`, lives in a separate
worktree (`~/io.them-worktrees/ghost-print`) because four sessions were editing
the main checkout at once and one of them parked the whole tree as `611acba`
on `muse/scratch-2026-09-05` mid-edit. Not pushed; human decides on the PR.

What the branch does, in one voice flow inside Studio:

1. While the writer is still talking, `ScreenplayGhostDraft` turns the
   on-device partial transcript into the element it will become and Studio
   inks it faded under the page (`INT. KITCHEN - DAY` from "interior kitchen
   day"; a bare "Jess" centers as a cue). No model round trip; clears on
   utterance end.
2. "Clementine, print the script" is a local Studio command
   (`ScreenplayLiveDraftBridge` → `ScreenplayPrintVoiceCoordinator`): it
   announces "Printing N pages to <printer> — say cancel", waits 3.5 s, then
   spools an AirPrint PDF to the remembered printer. "Cancel", "never mind",
   or the pill's Cancel button stops it. First print (or "print somewhere
   else") opens the system picker and remembers the choice.
3. Settings gains a Print section (paper size, forget printer). Printing is on
   by default in every build at the user's request (2026-09-05); the
   `io.them.printDisabled` default is the kill switch. The Siri /
   Shortcuts `PrintScreenplayIntent` and the clarify flow are NOT on this
   branch; they belong to `claude/voice-print` (worktree
   `~/io.them-worktrees/voice-print`), which shares `ScreenplayPrintService.swift`
   byte-for-byte with this branch so the two merge cleanly in either order.

Proof: `themTests/ScreenplayGhostDraftTests` (8) and
`themTests/ScreenplayPrintVoiceCoordinatorTests` (12) pass on the iPhone 17
Pro Max simulator. Full `themTests` on the branch: 612 run; the 8 assertion
failures (BackendPageCancelClientTests, BackendStateAuthRotationTests,
ElevenLabsTtsClientTests, DesignSystemGuard raw-font rule) reproduce
identically on clean main. Not verified on a real device with a printer.

Left in `611acba` on purpose (separate features, some not compiling):
PrintScreenplayIntent + ClarifyStoryIntent / `TODO: clarify` pill (voice-print branch), NotesPanel print + rewrite fork,
`BackendClient.talkText(fountainDraft:)` + OfflineTalkQueue, VAD threshold
tuning, HerOrbView VU, ScreenplayLocalExport title page, all `backend/`
changes.
