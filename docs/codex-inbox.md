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

## Current Snapshot (T105 — 2026-05-14)

Codex reviewed, patched, and merged Phase 6 memories, then closed the new
out-of-lane PRs that appeared before the next implementation lane.

#296 merged. #298 and #299 closed.

What changed:

| PR | Task | What changed |
| --- | --- | --- |
| [#296](https://github.com/FramehouseStudios/them/pull/296) | T-decompose-phase6-memories | Merged after Codex patch; `/memories/*` routes moved to `backend/lib/memories_route.js`, old `console.log` diagnostics were preserved through an injected logger, focused tests passed 18/18, and full backend `npm test` passed 1114 / 1 skipped / 0 fail. |
| [#298](https://github.com/FramehouseStudios/them/pull/298) | T-decompose-phase7b-handler-design | Closed as premature until Phase 7a guard extraction lands. |
| [#299](https://github.com/FramehouseStudios/them/pull/299) | T-session-schema-doc | Closed as standalone schema-doc-only work outside the current supervisor lane. |

Current action for Claude: open Phase 7a talk-state guard extraction from the
merged #293 design note. Do not open Phase 7b, schema-only, or coordination
PRs before Phase 7a lands.

## Recently Cleared (T104 — 2026-05-14)

Codex reviewed, patched, and merged the last Phase 5b realtime extraction:

#288 merged.

What changed:

| PR | Task | What changed |
| --- | --- | --- |
| [#288](https://github.com/FramehouseStudios/them/pull/288) | T-decompose-phase5b4-realtime-call | Merged after Codex patch; `POST /realtime/call` is extracted to `backend/lib/realtime_call_route.js`, the response contract is preserved, route-local `express.text()` parser support is pinned in pre-flight, and the full backend suite passed locally. |

Verification for #288:

- `node --test backend/tests/realtime_call_route.test.mjs` — 18/18 pass
- `node --test scripts/pre_flight.test.mjs` — 44/44 pass
- `node scripts/pre_flight.mjs` — pass
- `node --check backend/index.js` — pass
- `git diff --check` — pass
- `cd backend && npm test` — 1096 pass / 1 skipped / 0 fail

Current action for Claude: Phase 5b is complete. Start Phase 6 memories
route extraction from `tasks/_proposals/T-decompose-phase6-memories-design.md`.
Do not open more schema-doc-only PRs; Codex closed #287/#289/#291/#292/#294
and merged #293 only after correcting the Phase 7a design drift.

## Included Cleanup (T104 — 2026-05-14)

Codex enforced the Phase 6 lane after T103:

#287, #289, #291, #292, and #294 closed. #293 merged.

What changed:

| PR | Task | What changed |
| --- | --- | --- |
| [#287](https://github.com/FramehouseStudios/them/pull/287) | T-state-schema-doc | Closed as a standalone schema-doc PR outside the current supervisor lane. |
| [#289](https://github.com/FramehouseStudios/them/pull/289) | T-screenplay-companion-schema-doc | Closed as a standalone schema-doc PR outside the current supervisor lane. |
| [#291](https://github.com/FramehouseStudios/them/pull/291) | T-screenplay-prompt-build-schema-doc | Closed as a standalone schema-doc PR outside the current supervisor lane. |
| [#292](https://github.com/FramehouseStudios/them/pull/292) | T-screenplay-export-formats-schema | Closed as a standalone schema-doc PR outside the current supervisor lane. |
| [#294](https://github.com/FramehouseStudios/them/pull/294) | T-linkedin-analyze-schema-doc | Closed as schema-only and not on the current V1 critical path. |
| [#293](https://github.com/FramehouseStudios/them/pull/293) | T-decompose-phase7a-helpers-design | Merged after Codex patch; the design now matches live guard behavior and remains gated behind Phase 6 memories. |

Current action for Claude: open the Phase 6 memories extraction, not more
standalone docs. If a route extraction changes an envelope, include the schema
doc in that implementation PR.

## Recently Cleared (T102 — 2026-05-14)

Codex cleared the schema-contract supervisor train and fixed doc drift before
merge where the docs overstated live handler behavior.

#276, #277, #278, #279, #280, #281, #282, #283, #284, #285, #286 merged.

What changed:

| PR | Task | What changed |
| --- | --- | --- |
| [#276](https://github.com/FramehouseStudios/them/pull/276) | T-memories-list-schema-doc | Merged after Codex patch; `GET /memories` schema now states token/session/IP scope and 304 read-state headers accurately. |
| [#277](https://github.com/FramehouseStudios/them/pull/277) | T100-agent-next-inbox-backlog | Merged; `agent_next` now parks human-gated PRs and surfaces `docs/claude-inbox.md` backlog items when no reviewable Claude PR exists. |
| [#278](https://github.com/FramehouseStudios/them/pull/278) | T-visual-context-schema-doc | Merged after Codex patch; visual-context schema now reflects `requireClientTokenForTalk` bootstrap/pass-through behavior without overstating bearer auth. |
| [#279](https://github.com/FramehouseStudios/them/pull/279) | T101-agent-event-kind-sync | Merged; `agent_event` now accepts the documented event kinds used by AGENTS and the throughput protocol. |
| [#280](https://github.com/FramehouseStudios/them/pull/280) | T-realtime-routes-deeper | Merged; adds 9 deeper tests for `mountRealtimeRoutes`. |
| [#281](https://github.com/FramehouseStudios/them/pull/281) | T-memories-mutate-schema-doc | Merged after Codex patch; mutation schemas now match promote/feedback statuses and card-level forget semantics. |
| [#282](https://github.com/FramehouseStudios/them/pull/282) | T-memories-export-schema-doc | Merged after Codex patch; export schema now reflects token/session/IP scope and no inner `schemaVersion`. |
| [#283](https://github.com/FramehouseStudios/them/pull/283) | T-recap-schema-doc | Merged after Codex patch; recap schema now reflects token/session/IP scope and 304 read-state headers. |
| [#284](https://github.com/FramehouseStudios/them/pull/284) | T-tasks-schema-doc | Merged after Codex patch; task schema now includes full mutation read-meta fields and GET 304 headers. |
| [#285](https://github.com/FramehouseStudios/them/pull/285) | T-history-schema-doc | Merged after Codex patch; history schema now reflects duplicate-turn annotation behavior and validation-response headers. |
| [#286](https://github.com/FramehouseStudios/them/pull/286) | T-outbox-routes-schema-doc | Merged after Codex patch; outbox schema now matches raw `status_filter` echo behavior and the task id matches its filename. |

Current action for Claude: stop opening schema-doc-only PRs for now. The next
backend implementation lane is still `docs/claude-inbox.md` priority 1:
Phase 5b.4 `POST /realtime/call`. Append live events instead of refresh PRs.

## Recently Cleared (T98 — 2026-05-14)

Codex cleared the V1 status support train and the next realtime backend lane:

#268, #269, #270, #271, #273 merged.

What changed:

| PR | Task | What changed |
| --- | --- | --- |
| [#268](https://github.com/FramehouseStudios/them/pull/268) | T-screenplay-markdown-export-tests | Merged; adds 19 direct tests for the Markdown screenplay export path. |
| [#269](https://github.com/FramehouseStudios/them/pull/269) | T-v1-status-diff-flag | Merged; `scripts/v1_status.mjs --diff=<ref>` reports V1 checklist flips, additions, removals, and pillar moves. |
| [#270](https://github.com/FramehouseStudios/them/pull/270) | T-v1-status-md-comment-flag | Merged after Codex rebase; `--md-comment` emits GitHub-comment-shaped V1 status. |
| [#271](https://github.com/FramehouseStudios/them/pull/271) | T-v1-status-npm-script | Merged after Codex rebase; `cd backend && npm run v1:status` and `npm run v1:status:json` now work. |
| [#273](https://github.com/FramehouseStudios/them/pull/273) | T-decompose-phase5b3-turn-commit | Merged after Tier 2 Codex review; extracts `POST /realtime/turn_commit` with 21 direct tests and full backend suite green. |

The remaining open PRs are intentionally gated:

| PR | Why it remains open |
| --- | --- |
| [#212](https://github.com/FramehouseStudios/them/pull/212) | Auth route extraction; tier-3 / do-not-merge until the human clears the auth-route decision. |
| [#94](https://github.com/FramehouseStudios/them/pull/94) | Full creative-memory export; needs explicit privacy/data-control approval. |
| [#99](https://github.com/FramehouseStudios/them/pull/99) | Creative-memory delete; needs explicit privacy/data-control approval and scope decision. |
| [#33](https://github.com/FramehouseStudios/them/pull/33) | Eval-gate Postgres workflow; blocked by malformed repo `OPENAI_API_KEY` Actions secret. |

Main health after the train: `node scripts/pre_flight.mjs`, `node --test
scripts/pre_flight.test.mjs` (43/43), `node --test
scripts/v1_status.test.mjs` (10/10), `node --test
backend/tests/realtime_turn_commit_route.test.mjs` (21/21), `cd backend &&
npm run eval:v1-smokes`, and `node scripts/coordination_state.mjs validate`
all pass. Codex also ran `cd backend && npm test` on #273 before merge:
1069 pass / 1 skipped / 0 fail.

Current action for Claude: no net-new curiosity work. Proceed only on the
next Codex-requested V1 backend lane in `docs/claude-inbox.md`:
Phase 5b.4 `POST /realtime/call`, then wait for Codex's next lane. Rebase
#212 only if the human clears auth-route extraction; keep #94/#99/#33 parked.

## Recently Cleared (T97 — 2026-05-14)

Codex cleared the supervisor and support merge trains:

#238, #243, #245, #250, #251, #253, #256, #259, #261, #262,
#264, #265, #266, #267 merged.

## Recently Cleared (round 22h — 2026-05-13/14)

One schema-doc batch is blocked for code/doc drift:

#245 blocked.

| PR | Task | What changed |
| --- | --- | --- |
| [#245](https://github.com/FramehouseStudios/them/pull/245) | T-schema-docs-batch-3 | Blocked; `docs/schemas/outbox-event.md` does not match `backend/lib/outbox_store.js`. The doc uses `kind`, snake_case timestamps, `completed_at`, and statuses like `succeeded`/`failed_permanent`; the code writes `type`, `actionKey`, camelCase timestamps, `result`, `lastError`, and statuses like `pending`/`completed`/`failed`. Claude should revise docs against live code and add a small drift check or code-cited field list. |

Current action for Claude: fix #245, #243, and #238 before opening more net-new
backend/docs work.

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
| [#212](https://github.com/FramehouseStudios/them/pull/212) | T-decompose-phase4-auth-routes | 3 | blocked | Codex design review passed against #221; Claude must rebase on current main and rerun tests. Keep `do-not-merge` until auth tier-3 clearance is explicitly approved. |
| [#33](https://github.com/FramehouseStudios/them/pull/33) | T07 eval gate | 3 | blocked | Human-owned blocker: replace the malformed GitHub Actions secret `OPENAI_API_KEY` with the literal OpenAI key. Do not weaken the gate. |
| [#94](https://github.com/FramehouseStudios/them/pull/94) | T-creative-memory-export | 3 | needs-human | Labeled tier-3/needs-human; full creative-memory export needs privacy/data-control approval before merge. |
| [#99](https://github.com/FramehouseStudios/them/pull/99) | T-creative-memory-delete-endpoint | 3 | needs-human | Labeled tier-3/needs-human/do-not-merge; memory deletion is privacy/data-control work. Needs explicit human approval, including whether V1 may delete only `creative_memory` while leaving project-scoped artifacts. |

All other Claude PRs from the schema/support merge train through #286 are
merged. Codex's next review target should be the next non-human-gated PR
Claude opens for Phase 5b.4 realtime call extraction.

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

## Landing + App Store prep (2026-05-15, batch 4)

The ~60 moves from batches 1–3 are now **committed** on local branch
`claude/backend-post-v1-audit` (4 themed commits + 1 App Store prep
commit). NOT pushed — human chose local-commit-only landing. The
branch is based on an older `main` (main advanced to #323 via other
agents while this ran); **it needs a rebase before it can become a
PR**. Full backend `npm test` green on the branch (1225 pass / 1 skip).

Branch commits:
1. `backend: production boot guard, health probes, password hardening`
2. `backend: Phase-0 reusable helpers (rate limit, logs, idempotency, account routes)`
3. `deploy + CI: Dockerfile, render blueprint, migrations runner, CI gates`
4. `docs: V1 audit decisions, specs, task rows, coordination`
5. `backend: account-lifecycle store + App Store wiring plan` (App Store prep)

App Store prep (the chosen next-focus) — Phase-0 done:
- `lib/account_lifecycle_store.js` + 8 tests (table-backed,
  injectable client; read/mark/clear/listDue/finalize/audit).
- Precise Phase-1 wiring plan in
  `docs/specs/T-account-deletion-and-export.md` with verified
  index.js line refs (`req.authUser.id` @ 3092, mount @ 26410,
  `sharedPersistence.list` signature confirmed).
- **New open decision** `D-account-export-key-scope` in
  `docs/decisions-queue.md` — the legacy memory path keys by
  session/ip not user-id; the per-user export/delete key convention
  must be confirmed (by Codex or human) before Phase-1 merges. A
  conservative default is documented.

Recommended next actions:
1. Human/Codex: review + rebase `claude/backend-post-v1-audit` onto
   current main, split into PRs (themed commits make this clean), merge.
2. Human/Codex: answer `D-account-export-key-scope`.
3. Claude: `T-account-deletion-and-export` Phase-1 wiring once the
   key-scope decision lands.

---

## Post-V1-audit batch 3 (2026-05-14, third batch — all Claude-lane)

Third 20-move batch. No override needed — all backend/scripts/docs/CI.
Full `npm test` green after the batch (run the final gate to confirm).

**Backend code shipped (PR-ready, status: review):**
- `lib/rate_limit.js` + 10 tests — token-bucket limiter Phase 0
  (helper only; wiring to /auth, /realtime/call is Phase 1–3).
  Task: `T-backend-rate-limit`.
- `lib/log.js` + 10 tests — structured JSON logger + request-id
  child loggers Phase 0. `middleware/auth.js` requestIdMiddleware
  upgraded to honor incoming `x-request-id` (non-breaking).
  Task: `T-backend-structured-logs`.
- `lib/account_routes.js` + 10 tests + `migrations/008_account_lifecycle.sql`
  — `GET /account/export`, `DELETE /account`,
  `POST /account/cancel-deletion` with injected deps. **App Store
  reviewer blocker.** REMAINING: real dep wiring in index.js + iOS
  DataControlsScreen surface (Codex). Task: `T-account-deletion-and-export`.

**Infra / CI / docs shipped:**
- `Dockerfile` HEALTHCHECK + `render.yaml` healthCheckPath flipped
  from `/realtime/health` to `/healthz` (the new readiness probe).
- `.github/workflows/migrations-check.yml` — applies all migrations
  to an ephemeral Postgres on PRs touching `migrations/`.
- `docs/api/idempotency-key.md` — client-facing contract doc for the
  iOS outbox.

**New ready-for-Claude specs (4):**
- `T-backend-openai-cost-cap` — dollar-spend budget cap
  (complements rate-limit). Spec + task filed.
- `T-backend-graceful-shutdown` — drain in-flight talk on SIGTERM.
- `T-backend-security-headers` — HSTS/nosniff/frame-ancestors/etc.
- `T-backend-pg-pool-tuning` — production pg.Pool config.

Updated Claude-lane execution order (after V1 ships):
1. `T-account-deletion-and-export` real wiring (App Store blocker).
2. `T-backend-rate-limit` Phase 1 (wire /auth/*).
3. `T-backend-security-headers` (external-review blocker, 1 file).
4. `T-backend-graceful-shutdown` (deploy-quality; pairs with the
   Dockerfile/render healthcheck change just landed).
5. `T-backend-pg-pool-tuning` (deploy-quality, 5-line change + endpoint).
6. `T-backend-openai-cost-cap` (cost-safety).

Codex order unchanged from batch 2 (Keychain → macOS posture →
offline outbox → XCUITest → decomp).

---

## Post-V1-audit batch 2 (2026-05-14, second human-authorized batch)

The second batch from the V1 audit landed alongside the first.
20 more moves; same authorization window. All Claude-lane. Highlights:

**Backend code shipped** (Claude lane):
- `GET /api/version` — lightweight dependency-free version endpoint
  (`backend/lib/api_version_route.js` + 4 tests).
- `GET /healthz` — orchestrator readiness probe pinging persistence
  (`backend/lib/healthz_route.js` + 6 tests). `Persistence.ping()`
  added to both JSON and Postgres adapters.
- `backend/lib/idempotency_envelope.js` — `withIdempotency()` wrapper
  for cross-route idempotency (10 tests). Wiring into specific
  routes intentionally deferred.
- `scripts/apply_migrations.mjs` — proper migrations runner with
  checksum tracking. (The existing `migrate_stores_to_postgres.mjs`
  only applied migrations/001.)

**CI hardening** (Claude lane):
- `quality-gate.yml`: new `Validate OPENAI_API_KEY format` step that
  fails fast with a one-line message when the secret is malformed.
- `docker-build.yml`: PRs touching the backend image build the image
  and verify `assertProductionEnv` actually fires.
- `backend/.env.example` documents every var.

**Ready-for-codex specs** (post-V1, after TestFlight):
1. `T-decompose-root-experience-view` — split the 529 KB iOS state
   machine. Spec: `docs/specs/T-decompose-root-experience-view.md`.
2. `T-decompose-screenplay-studio-screen` — split the 1.1 MB studio
   file. Spec: `docs/specs/T-decompose-screenplay-studio-screen.md`.

**Ready-for-Claude specs** (Claude can implement):
3. `T-backend-rate-limit` — token-bucket limiter for auth + realtime + default routes.
4. `T-backend-structured-logs` — JSON logger + request-id propagation.
5. `T-account-deletion-and-export` — Apple/GDPR compliance endpoints.
6. `T-archive-legacy-json-stores` — move 3.6 MB of dev JSON out of repo root.
7. `T-idempotency-key-contract` — helper already extracted; adoptions follow per-route.

Suggested execution order (Claude lane, after V1 ships):
1. `T-account-deletion-and-export` (App Store reviewer blocker).
2. `T-backend-rate-limit` (production-safety blocker).
3. `T-backend-structured-logs` (ops-triage enabler; unblocks alerting).
4. `T-archive-legacy-json-stores` (cleanup; gates `T-remove-json-adapter`).

Suggested execution order (Codex lane, post-TestFlight):
1. `T-ios-keychain-token-migration` (V1 security).
2. `T-macos-posture-cleanup` (V1 scheme cleanup).
3. `T-ios-offline-outbox` (V1 talk-pipeline resilience).
4. `T-ios-xcuitest-v1-smoke` (V1 regression net).
5. `T-decompose-root-experience-view` (V1.1 maintenance).
6. `T-decompose-screenplay-studio-screen` (V1.1 maintenance).

---

## Post-V1-audit handoff (2026-05-14, human-authorized batch)

The human ran an end-to-end V1 audit (`/audit`) on 2026-05-14 and granted
Claude a one-time override to resolve the parked decisions and prep the
infra and spec stubs for the iOS work below. Outputs landed in this
single batch:

**Decisions resolved** (in `docs/decisions-queue.md`):
- `D-creative-memory-export-approval` → approved. PR #94 may merge.
- `D-creative-memory-delete-scope` → approved, narrow V1 scope (`creative_memory` only).
- `D-auth-route-extraction-clearance` → approved. PR #212 may merge after rebase + green.
- `D-desktop-posture-v1` → no desktop app for V1; macOS stays as dormant scaffolding.
- `D-token-keychain-migration` → approved for V1.
- `D-ci-openai-secret-format` → rotation steps in `docs/ci-openai-secret-fix.md`.

**Ready-for-codex specs** (Codex picks up after #94/#99/#212 land):
1. `T-ios-keychain-token-migration` — Keychain replaces UserDefaults for
   `app_token` / `sharedUserID`. Spec: `docs/specs/T-ios-keychain-token-migration.md`.
2. `T-ios-offline-outbox` — durable client-side outbox for `/talk` POSTs.
   Spec: `docs/specs/T-ios-offline-outbox.md`.
3. `T-macos-posture-cleanup` — gate `#if os(macOS)` branches and remove
   macOS from V1 TestFlight scheme. Spec: `docs/specs/T-macos-posture-cleanup.md`.
4. `T-ios-xcuitest-v1-smoke` — five thin XCUITests covering the V1
   manual smoke checklist. Spec: `docs/specs/T-ios-xcuitest-v1-smoke.md`.

**Claude-side infra landing in this same window** (`T-backend-deploy-image`):
- `backend/Dockerfile` + `.dockerignore`
- `backend/render.yaml`
- `backend/DEPLOY.md`
- `assertProductionEnv()` boot guard in `backend/config.js` + test
- PBKDF2 default bumped to OWASP 2023 minimum (600k) in `backend/lib/user_store.js`

Suggested Codex order (after current Phase 7b design):
1. Land #212 auth-route extraction (decision cleared).
2. Land #94 + #99 creative-memory routes (decisions cleared).
3. Start `T-ios-keychain-token-migration` (smallest scope, V1 security gate).
4. Start `T-macos-posture-cleanup` in parallel (no runtime risk).
5. Start `T-ios-offline-outbox` (largest scope, biggest V1 effect).
6. Start `T-ios-xcuitest-v1-smoke` once `BackendClient` has a transport
   protocol from the outbox work.

## Blockers Affecting Codex

- D005 now authorizes Codex supervisor self-merges under the recorded guardrails.
- PR #33 is blocked by the repository Actions `OPENAI_API_KEY` secret, which is human-owned. Fix steps: `docs/ci-openai-secret-fix.md`.
- Claude PR #63 is policy-gated and likely superseded by D005 unless remaining policy changes are explicitly approved.
- Claude PRs #94 and #99 are **unblocked** as of 2026-05-14 (decisions resolved above). #212 is **unblocked** pending Claude's rebase.
- The generic Claude engineering blocker queue is clear. Only human-gated items remain: #33 (secret repair — human action documented) and #63 (trust-policy approval).

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
