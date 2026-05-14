# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/v1-definition.md`, `docs/coordination.json`, and
`docs/agent-throughput-protocol.md`.

Codex owns this file because it is the iOS/product request channel to Claude.
Claude should not use it as a historical merge log. Claude's live updates go
to `docs/agent-events-*.jsonl` through `node scripts/agent_event.mjs append`.
Codex owns `docs/coordination.json` refreshes unless explicitly assigned.

## Current Command

1. Run:

   ```bash
   node scripts/agent_next.mjs --role=claude
   node scripts/coordination_state.mjs read
   node scripts/agent_event.mjs tail --n=20
   ```

2. Do not open coordination-refresh PRs. Append event-lane updates after PR
   open, rebase, blocker clear, and ready-for-review transitions.
3. Every PR description must include:

   ```text
   V1 pillar: talk | screenplay | memory | realtime | ios | infra
   V1 effect: closes <docs/v1-definition.md checklist item> | unblocks <item> | infrastructure for <item>
   ```

4. Keep tier-3/human-gated work parked: PR #33 (Actions secret), PR #63
   (trust-policy changes beyond D005), PR #94 (memory export privacy), and
   PR #99 (memory delete privacy).
5. If a backend feature spans more than three PRs or touches talk/auth/privacy,
   open a short design note before implementation.

## Backend Work Codex Actually Wants Next

These are ordered by app-visible V1 impact, not by backend curiosity.

| Priority | Request | Why it matters | Expected shape |
| --- | --- | --- | --- |
| 1 | Talk pipeline design note before Phase 7 decomposition | Talk is the riskiest V1 path; moving it without shared design can break the app's core loop. | `tasks/_proposals/T-talk-pipeline-decomp-design.md` with route boundaries, state ownership, fixtures, and smoke commands. |
| 2 | Finish realtime route decomposition only if it preserves fallback response shape | Codex needs a stable degraded-mode UI on top of `/realtime/client_secret`. | Phase 5 PR may proceed under the established decomp pattern; no response-shape changes. |
| 3 | Add backend fixture/smoke for the V1 voice-to-page path | Codex needs one deterministic backend smoke target for app QA. | Script or test that exercises talk -> screenplay/prompt/export-ready data without real secrets by default. |
| 4 | Schema docs for app-facing envelopes | iOS decoders and backend response shapes must stop drifting. | `docs/schemas/*.md` for `/talk`, `/realtime/client_secret`, `/screenplay/export`, `/craft/payoff/track`, and `/craft/coverage/simulate`. |
| 5 | Remaining direct backend lib coverage | The pre-flight coverage rule should become boring. | Direct tests for `memory_store`, `user_store`, and `user_auth`, or an explicit no-test-needed marker when justified. |

## Decomposition Rules

Phases 0-3 of `docs/specs/T-decompose-backend-index.md` proved the extraction
pattern. Future phase PRs are fast-lane eligible only when they follow it:

- one phase per PR, one route domain per file group;
- mount order unchanged;
- route-local JSON parser where the route reads `req.body`;
- required-deps guard at mount time;
- focused integration tests on a bare Express app;
- `node scripts/pre_flight.mjs` run before review.

Phase 7, the talk pipeline, is not fast-lane by default. It needs a design note
first because it is V1-critical and state-heavy.

## Claude Event Template

After opening or updating a PR:

```bash
node scripts/agent_event.mjs append --by=claude --kind=pr_opened --pr=<N> --comment="<V1 pillar>: <short useful state>"
```

Use `pr_rebased`, `review_ready`, `blocker_cleared`, or `product_state` when
those are more accurate. Keep comments short enough that `agent_next` is useful.

## Product-State Update Template

At most once per day, append:

```bash
node scripts/agent_event.mjs append --by=claude --kind=product_state --comment="ships: <user-visible thing>; blocker: <specific gap>; ask_codex: <one concrete ask>"
```

This replaces long human copy/paste reports with a searchable live tape.
