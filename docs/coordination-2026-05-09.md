# io.them — Coordination Snapshot (2026-05-09)

A point-in-time map of what landed today, what is still open, and the follow-up rows that need to enter `TASKS.md` so nothing gets lost.

## Merged today

| PR | Title | Branch |
|---|---|---|
| #2 | Protocol — operating-system contract | `claude/backend-establish-operating-system` |
| #1 | T03 strip test assets | `codex/T03-strip-test-assets` |
| #3 | T17 craft Codable models | `codex/T17-craft-report-models` |
| #4 | T15 iOS simulator test host | `codex/T15-ios-test-host` |
| #5 | T16 exclude local tooling artifacts | `codex/T16-exclude-local-artifacts` |
| #6 | T18 backend craft schemas + endpoints | `claude/T18-craft-schemas-analysis` |
| #7 | T06 enforce quality-gate in CI | `claude/T06-quality-gate-default` |
| #8 | T07 persistence canonical foundation | `claude/T07-postgres-canonical` |
| #9 | T08 creative memory + canonical prompt assembly | `claude/backend-T08-memory-tier` |
| #14 | T19 BackendClient craft API methods | `codex/T19-backend-client-craft-api` |

The operating-system protocol is now on `main`. Both the audit tier and the persistence-canonical foundation are landed. Codex shipped T19 against the contract that T18 documented — the craft-analysis loop is end-to-end on the iOS side at the API layer.

## Still open (Claude-owned)

The four remaining open PRs form a single linear stack, all written this session against pre-merge bases. Each is mergeable on its own; the base-branch refs simply chain because they were authored before their parents merged.

```
PR #10  T08-wire handleTalkRequest reads creative memory  → claude/backend-T08-memory-tier (merged)
PR #11  T07b wire screenplay_store to adapter             → claude/T07-postgres-canonical (merged)
PR #12  T07d wire knowledge embeddings + test isolation   → claude/T07b-screenplay-wire   (PR #11)
PR #13  T07c wire memory_store to adapter                 → claude/T07d-embeddings-wire  (PR #12)
```

GitHub handles the base-branch-already-merged case automatically — each PR remains mergeable, with the diff computed against the actual base commit. Recommended merge order:

1. **PR #10** — independent of the T07 chain. Merge anytime. Re-bases onto `main` cleanly because its parent merged.
2. **PR #11** — independent of #10. Merge anytime. Same situation.
3. **PR #12** — needs PR #11 first.
4. **PR #13** — needs PR #12 first.

Or merge in PR-number order (10 → 11 → 12 → 13). Either is safe.

## What today's PRs actually do

- **PR #10 (T08-wire):** three surgical edits to `backend/index.js` so `/talk` reads creative memory and routes its system prompt through `buildModelPrompt`. Cold users see no `<creative_memory>` block; warm users get the compact ordered block defined in `prompt_assembly.js`. Read path is open; write triggers (character mention detection, scene completion detection) are a separate row — see follow-ups below.
- **PR #11 (T07b screenplay):** dual-write pattern. Existing JSON file remains canonical; per-owner records also `put` into the persistence adapter. Loads prefer the adapter when it has data.
- **PR #12 (T07d embeddings + test isolation):** same dual-write pattern for the inline knowledge embeddings cache, plus a test-helper fix (`PERSISTENCE_JSON_ROOT` per test run) that resolves a regression introduced by T07b's dual-writes when tests share `backend/data/persistence/`.
- **PR #13 (T07c memory):** same dual-write pattern for the largest store (559 lines). Records keyed `byIp:<ip>` and `byUserId:<id>` so reverse migration reconstructs the legacy bucket structure intact.

## Follow-up rows that should enter TASKS.md

Claude can author new rows it intends to own. These should join the queue so they aren't lost:

- **T07a — wire outbox_store to persistence adapter (architectural).** Owner: claude. Done when: outbox queue durability runs through the persistence adapter when `DATABASE_URL` is set, with `scaleBackplane` retained for cross-process state. Note: outbox does not have direct file I/O (uses `scaleBackplane`). The wiring is non-mechanical and warrants a design pass before implementation.
- **T07-cutover — drop dual-write JSON paths once Postgres is canonical.** Owner: claude. Done when: with `DATABASE_URL` set in CI for >7 days with no adapter errors logged, the legacy `*_store.json` write paths in screenplay/memory/embeddings are removed; loads go adapter-only.
- **T07-eval-gate — verify `npm run eval:gate` green with `DATABASE_URL`.** Owner: claude. Done when: a CI job runs the full gate against a live Postgres instance and passes; the result is recorded in `docs/T07-persistence-canonical.md`.
- **T08w-triggers — fire write triggers from `handleTalkRequest` post-processing.** Owner: claude. Done when: character mentions, scene completions, and tone signals detected in `/talk` exchanges trigger the corresponding `recordXxx` calls on `creativeMemoryStore`; eval coverage in `run_creative_memory_eval.mjs` extended with at least one trigger-fired case.
- **T08-postgres — swap `creative_memory_store` file I/O for the persistence adapter.** Owner: claude. Done when: `creative_memory_store.js` uses `createPersistence({ ... })` for the `user_memory` domain (or a dedicated `creative_memory` domain — design call); public API unchanged; eval suite green.
- **T06-iOS — update `them/QUALITY_GATE.md` to reference `docs/quality-gate-enforcement.md`.** Owner: codex. Done when: the iOS-side doc links the new CI-side enforcement doc and notes the `Verify Quality Gate Was Enforced` step. (Denied to Claude — `them/**` is read-only for the support agent.)

I am only authorized to edit my own rows in `TASKS.md`. Rather than cause merge conflicts on the four open PRs, I recommend the human (or Codex) add these rows to `TASKS.md` directly on `main` after the open PR stack merges.

## Branch hygiene

Two stale Claude branches predating the protocol can be retired:

- `claude/affectionate-gagarin`
- `claude/sharp-davinci-7cbf16`

`git worktree list` marks the corresponding worktrees as `prunable`. Suggested cleanup:

```bash
git worktree prune
git branch -D claude/affectionate-gagarin
git branch -D claude/sharp-davinci-7cbf16
```

After PRs #10–#13 merge, the four worktrees under `.agents/worktrees/` (`claude-T08-wire`, `claude-T07b-screenplay`, `claude-T07c-memory`, `claude-T07d-embeddings`, `claude-coordination`) can be removed in the same way:

```bash
for wt in claude-T08-wire claude-T07b-screenplay claude-T07c-memory claude-T07d-embeddings claude-coordination; do
  git worktree remove ".agents/worktrees/$wt" 2>/dev/null
done
```

`.agents/worktrees/claude-backend/` is the long-lived Claude worktree per `AGENTS.md`; keep it.

## What this means for Codex's next session

Codex's most leveraged moves now:

1. **T20 (Craft tab UI)** is unblocked by the merged T19 — the BackendClient methods exist; the UI can now consume them.
2. **T02 (archive case collision)** still blocks T09 (modularization) and transitively T11/T12. Highest downstream leverage of any remaining Codex task.
3. **T04 / T05 / T10 / T14** all remain `ready` and don't depend on each other.

## What this means for the human

The PR stack is much healthier than it looked at session start. Order to drain it:

1. Merge **PR #10** (independent) and **PR #11** (independent) first, in either order.
2. Then **PR #12** (depends on #11).
3. Then **PR #13** (depends on #12).
4. Add the seven follow-up rows above to `TASKS.md` on `main`.
5. Optionally delete the two stale `claude/*` branches and prune their worktrees.

Once the stack drains, `main` will have:
- Full operating-system protocol on disk.
- Craft analysis loop end-to-end (T17 + T18 + T19; T20 and T21–T23 follow).
- Persistence adapter foundation + screenplay/embeddings/memory stores dual-writing.
- Creative memory tier wired into `/talk`.
- Quality-gate enforcement verified in release CI.
