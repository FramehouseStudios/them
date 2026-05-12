# Codex Inbox

This is the short handoff Codex should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/codex-claude-live-handoff.md`, and
`docs/coordination.json`.

Claude maintains this file. It is the symmetric reverse of
`docs/claude-inbox.md` and removes the need for the human to copy/paste
Claude→Codex handoffs after each Claude PR.

Claude updates this file at the end of every Claude task or PR. Each
update should fit the standing PR template: task id, branch, PR URL,
exact endpoints/files changed, exact tests run, what Codex should
consume next, and any blockers.

Codex should start with:

```bash
node scripts/agent_next.mjs --role=codex
node scripts/coordination_state.mjs read
```

Throughput rules live in `docs/agent-throughput-protocol.md`. Routine green
tier-1 PRs should be reviewed as a merge train, then reflected with one
batched coordination refresh. PR #167/T71 makes `agent_next` the canonical
first command for both agents.

## Current Open Claude PRs

| PR | Task | Tier | Status | Codex action |
| --- | --- | --- | --- | --- |
| [#148](https://github.com/FramehouseStudios/them/pull/148) | T-ops-routes-list-route | 1 | blocked | Has `do-not-merge`; conflicting after PR #149/T66, and the route-manifest contract is broader than the static list. Claude should rebase, then either narrow/document the response as a curated subset with an explicit scope or include the full intended route set with regression coverage. |
| [#133](https://github.com/FramehouseStudios/them/pull/133) | T-build-tasks-md-anchors | 1 | blocked | Has `do-not-merge`; after merging post-#149 `main`, the generator still needs an idempotency proof. Claude should commit the current generated `TASKS.md`, verify a second `node scripts/build_tasks_md.mjs --write` is clean, then request review. |
| [#142](https://github.com/FramehouseStudios/them/pull/142) | T-known-domains-startup-check | 1 | blocked | Has `do-not-merge`; default warn-and-continue can still throw if `KNOWN_DOMAINS` is corrupted to a non-array. Claude should guard iteration with `Array.isArray` or inject domains for testing, add non-array/duplicate/non-snake-case regressions, rerun focused test plus `npm test`, then request review. |
| [#127](https://github.com/FramehouseStudios/them/pull/127) | T-decisions-queue-md-lint | 1 | blocked | Has `do-not-merge`; branch is DIRTY against current `main` and has no current checks. Rebase/update, rerun `node scripts/decisions_queue_lint.mjs` and `node --test scripts/decisions_queue_lint.test.mjs`, then request full review. |
| [#124](https://github.com/FramehouseStudios/them/pull/124) | T-block-signal-atms-zero-fix | 1 | blocked | Has `do-not-merge`; the `atMs=0` fix must distinguish explicit zero from `null`/blank input, add regressions for `atMs: null` and empty string falling back to `nowMs()`, then update over current `main` after PR #125. |
| [#117](https://github.com/FramehouseStudios/them/pull/117) | T-coordination-state-eval | 1 | blocked | Has `do-not-merge`; branch is DIRTY after PR #114. Claude should rebase on current `main`, rerun `node scripts/coordination_state_schema_check.mjs` and `node --test scripts/coordination_state_schema_check.test.mjs`, then remove the blocker. |
| [#115](https://github.com/FramehouseStudios/them/pull/115) | T-known-domains-runtime-check | 1 | blocked | Has `do-not-merge`; branch is DIRTY after PR #114. Claude should rebase on current `main`, rerun `node --test tests/known_domains_invariants.test.mjs` plus `npm test`, then remove the blocker. |
| [#33](https://github.com/FramehouseStudios/them/pull/33) | T07 eval gate | 3 | blocked | Human-owned blocker: replace the malformed GitHub Actions secret `OPENAI_API_KEY` with the literal OpenAI key. Do not weaken the gate. |
| [#63](https://github.com/FramehouseStudios/them/pull/63) | T-trust-tiers | 3 | policy-gated | D005 now records the human-approved Codex supervisor authority. Do not merge #63 unless it is reconciled with D005 and has explicit human approval for any remaining trust-policy changes. |
| [#74](https://github.com/FramehouseStudios/them/pull/74) | T-prompt-wire-traits-and-twists | 2 | blocked | Has `do-not-merge`; Claude must rebase/fix and provide integration proof without weakening gates. |
| [#76](https://github.com/FramehouseStudios/them/pull/76) | T-logline-drift-alert | 1 | blocked | Has `do-not-merge`; needs endpoint/status proof before Codex review. |
| [#79](https://github.com/FramehouseStudios/them/pull/79) | T-first-page-telemetry-sink | 2 | blocked | Has `do-not-merge`; needs rebase/task detail and green checks. |
| [#80](https://github.com/FramehouseStudios/them/pull/80) | T-craft-frameworks-eval | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker and keep eval coverage intact. |
| [#81](https://github.com/FramehouseStudios/them/pull/81) | T-block-signal-clears-on-completion | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker and keep behavior tests. |
| [#82](https://github.com/FramehouseStudios/them/pull/82) | T-realtime-supplier-health | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker and keep route tests. |
| [#83](https://github.com/FramehouseStudios/them/pull/83) | T-fountain-export-endpoint | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker and keep endpoint tests. |
| [#84](https://github.com/FramehouseStudios/them/pull/84) | T-realtime-supplier-failover | 2 | blocked | Has `do-not-merge`; needs cross-agent review only after route-level coverage is explicit. |
| [#85](https://github.com/FramehouseStudios/them/pull/85) | T-backend-surface-smoke | 1 | blocked | Has `do-not-merge`; this is the likely next infrastructure unblock after Claude clears its blocker. |
| [#86](https://github.com/FramehouseStudios/them/pull/86) | T-genre-classifier | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker before Codex review. |
| [#87](https://github.com/FramehouseStudios/them/pull/87) | T-screenplay-import-fountain | 1 | blocked | Has `do-not-merge`; Codex review found the advertised >4MB 413 path likely escapes route handling as a generic Express error. Claude should add route-local parsing/error handling plus a production-style 413 integration test. |
| [#88](https://github.com/FramehouseStudios/them/pull/88) | T-coverage-simulator | 1 | blocked | Has `do-not-merge`; PR #98 fixed the shared Craft JSON parser on `main`. Claude should rebase onto current `main`, rerun backend tests, and confirm the production-style parser path stays green. |
| [#90](https://github.com/FramehouseStudios/them/pull/90) | T-fdx-export-endpoint | 1 | blocked | Has `do-not-merge`; Codex review found the endpoint reads `req.body` without a route-local JSON parser, while tests mask it with app-level parsing. Claude should add a production-style parser test and route parser. |
| [#92](https://github.com/FramehouseStudios/them/pull/92) | T-payoff-tracker | 1 | blocked | Has `do-not-merge`; PR #98 fixed the shared Craft JSON parser, but Codex also found a payoff dedupe bug where the payoff line can become a fresh unpaid setup. Claude should rebase and add that regression. |
| [#94](https://github.com/FramehouseStudios/them/pull/94) | T-creative-memory-export | 3 | needs-human | Labeled tier-3/needs-human; full creative-memory export needs privacy/data-control approval before merge. |
| [#97](https://github.com/FramehouseStudios/them/pull/97) | T-talk-turn-meta-stats | 1 | blocked | Has `do-not-merge`; branch is dirty and aggregate `/talk/stats` needs explicit route-level access-control proof or a recorded policy note before review. |
| [#99](https://github.com/FramehouseStudios/them/pull/99) | T-creative-memory-delete-endpoint | 3 | needs-human | Labeled tier-3/needs-human/do-not-merge; memory deletion is privacy/data-control work. Needs explicit human approval, including whether V1 may delete only `creative_memory` while leaving project-scoped artifacts. |
| [#100](https://github.com/FramehouseStudios/them/pull/100) | T-talk-error-rate-tracker | 1 | blocked | Has `do-not-merge`; `/talk/errors` needs ops access-control proof or safe-public policy, and its `sinceMs` window must count only events in the window instead of returning class lifetime totals. |
| [#104](https://github.com/FramehouseStudios/them/pull/104) | T-decisions-queue-route | 1 | blocked | Reviewed as acceptable before #103 landed, then became DIRTY. Has `do-not-merge`; Claude should rebase on current `main`, keep the route/tests intact, rerun focused decisions-queue tests plus `npm test`, then remove the blocker. |
| [#105](https://github.com/FramehouseStudios/them/pull/105) | T-memory-quality-eval | 1 | blocked | Reviewed as acceptable before #103 landed, then became DIRTY. Has `do-not-merge`; Claude should rebase on current `main`, rerun the direct eval, `npm run eval:memory-quality`, and `npm test`, then remove the blocker. |
| [#107](https://github.com/FramehouseStudios/them/pull/107) | T-tasks-sync-check | 1 | blocked | Reviewed as acceptable before #103 landed, then became DIRTY. Has `do-not-merge`; Claude should rebase on current `main`, rerun default/strict script checks plus `node --test scripts/tasks_sync_check.test.mjs`, then remove the blocker. |
| [#110](https://github.com/FramehouseStudios/them/pull/110) | T-prompt-size-eval | 1 | blocked | Has `do-not-merge`; DIRTY after #103. Claude should rebase on current `main`, rerun `node evals/run_prompt_size_eval.mjs`, `npm run eval:prompt-size`, and `npm test`, then remove the blocker. |
| [#111](https://github.com/FramehouseStudios/them/pull/111) | T-creative-memory-stats-route | 1 | blocked | Has `do-not-merge`; DIRTY after #103. Claude should rebase on current `main`, keep the no-leakage assertion, rerun focused memory-stats route tests plus `npm test`, then remove the blocker. |
| [#112](https://github.com/FramehouseStudios/them/pull/112) | T-prompt-assembly-snapshot-eval | 1 | blocked | Has `do-not-merge`; DIRTY after #103 and needs fresh visible checks. Claude should rebase on current `main`, rerun `node evals/run_prompt_assembly_snapshot_eval.mjs`, `npm run eval:prompt-snapshot`, and `npm test`, then remove the blocker. |

## Endpoint Contracts Ready to Consume

PR #119's `POST /screenplay/export` Markdown path is consumed by `codex/T59-ios-markdown-export`: `format=md|markdown` returns `text/markdown` and a `.md` attachment.

PR #135's `GET /screenplay/export/formats` path is consumed by merged PR #137 / `codex/T60-export-formats-picker`: the Studio export menu decodes the format list, filters unsupported backend entries, and keeps local fallback export options. PR #139 / `codex/T62-studio-offline-refresh-quiet` keeps automatic discovery quiet during XCTest/offline launches while preserving manual Refresh Formats error reporting.

Codex T64 / PR #146 / `codex/T64-session-evolution-quiet` is merged and extends the same offline/XCTest quieting to automatic session evolution, health/hydration, keychain auth reads, Studio history, project outline, and navigator probes. Backend-backed/manual refresh paths remain available. No Claude action is needed.

PR #141's `npm run eval:block-signal-block-cap`, PR #143's `docs/decisions-queue-template.md`, and PR #144's `node scripts/coordination_state.mjs validate` are merged. PR #145 is closed as a stale conflicting inbox-only refresh. PR #142 is blocked on the known-domains startup-check review finding.

PR #134's `GET /ops/health-summary` route is merged after Codex cleared the stale blocker and verified focused route tests plus full backend `npm test` locally.

PR #157 records the #134 landing state in the repo-native handoff lane.

PR #154's pure talk-turn token-bucket helper is merged. Follow-up: mount it
on `GET /talk/turn/:turnId` with route-level coverage, then have iOS surface
a friendly retry affordance if the route returns `rate_limited`.

PR #155's `tasks_active_frontmatter_eval`, PR #156's
`backend/lib/prompt_assembly.README.md`, and PR #158's
`tasks_active_stats` are merged. Use these scripts in future queue refreshes.

PR #162 records the #154/#155/#156/#158 landing state in the repo-native
handoff lane.

PR #148's `GET /ops/routes` manifest is blocked until the response scope matches the documented contract and the branch is rebased over post-#149 `main`.

PR #150's `npm run eval:creative-memory-version` is merged and pins the creative-memory snapshot `version` field. PR #151's PDF export rejection payload is merged; Studio export UI can now read `message`, `alternative_formats`, and `docs_path` when `format=pdf` is rejected.

PR #114's `GET /memory/block-signal/history` endpoint is consumed by `codex/T53-ios-block-signal-history` as a compact Studio Momentum history sparkline / stuck-this-week surface.

PR #108 already consumed PR #91's `GET /memory/character-archetypes` endpoint as an archetype tag/insight in the character traits rail.

Blocked contracts not ready to consume: PR #87 (`POST /screenplay/import/fountain`), PR #88 (`POST /craft/coverage/simulate`), PR #90 (`POST /screenplay/export/fdx`), PR #92 (`POST /craft/payoff/track`), and PR #97 (`GET /talk/stats`). Do not start iOS consumers until those PRs are rebased, reviewed, and merged.

## Coordination Infrastructure Now Live for Codex

With PR #60, PR #64, PR #65, PR #66, PR #67, PR #72, and D005 live, the coordination loop is now repo-native:

1. **Trust tiers** (PR #63 / `AGENTS.md`) — every Codex PR gets a tier label:
   - **Tier 1** (default, merge-eligible after explicit trusted approval): routine iOS feature work consuming a merged Claude contract, doc fixes, conflict refreshes, status flips.
   - **Tier 2**: edits to `AGENTS.md` / `DECISIONS.md` / `KNOWN_DOMAINS` / CI workflows / response-shape changes Claude consumes.
   - **Tier 3**: anything human-owned (auth, secrets, deploys, entitlements, gate weakening, new `DECISIONS.md` row).
2. **Auto-merge workflow** (merged PR #64, hardened by PR #72) — merges Tier 1 PRs only after green checks, `tier-1`, no blocker label, and explicit trusted approval. There is no quiet-time fallback.
3. **Coordination state** (merged PR #65 / `docs/coordination.json` + `scripts/coordination_state.mjs`) — fast read of open PRs / blockers / decisions. Run `export COORD_AGENT=codex`. Update on PR open/close: `node scripts/coordination_state.mjs add-pr --number=N --title=T --owner=codex --tier=1 --branch=B`.
4. **Decisions queue** (merged PR #66 / `docs/decisions-queue.md`) — the only place to post "needs human" questions. One concrete question per entry, with a safe default the agent will follow absent the human's answer.
5. **Per-row task files** (merged PR #67 / `tasks/_active/`) — optional. New tasks can drop `tasks/_active/T-<slug>.md` instead of editing `TASKS.md` directly. Removes the recurring "two agents touch the same line of TASKS.md" merge-conflict class. `node scripts/build_tasks_md.mjs` renders the rebuilt section.

## Blockers Affecting Codex

- D005 now authorizes Codex supervisor self-merges under the recorded guardrails.
- PR #33 is blocked by the repository Actions `OPENAI_API_KEY` secret, which is human-owned.
- Claude PR #63 is policy-gated and likely superseded by D005 unless remaining policy changes are explicitly approved.
- Claude PRs #94 and #99 are blocked on human privacy/data-control approval because they export/delete creative-memory data.
- Claude PRs #74, #76, #79-#88, #90, #92, #97, #99, #100, #104, #105, #107, #110-#112, #115, #117, #124, #127, #133, #142, and #148 currently carry `do-not-merge` or `needs-human`; Claude should clear those before opening more backend feature branches.

## Decisions Claude Needs from Codex

- PR #63 (`T-trust-tiers`) still requires explicit human acceptance before merge if it changes standing trust/pre-approval policy beyond D005.

## Human Shortcut

Instead of copy/pasting a long handoff, send Codex this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
docs/coordination.json, then docs/codex-inbox.md. Pick the next Codex action
from the open Claude PRs section and the coordination queue. Start by running
node scripts/agent_next.mjs --role=codex.
```

To print the same compact handoff prompt from the repo:

```bash
node scripts/agent_next.mjs --role=codex
node scripts/print_codex_prompt.mjs
```
