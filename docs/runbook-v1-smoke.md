# V1 smoke runbook

Operator-facing reference for the V1 smoke suite — what each smoke
verifies, how to run them, what failure means, and where to look
when something breaks.

## TL;DR

```
cd backend
npm run eval:canon
```

→ All canon evals + all 5 V1 smokes pass. Exit 0 means V1 is safe
to ship from a deterministic-tripwire perspective.

For the iOS golden path:

```
cd backend
npm run eval:studio-ios-writer-loop-contract
```

→ The required integrated iPhone contract creates a real authenticated project,
types and saves screenplay text, exports a copy, relaunches, and proves the
same server-backed draft restores exactly once.

For the broader iOS UI suite:

```
scripts/run_v1_ui_smoke.sh
```

→ The current sequential `themUITests` suite covers the V1 UI contracts.
Manual smoke remains the source of truth for visual polish,
microphone/audio quality, and signed release hardware behavior.

## Where this fits

V1 is defined by `docs/v1-definition.md`'s 25-item checklist. The
deterministic subset of that checklist — the parts that can be
verified without an iOS device or external API — is captured in
the V1 smoke chain wired into `eval:canon` (#235).

`eval:canon` runs in CI on every PR. A green `eval:canon` means
no deterministic regression sneaked in. A red `eval:canon` means
some piece of V1's deterministic tripwire fired and the PR
should not merge until it's understood.

## The 5 V1 smokes

Each smoke is deterministic and avoids external services and LLM calls. The
first four are pure fixture/contract checks; the fifth uses an isolated
loopback backend with a simulated provider. The same authored inputs exercise
the same assertions on every run.

### 1. v1_voice_to_page_smoke (talk pillar)

`scripts/v1_voice_to_page_smoke.mjs` — feeds a canonical
fixture (a simulated STT transcript + persona + creative memory)
into prompt-assembly and verifies the **prompt shape** the LLM
would see. No LLM call; the smoke pins what we send, not what
the model returns. Verifies:

- Prompt-assembly stages run end-to-end without throwing.
- The assembled prompt contains every block declared in the
  fixture's `expected_prompt_contains[]` (persona, session,
  block-signal, creative-memory blocks, etc.).
- Block ordering is stable (the `expected_prompt_ordering[]`
  list appears in document order in the prompt).
- Determinism: two runs on the same fixture produce a
  byte-identical assembled prompt.
- Creative-memory rendering preserves character voice + tags
  through the prompt path.

Failure means: a prompt-assembly or creative-memory rendering
change altered the prompt the LLM sees. Look at:
`backend/lib/prompt_assembly.js`,
`backend/lib/creative_memory_store.js`,
`backend/fixtures/v1_voice_to_page.json`.

(NB: this smoke does **not** verify the `/talk/turn` response
envelope — that lives in `docs/schemas/talk-response.md` and
`docs/schemas/talk-turn-meta.md` and is exercised by the route
tests, not this prompt-shape smoke.)

### 2. v1_screenplay_smoke (screenplay pillar)

`scripts/v1_screenplay_smoke.mjs` — runs `exportToFountain` on
a canonical project fixture
(`backend/fixtures/v1_screenplay_export.json`) and verifies the
output against the fixture's `expected_fountain_contains[]` and
`expected_fountain_ordering[]` lists. Verifies:

- Every string in `expected_fountain_contains[]` appears in the
  output (today: title page fields, scene headings, action
  lines, character cues, dialogue).
- Every string in `expected_fountain_ordering[]` appears in
  order (today: title → scene 1 heading → character → dialogue
  → scene 2 heading).
- Two consecutive runs on the same input produce byte-identical
  output (determinism).

What the per-line-kind serialization invariants pin (action vs
character cue ordering inside a scene, transition rendering,
multi-scene ordering, etc.) is the **fountain_export_deeper**
test in `backend/tests/fountain_export_deeper.test.mjs` (#258),
not this smoke. The smoke pins the fixture-driven happy path;
the deeper tests pin the serializer rules.

Failure means: either an `exportToFountain` change broke the
fixture's expected text/ordering, or determinism regressed.
Look at: `backend/lib/fountain_export.js`,
`backend/fixtures/v1_screenplay_export.json`.

### 3. v1_memory_recall_smoke (memory pillar)

`scripts/v1_memory_recall_smoke.mjs` — records a character mention
via `createCreativeMemoryStore`, then reads the prompt-ready
recall payload back. Verifies:

- Cold state (no memory) returns null for prompt-ready payload.
- After `recordCharacterMention`, the character appears in the
  prompt-ready summary with its voice + tags preserved.
- Two consecutive reads return the same payload (determinism).
- A different `userId` does NOT see the character (isolation).

Failure means: a memory-store change broke write-then-read, lost
fields on read, or violated cross-user isolation. Look at:
`backend/lib/creative_memory_store.js`,
`backend/lib/persistence_json.js`.

### 4. v1_realtime_failover_smoke (realtime pillar)

`scripts/v1_realtime_failover_smoke.mjs` — exercises 4 failover
paths:

1. **primary_ok** — primary supplier mints successfully.
2. **primary_fail_fallback_ok** — primary fails, fallback (stub)
   takes over.
3. **primary_fail_fallback_fail** — both fail; correct error path.
4. **pinned_provider_fail** — explicit provider pin honored on
   failure (does NOT silently fall back).

Failure means: a realtime-supplier change broke the failover
ladder. Look at: `backend/lib/realtime_supplier_failover.js`,
`backend/lib/realtime_supplier_openai.js`.

### 5. v1_realtime_learned_answer_voice_smoke (realtime + memory pillars)

`backend/evals/run_realtime_learned_answer_voice_smoke.mjs` starts the owned
backend on loopback with a simulated realtime provider. It seeds a pending
screenplay question, speaks the question through the bridge simulator, commits
the writer's answer through the authenticated production-shaped route, refreshes
grounding, and verifies the next spoken reply uses the learned fact on the same
peer connection without repeating the resolved question.

Failure means: auth, durable memory, realtime turn commit, grounding refresh,
or the bridge's next-spoken-event contract regressed. It does not prove a live
provider's instruction adherence or acoustic voice quality. Look at:
`backend/evals/run_realtime_learned_answer_voice_smoke.mjs`,
`backend/lib/realtime_turn_commit_route.js`, and
`backend/lib/realtime_project_grounding_route.js`.

## How to run

### All canon evals + V1 smokes

```
cd backend
npm run eval:canon
```

Exit 0 = pass. Exit non-zero = read the failure log line-by-line.

### Just the V1 smokes

```
cd backend
npm run eval:v1-smokes
```

Or one at a time:

```
node ../scripts/v1_voice_to_page_smoke.mjs
node ../scripts/v1_screenplay_smoke.mjs
node ../scripts/v1_memory_recall_smoke.mjs
node ../scripts/v1_realtime_failover_smoke.mjs
npm run eval:v1-realtime-learned-answer-voice-smoke
```

The first four accept `--json` for machine-readable output. The fifth prints a
single structured JSON result followed by its pass marker.

### Just one smoke's test wrapper

```
node --test ../scripts/v1_voice_to_page_smoke.test.mjs
```

The `.test.mjs` wrapper spawns the smoke and asserts exit 0 +
expected output markers.

## Human V1 QA Checklist

The deterministic smokes do not replace the human pass through the app. Before
TestFlight or external review, generate the manual QA checklist and preflight
artifact:

```
node scripts/v1_manual_qa_checklist.mjs
node scripts/v1_manual_qa_checklist.mjs --write=docs/testflight-v1-preflight.md
```

The checklist covers the five manual V1 paths that still require a person:
voice-to-reply persistence, Studio save/export/reopen, creative-memory recall,
realtime primary/fallback behavior, and iPhone release readiness.

## How to interpret a failure

1. **Run the failing smoke standalone** to see its full output:
   ```
   node ../scripts/v1_<which>_smoke.mjs
   ```
2. **The smoke prints a structured findings list** under
   `--json`. Each finding has a `kind` field naming the
   specific invariant violated.
3. **Map the finding to a backend lib** using the per-smoke
   "Look at" line above.
4. **Reproduce by hand** with the same fixture — the fixture
   lives in `backend/fixtures/v1_<which>.json` (where applicable).

## V1 status reporter

For the broader V1 checklist (not just the deterministic smokes):

```
node scripts/v1_status.mjs            # markdown table
node scripts/v1_status.mjs --json     # machine-readable
node scripts/v1_status.mjs --pillar=talk
```

Reads `docs/v1-definition.md` and emits per-pillar completion %
and remaining items.

## iOS V1 UI smoke

The single integrated writer-loop contract is a required CI gate. It runs
against a temporary authenticated backend and fails if its XCUITest is skipped
or executes zero tests. The broader UI suite remains a soft gate because
several specialized stories intentionally depend on external fixtures.

Promotion evidence: the pre-existing iOS V1 UI smoke step completed
successfully on ten consecutive completed `main` runs before the integrated
contract became required. Superseded runs cancelled by workflow concurrency do
not count toward that total.

The `themUITests` target is a growing sequential suite; do not copy a hard-coded
test count into release claims. It includes onboarding, local demo/Apple
separation, Keychain relaunch, Talk-to-Page, Studio routing, export/restore,
memory, realtime, conflict, recovery, and writer-block stories. The app receives
`--ui-testing` launch arguments and uses explicit deterministic fixtures where
the story does not require an external server. Fixture-gated skips must stay
visible and never count as human signoff.

## What this runbook does NOT cover

- Visual polish and hardware-only iOS release proof. The sequential
  `themUITests` cover automated UI contracts; a human still signs off
  microphone/audio feel and final TestFlight behavior.
- LLM behavior. The V1 smokes deliberately avoid LLM calls — they
  pin shape and ordering, not semantics. LLM regression lives in
  the nightly regression eval (`eval:regression`).
- Production health. For live observability, see
  `docs/schemas/ops-health-summary.md` and
  `/ops/health/summary`.

## Updating the runbook

This is a project-owned Codex runbook. When a V1 smoke is added or its
invariants change, update both the smoke's header comment AND
the matching section here. Schema doc references in this runbook
must stay in lockstep with `docs/schemas/`.
