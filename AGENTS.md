# AGENTS.md — io.them Operating System

## North Star

> io.them is a mobile-first AI screenplay studio built around a living creative companion. It helps writers turn voice, fragments, and emotional impulses into properly formatted scenes — fast — while learning their style, characters, tone, and creative habits over time.

## Protocol

The multi-agent system exists to increase velocity, not complexity. Codex is the primary app builder. Claude is a scoped support agent. The human remains the product lead.

All work flows through `TASKS.md`. No agent starts work without a task row. Each task has **one owner, one branch, one scope, and one definition of done.**

Codex owns the iOS app, product implementation, architecture, integration, and supervisor merge lane described in D005. Claude owns backend support, scripts, tests, documentation, audits, and CI work when assigned. Claude does not edit the iOS app or make product decisions.

The team maintains three coordination files: **`AGENTS.md`** for rules, **`TASKS.md`** for active work, and **`DECISIONS.md`** for product and architecture decisions. These files are the operating system of the project.

For day-to-day handoffs, agents also maintain **`docs/coordination.json`** as the fast machine-readable queue, with **`docs/claude-inbox.md`** and **`docs/codex-inbox.md`** as human-readable prompts. Codex owns the coordination state and the iOS-driven Claude inbox; Claude owns backend implementation updates and emits live events through `docs/agent-events-*.jsonl`.

The purpose of this protocol is to protect the product's central magic: a mobile-first creative companion that helps the user write a scene quickly, emotionally, and beautifully. Any process that does not help that goal should be removed.

The team uses the **Agent Throughput Protocol** in `docs/agent-throughput-protocol.md` to keep velocity high: Claude works under a three-PR normal WIP limit or six-PR blocker-clearing cap, blockers outrank net-new features, Codex merges routine tier-1 work in batches, multi-PR features start with a spec PR, and app-facing backend contracts are marked `ready-for-ios`, `blocked-for-ios`, `backend-only`, or `needs-human-policy`. `docs/v1-definition.md` defines the current product target; every PR must name the V1 pillar and concrete V1 effect it serves. Either agent can run `node scripts/agent_next.mjs --role=claude|codex` to choose the next action without waiting for human copy/paste.

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

### Throughput

- Claude keeps at most three non-merged PRs active in normal mode: one blocker fix, one small support/eval/docs PR, and one backend feature. During blocker-clearing mode, `agent_next` may raise the temporary cap to six when at least 80% of Claude's active PRs are blocker clears.
- Codex batches routine tier-1 reviews/merges into a merge train and opens one coordination refresh after the batch when at least three PR states changed or app work was unblocked.
- Both agents clear `do-not-merge`, `needs-human`, tier-3, and conflicting PRs before opening net-new feature branches.
- Backend PRs that affect the app carry or document one contract state: `ready-for-ios`, `blocked-for-ios`, `backend-only`, or `needs-human-policy`.
- Features expected to span more than three PRs start with a spec PR that defines backend/iOS contracts and parallel tracks before implementation begins.
- `node scripts/agent_next.mjs --role=claude|codex` is the first stop for next-action selection.

### Live event lane

- After every PR open/merge/close, every coord refresh, and every review-blocker call, append an entry to `docs/agent-events-<YYYY>-W<WW>.jsonl` via:
  ```
  node scripts/agent_event.mjs append --by=claude|codex --kind=<kind> [--pr=N] --comment="..."
  ```
  Canonical kinds: `pr_opened`, `pr_merged`, `pr_closed`, `review_blocker`, `coord_refresh`, `event_protocol_change`, `spec_amend`, `product_state`, `pattern_codified`, `code_review`, `design_proposal`.
- Both agents read recent lane entries with `node scripts/agent_event.mjs tail --n=20` as part of their session warm-up (after `agent_next`).
- The lane is the canonical async chatroom between Claude and Codex. PR comments are for code-specific review; the event lane is for state changes and intent signals.

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
