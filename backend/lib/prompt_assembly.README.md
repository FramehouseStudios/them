# prompt_assembly.js — canonical prompt builder

`buildModelPrompt({ persona, creativeMemory, userInput, sessionContext, screenplayTask, acceptedTwists, blockCoaching })`
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

<feature_film_map>  (when screenplay task or feature context needs it)
  act_ladder:
  act_bridge_ladder:
  expert_scene_execution:
  feature_completion_protocol:
</feature_film_map>

<accepted_twists>   (only when accepted twist cards are supplied)
  - ...
</accepted_twists>

<screenplay_task>   (only when a screenplay task is supplied/inferred)
  intent: ...
  role: Clementine is an elite cinematic writing partner...
  mode_guidance: ...
</screenplay_task>

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
| Block ordering is exactly persona → memory → session → feature-map → accepted-twists → screenplay-task → block-signal → input | PR #112 `T-prompt-assembly-snapshot-eval` |
| Heavy user prompt stays under 12,000 chars | PR #110 `T-prompt-size-eval` |
| `<block_signal>` block stays under 12,000 chars even with pathological summary | PR #141 `T-prompt-assembly-block-signal-cap-eval` |
| Screenplay prompts carry Act I/II/III feature-continuity, feature-scale page-batch discipline, expert scene execution, subtext/image-system, and page-first speed obligations | `run_screenplay_quality_eval.mjs` |
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
Project/session object. At minimum this can be `{ projectId,
versionId, scene }`, but screenplay mode also consumes fields such as
`act`, `pageCount`, `targetPages`, `draftExcerpt`, `currentBeat`,
`sceneObjective`, `logline`, `themeArgument`, `protagonistWant`,
`protagonistNeed`, `endingImage`, `nextSceneMoves`,
`unresolvedSetups`, and `continuityNotes`.

When feature-scale context is present, `buildModelPrompt(...)` also
emits a `<feature_film_map>` block with act ladder, sequence pressure,
expert scene execution, and feature-completion protocol.

### `screenplayTask`
Object returned by `inferScreenplayTask(...)`, or any compatible
`{ intent, label, output }` object. When present, emits
`<screenplay_task>` after story context and before writer-facing block
coaching. This is where Clementine's mode-specific writing contract is
declared for scene writing, rewriting, continuation, scene doctor,
dialogue punch-up, feature completion, pacing, and emotional
continuity.

### `acceptedTwists`
Optional accepted reversal/twist cards. When present, emits
`<accepted_twists>` after feature/session context and before
`<screenplay_task>`.

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
- `backend/evals/run_screenplay_quality_eval.mjs` — deterministic Act I/II/III and screenplay-task quality fixtures.
- `backend/evals/run_block_signal_block_cap_eval.mjs` — pathological-summary test.
- `backend/evals/run_memory_quality_eval.mjs` — multi-turn recall test.
