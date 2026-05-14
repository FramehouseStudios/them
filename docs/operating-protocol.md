# io.them — Operating Protocol (Narrative)

A working narrative of how io.them is built. This is the
explanatory complement to `AGENTS.md` (the rules), `TASKS.md`
(the work), and `DECISIONS.md` (the decisions). Read this first
if you're new; read those three for the load-bearing surface.

## The product

io.them is a mobile-first AI screenplay studio built around a
living creative companion. It helps writers turn voice, fragments,
and emotional impulses into properly formatted scenes — fast —
while learning their style, characters, tone, and creative habits
over time.

The current product target is `docs/v1-definition.md`. Every PR
names the V1 pillar it serves and the concrete V1 effect.

## The three roles

| Role | Owns | Doesn't own |
| --- | --- | --- |
| **Codex** | iOS app, product implementation, architecture, integration, supervisor merge lane, coordination state, claude-inbox | Backend lib internals, scripts, docs/schemas/, docs/, themTests/ |
| **Claude** | Backend support, scripts, tests, documentation, audits, CI work when assigned, live agent-events lane | iOS app, product decisions, AGENTS.md, DECISIONS.md, them/, archive/, Library/, Projects/ |
| **Human** | Product lead, AGENTS.md / DECISIONS.md acceptance, App Store metadata, *.entitlements, PrivacyInfo, archive/, Library/, Projects/ | Day-to-day implementation, routine reviews |

When in doubt about who owns what: read `AGENTS.md` § "Scope by
path."

## The four coordination files

1. **`AGENTS.md`** — the rules. North star, scope, branches,
   throughput caps, contract states, live event lane. Owned by
   the human and Codex jointly. Claude does not edit this file.
2. **`TASKS.md`** — the active work queue. Tier 1 / tier 2 /
   tier 3 grouping; one owner, one branch, one scope, one
   definition of done per row.
3. **`DECISIONS.md`** — the decisions. Append-only log of
   product and architecture decisions that touch contracts. Claude
   does not edit this file.
4. **`docs/coordination.json`** + **`docs/claude-inbox.md`** +
   **`docs/codex-inbox.md`** + **`docs/agent-events-*.jsonl`** —
   the fast machine-readable layer. Codex owns the inbox + state.
   Claude emits live events into the event-lane JSONL.

## How a PR ships

1. **Pick from the queue.** `node scripts/agent_next.mjs
   --role=claude` chooses the next action. Three-PR normal WIP
   cap; six-PR blocker-clearing cap.
2. **Open a task file** under `tasks/_active/T-*.md` with YAML
   front matter:
   - `id`, `title`, `owner`, `status`, `branch`, `pillar`,
     `v1_pillar`, `v1_effect`.
3. **Create a worktree** under
   `.agents/worktrees/claude-<slug>` on branch
   `claude/T-<slug>`. Never push to `main`.
4. **Write code or docs.** Pre-flight (`node scripts/pre_flight.mjs`)
   should pass. Tests should pass (`node --test ...`).
5. **Commit** with a message that names the V1 pillar + effect.
6. **Push** to remote, **open a PR** with a body that includes
   the V1 pillar and a test plan.
7. **Append a live event:**
   ```
   node scripts/agent_event.mjs append --by=claude --kind=pr_opened --pr=N --comment="..."
   ```
8. **Wait for Codex's merge train** if it's an iOS-touching PR;
   self-review-and-merge for backend-only PRs once green.

## The V1 status reporter

```
node scripts/v1_status.mjs
```

Reads `docs/v1-definition.md` and emits per-pillar completion %.
`--json` for machine-readable output; `--pillar=<slug>` to focus
one surface.

## The pre-flight rules

`scripts/pre_flight.mjs` runs a set of static checks before a PR
opens:

- `route-needs-own-parser` — every live route must own its
  `express.json({ limit: ... })` parser (no shared global parser).
- `mount-missing-required-deps-guard` — every `mount<X>Route`
  factory must validate its required deps at registration time.
- `lib-missing-test` — every `backend/lib/*.js` should have a
  matching `backend/tests/*.test.mjs`.
- `task-missing-v1-pillar` / `task-invalid-v1-pillar` — every
  active task file must name a V1 pillar from the canonical set.
- `task-missing-status` / `task-invalid-status` — every active
  task file must use a canonical status (`open | review |
  merged | closed | parked | blocked | draft`).
- `eval-missing-determinism-check` — every eval must document or
  assert determinism.
- `schema-envelope-missing-version` — every schema doc must name
  its schema version.
- `console-log-in-lib` — no `console.log` in production lib code.
- `middleware-error-escapes` — error handlers must not let an
  error escape past the response.
- `exported-const-not-frozen` — exported canon constants must be
  `Object.freeze`d.

Warn-only by default; `--strict` fails the run.

## The V1 smoke chain

`backend/package.json`'s `eval:canon` script runs every canon
eval plus four deterministic V1 smokes:

- `v1_voice_to_page_smoke` — talk pipeline shape.
- `v1_screenplay_smoke` — fountain export ordering + determinism.
- `v1_memory_recall_smoke` — write-then-read recall + isolation.
- `v1_realtime_failover_smoke` — 4 realtime failover paths.

See `docs/runbook-v1-smoke.md` for what to do when one fails.

## The decomposition spec

`backend/index.js` started at >33,000 lines and is being
decomposed phase-by-phase under
`docs/specs/T-decompose-backend-index.md`. Rules:

- One decomposition PR in flight at a time.
- Each phase must ship a design note under `tasks/_proposals/`
  before code lands.
- The `mount<X>Route(app, deps)` factory pattern is the canonical
  extraction shape.
- Live state crosses module boundaries through accessor functions
  (`getRealtimeSupplier: () => realtimeSupplier`), not stale
  bindings.

## The schema discipline

`docs/schemas/*.md` is the canonical envelope/record shape for
every iOS-facing API. New routes ship a schema doc with the same
PR or before. The `docs/schemas/INDEX.md` lists every doc with
its access-control posture (`SAFE-PUBLIC` | `PER-USER` |
`TIER-3 SENSITIVE`).

A schema change that affects iOS triggers:
1. A `note` event on the agent-event lane.
2. A `DECISIONS.md` entry if the change is breaking.
3. A coordinated PR that lands the backend change and the
   schema doc together.

## Things this protocol explicitly avoids

- **Direct edits to coordination state** without a task row.
  Coordination drift is the highest-cost bug class.
- **Coord-refresh PRs from Claude** unless Codex explicitly
  assigns one. Codex owns coordination cadence.
- **Decomposition without a design note.** Risk-class change.
- **Schema changes without a schema doc update.** Silent drift.
- **PRs without a V1 pillar / effect line.** Drops out of V1
  rollups silently.

## How this doc gets updated

- Add new pre-flight rules to the list when they ship.
- Add new V1 smokes to the V1 chain section when they ship.
- Add new schema-doc surfaces to the schema discipline section.
- Anything load-bearing about scope, branches, or merge authority
  → update `AGENTS.md`, not this file. This doc is the narrative
  view; `AGENTS.md` is the rules of record.
