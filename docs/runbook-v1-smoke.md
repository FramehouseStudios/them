# V1 smoke runbook

Operator-facing reference for the V1 smoke suite — what each smoke
verifies, how to run them, what failure means, and where to look
when something breaks.

## TL;DR

```
cd backend
npm run eval:canon
```

→ All canon evals + all 4 V1 smokes pass. Exit 0 means V1 is safe
to ship from a deterministic-tripwire perspective. (It does not
mean iOS works — that's a human manual smoke.)

## Where this fits

V1 is defined by `docs/v1-definition.md`'s 25-item checklist. The
deterministic subset of that checklist — the parts that can be
verified without an iOS device or external API — is captured in
the V1 smoke chain wired into `eval:canon` (#235).

`eval:canon` runs in CI on every PR. A green `eval:canon` means
no deterministic regression sneaked in. A red `eval:canon` means
some piece of V1's deterministic tripwire fired and the PR
should not merge until it's understood.

## The 4 V1 smokes

Each smoke is deterministic: no clocks, no random ids, no network,
no LLM calls. Same input always produces the same output.

### 1. v1_voice_to_page_smoke (talk pillar)

`scripts/v1_voice_to_page_smoke.mjs` — feeds a canonical fixture
through the talk-pipeline stages (transcript → prompt-assembly →
response shape → memory-stamp). Verifies:

- Response envelope keys match `docs/schemas/talk-response.md`.
- Meta block matches `docs/schemas/talk-turn-meta.md`.
- Block-signal stamping fires when fixture content triggers it.
- Memory record is enqueued.

Failure means: a talk-pipeline change broke envelope shape or
stamping. Look at: `backend/lib/talk_pipeline.js`,
`backend/fixtures/v1_voice_to_page.json`.

### 2. v1_screenplay_smoke (screenplay pillar)

`scripts/v1_screenplay_smoke.mjs` — runs `exportToFountain` on a
canonical project fixture. Verifies:

- Output contains scenes in document order.
- Character lines render before action lines under the same scene.
- Transitions render between scenes.
- Two consecutive runs on the same input produce byte-identical
  output (determinism).

Failure means: a fountain-export change broke ordering, character
rendering, or determinism. Look at: `backend/lib/fountain_export.js`,
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
node scripts/v1_voice_to_page_smoke.mjs
node scripts/v1_screenplay_smoke.mjs
node scripts/v1_memory_recall_smoke.mjs
node scripts/v1_realtime_failover_smoke.mjs
```

All four accept `--json` for machine-readable output.

### Just one smoke's test wrapper

```
node --test scripts/v1_voice_to_page_smoke.test.mjs
```

The `.test.mjs` wrapper spawns the smoke and asserts exit 0 +
expected output markers.

## How to interpret a failure

1. **Run the failing smoke standalone** to see its full output:
   ```
   node scripts/v1_<which>_smoke.mjs
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

## What this runbook does NOT cover

- iOS-side manual smokes (record voice → reply → save → reopen).
  Those are human-in-the-loop and tracked in
  `docs/v1-definition.md`'s "Manual smoke" lines.
- LLM behavior. The V1 smokes deliberately avoid LLM calls — they
  pin shape and ordering, not semantics. LLM regression lives in
  the nightly regression eval (`eval:regression`).
- Production health. For live observability, see
  `docs/schemas/ops-health-summary.md` and
  `/ops/health/summary`.

## Updating the runbook

This doc is owned by Claude. When a V1 smoke is added or its
invariants change, update both the smoke's header comment AND
the matching section here. Schema doc references in this runbook
must stay in lockstep with `docs/schemas/`.
