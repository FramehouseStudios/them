# prompt_assembly.js — canonical prompt builder

`buildModelPrompt({ persona, creativeMemory, userInput, sessionContext, blockCoaching })`
is the single entry point every model-bound prompt the backend
constructs goes through.

This README documents the canonical layout so a future change
doesn't accidentally drift from what iOS, the prompt-regression
baseline, and the model-attention assumptions all depend on.

## Canonical block order

The function concatenates blocks in this strict order:

```
<persona>           (free-form string, no tag wrapper)

<creative_memory>   (only when memory present)
  style:            (optional)
  recurring-characters:
  tone:
  habits:
</creative_memory>

<session>           (only when sessionContext supplied)
  project: ...
  version: ...
  scene: ...
</session>

<block_signal>      (only when blockCoaching non-empty)
  writer-coaching-note:
    observation: ...
    tone: ...
    ask: ...
</block_signal>

<userInput>         (free-form string, no tag wrapper)
```

Each section is separated by a blank line (`\n\n`). Optional blocks
drop out cleanly when their input is absent — no empty tag stays
behind.

## Pinned invariants (load-bearing)

| Invariant | Pinned by |
|---|---|
| Block ordering is exactly persona → memory → session → block-signal → input | PR #112 `T-prompt-assembly-snapshot-eval` |
| Heavy user prompt stays under 12,000 chars | PR #110 `T-prompt-size-eval` |
| `<block_signal>` block stays under 12,000 chars even with pathological summary | PR #141 `T-prompt-assembly-block-signal-cap-eval` |
| Cold user prompt has no memory block | PR #112 + run_creative_memory_eval |
| Multi-turn recall: memory recorded in turn N appears in turn N+1's prompt | PR #105 `T-memory-quality-eval` |
| Per-user isolation: prompt for user A never contains user B's memory | PR #105 |
| Top-8 character cap holds even with 50 recorded characters | PR #110 |

## Field reference

### `persona`
Free-form string emitted verbatim at the top. No tag wrapper. Empty
string → no persona line emitted.

### `creativeMemory`
Object from `creative_memory_store.getCreativeMemoryForPrompt`.
`null` → no `<creative_memory>` block emitted.

When present, the helpers in `prompt_assembly.js` serialize sub-
sections in this order:

1. `style` — `serializeStyle(...)`: emits `style:` with preferred
   tone, sentence-length bias, formatting, and the last 12 entries
   of `lexicalFingerprint`.
2. `characters` — `serializeCharacters(...)`: emits
   `recurring-characters:` with up to 8 characters, sorted by
   `last_referenced` desc. Each line is `  - <name> [tags] —
   <voice>`.
3. `tone` — `serializeTone(...)`: emits `tone:` with
   `emotional_default`, `humor_register`, `violence_tolerance`.
4. `habits` — `serializeHabits(...)`: emits `habits:` with
   `session_pattern`, `preferred_scene_length_pages`,
   `page_completion_rate`.

Empty sub-sections are dropped.

### `sessionContext`
`{ projectId, versionId, scene }`. `null` → no `<session>` block.

### `blockCoaching`
String from `block_detector.buildBlockCoachingBlockForPrompt(signal)`.
Empty string → no `<block_signal>` block.

### `userInput`
Free-form string emitted verbatim at the bottom. No tag wrapper.

## Changing the layout

Any change to:
- The order of blocks
- The set of blocks
- The names of opening / closing tags (`<creative_memory>` etc.)
- The default `render_contract` keys

MUST also update PR #112's snapshot eval in the same PR, plus this
README. The eval intentionally compares the rendered output against
a literal expected string so silent reordering fails fast.

## Related modules

- `backend/lib/creative_memory_store.js` — `getCreativeMemoryForPrompt`
  source of truth for the memory shape.
- `backend/lib/block_detector.js` — `buildBlockCoachingBlockForPrompt`
  source of truth for the coaching block contents.
- `backend/evals/run_prompt_assembly_snapshot_eval.mjs` — snapshot test.
- `backend/evals/run_prompt_size_eval.mjs` — size-budget test.
- `backend/evals/run_block_signal_block_cap_eval.mjs` — pathological-summary test.
- `backend/evals/run_memory_quality_eval.mjs` — multi-turn recall test.
