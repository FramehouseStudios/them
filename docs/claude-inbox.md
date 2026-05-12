# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/codex-claude-live-handoff.md`, and
`docs/coordination.json`.

## Current Command

0. Start with `node scripts/agent_next.mjs --role=claude` and
   `node scripts/coordination_state.mjs read`. The script's top blocker is
   the default next task unless Codex explicitly assigns otherwise.
1. Do not merge or weaken PR #33. It remains blocked by the GitHub Actions
   `OPENAI_API_KEY` secret, not by code.
2. Treat `docs/coordination.json` as the live queue. After every Claude PR
   update, refresh that file and leave a concise PR comment for Codex.
3. Do not merge PR #63 unless the human explicitly accepts any standing
   trust/pre-approval policy changes beyond D005; if edited, keep it aligned
   with the no-quiet-time auto-merge rule from PR #72.
4. Clear `do-not-merge` blockers on existing PRs before opening more backend
   feature branches. Highest-value current blockers: #163 and #164 need a
   rebase after PR #160; #161 needs duplicate/length assertions for canonical
   traits; #166 must prove all 8 format-linter rules; #159 must read the
   production-mounted feature source or narrow the eval contract; #171 should
   wait for the canon-eval stack to settle. Then continue older blockers:
   #90 parser proof, #88 rebase after PR #98, #92 payoff regression, #97/#100
   ops access-control/window fixes, #104/#105/#107 after #103, #110/#111/#112
   after #103, #115/#117 after #114, #124 null/blank `atMs` regressions, and
   #127 decisions-queue lint checks.
5. Treat full-memory export/import/delete surfaces as human-gated privacy work,
   not routine tier-1 work. PR #99 is blocked until the human accepts the
   memory deletion policy.
6. Keep backend work one branch per PR, and report exact tests run.
7. Follow `docs/agent-throughput-protocol.md`: max three active Claude PRs,
   blocker-first, no net-new backend feature branches while the blocked queue
   is over limit unless Codex explicitly assigns an exception.

## Codex Supervisor Status

- Merged PR #48: `T-logline-distiller`.
- Merged PR #53: `T-block-detector`.
- Merged PR #55: `T-trait-library`.
- Merged PR #57: `T-twist-engine`.
- Merged PR #59: `T-accepted-twist-log`; verification passed syntax checks, focused accepted-twist backend tests 17/17, and full backend `npm test` 296 pass / 1 skipped.
- Merged PR #60: `T-codex-inbox` was conflict-resolved by Codex supervisor; it adds `docs/codex-inbox.md` and `scripts/print_codex_prompt.mjs` for Claude→Codex handoffs.
- Merged PR #65: `T-coordination-state` was conflict-resolved by Codex supervisor; it adds `docs/coordination.json` and `scripts/coordination_state.mjs` for a machine-readable queue.
- Merged PR #64: `T-auto-merge-tier1` was conflict-resolved and hardened by Codex supervisor; the workflow now counts supervisor approval comments only from OWNER/MEMBER/COLLABORATOR authors.
- Merged PR #66: `T-decisions-queue` was conflict-resolved by Codex supervisor; it adds `docs/decisions-queue.md` and the AGENTS pointer for human-needed questions.
- Merged PR #72: `T-strict-auto-merge` removes the four-hour quiet-time fallback; Tier 1 auto-merge now requires explicit trusted approval.
- Merged PR #67: `T-tasks-per-row` adds `tasks/_active/` per-row task files and `scripts/build_tasks_md.mjs`; Codex supervisor rebased it over current main and removed stale 4h-quiet wording from the seeded T-trust-tiers file.
- Accepted D005: Codex has supervisor self-merge authority under guardrails. Do not tell the human to manually merge routine Codex PRs if checks are green and no blocker labels are present.
- Merged PR #56: `T32` reply-side character mentions default-on.
- Merged PR #61: `T34` iOS logline rail consumer; it consumes PR #48 logline endpoints.
- Merged PR #62: `T35` iOS block-signal nudge surface consumes PR #53 `GET /memory/block-signal`.
- Merged PR #68: `T36` iOS character-traits side-rail consumer consumes PR #55 `GET /memory/character-traits`.
- Merged PR #69: `T37` iOS twist-card consumer consumes PR #57 `POST /craft/twist/suggest`; verification passed package tests, focused Xcode tests, full macOS tests, generic iOS build, and diff check.
- Merged PR #70: `T12` perceived-speed primitives; verification passed focused perceived-speed tests 2/2, full macOS `themTests` 73/73, generic iOS build, and diff check.
- Merged PR #71: `T38-accepted-twist-ios` wires iOS Keep/Dismiss/Reload calls for the merged PR #59 accepted-twist endpoints; verification passed package tests, focused accepted-twist Xcode tests 2/2, full macOS `themTests` 75/75, generic iOS build, diff check, and GitHub evaluate.
- Merged PR #73: `T39-symbol-warning` fixes the Studio SF Symbol warning.
- Merged PR #75: `T40-userdefaults-suite-warning` fixes the app UserDefaults suite warning.
- Merged PR #78: `T41-defer-studio-debug-publish` defers Studio debug lifecycle publishing until after SwiftUI mutations settle.
- Merged PR #93: `T42-supervisor-merge-protocol` records D005 and makes the Codex/Claude handoff lane coordination-first.
- Merged PR #167: `T71-agent-throughput` adds `node scripts/agent_next.mjs`, `docs/agent-throughput-protocol.md`, and the first-command workflow. Claude should use that command before choosing work.
- Merged PR #174: `T72-batch-refresh` records the supervisor merge train and updates `agent_next` priorities. Claude's first six blockers are #163, #164, #161, #166, #159, and #171.
- Merged PR #160: `T-archetype-engine-canon-eval`; Codex verified `npm run eval:archetype-canon`.
- Merged PR #168: `T-creative-memory-store-eviction-eval`; Codex verified `npm run eval:creative-memory-eviction`.
- Merged PR #169: `T-coordination-state-mutate-eval`; Codex verified `node scripts/coordination_state_mutate_eval.mjs` and `node --test scripts/coordination_state_mutate_eval.test.mjs`.
- Merged PR #170: `T-talk-turn-rate-limit-route`; Codex verified focused route tests and backend `npm test`. Consumed by PR #179 / T75 iOS retry affordance.
- Merged PR #87: `T-screenplay-import-fountain`; PR #176 / T73 consumes it on iOS with the Studio Import Script path.
- Merged PR #142: `T-known-domains-startup-check`; Codex verified focused startup-check tests.
- Merged PR #133: `T-build-tasks-md-anchors`; Codex verified generator idempotency.
- Merged PR #148: `T-ops-routes-list-route`; PR #178 / T74 consumes it in the app support diagnostics/debug bundle.
- Merged PR #175: `T-agent-events-jsonl-live-lane`; both agents can now run `node scripts/agent_event.mjs tail --n=20` after `agent_next` and append transition events without waiting for a refresh PR.
- Merged PR #177: `T-pre-flight-self-check-script`; run `node scripts/pre_flight.mjs` before opening backend/script PRs to catch the recurring Codex review blockers locally.
- Closed PR #173 as stale; current coordination is carried by T72/T73/T74/T75 and this T76 refresh.
- Blocked PR #159: `T-ops-health-summary-eval` because the eval injects local expected features instead of reading the production-mounted feature source.
- Blocked PR #161: `T-trait-library-canon-eval` because duplicate canonical traits can pass.
- Blocked PR #163 and PR #164: rebase after PR #160's package/task-file merge.
- Blocked PR #166: `T-format-linter-rules-canon-eval` because not all 8 canonical rules are exercised.
- Blocked PR #171: `T-eval-gate-add-canon-evals` until the canon eval stack settles.
- Closed PR #165 and PR #172 as stale inbox-only refreshes superseded by the T72 batch refresh.
- Merged PR #95: `T43-refresh-claude-queue` refreshes the queue after Claude opened PRs #91 and #92 during the T42 landing window.
- Merged PR #96: `T44-creative-memory-export-triage` records PR #94 as a human-gated privacy/data-control item.
- Merged PR #91: `T-archetype-engine`; T48 consumes `GET /memory/character-archetypes` in the iOS character-traits rail.
- Merged PR #98: `T45-craft-route-json-parser`; Craft routes now own `/craft` JSON parsing in production. Rebase Craft PRs #88 and #92 before asking Codex to review them again.
- Merged PR #101: `T46-post-review-queue-refresh` updates the coordination queue after the #87/#88/#90/#92/#97 review pass and #91/#98 merges.
- New Codex triage: PR #99 is tier-3/needs-human/do-not-merge because it is memory deletion privacy work. PR #100 is tier-1/do-not-merge until `/talk/errors` has access-control proof and true `sinceMs` window counts.
- Merged PR #102: `T47-refresh-after-new-claude-prs` records PR #99/#100 blockers in the repo handoff lane.
- Merged PR #108: `T48-ios-archetype-traits` consumes PR #91's archetype endpoint as a non-blocking Studio character rail enrichment. No Claude backend action is needed unless the response envelope changes.
- Merged PR #109: `T49-post-t48-coordination-refresh` removes stale T48 in-progress wording from the repo-native handoff lane.
- Merged PR #103: `T-block-signal-history-tracking` records debounced block-signal samples in creative-memory habits.
- Blocked PR #104: `T-decisions-queue-route` is DIRTY after #103; rebase and rerun focused route tests plus `npm test`.
- Blocked PR #105: `T-memory-quality-eval` is DIRTY after #103; rebase and rerun the memory-quality eval commands plus `npm test`.
- Closed PR #106: `T-codex-inbox-refresh-round8` was handoff-only and is superseded by current main coordination docs.
- Blocked PR #107: `T-tasks-sync-check` is DIRTY after #103; rebase and rerun default/strict script checks plus the script test.
- Merged PR #113: `T50-refresh-after-pr103-merge` records the #103 merge and #104/#105/#106/#107 blockers in the handoff lane.
- Blocked PR #110: `T-prompt-size-eval` is DIRTY after #103; rebase and rerun prompt-size eval commands plus `npm test`.
- Blocked PR #111: `T-creative-memory-stats-route` is DIRTY after #103; rebase, keep the no-leakage assertion, and rerun focused route tests plus `npm test`.
- Blocked PR #112: `T-prompt-assembly-snapshot-eval` is DIRTY after #103 and needs fresh visible checks; rebase and rerun prompt snapshot eval commands plus `npm test`.
- Merged PR #116: `T51-refresh-after-new-eval-prs` records #110/#111/#112 blockers in the handoff lane.
- Merged PR #114: `T-block-signal-history-route` adds `GET /memory/block-signal/history`; Codex will consume it as an iOS block-signal history sparkline / stuck-this-week surface.
- Blocked PR #115: `T-known-domains-runtime-check` is DIRTY after #114; rebase and rerun `node --test tests/known_domains_invariants.test.mjs` plus `npm test`.
- Blocked PR #117: `T-coordination-state-eval` is DIRTY after #114; rebase and rerun `node scripts/coordination_state_schema_check.mjs` plus `node --test scripts/coordination_state_schema_check.test.mjs`.
- Merged PR #118: `T52-refresh-after-pr114-merge` records #114 merged, #115/#117 blocked, and the new block-signal history endpoint as ready for iOS consumption.
- Merged PR #122: `T53-ios-block-signal-history` consumes PR #114's `GET /memory/block-signal/history` in the Studio Momentum rail.
- Merged PR #120: `T-block-signal-history-bounds-eval` adds a deterministic pathological-input eval for the block-signal history buffer.
- Merged PR #119: `T-screenplay-export-markdown` adds `POST /screenplay/export` `format=md|markdown`; T59 consumes it with an iOS Markdown export/share option.
- Closed PRs #89, #106, and #121: these handoff-only refreshes are superseded by current main coordination docs.
- Merged PR #125: `T-talk-turn-meta-contract-snapshot` pins the iOS-visible `GET /talk/turn/:turnId` response keys, error codes, default `render_contract`, and `no-store` cache header.
- Blocked PR #124: `T-block-signal-atms-zero-fix` needs to preserve explicit `atMs=0` without treating `null` or blank string as zero; add those regressions and update over current `main` after PR #125.
- Blocked PR #127: `T-decisions-queue-md-lint` is DIRTY and has no current checks; update over current `main` and rerun its lint commands.
- Closed PR #128: `T-codex-inbox-refresh-round10` was handoff-only and is superseded by current main coordination docs.
- Merged PR #131: `T-task-files-cleanup` adds `TASKS.md` rows for orphan task files surfaced by the task sync checker.
- Merged PR #136: `T59-ios-markdown-export` consumes PR #119's Markdown export endpoint in the Studio export menu.
- Merged PR #135: `T-screenplay-export-formats-list-route` adds `GET /screenplay/export/formats`; T60 consumes it in the Studio export menu.
- Merged PR #137: `T60-export-formats-picker` consumes PR #135's export formats discovery endpoint in the Studio export menu.
- Merged PR #138: `T61-post-t60-coordination-refresh` refreshes the repo-native queue after T60.
- Merged PR #139: `T62-studio-offline-refresh-quiet` keeps T60 export-format discovery while preventing automatic XCTest/offline launch noise; manual Refresh Formats still reports backend errors.
- Merged PR #140: `T63-post-t62-coordination-refresh` records the post-T62 blocker refresh and keeps #133/#134 instructions current.
- Merged PR #146: `T64-session-evolution-quiet` quiets automatic XCTest/offline launch probes for session evolution, health/hydration, keychain auth reads, Studio history, project outline, and navigator loading while preserving backend-backed/manual refresh paths. No Claude backend action is needed unless one of those contracts changes.
- Merged PR #147: `T65-post-t64-coordination-refresh` marks PR #146/T64 merged across the repo-native handoff lane and keeps #133/#134 blockers current.
- Merged PR #141: `T-prompt-assembly-block-signal-cap-eval` adds `npm run eval:block-signal-block-cap`; Codex diff review passed and GitHub evaluate was green.
- Merged PR #142: `T-known-domains-startup-check` fixed the warn-and-continue startup path and is no longer a Claude blocker.
- Merged PR #143: `T-decisions-queue-fixture-template` adds the decisions-queue entry template; docs-only and GitHub evaluate was green.
- Merged PR #144: `T-coordination-state-cli-validate` adds `node scripts/coordination_state.mjs validate`; Codex diff review passed and GitHub evaluate was green.
- Closed PR #145: `T-codex-inbox-refresh-round11` was a stale conflicting inbox-only refresh superseded by current coordination docs.
- Merged PR #149: `T66-refresh-after-claude-pr-triage` records the #141/#143/#144 merges, #142 blocker, #145 close, and post-#144 Claude next actions in the repo-native handoff lane.
- Merged PR #148: `T-ops-routes-list-route` is no longer blocked; `GET /ops/routes` is ready for Codex diagnostics work.
- Merged PR #152: `T67-refresh-after-pr148-triage` records PR #148's blocker in the repo-native handoff lane.
- Merged PR #150: `T-creative-memory-version-check-eval` adds `npm run eval:creative-memory-version`; Codex diff review passed and GitHub evaluate was green.
- Merged PR #151: `T-screenplay-export-pdf-error-clarity` adds `message`, `alternative_formats`, and `docs_path` to the PDF export rejection payload; Codex diff review passed and GitHub evaluate was green.
- Merged PR #153: `T68-refresh-after-pr150-151` records PR #150/#151 merged and fixes T67's status detail in the repo-native handoff lane.
- Merged PR #134: `T-ops-health-summary-route` adds `GET /ops/health-summary`; Codex cleared the stale blocker after Claude's rebase note, verified focused route test 11/11 plus backend `npm test` 379 pass / 1 skipped, and merged it.
- Merged PR #157: `T69-refresh-after-pr134` records PR #134 as landed in the repo-native handoff lane.
- Merged PR #154: `T-talk-turn-rate-limit-helper` adds a pure token-bucket helper; Codex focused test 11/11 and GitHub evaluate passed.
- Merged PR #155: `T-tasks-active-frontmatter-eval` adds a task-file content validator; Codex default/strict runs plus script test 2/2 and GitHub evaluate passed.
- Merged PR #156: `T-prompt-assembly-readme` documents the canonical prompt-assembly layout beside the source; docs-only GitHub evaluate passed.
- Merged PR #158: `T-tasks-active-stats` adds text/JSON active-task summaries; Codex script checks plus script test 2/2 and GitHub evaluate passed.
- Merged PR #162: `T70-refresh-after-pr154-158` records PR #154/#155/#156/#158 as landed in the repo-native handoff lane.
- Merged PR #133: `T-build-tasks-md-anchors` is no longer blocked; the AUTOGEN anchor path is live.
- Open blocker: PR #33 eval gate, red because the Actions secret is malformed.

## Codex Needs Next

- Use `node scripts/coordination_state.mjs read` before choosing work.
- Use `node scripts/agent_next.mjs --role=claude` before choosing work.
- Clear blockers on PRs already open before starting net-new backend feature work.
- Keep the backend queue ahead of iOS surfaces, but avoid work that depends on the blocked eval-gate cutover.

## Human Shortcut

Instead of copy/pasting a long checklist, send Claude this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
docs/coordination.json, then docs/claude-inbox.md. Follow the Current Command
exactly. Start by running node scripts/agent_next.mjs --role=claude.
```

## Reciprocal Channel (Claude → Codex)

Claude maintains `docs/codex-inbox.md` as the symmetric reverse of this
file. After every Claude task or PR, Claude updates that inbox with the
PR number, branch, endpoint contracts ready to consume, blockers, and
the next recommended Codex action — so the human no longer has to copy/
paste a Claude→Codex handoff. The Codex-side prompt printer is
`scripts/print_codex_prompt.mjs`.
