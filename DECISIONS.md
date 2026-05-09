# DECISIONS.md — io.them

Product and architecture decisions. The human owns this file. Codex proposes, human accepts. Claude may flag the need for a decision but does not author one.

Each entry follows the ADR pattern:

- **ID** — `D###`, monotonically increasing.
- **Date** — ISO date of acceptance (or proposal if not yet accepted).
- **Status** — `proposed` | `accepted` | `superseded by D###` | `rejected`.
- **Context** — what forced the decision.
- **Decision** — the choice.
- **Consequences** — what changes because of it.

Status transitions: `proposed` → `accepted`, or `proposed` → `rejected`. An accepted decision is superseded only by a later accepted decision that explicitly references it.

---

## D001 — `io.them` is the canonical product name

- **Date:** 2026-05-09
- **Status:** accepted
- **Context:** The codebase contains four parallel identities — `Framehouse` (parent collateral), `them` (folder), `io.them` (parent), `Clementine` (realtime), `Her*` (companion files). User-facing identity was undeclared. The strategic audit flagged this as a material risk to App Store conversion, marketing, and recruiter signal.
- **Decision:** The canonical product name is **`io.them`**. Internal code identifiers (`Clementine*`, `Her*`, etc.) may persist as legacy names where rename cost exceeds benefit, but no user-visible surface displays them.
- **Consequences:** `README.md`, `Info.plist` `CFBundleDisplayName`, App Store metadata, marketing copy, and onboarding text must use `io.them`. Future code does not introduce new identities.

## D002 — North-star statement

- **Date:** 2026-05-09
- **Status:** accepted
- **Context:** The audit identified missing product positioning. Without a one-sentence north star, feature scope is undisciplined and the team builds parallel identities by accident.
- **Decision:** The official north star is verbatim: *"io.them is a mobile-first AI screenplay studio built around a living creative companion. It helps writers turn voice, fragments, and emotional impulses into properly formatted scenes — fast — while learning their style, characters, tone, and creative habits over time."* The four pillars are: **mobile-first**, **voice→scene**, **living creative companion**, **longitudinal learning**. Every task must serve at least one.
- **Consequences:** `AGENTS.md` cites this. `TASKS.md` enforces it as an invariant. Features that do not serve a pillar are out of scope. The 60-second magic moment is no longer hypothetical; it is the literal product promise.

## D003 — Codex-primary, Claude-scoped, human product-lead

- **Date:** 2026-05-09
- **Status:** accepted
- **Context:** Multi-agent work without a clear authority hierarchy produced an undifferentiated 409-file uncommitted snapshot — the precise failure mode that motivated this protocol. Two earlier `claude/*` branches and one `codex-*` branch existed with no coordination.
- **Decision:** Codex is the primary app builder (owns `them/`, product, architecture, integration). Claude is the scoped support agent (owns `backend/`, scripts, tests, docs, audits, CI when assigned; never edits the iOS app; never makes product decisions). The human is the product lead (decides direction, accepts decisions, merges PRs). All work flows through `TASKS.md`. The three coordination files — `AGENTS.md`, `TASKS.md`, `DECISIONS.md` — are the operating system.
- **Consequences:** Replaces the earlier two-file (`AGENTS.md` + `CLAUDE.md`) protocol. `CLAUDE.md` becomes a thin redirect to `AGENTS.md`. Hard scope enforcement via `.claude/settings.json` deny rules to follow. The earlier "Codex-Primary / Claude-Support Architecture" document (PDF section 4) is superseded by this entry and folded into a single "Operating System" section.

## D004 — _next decision goes here_
