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

## Recently Cleared (round 22g — 2026-05-13/14)

One more auth coverage PR merged, and one V1 status tool PR is blocked:

#242 merged. #243 blocked.

| PR | Task | What changed |
| --- | --- | --- |
| [#242](https://github.com/FramehouseStudios/them/pull/242) | T-user-auth-roundtrip-tests | Merged; adds 13 full handler round-trip tests over signup/login/refresh/logout/password reset/email verification with real `user_store` + HS256 JWT. Codex ran the targeted node test locally: 13/13 pass. |
| [#243](https://github.com/FramehouseStudios/them/pull/243) | T-v1-status-reporter | Blocked; `scripts/v1_status.mjs` truncates wrapped checkbox continuation lines. It must join continuation lines until the next checkbox/heading and include a regression assertion before merge. |

Current action for Claude: fix #243 and #238; rebase #212 only after the
human clears the auth-route extraction decision or explicitly asks us to keep
reviewing it without merge.

## Recently Cleared (round 22f — 2026-05-13/14)

Codex cleared the latest fast-lane queue and blocked one non-identical
realtime extraction:

#235, #237, #239, #240, #241 merged. #238 blocked.

| PR | Task | What changed |
| --- | --- | --- |
| [#235](https://github.com/FramehouseStudios/them/pull/235) | T-v1-pillar-rule-and-canon-wire | Merged; `pre_flight` now requires V1 pillar/effect metadata, and `backend/package.json` wires the deterministic V1 smoke pack into `eval:v1-smokes` + `eval:canon`. |
| [#237](https://github.com/FramehouseStudios/them/pull/237) | T-deeper-lib-tests-batch | Merged; adds 18 deeper `user_store` auth-session lifecycle tests. Codex ran the targeted node test locally: 18/18 pass. |
| [#239](https://github.com/FramehouseStudios/them/pull/239) | T-backfill-v1-pillar-legacy | Merged; backfills V1 pillar/effect metadata on 13 legacy task files. |
| [#240](https://github.com/FramehouseStudios/them/pull/240) | T90-v1-memory-realtime-diagnostics | Merged; iOS Data Controls now decodes content-free `/memory/stats`, shows Memory Shape, exposes realtime provider selection, and preserves `/realtime/client_secret` fallback metadata. |
| [#241](https://github.com/FramehouseStudios/them/pull/241) | T-deeper-memstore-and-user-auth-tests | Merged; adds 22 deeper memory-store/user-auth tests. Codex reran targeted tests locally after installing backend deps in the review worktree: 22/22 pass. |
| [#238](https://github.com/FramehouseStudios/them/pull/238) | T-decompose-phase5b1-realtime-client-secret | Blocked; the extracted `/realtime/client_secret` route writes fallback/created supplier state back through `setRealtimeSupplier(supplier)`, but the old inline handler only reassigned the local supplier variable. Claude should remove the write-back for a true extraction or rescope the PR as an intentional behavior change with design/schema/tests. |

Current action for Claude: fix/rebase #238 before it can merge; rebase #212 on
current main if continuing auth extraction; leave #94/#99/#33 human-gated.

## Recently Cleared (round 22e — 2026-05-13/14)

The second schema-doc batch merged after round 22d:

#233.

| PR | Task | What changed |
| --- | --- | --- |
| [#233](https://github.com/FramehouseStudios/them/pull/233) | T-schema-docs-batch-2 | Merged after a Codex README cleanup; `docs/schemas/` now covers the V1-critical backend-to-iOS envelopes for talk response, screenplay project/version, realtime health/client-secret, ops health summary, memory stats, and block signal. |

Schema docs now cover the main V1 contract surfaces. Future route extraction PRs
should update the matching schema doc only when the response envelope changes;
byte-identical extraction PRs can cite the existing doc.

## Recently Cleared (round 22d — 2026-05-13/14)

The V1 smoke-fixture pack merged after round 22c:

#231.

| PR | Task | What changed |
| --- | --- | --- |
| [#231](https://github.com/FramehouseStudios/them/pull/231) | T-v1-three-smoke-fixtures | Merged; deterministic smoke tripwires now cover screenplay export, memory recall, and realtime failover. Codex reviewed the diff and ran local `node --check` for all three scripts, `node --test` for all three wrappers, and `git diff --check`; 7/7 local tests passed. |

V1 now has deterministic smoke coverage for voice-to-page prompt path (#224),
screenplay export, memory recall, and realtime failover (#231). The full human
TestFlight smoke still gates V1 sign-off. Claude's next safe backend
implementation remains Phase 5b.1 `/realtime/client_secret`; #212 remains
auth/tier-3 blocked.

## Recently Cleared (round 22c — 2026-05-13/14)

The memory and long-tail design notes merged after round 22b:

#228, #229.

| PR | Task | What changed |
| --- | --- | --- |
| [#228](https://github.com/FramehouseStudios/them/pull/228) | T-decompose-phase6-memories-design | Merged; Codex accepted the Phase 6 memories split as one implementation PR after the realtime turn-commit memory-write path is stable. Constraint: wait for Phase 5b.3 unless Codex explicitly reassigns the order; `/memories/export` remains tier-3/privacy-gated and must keep `requireMemoryExportAuth`. |
| [#229](https://github.com/FramehouseStudios/them/pull/229) | T-decompose-phase6-1-long-tail-design | Merged; Codex accepted the Phase 6.1 long-tail grouping and method-guards sweep. Constraint: begin after Phase 5b and Phase 6 unless Codex explicitly reorders it. |

Claude's next safe backend implementation remains Phase 5b.1
`/realtime/client_secret`. Phase 6 and Phase 6.1 are accepted designs, not the
next active implementation lane yet. The current open queue is #212, #33, #63,
#94, and #99; all are auth/policy/privacy/human-gated.

## Recently Cleared (round 22b — 2026-05-13/14)

The follow-up design/smoke/schema mini-train merged after round 22:

#223, #224, #226, #227.

| PR | Task | What changed |
| --- | --- | --- |
| [#223](https://github.com/FramehouseStudios/them/pull/223) | T-decompose-phase7-talk-pipeline-design | Merged; Codex accepted the Phase 7 talk-pipeline split: 7a guards/state, 7b handler, 7c supplier glue. Full audio fixture remains a follow-up; #224 covers the deterministic prompt subset. |
| [#224](https://github.com/FramehouseStudios/them/pull/224) | T-v1-voice-to-page-smoke | Merged; deterministic, network-free V1 voice-to-page prompt-path smoke is now available. |
| [#226](https://github.com/FramehouseStudios/them/pull/226) | T-schema-docs-scaffold | Merged after a Codex README correction; `docs/schemas/` now has canonical starter docs for auth, talk-turn-meta, and ops-metrics envelopes. |
| [#227](https://github.com/FramehouseStudios/them/pull/227) | T-decompose-phase5b-realtime-design | Merged; Codex accepted serial 5b.1 client_secret, 5b.2 studio render/stream, 5b.3 turn_commit, 5b.4 realtime/call. Constraint: 5b.3 needs explicit memory-write round-trip tests and must not race Phase 6 memory work. |

Claude may proceed with Phase 5b.1 as the next safe backend decomp
implementation when no other decomp PR is in flight. Talk-pipeline Phase 7
implementation remains gated behind the accepted design note plus the realtime
Phase 5b work. #212 remains separately blocked/tier-3.

## Recently Cleared (round 22 — 2026-05-13/14)

Codex's supervisor merge train cleared the non-human Tier 1 queue again.
Merged on main since the previous coordination refresh:

#214, #215, #216, #217, #218, #220, #221, #222.

| PR | Task | What changed |
| --- | --- | --- |
| [#214](https://github.com/FramehouseStudios/them/pull/214) | T-protocol-infra-batch | Merged after Codex review fixups; protocol/docs/audit infrastructure landed. |
| [#215](https://github.com/FramehouseStudios/them/pull/215) | T-decompose-phase5a-realtime-reads | Merged; `GET /realtime/health` + `GET /realtime/bridge` moved to `backend/lib/realtime_routes.js`. Allowed out of auth-order because #212 is tier-3 blocked and this extraction is read-only safe-public. |
| [#216](https://github.com/FramehouseStudios/them/pull/216) | T-memory-store-smoke-test | Merged; direct smoke coverage for `backend/lib/memory_store.js`. |
| [#217](https://github.com/FramehouseStudios/them/pull/217) | T-user-store-smoke-test | Merged; direct smoke coverage for `backend/lib/user_store.js`. |
| [#218](https://github.com/FramehouseStudios/them/pull/218) | T-user-auth-smoke-test | Merged; direct smoke coverage for `backend/lib/user_auth.js`; production auth behavior unchanged. |
| [#220](https://github.com/FramehouseStudios/them/pull/220) | T-fix-214-audit-and-readme | Merged; accepted-precedent README now cites only merged phases, and route audit separates live handlers from method guards. |
| [#221](https://github.com/FramehouseStudios/them/pull/221) | T-decompose-phase4-auth-design | Merged; design note for #212 is now the review contract. #212 still must not merge until reviewed against it. |
| [#222](https://github.com/FramehouseStudios/them/pull/222) | T84-talk-health-diagnostics | Merged; iOS now consumes `/talk/stats` + `/talk/errors` from the support/reporting flow and debug bundles. |

Current non-human queue after round 22:

- #212 is the next Codex review target, but it stays `do-not-merge`/tier-3
  until reviewed against the merged design note #221 and auth guardrails are
  explicitly cleared.
- #33, #63, #94, and #99 remain human-gated.

## Recently Cleared (round 20 — 2026-05-13/14)

Codex's supervisor lane absorbed the stale backend/support backlog.
Merged on main since the last on-main refresh:

#76, #80, #81, #82, #83, #85, #86, #88, #90, #92, #97, #100, #104,
#105, #107, #110, #111, #112, #115, #124, #127, #159, #161, #163,
#164, #166, #171, #117, #79, #74, #84, #190, #192, #193, #194,
#197, #199, #200, #201, #202, #204, #205, #206, #207.

Important round-20 details:

| PR | Task | What changed |
| --- | --- | --- |
| [#117](https://github.com/FramehouseStudios/them/pull/117) | T-coordination-state-eval | Merged; coordination schema check is live. |
| [#79](https://github.com/FramehouseStudios/them/pull/79) | T-first-page-telemetry-sink | Merged; backend can store first-page-written SLA events. |
| [#74](https://github.com/FramehouseStudios/them/pull/74) | T-prompt-wire-traits-and-twists | Merged; prompt order now pins `persona < memory < session < accepted_twists < block_signal < userInput`. |
| [#84](https://github.com/FramehouseStudios/them/pull/84) | T-realtime-supplier-failover | Merged; `/realtime/client_secret` falls back to stub only for unpinned primary failures, with route-level tests. |
| [#190](https://github.com/FramehouseStudios/them/pull/190) | T-decompose-phase1-ops-routes | Merged; `/ops/metrics` and `/ops/alerts` extracted from `backend/index.js`. |
| [#191](https://github.com/FramehouseStudios/them/pull/191) | T-coord-refresh-batch-13 | Closed; superseded by merged PR #189. |
| [#192](https://github.com/FramehouseStudios/them/pull/192) | T-decompose-phase2a-screenplay-projects-reads | Merged; 5 read-only `/screenplay/projects/*` routes extracted from `backend/index.js`. |
| [#193](https://github.com/FramehouseStudios/them/pull/193) | T-route-local-parsers | Merged; all `route-needs-own-parser` pre-flight findings cleared. |
| [#194](https://github.com/FramehouseStudios/them/pull/194) | T-decompose-spec-update | Merged; backend-index decomposition spec records phases 0-2a and parser hardening. |
| [#195](https://github.com/FramehouseStudios/them/pull/195) | T-coord-refresh-batch-14 | Closed; stale duplicate superseded by Codex refresh. |
| [#197](https://github.com/FramehouseStudios/them/pull/197) | T-decompose-phase2b-screenplay-projects-writes | Merged; 7 write `/screenplay/projects/*` routes extracted, with a stale `base_version_id` 409 regression added before merge. |
| [#199](https://github.com/FramehouseStudios/them/pull/199) | T-pre-flight-required-deps-rule | Merged; `pre_flight` now warns when `mount<X>` route modules accept deps without a required-deps guard. |
| [#200](https://github.com/FramehouseStudios/them/pull/200) | T-utils-smoke-test | Merged; `backend/lib/utils.js` now has 17 direct smoke tests and a follow-up task tracks the remaining untested libs. |
| [#201](https://github.com/FramehouseStudios/them/pull/201) | T-eval-canon-into-gate | Merged; `npm run eval:canon` is now default-on in `quality_gate.sh` / `quality-gate.yml` before external-secret evals. |
| [#202](https://github.com/FramehouseStudios/them/pull/202) | T-snapshot-eval-accepted-twists | Merged; prompt assembly snapshot eval now pins accepted-twist/block-signal drop-out and determinism. |
| [#204](https://github.com/FramehouseStudios/them/pull/204) | T-decompose-phase3-screenplay-companion | Merged; `/screenplay/companion/state`, `/screenplay/paginate`, and `/screenplay/revision-colors` moved out of `backend/index.js`. |
| [#205](https://github.com/FramehouseStudios/them/pull/205) | T-persona-smoke-test | Merged; `backend/lib/persona.js` now has direct runtime smoke coverage. |
| [#206](https://github.com/FramehouseStudios/them/pull/206) | T-screenplay-store-smoke-test | Merged; `backend/lib/screenplay_store.js` now has direct lookup, sort, round-trip, and adapter hydration coverage. |
| [#207](https://github.com/FramehouseStudios/them/pull/207) | T-outbox-store-smoke-test | Merged; `backend/lib/outbox_store.js` now has direct enqueue, retry, batch, single-item, and worker gate coverage. |

The `ops-surface-access-control` cross-PR blocker remains fully cleared
(merged into main via #97 + #100). The generic Claude do-not-merge
queue is also cleared; the remaining open blockers are human-owned.
Round 20 is clear: #197/#199/#200/#201/#202/#204/#205/#206/#207 are
all merged. The only open PRs are human-gated. Claude's next safe
backend coverage targets are `memory_store`, `user_store`, and
`user_auth`; Codex's highest-leverage next work is app-visible iOS
consumption of the already-merged backend contracts.

## Current Open Claude PRs

| PR | Task | Tier | Status | Codex action |
| --- | --- | --- | --- | --- |
| [#243](https://github.com/FramehouseStudios/them/pull/243) | T-v1-status-reporter | 1 | blocked | Fix wrapped checklist continuation parsing in `scripts/v1_status.mjs`; current JSON/output truncates the iOS Release Readiness item after "next app-visible". |
| [#238](https://github.com/FramehouseStudios/them/pull/238) | T-decompose-phase5b1-realtime-client-secret | 2 | blocked | Fix behavior drift: remove `setRealtimeSupplier(supplier)` write-back for byte-identical extraction, or rescope as intentional supplier-rotation behavior with design/schema/tests. |
| [#212](https://github.com/FramehouseStudios/them/pull/212) | T-decompose-phase4-auth-routes | 3 | blocked | Codex design review passed against #221; Claude must rebase on current main and rerun tests. Keep `do-not-merge` until auth tier-3 clearance is explicitly approved. |
| [#33](https://github.com/FramehouseStudios/them/pull/33) | T07 eval gate | 3 | blocked | Human-owned blocker: replace the malformed GitHub Actions secret `OPENAI_API_KEY` with the literal OpenAI key. Do not weaken the gate. |
| [#63](https://github.com/FramehouseStudios/them/pull/63) | T-trust-tiers | 3 | closed | Closed as stale/superseded by accepted D005/D006 and current `AGENTS.md` supervisor guardrails. |
| [#94](https://github.com/FramehouseStudios/them/pull/94) | T-creative-memory-export | 3 | needs-human | Labeled tier-3/needs-human; full creative-memory export needs privacy/data-control approval before merge. |
| [#99](https://github.com/FramehouseStudios/them/pull/99) | T-creative-memory-delete-endpoint | 3 | needs-human | Labeled tier-3/needs-human/do-not-merge; memory deletion is privacy/data-control work. Needs explicit human approval, including whether V1 may delete only `creative_memory` while leaving project-scoped artifacts. |

## Endpoint Contracts Ready to Consume

PR #119's `POST /screenplay/export` Markdown path is consumed by `codex/T59-ios-markdown-export`: `format=md|markdown` returns `text/markdown` and a `.md` attachment.

PR #135's `GET /screenplay/export/formats` path is consumed by merged PR #137 / `codex/T60-export-formats-picker`: the Studio export menu decodes the format list, filters unsupported backend entries, and keeps local fallback export options. PR #139 / `codex/T62-studio-offline-refresh-quiet` keeps automatic discovery quiet during XCTest/offline launches while preserving manual Refresh Formats error reporting.

Codex T64 / PR #146 / `codex/T64-session-evolution-quiet` is merged and extends the same offline/XCTest quieting to automatic session evolution, health/hydration, keychain auth reads, Studio history, project outline, and navigator probes. Backend-backed/manual refresh paths remain available. No Claude action is needed.

PR #141's `npm run eval:block-signal-block-cap`, PR #143's `docs/decisions-queue-template.md`, and PR #144's `node scripts/coordination_state.mjs validate` are merged. PR #145 is closed as a stale conflicting inbox-only refresh. PR #142 is merged after the known-domains startup-check fix.

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

PR #87's `POST /screenplay/import/fountain` path is consumed by PR #176 / T73 / `codex/T73-ios-fountain-import`: Studio script imports use the backend Fountain parser when available and fall back to local normalization offline.

PR #148's `GET /ops/routes` manifest is consumed by PR #178 / T74 / `codex/T74-ops-routes-diagnostics`: support summaries and debug bundles include route-manifest counts and groups when the backend provides them.

PR #170's optional `GET /talk/turn/:turnId` limiter behavior is merged and consumed by PR #179 / T75 / `codex/T75-talk-turn-rate-limit-retry`: iOS preserves the saved talk response and surfaces a friendly retry interval when metadata reads return `rate_limited`.

PR #97's `GET /talk/stats` and PR #100's `GET /talk/errors` are consumed by PR #222 / T84 / `codex/T84-talk-health-diagnostics`: the support/reporting flow has a Talk Diagnostics sheet and debug bundles now carry safe-public talk health summaries.

PR #175's `scripts/agent_event.mjs` live lane is merged. Start Codex sessions with `node scripts/agent_event.mjs tail --n=20` after `agent_next`, and append `pr_merged`, `pr_closed`, `review_blocker`, and `coord_refresh` events as the merge train moves.

PR #177's `scripts/pre_flight.mjs` self-check is merged. Claude should run it before backend/script PRs; Codex should use it when reproducing recurring route-parser, middleware-error, frozen-constant, or console-log findings.

PR #173 was closed as stale so it cannot rewind the current handoff state.

PR #180's outbox console cleanup is merged. The pre-flight `console-log-in-lib` class should now be gone; remaining pre-flight findings are route-local parser work.

PR #181's backend-index decomposition spec is merged. Codex approved low-risk routes before auth, grouped `*_routes.js` naming, flat `backend/lib/`, and talk-pipeline phase splits.

PR #183's Phase 0 `/health` + `/bridge` extraction is merged as a one-off Codex-accepted exception. Do not let more backend-index decomposition phases start until the blocker-first queue is healthier unless explicitly assigned.

PR #186 / T79 is merged. The second-pass efficiency protocol is the active
operating mode: `agent_next` shows recent event-lane entries, blocker-clearing
mode raises Claude's temporary cap to six, `coordination_state` supports
structured blocker metadata, `pre_flight` catches determinism/schema-version
warnings, and multi-PR features start with a spec before backend/iOS parallel
tracks begin.

PR #150's `npm run eval:creative-memory-version` is merged and pins the creative-memory snapshot `version` field. PR #151's PDF export rejection payload is merged; Studio export UI can now read `message`, `alternative_formats`, and `docs_path` when `format=pdf` is rejected.

PR #114's `GET /memory/block-signal/history` endpoint is consumed by `codex/T53-ios-block-signal-history` as a compact Studio Momentum history sparkline / stuck-this-week surface.

PR #108 already consumed PR #91's `GET /memory/character-archetypes` endpoint as an archetype tag/insight in the character traits rail.

Newly ready app-facing backend contracts: PR #88 (`POST /craft/coverage/simulate`), PR #90 (`POST /screenplay/export/fdx`), PR #92 (`POST /craft/payoff/track`), PR #97 (`GET /talk/stats`), PR #79 (`POST`/`GET /telemetry/first-page-written`), and PR #84's fallback-aware `/realtime/client_secret` response. Codex can prioritize iOS consumers for these next.

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
- The generic Claude engineering blocker queue is clear. Only human-gated PRs remain: #33 (secret repair), #63 (trust-policy approval), #94 (creative-memory export approval), and #99 (creative-memory delete approval).

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
