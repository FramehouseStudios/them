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

Anything else that needs the human's answer — a one-line product question, a tier-3 ambiguity, an unclear scope — goes into `docs/decisions-queue.md`, not the PR body. The queue is the single place the human checks for open questions. Each entry is one concrete question with a documented safe default the agent will follow absent an answer.

### Removal principle

Any process, file, or rule that does not help the user write a scene quickly, emotionally, and beautifully is a candidate for deletion. Review quarterly.

---

## Trust Tiers (standing pre-approvals)

The human is the product lead but is not the merge bottleneck for routine work. Each PR carries one tier; the tier determines who can merge it.

### Tier 1 — agent-owned, auto-mergeable

The owning agent (Claude or Codex) may merge their own PR without further approval when **all** of the following hold:

- Full owning-side test suite green (`cd backend && npm test` for Claude; `themTests` for Codex).
- No file under `Human only` scope (see Scope by path) is touched.
- No edits to `AGENTS.md`, `DECISIONS.md`, `KNOWN_DOMAINS`, the eval gate scripts, or any auth/security/secret/deploy surface.
- No schema-breaking change (additive fields and new domains following the existing canonical pattern are Tier 1; renames, removals, and shape changes are not).
- No new external network call outside the existing supplier interfaces.
- Diff under ~600 lines of substantive code (docs + tests excluded).
- The other agent has explicitly approved the PR — either a formal Approve review from a trusted OWNER/MEMBER/COLLABORATOR, or a comment beginning with `Codex supervisor update: approved` or `Claude supervisor update: approved`. There is no quiet-time fallback; an idle PR sits idle (per the 2026-05-11 human rule that neither agent merges without explicit cross-agent approval).

Typical Tier 1 PRs: new pure-backend module + tests + docs, new `/craft/*` or `/memory/*` endpoint that follows the canonical envelope, new persistence domain matching the `005_logline_history.sql` shape, conflict refreshes, status flips, doc-only fixes, iOS feature work that consumes a merged Claude contract.

Tier 1 is the default. Apply the `tier-1` PR label so the auto-merge workflow can pick it up.

### Tier 2 — cross-agent review, no human

PR must carry the `tier-2` label and an explicit cross-agent approval comment before merge. Use when **any** of:

- Edits to `AGENTS.md`, `DECISIONS.md`, `KNOWN_DOMAINS`, the prompt-assembly path, the eval gate scripts, or shared persistence migrations beyond the canonical pattern.
- Adds or modifies a CI workflow.
- Changes the public response shape of an endpoint that the other agent already consumes.

The reviewing agent must read the diff, confirm the contract, and post a `supervisor update: approved` comment. Either agent may then merge.

### Tier 3 — human approval required

PR must carry the `tier-3` label and an explicit human-authored merge. Use when **any** of:

- Adds a new row to `DECISIONS.md`.
- Touches auth, security, secrets, production database, deploy config, App Store metadata, entitlements, or PrivacyInfo.
- Touches anything under the `Human only` scope.
- Disables or weakens a gate (eval gate, craft completeness gate, quality gate).
- Force-pushes to `main` or to any shared branch.

Tier 3 PRs may not be merged by either agent regardless of test results.

### Tier defaulting + escalation

- Default tier is **Tier 1**. The PR author picks the tier and applies the label.
- Either agent may **escalate** another agent's PR (Tier 1 → Tier 2 → Tier 3) by replacing the label and leaving a comment explaining why. Escalation cannot be reversed except by the human.
- The human may downgrade or merge any PR at any time.

This is the canonical reference for `auto-merge-tier1.yml` and any future automation that needs to know who can ship what.
