# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/codex-claude-live-handoff.md`, and
`docs/coordination.json`.

## Current Command

1. Do not merge or weaken PR #33. It remains blocked by the GitHub Actions
   `OPENAI_API_KEY` secret, not by code.
2. Treat `docs/coordination.json` as the live queue. After every Claude PR
   update, refresh that file and leave a concise PR comment for Codex.
3. Do not merge PR #63 unless the human explicitly accepts any standing
   trust/pre-approval policy changes beyond D005; if edited, keep it aligned
   with the no-quiet-time auto-merge rule from PR #72.
4. Clear `do-not-merge` blockers on existing PRs before opening more backend
   feature branches. Highest-value current blockers: #148 needs a rebase over
   post-#149 `main` plus a route-manifest scope fix; #142 needs a guarded
   non-array `KNOWN_DOMAINS` startup-check path with injected-domain tests;
   #87 needs a route-local
   >4MB/413 test and handler; #90 needs a production-style route parser fix;
   #88 should rebase after PR #98's shared Craft parser fix; #92 should rebase
   after PR #98 and fix the payoff-as-new-setup regression; #97 needs a rebase
   plus explicit `/talk/stats` access-control proof or a recorded policy note;
   #100 needs `/talk/errors` access-control proof and true since-window counts;
   #104, #105, and #107 need a rebase after PR #103; #110, #111, and #112
   need a rebase after PR #103; #115 and #117 need a rebase after PR #114;
   #124 needs null/blank `atMs` fallback regressions plus an update over current `main`; #127
   needs a rebase/update and fresh decisions-queue lint checks.
5. Treat full-memory export/import/delete surfaces as human-gated privacy work,
   not routine tier-1 work. PR #99 is blocked until the human accepts the
   memory deletion policy.
6. Keep backend work one branch per PR, and report exact tests run.

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
- Blocked PR #142: `T-known-domains-startup-check` now has `tier-1` + `do-not-merge`; fix the warn-and-continue path so non-array `KNOWN_DOMAINS` cannot throw, add injected-domain regressions, rerun focused test plus `npm test`, then request review.
- Merged PR #143: `T-decisions-queue-fixture-template` adds the decisions-queue entry template; docs-only and GitHub evaluate was green.
- Merged PR #144: `T-coordination-state-cli-validate` adds `node scripts/coordination_state.mjs validate`; Codex diff review passed and GitHub evaluate was green.
- Closed PR #145: `T-codex-inbox-refresh-round11` was a stale conflicting inbox-only refresh superseded by current coordination docs.
- Merged PR #149: `T66-refresh-after-claude-pr-triage` records the #141/#143/#144 merges, #142 blocker, #145 close, and post-#144 Claude next actions in the repo-native handoff lane.
- Blocked PR #148: `T-ops-routes-list-route` now has `tier-1` + `do-not-merge`; rebase over post-#149 `main`, then either narrow/document the manifest as a curated subset with an explicit scope or include the full intended optional route set with regression coverage. Rerun focused route test plus `npm test`.
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
- Blocked PR #133: `T-build-tasks-md-anchors` is mergeable but still needs generator idempotency proof after post-#149 `main`; update over current `main`, commit generated `TASKS.md`, verify a second generator write is clean, then remove `do-not-merge`.
- Open blocker: PR #33 eval gate, red because the Actions secret is malformed.

## Codex Needs Next

- Use `node scripts/coordination_state.mjs read` before choosing work.
- Clear blockers on PRs already open before starting net-new backend feature work.
- Keep the backend queue ahead of iOS surfaces, but avoid work that depends on the blocked eval-gate cutover.

## Human Shortcut

Instead of copy/pasting a long checklist, send Claude this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
docs/coordination.json, then docs/claude-inbox.md. Follow the Current Command
exactly.
```

## Reciprocal Channel (Claude → Codex)

Claude maintains `docs/codex-inbox.md` as the symmetric reverse of this
file. After every Claude task or PR, Claude updates that inbox with the
PR number, branch, endpoint contracts ready to consume, blockers, and
the next recommended Codex action — so the human no longer has to copy/
paste a Claude→Codex handoff. The Codex-side prompt printer is
`scripts/print_codex_prompt.mjs`.
