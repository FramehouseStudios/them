# AGENTS.md — io.them Operating System

## North Star

> io.them is a mobile-first AI screenplay studio built around a living creative companion. It helps writers turn voice, fragments, and emotional impulses into properly formatted scenes — fast — while learning their style, characters, tone, and creative habits over time.

## Protocol

The multi-agent system exists to increase velocity, not complexity. Codex is the primary app builder. Claude is a scoped support agent. The human remains the product lead.

All work flows through `TASKS.md`. No agent starts work without a task row. Each task has **one owner, one branch, one scope, and one definition of done.**

Codex owns the iOS app, product implementation, architecture, and integration. Claude owns backend support, scripts, tests, documentation, audits, and CI work when assigned. Claude does not edit the iOS app or make product decisions.

The team maintains three coordination files: **`AGENTS.md`** for rules, **`TASKS.md`** for active work, and **`DECISIONS.md`** for product and architecture decisions. These files are the operating system of the project.

The purpose of this protocol is to protect the product's central magic: a mobile-first creative companion that helps the user write a scene quickly, emotionally, and beautifully. Any process that does not help that goal should be removed.

---

## Operational details

### Scope by path

- **Codex** — `them/`, `*.xcodeproj`, `*.xcworkspace`, product/integration glue, trivial backend tweaks.
- **Claude** — `backend/`, `scripts/`, `tools/`, `docs/`, `themTests/` (when backend-touching), `.github/workflows/` (when assigned).
- **Human only** — `Info-*.plist`, `*.entitlements`, `PrivacyInfo.xcprivacy`, App Store metadata, acceptance of `DECISIONS.md` entries, `archive/`, `Library/`, `Projects/`.

### Branches

- `codex/<task-id>-<short-name>`
- `claude/backend-<short-name>`
- Never push to `main`.

### Status vocabulary (in `TASKS.md`)

`ready` → `ready-for-claude` → `in-progress` → `review` → `merged`

### Verification

- **Codex:** iOS build green; `themTests` pass.
- **Claude:** `cd backend && npm test`; `npm run eval:gate`; `RUN_QUALITY_GATE=1 ./scripts/quality_gate.sh` when backend or CI is touched.
- Both agents report what was run and what was not. Never claim verification you skipped.

### Decisions

Architectural or product decisions are appended to `DECISIONS.md` in ADR form: `id`, `date`, `status`, `context`, `decision`, `consequences`. Codex may propose. Human accepts. Claude may flag the need for a decision but does not author one.

### Removal principle

Any process, file, or rule that does not help the user write a scene quickly, emotionally, and beautifully is a candidate for deletion. Review quarterly.
