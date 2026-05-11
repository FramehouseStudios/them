# AGENTS.md — io.them Operating System

## North Star

> io.them is a mobile-first AI screenplay studio built around a living creative companion. It helps writers turn voice, fragments, and emotional impulses into properly formatted scenes — fast — while learning their style, characters, tone, and creative habits over time.

## Protocol

The multi-agent system exists to increase velocity, not complexity. Codex is the primary app builder. Claude is a scoped support agent. The human remains the product lead.

All work flows through `TASKS.md`. No agent starts work without a task row. Each task has **one owner, one branch, one scope, and one definition of done.**

Codex owns the iOS app, product implementation, architecture, integration, and supervisor merge lane described in D005. Claude owns backend support, scripts, tests, documentation, audits, and CI work when assigned. Claude does not edit the iOS app or make product decisions.

The team maintains three coordination files: **`AGENTS.md`** for rules, **`TASKS.md`** for active work, and **`DECISIONS.md`** for product and architecture decisions. These files are the operating system of the project.

For day-to-day handoffs, agents also maintain **`docs/coordination.json`** as the fast machine-readable queue, with **`docs/claude-inbox.md`** and **`docs/codex-inbox.md`** as human-readable prompts. Agents update the coordination state and leave PR comments when their work unblocks or blocks the other agent.

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

### Merge authority

- Codex may merge Codex-owned PRs under D005 after the branch is current with `main`, required checks are green, no blocker label is present, verification is recorded, and the merge message names the human-approved supervisor authority.
- Codex may merge Claude-owned PRs only after Codex review when the PR is green, unblocked, and not labeled `do-not-merge`, `needs-human`, or `tier-3`.
- No agent may merge work that weakens gates, changes human-only surfaces, or alters an accepted decision without explicit human approval.
- All merges go through PRs. No agent pushes directly to `main`.

### Status vocabulary (in `TASKS.md`)

`ready` → `ready-for-claude` → `in-progress` → `review` → `merged`

### Verification

- **Codex:** iOS build green; `themTests` pass.
- **Claude:** `cd backend && npm test`; `npm run eval:gate`; `RUN_QUALITY_GATE=1 ./scripts/quality_gate.sh` when backend or CI is touched.
- Both agents report what was run and what was not. Never claim verification you skipped.

### Decisions

Architectural or product decisions are appended to `DECISIONS.md` in ADR form: `id`, `date`, `status`, `context`, `decision`, `consequences`. Codex may propose. Human accepts. Claude may flag the need for a decision but does not author one. D005 is the standing accepted exception that lets Codex execute the supervisor merge lane once the human has already approved the authority.

Anything else that needs the human's answer — a one-line product question, a tier-3 ambiguity, an unclear scope — goes into `docs/decisions-queue.md`, not the PR body. The queue is the single place the human checks for open questions. Each entry is one concrete question with a documented safe default the agent will follow absent an answer.

### Removal principle

Any process, file, or rule that does not help the user write a scene quickly, emotionally, and beautifully is a candidate for deletion. Review quarterly.
