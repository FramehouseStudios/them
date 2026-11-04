# Server-owned Page budgets — 2026-10-26

## Checkpoint

**VERIFIED:** scoped branch `codex/T-1173-server-page-budget`, final runtime
`73770829328edecc1d16902b3286db5c6b8eb741`. Preserving merge `b873807` retains
T1174's verified overlapping-edit recovery. Original PR heads, main and
production are unchanged by this work. No paid provider call was made.

## Reproduced failures

1. On saved `a37ef3b`, omitted/zero/one caller token caps reached generation
   with only **0.1 Page turns**. Pinned Node20 red: **0 pass / 3 fail / 4
   unselected skips**. A client cap could create a zero/tiny hold while the
   actual server generation cap was much larger.
2. An untranscribed recording was classified before ASR knew its words, so a
   writing request could inherit a silence/Reflex lane without a Page hold.
   The preserved raw-ASR repair is required for the budget to cover real voice.
3. Adversarial review of the first passing tree exposed another bypass: a
   caller could set `clementine_intent=advise` on a writing request and avoid
   Page reservation. Red source `97cbb40`, local Node20: **0 pass / 1 fail /
   7 unselected skips**, missing expected rejection. This was fixed before
   treating the checkpoint as verified.

## Root fixes

- Reuse preserved server-budget `d832be8` and required failed-response/refund
  `3a1c04b` / `795f14f` and raw-ASR `be7c70d` capabilities through the existing
  Page/wallet adapter. Keep T1172's awaited metadata/replay publication and
  bounded response headers intact; do not overwrite the handler wholesale.
- The HTTP edge creates one linked provisional hold. Before generation, grow
  that same hold using the **server's actual output cap**. A caller's omitted,
  tiny or inflated cap cannot set the hold or truncate the story. Insufficient
  funds reject with 402 before chat/TTS; reservation infrastructure failure
  returns 503 rather than falling through into generation.
- Budget growth is synchronous, monotonic and atomic within the process:
  insufficient growth leaves the existing hold/balance unchanged; repeated
  notifications do not double-reserve; released reservations cannot reopen.
- Account for both metered multipass stages and the optional third repair
  stage. The short-film path prepares its actual supplier cap too.
- For raw recordings, prepare routing once **after authoritative server ASR**,
  before generation, without rerunning transcription/the speech handler.
  Refusal still cancels the Page hold and leaves discussion usable.
- A non-Page intent hint cannot downgrade a request whose canonical screenplay
  target is Page. Reuse `resolveScreenplayTargetFromRequest`; preserve an
  explicit discussion target rather than letting a coarse verb match turn
  advice into billable Page work. Test explicit and inferred writing targets.
- Generation records proposed usage. Provider errors, malformed/empty output,
  quality rejection, throw, disconnect, refusal, `asked_repeat` and
  `continue_listening` do not settle a Page charge. Duplicate response events
  cannot settle twice. Successful output settles actual usage, refunding
  unused headroom. This response-lifecycle boundary is **not yet crash-safe**.
- Parse the short-film supplier's actual content rather than mistaking its
  normalized JSON response envelope for a screenplay. Retain non-empty quality
  output; rejected real handler results preserve history, the saved draft and
  wallet balance, including after graceful backend restart.

## Proof

All suppliers in this checkpoint are deterministic intercepted transport or
injected fixtures. None establishes live model quality or real microphone proof.

| Source / check | Result |
| --- | --- |
| `0cbf1fb` initial focused Node20 | **91 pass / 0 fail / 0 skip** |
| `0cbf1fb` first full Node20 | **2945 pass / 0 fail / 2 skip**, 47 suites |
| `7377082` final budget cases, local Node20 | **10 pass / 0 fail / 0 skip** |
| `7377082` final full pinned Node20 | **2948 pass / 0 fail / 2 skip**, 47 suites |
| Final signed raw-audio → page → save → exact relaunch | **1 pass / 0 fail / 0 skip**; intercepted STT1/chat3/TTS1 |
| Final signed queued reply → playback → append → one save → restore | **1 pass / 0 fail / 0 skip**; intercepted STT1/chat2/TTS23 |

The two full-suite skips are the opt-in real-Postgres prefix test without a
database URL and the gated live Page-sync case. They remain skips. No external
database or production endpoint was contacted.

The actual authenticated HTTP regression enforces `REQUIRE_USER_AUTH=1`:
four underfunded raw-audio requests return **402/402/402/402**, including the
forged conversational hint. It observes four ASR calls, **zero chat and zero
TTS**, and unchanged 0.1-turn balance. A funded request carrying the tiny cap
and advice hint returns an authoritative Page, one ASR, full canonical metadata
and balance **100 → 99.8** for fixture usage of 80 output tokens. It uses
ordinary Node fetch; the old expanded 131072-byte header allowance was not
ported. T1172's normal-client header contract remains exercised.

The UI runner provisions an isolated synthetic user through real signup, writes
synthetic funds through the canonical persistence adapter while its own backend
is stopped, restarts/hydrates, then uses real login/session routes. Fixture
discovery is restricted to an explicitly loaded loopback test module and grants
neither funds nor credentials. No shipping wallet bypass, production grant,
purchase verification claim or test-only auth route is introduced.

Simulator `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A` is task-owned and erased before
each signed run. The first queued-run request was rejected by automatic approval
review due to suspected concurrent Xcode work. It did not execute. Read-only
inspection established no Xcode processes and a terminal passing prior result;
the same authorized sequential workflow then ran. No bypass or concurrent proof.

App Swift, unit-test Swift and project/dependency settings are byte-unchanged
from saved T1174 `977717e`. Its **886/0/0 signed units and macOS scaffold build**
are inherited, not newly rerun results. The changed UI test helper compiled and
ran in the essential signed workflows above.

D009 against fetched saved parent `codex/T-1172-durable-talk-replay`: pass.
Index **33494**, Studio **17345**, Root **14933**, bridge **12788**, Memory API
**10463**, all unchanged. Handler shrinks through the canonical transcript
reconciliation owner. Syntax checks and `git diff --check`: pass.

Permanent evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1173-20261026.AhoeZZ/`.
Includes the initial/final results and failure logs, terminal UI bundles and
summaries, D009 output, and SHA-256 manifest. Only the explicitly created
exact-lock dependency symlink was removed after every runner exited.

## Changed files in this capability

`TASKS.md`, this report, and:

```text
backend/lib/clementine/page_lane_adapter.js
backend/lib/clementine/page_multipass.js
backend/lib/clementine/short_film_lane.js
backend/lib/clementine/wallet.js
backend/lib/screenplay_turn_target.js
backend/lib/talk_failure_diagnostics.js
backend/lib/talk_generate.js
backend/lib/talk_handler.js
backend/evals/home_voice_provider_fixture.mjs
backend/evals/run_home_voice_handoff_ui_smoke.mjs
backend/tests/server_page_budget.test.mjs
backend/tests/raw_voice_lane.test.mjs
backend/tests/raw_voice_page_lane.integration.test.mjs
backend/tests/empty_generation_billing.test.mjs
backend/tests/talk_empty_billing.integration.test.mjs
backend/tests/helpers/billing_provider_stub.mjs
backend/tests/screenplay_write_refusal.test.mjs
themUITests/V1SmokeUITests.swift
```

The preserving merge additionally retains T1174's three Swift recovery files
and its report without rewriting that history.

## Adversarial limits and next boundary

- **Answered within this process:** caller caps/hints, failed budget top-up,
  duplicate notifications/settlement, cancellation, refusal, provider and output
  failure, HTTP200 listening recovery, authenticated funded raw voice.
- **Not answered:** atomic response acknowledgement plus durable debit across
  abrupt process death. `wallet.commit` still queues mutable balance state;
  its background queue swallows persistence failures from `flush`. The Page
  holds are process-local. A passing response/replay does not prove settlement.
- **Next:** integrate preserved T1122 durable settlement with canonical startup
  wiring, actual prepared-response retry/restart proof and guarded local
  PostgreSQL concurrency/failure checks. Do not advance original647 or main
  until that and the remaining integration conditions are satisfied.
- Actual iPhone microphone, live Clementine quality, precise live rewrite,
  native screenplay export outside THEM, intended shipping backend and complete
  integrated-main journey remain unproven. Production hold stays in place.
