# TASKS.md — io.them Active Work

> **Rule:** Every task has one owner, one branch, one scope, and one definition of done. Every task must serve at least one north-star pillar — **mobile-first**, **voice→scene**, **living companion**, **longitudinal learning**. See `AGENTS.md`.

## Status vocabulary
`ready` → `ready-for-claude` → `in-progress` → `review` → `merged`

## Branch conventions
- `codex/<task-id>-<short-name>`
- `claude/backend-<short-name>`

---

## Active work — quick view

| ID   | Title                                              | Owner  | Status            |
|------|----------------------------------------------------|--------|-------------------|
| T01  | Triage 409-file uncommitted snapshot               | human  | ready             |
| T02  | Resolve `archive/` vs `Archive/` case collision    | codex  | ready             |
| T03  | Strip `test.mp3` / `test.wav` from app target      | codex  | review            |
| T04  | Apply canonical product name `io.them` end-to-end  | codex  | ready             |
| T05  | Add `first_page_written` client telemetry event    | codex  | ready             |
| T06  | Flip `RUN_QUALITY_GATE=1` default in release CI    | claude | ready-for-claude  |
| T07  | Promote backend persistence to Postgres canonical  | claude | ready-for-claude  |
| T08  | Centralize prompt assembly + first memory tier     | claude | ready-for-claude  |
| T09  | Modularize `DraftStudio` and `ScreenplayStudio`    | codex  | blocked-T02       |
| T10  | Codify single design system (color/typo/spacing)   | codex  | ready             |
| T11  | 60-second magic-moment onboarding                  | codex  | blocked-T09       |
| T12  | Adopt perceived-speed primitives system-wide       | codex  | blocked-T09       |
| T13  | Add second realtime supplier behind interface      | claude | ready-for-claude  |
| T14  | Triage G3 backend feature snapshot                 | codex  | ready             |
| T15  | Fix iOS simulator test host configuration          | codex  | in-progress       |
| T16  | Exclude local tooling artifacts from app bundle    | codex  | ready             |

---

## Active work — full detail

### T01 — Triage 409-file uncommitted snapshot
- **Owner:** human
- **Branch:** —
- **Pillar:** infra (enables all)
- **Status:** ready
- **Done when:** the snapshot on `codex-save-primary-folder-20260420` is split into ≤6 intent-grouped branches, each open as a PR; no orphan changes remain on the source branch; stale `claude/*` branches with no merged work are deleted.

### T02 — Resolve `archive/` vs `Archive/` case collision
- **Owner:** codex
- **Branch:** —
- **Pillar:** infra (enables all)
- **Status:** ready
- **Done when:** only one casing exists in the repo; contents are migrated; commit explicitly states the casing chosen and why; entry recorded in `DECISIONS.md`.

### T03 — Strip `test.mp3` / `test.wav` from app target
- **Owner:** codex
- **Branch:** —
- **Pillar:** infra (App Review hygiene)
- **Status:** review
- **Done when:** files removed from the app target and from the repo; app builds and signs without them; `appstore_preflight.sh` passes.

### T04 — Apply canonical product name `io.them` end-to-end
- **Owner:** codex
- **Branch:** —
- **Pillar:** living companion (identity)
- **Status:** ready
- **Done when:** `Info.plist` `CFBundleDisplayName`, `README.md` title line, onboarding copy, and any user-visible string read `io.them` (or final agreed casing); no user-visible surface still reads `Framehouse`, `them`, `Clementine`, or `Her*`. References `D001`.

### T05 — Add `first_page_written` client telemetry event
- **Owner:** codex
- **Branch:** —
- **Pillar:** voice→scene (measurement)
- **Status:** ready
- **Done when:** event fires once per user the first time they ship a screenplay-formatted page; visible in the analytics destination; documented in `docs/`.

### T06 — Flip `RUN_QUALITY_GATE=1` default in release CI
- **Owner:** claude
- **Branch:** —
- **Pillar:** infra (enables all)
- **Status:** ready-for-claude
- **Done when:** `.github/workflows/release-preflight.yml` runs the gate by default; a smoke run on a synthetic `rc-*` tag confirms the gate executes; `QUALITY_GATE.md` updated.

### T07 — Promote backend persistence to Postgres canonical
- **Owner:** claude
- **Branch:** —
- **Pillar:** longitudinal learning
- **Status:** ready-for-claude
- **Done when:** all `*_store.json` files at backend root are deprecated; backend code reads/writes only Postgres for these domains; migration script ships and is reversible; `npm run eval:gate` green.

### T08 — Centralize prompt assembly + first memory tier
- **Owner:** claude
- **Branch:** —
- **Pillar:** living companion + longitudinal learning
- **Status:** ready-for-claude
- **Done when:** `ScreenplayPromptBuilder` is the only path that produces a model-bound prompt; a per-user memory record persists style/character/tone signals; all generation requests carry the memory context; prompt regression eval green; documented in `docs/`.

### T09 — Modularize `DraftStudio` and `ScreenplayStudio` into SwiftPM packages
- **Owner:** codex
- **Branch:** —
- **Pillar:** infra (enables all)
- **Status:** blocked-T02
- **Done when:** `DraftStudio` and `ScreenplayStudio` are local SwiftPM packages; `ContentView.swift` is below 500 LOC; clean build green; `themTests` pass.

### T10 — Codify single design system (color, typography, spacing)
- **Owner:** codex
- **Branch:** —
- **Pillar:** mobile-first
- **Status:** ready
- **Done when:** one color file, one typography file, one spacing scale; legacy `HerColors`, `FountainTypography`, and `*Chrome*` styling consolidated or deprecated; lint or build rule fails any new file that bypasses them.

### T11 — 60-second magic-moment onboarding
- **Owner:** codex
- **Branch:** —
- **Pillar:** voice→scene + mobile-first
- **Status:** blocked-T09
- **Done when:** cold-start to a properly formatted screenplay page in ≤60 seconds on a real iPhone, validated by the human; `first_page_written` (T05) fires; flow uses centralized prompts (T08).

### T12 — Adopt perceived-speed primitives system-wide
- **Owner:** codex
- **Branch:** —
- **Pillar:** mobile-first + voice→scene
- **Status:** blocked-T09
- **Done when:** skeletons, optimistic writes, and audio-first responses are the default in the studio surface; measured time-to-perceived-response is ≤100 ms for the magic-moment path.

### T13 — Add second realtime supplier behind existing interface
- **Owner:** claude
- **Branch:** —
- **Pillar:** living companion (resilience)
- **Status:** ready-for-claude
- **Done when:** a second supplier ships behind the existing `Realtime` interface; the supplier choice is configurable at runtime; smoke test exercises both paths.

### T14 — Triage G3 backend feature snapshot
- **Owner:** codex
- **Branch:** —
- **Pillar:** living companion + longitudinal learning
- **Status:** ready
- **Done when:** the G3 backend feature work is split into intent-grouped commits or explicitly routed to Claude with context; no G3 backend changes remain orphaned in the dirty tree.
- **Decision:** Option A from the handoff brief. Codex will own the snapshot triage because the work appears to have been authored before the protocol existed; Claude should run backend eval gates before merge.

### T15 — Fix iOS simulator test host configuration
- **Owner:** codex
- **Branch:** codex/T15-ios-test-host
- **Pillar:** infra (enables all)
- **Status:** in-progress
- **Done when:** `themTests` runs successfully on an iOS Simulator destination via `xcodebuild`; the macOS test path still passes; the verified test commands are documented in `them/QUALITY_GATE.md` or the release runbook.

### T16 — Exclude local tooling artifacts from app bundle
- **Owner:** codex
- **Branch:** —
- **Pillar:** infra (App Review hygiene)
- **Status:** ready
- **Done when:** local tooling and scratch paths such as `.codex_tmp/`, `.claude/`, `tmp/`, and non-app docs are excluded from app resources; iOS and macOS builds stay green; a bundle audit finds no local-only artifacts.

---

## Completed (last 30 days)

_None yet under this protocol._

---

## Notes

- Claim a row by editing it to `Owner=<you>, Status=in-progress` **as the first commit on your new branch**. If two agents try to claim the same row, the merge conflict on this file is the correct signal — do not work around it; resolve the intent.
- New rows must include a one-line "done when" before they go to `ready` or `ready-for-claude`. A row without a definition of done does not belong in this file.
- When a row reaches `merged`, move it to "Completed" with the merge date. Prune rows older than 30 days.
