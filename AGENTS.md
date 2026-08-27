# AGENTS.md — io.them Operating System

## North Star

> io.them is a mobile-first AI screenplay studio built around a living creative companion. It helps writers turn voice, fragments, and emotional impulses into properly formatted scenes — fast — while learning their style, characters, tone, and creative habits over time.

The product must become a fully functional end-to-end AI screenwriting app as efficiently as possible. Every agent action should move the app closer to a stable, usable, emotionally cinematic writing experience.

## Primary Repository

- GitHub: `https://github.com/FramehouseStudios/them`
- Repository: `FramehouseStudios/them`
- Default branch: `main`

## Permanent Mandate

1. **Always find solutions and ship.** Exhaust safe, in-scope implementation paths before declaring a blocker. Prefer the smallest verified change that advances the product. When authority or external state truly blocks one path, record the exact blocker and continue with the highest-value unblocked work.
2. **Forever help the company grow.** Evaluate work against the next measurable product or commercial milestone: faster time to a usable scene, stronger retained writing behavior, safer persistence, better creative quality, or lower fully-loaded cost. Green code alone is not product-market proof.
3. **Actively guide and elevate every other agent.** Leave explicit assumptions, decisions, verification evidence, and hand-off state. Make the next agent's work safer and faster; the multi-agent system succeeds as one compounding team.

## Non-Negotiable Execution Mandate

This project is not an audit exercise. It is a shipping exercise.

Agents must prioritize implementation, verification, and forward progress over excessive analysis. Inspect only enough to make the next correct code change. Do not repeatedly summarize the same problems. Do not stop at recommendations when code can be edited.

When a full day's task set is complete, immediately move to the next day's task set. Continue advancing through the 14-day roadmap until the entire app is fully functional end to end. The human should only need to type `continue` for the agent to resume from the exact current state and keep executing the next unfinished task.

If a task is already complete and verified, mark it complete and move on. If a task is missing, build the simplest robust implementation. If a task is blocked, document the blocker precisely and switch to the next highest-value unblocked task.

## Efficiency Rules

1. Ship working software first.
2. Prefer small, safe, direct code edits over broad rewrites.
3. Reuse existing architecture unless it is actively blocking delivery.
4. Delete or isolate dead code when it causes confusion or broken behavior.
5. Do not create unnecessary abstractions, frameworks, or speculative systems.
6. Do not leave TODOs, placeholder buttons, fake flows, or disconnected UI.
7. Fix root causes across frontend, backend, AI routing, persistence, and state management.
8. Verify every feature before calling it complete.
9. Keep commits small, readable, and reversible.
10. Move continuously from task to task without waiting for extra permission unless human-only authority is required.

## Self-Checking Loop Protocol

Every meaningful implementation pass runs as a strict loop:

1. **Plan** — state the single next implementation target and its binary success criteria.
2. **Do** — produce or improve the connected app behavior.
3. **Verify** — run the most relevant tests, builds, or reproducible checks; record what passed and what was not run.
4. **Decide** — if every criterion passes, commit and continue. Otherwise fix the weakest result first and repeat the loop.

Do not call work complete until the loop produces a working, connected, verified improvement or a specific external/authority blocker is documented. Never use a soft score to override a failing binary criterion.

## Evidence and Decision Discipline

- Material product, reliability, cost, retention, and performance claims must be reproducible from stored source events plus versioned calculation rules, cited to a durable source, or labeled explicitly as `ASSUMPTION`, `ESTIMATE`, `RECOMMENDATION`, `LEGAL_REVIEW`, or `UNKNOWN_RFI`.
- Use `VERIFIED` only for facts supported by current repository evidence, a reproducible check, or an authoritative external source. Use `DECIDED` only for accepted entries in `DECISIONS.md`.
- Keep the mobile-first product surface and the smallest low-ops modular backend that can prove the next milestone. Add microservices, queues, caches, warehouses, or custom ML only after a measured trigger is recorded.
- Identity and project-owner separation are structural constraints. Domain code uses product-owned provider/adaptor contracts; vendor SDKs do not become domain contracts.
- Distinguish **code proof** (tests/builds are green) from **company proof** (writers repeatedly reach a useful scene, return, expand into projects, and support viable unit economics).

## Canonical Product Document System

[`docs/io-them-master-document-system-prompt.md`](docs/io-them-master-document-system-prompt.md) is the versioned generation prompt for the Founder Product Brief, Platform Proposal, and Technical Architecture Blueprint. It is a reference/generation artifact, not an accepted decision by itself.

Within repository doctrine, resolve conflicts in this order:

1. Accepted decisions in `DECISIONS.md` and the North Star in this file.
2. The current product target in `docs/v1-definition.md`.
3. Active work and ownership in `TASKS.md` plus `tasks/_active/`.
4. Generated strategy/architecture documents and the master prompt.

Generated documents must inspect current repository evidence, preserve open decisions as open, and enter `DECISIONS.md` or `docs/decisions-queue.md` before changing accepted product or architecture policy.

## 14-Day Completion Protocol

The app must be driven through this roadmap until functional:

### Days 1–2 — Repo and System Stabilization

- Identify the real active app architecture.
- Confirm active iOS/frontend files, backend files, scripts, and configuration.
- Remove or isolate confusing duplicates and dead paths.
- Verify the app boots locally.
- Verify the backend runs locally.
- Verify AI calls can be made safely.
- Update setup documentation if needed.

### Days 3–4 — Backend Stability

- Stabilize API routes and service boundaries.
- Verify environment variable requirements.
- Add practical logging and error handling.
- Ensure backend responses are typed, predictable, and usable by the app.
- Run backend tests and quality gates where available.

### Days 5–6 — Clementine AI Behavior

- Finalize Clementine's system behavior as a cinematic screenwriting partner.
- Implement or fix intent routing for writing, rewriting, scene doctor, outlining, dialogue, pacing, character, and continuation requests.
- Ensure Clementine is not a generic chatbot.
- Improve screenplay formatting, emotional continuity, and usefulness.

### Days 7–8 — Writing Workspace

- Make talk-to-write work as a real writing flow.
- Ensure generated screenplay text appears cleanly in the editor.
- Support continue, rewrite, scene doctor, and dialogue punch-up flows.
- Ensure loading, streaming, cancellation, and error states are clear.

### Days 9–10 — Persistence and Session Restore

- Save projects, scenes, and writing sessions.
- Restore previous sessions reliably.
- Add or repair autosave where appropriate.
- Verify persistence from fresh app launch through reopened project.

### Days 11–12 — UX Polish

- Improve empty states, loading states, typography, spacing, buttons, and interaction clarity.
- Make the app feel cinematic, minimalist, emotionally intelligent, and Apple-level clear.
- Remove friction from the core writing path.

### Day 13 — Full QA

- Test every core flow from a clean run.
- Fix crashes, broken calls, bad states, and unclear UX.
- Verify backend, frontend, AI, voice, persistence, and GitHub status.

### Day 14 — Final Shipping Pass

- Finalize README and setup notes.
- Confirm deploy/build instructions.
- Clean remaining obvious dead code.
- Push final stable state.
- Provide a launch checklist.

## Continue Command Behavior

When the human enters `continue`, the agent must:

1. Read this file first.
2. Read `TASKS.md`, `DECISIONS.md`, `docs/coordination.json`, and the relevant inbox files if they exist.
3. Identify the current unfinished roadmap day or highest-priority task.
4. Begin implementation immediately.
5. Continue into the next task automatically after completing the current one.
6. End with a concise status report and the exact next task.

The agent must not restart from Day 1 unless the repo state proves earlier phases are incomplete or broken.

## Clementine Product Standard

Clementine is the soul of the product. She is an emotionally intelligent, world-class screenwriting assistant inspired by the feeling of intimate AI companionship, elite Hollywood story editing, and cinematic creative collaboration.

Clementine must help users:

- speak scenes onto the page
- write screenplay pages
- rewrite scenes
- continue unfinished work
- diagnose weak scenes
- improve dialogue
- strengthen characters
- clarify structure
- fix pacing
- preserve tone
- finish feature films

Her output should feel like an elite screenwriter, script consultant, and emotionally aware creative partner — never like a generic chatbot.

## Protocol

The multi-agent system exists to increase velocity, not complexity. Codex is the primary app builder. Claude is a scoped support agent. The human remains the product lead.

All work flows through `TASKS.md` when that file exists and is current. No agent starts planned project work without checking the active task list. Each task should have one owner, one branch, one scope, and one definition of done.

Codex owns the iOS app, product implementation, architecture, integration, and supervisor merge lane described in D005. Claude owns backend support, scripts, tests, documentation, audits, and CI work when assigned. Claude does not edit the iOS app or make product decisions unless the human explicitly asks it to.

The team maintains three coordination files: **`AGENTS.md`** for rules, **`TASKS.md`** for active work, and **`DECISIONS.md`** for product and architecture decisions. These files are the operating system of the project.

For day-to-day handoffs, agents also maintain **`docs/coordination.json`** as the fast machine-readable queue, with **`docs/claude-inbox.md`** and **`docs/codex-inbox.md`** as human-readable prompts. Codex owns the coordination state and the iOS-driven Claude inbox; Claude owns backend implementation updates and emits live events through `docs/agent-events-*.jsonl`.

The purpose of this protocol is to protect the product's central magic: a mobile-first creative companion that helps the user write a scene quickly, emotionally, and beautifully. Any process that does not help that goal should be removed.

The team uses the **Agent Throughput Protocol** in `docs/agent-throughput-protocol.md` when present to keep velocity high: Claude works under a three-PR normal WIP limit or six-PR blocker-clearing cap, blockers outrank net-new features, Codex merges routine tier-1 work in batches, multi-PR features start with a spec PR, and app-facing backend contracts are marked `ready-for-ios`, `blocked-for-ios`, `backend-only`, or `needs-human-policy`. `docs/v1-definition.md` defines the current product target when present; every PR should name the V1 pillar and concrete V1 effect it serves. Either agent can run `node scripts/agent_next.mjs --role=claude|codex` to choose the next action without waiting for human copy/paste.

---

## Operational Details

### Scope by path

- **Codex** — `them/`, `*.xcodeproj`, `*.xcworkspace`, product/integration glue, trivial backend tweaks.
- **Claude** — `backend/`, `scripts/`, `tools/`, `docs/`, `themTests/` when backend-touching, `.github/workflows/` when assigned.
- **Human only** — `Info-*.plist`, `*.entitlements`, `PrivacyInfo.xcprivacy`, App Store metadata, acceptance of `DECISIONS.md` entries, `archive/`, `Library/`, `Projects/`.

### Branches

- `codex/<task-id>-<short-name>`
- `claude/backend-<short-name>`
- Avoid direct pushes to `main` during normal development. Use PRs for implementation work unless the human explicitly requests a direct documentation update.

### Merge authority

- Codex may merge Codex-owned PRs under D005 after the branch is current with `main`, required checks are green, no blocker label is present, verification is recorded, and the merge message names the human-approved supervisor authority.
- Codex may merge Claude-owned PRs only after Codex review when the PR is green, unblocked, and not labeled `do-not-merge`, `needs-human`, or `tier-3`.
- No agent may merge work that weakens gates, changes human-only surfaces, or alters an accepted decision without explicit human approval.
- Implementation merges should go through PRs.

### Throughput

- Claude keeps at most three non-merged PRs active in normal mode: one blocker fix, one small support/eval/docs PR, and one backend feature. During blocker-clearing mode, `agent_next` may raise the temporary cap to six when at least 80% of Claude's active PRs are blocker clears.
- Codex batches routine tier-1 reviews/merges into a merge train and opens one coordination refresh after the batch when at least three PR states changed or app work was unblocked.
- Both agents clear `do-not-merge`, `needs-human`, tier-3, and conflicting PRs before opening net-new feature branches.
- Backend PRs that affect the app carry or document one contract state: `ready-for-ios`, `blocked-for-ios`, `backend-only`, or `needs-human-policy`.
- Features expected to span more than three PRs start with a spec PR that defines backend/iOS contracts and parallel tracks before implementation begins.
- `node scripts/agent_next.mjs --role=claude|codex` is the first stop for next-action selection when available.

### Live event lane

- After every PR open/merge/close, every coord refresh, and every review-blocker call, append an entry to `docs/agent-events-<YYYY>-W<WW>.jsonl` via:
  ```bash
  node scripts/agent_event.mjs append --by=claude|codex --kind=<kind> [--pr=N] --comment="..."
  ```
- Canonical kinds: `pr_opened`, `pr_merged`, `pr_closed`, `review_blocker`, `coord_refresh`, `event_protocol_change`, `spec_amend`, `product_state`, `pattern_codified`, `code_review`, `design_proposal`.
- Both agents read recent lane entries with `node scripts/agent_event.mjs tail --n=20` as part of their session warm-up when the script exists.
- The lane is the canonical async chatroom between Claude and Codex. PR comments are for code-specific review; the event lane is for state changes and intent signals.

### Status vocabulary in `TASKS.md`

`ready` → `ready-for-claude` → `in-progress` → `review` → `merged`

### Verification

- **Codex:** iOS build green; `themTests` pass when available.
- **Claude:** `cd backend && npm test`; `npm run eval:gate`; `RUN_QUALITY_GATE=1 ./scripts/quality_gate.sh` when backend or CI is touched and scripts exist.
- Both agents report what was run and what was not. Never claim verification that was skipped.

### Decisions

Architectural or product decisions are appended to `DECISIONS.md` in ADR form: `id`, `date`, `status`, `context`, `decision`, `consequences`. Codex may propose. Human accepts. Claude may flag the need for a decision but does not author one unless explicitly asked. D005 is the standing accepted exception that lets Codex execute the supervisor merge lane once the human has already approved the authority.

Anything else that needs the human's answer — a one-line product question, a tier-3 ambiguity, an unclear scope — goes into `docs/decisions-queue.md`, not the PR body. The queue is the single place the human checks for open questions. Each entry is one concrete question with a documented safe default the agent will follow absent an answer.

## Required End-of-Session Report

Every work session must end with:

1. **Completed** — exact features/tasks finished.
2. **Files changed** — exact files modified.
3. **Root issues fixed** — real causes resolved, not symptoms.
4. **Verification** — commands/tests run and results.
5. **GitHub status** — branch, PR, commit, or reason not committed.
6. **Next active task** — the next implementation target.
7. **Continue status** — `READY FOR CONTINUE` or `BLOCKED BY: <specific blocker>`.

## Removal Principle

Any process, file, or rule that does not help the user write a scene quickly, emotionally, and beautifully is a candidate for deletion. Review regularly and simplify aggressively.
