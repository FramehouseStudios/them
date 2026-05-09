# T08 — Prompt Centralization & Creative Memory Tier (Backend)

**Status:** in-progress
**Owner:** claude
**Branch:** `claude/backend-T08-memory-tier`
**Pillars:** living companion + longitudinal learning (D002)
**Related:** D001, D002, D003. Sibling follow-up: iOS prompt-path consolidation through `ScreenplayPromptBuilder` — Codex to own when the dirty iOS state lands on `main`.

## Problem

The audit identified two related gaps:

1. **Decentralized prompts metastasize.** Multiple prompt-construction sites are a defect generator. The system needs one path that produces every model-bound prompt.
2. **No visible memory tier means the companion is amnesiac.** Per the north star (D002), the companion must learn the user's *style, characters, tone, and creative habits over time.* Without a structured longitudinal memory, the companion is a stateless text generator.

Both are addressed by giving the backend a single prompt-assembly surface that always carries a structured per-user creative memory record.

## Current state (as of branch base)

| Component | File | Notes |
|---|---|---|
| In-process memory | `backend/lib/memory_store.js` (559 LOC) | Rich domain memory keyed by `userId` / IP / `clientToken`: rememberedPeople, social sparks, personality signals, affection style. **In-memory only.** Persistence is a JSON file (`backend/user_memory_store.json`) which is gitignored and brittle. |
| Persona prompts | `backend/lib/persona.js:97` (`prompts: Object.freeze({...})`) | Persona prompts already mention "memory continuity" — but only as instruction. Memory is not yet **injected** as structured context. |
| Generation entry point | `backend/index.js:29032` `handleTalkRequest` | Lives inside a 30k+ line file. Surgical edits only — refactoring index.js is out of scope for T08. |
| iOS prompt builder | `ScreenplayPromptBuilder` (Swift) | Referenced in T08's original done-when. **Not on `main`** yet — lives in the dirty G3 work-in-progress. iOS centralization waits for that to land. |

## Scope of T08

### In scope (this task)

1. **Creative-companion memory schema.** A new structured record per user that captures the four pillars of longitudinal learning: style, characters, tone, habits.
2. **Persistence (MVP).** JSON-file-backed initially; same brittleness as the existing `memory_store`. Acceptable bootstrap.
3. **Postgres adapter (target).** A thin write-side adapter so when T07 (Postgres canonical) lands, the persistence layer swaps without changing the read API.
4. **Read API.** A single pure function `getCreativeMemoryForPrompt({ userId })` returning either the user's record or an empty default. Cold-start safe.
5. **Write triggers.** Inline updates from `handleTalkRequest` post-processing on character mention, scene completion, tone signal, session end.
6. **Single prompt-assembly entry.** `buildModelPrompt({ persona, creativeMemory, userInput, sessionContext })` becomes the **only** function called from `handleTalkRequest` to produce a model-bound prompt.
7. **Eval coverage.** A new `backend/evals/run_creative_memory_eval.mjs` covering memory-present and memory-absent regression cases. Wired into `eval:gate`.

### Out of scope

- iOS-side prompt path consolidation (Codex follow-up).
- Postgres migration of the existing `memory_store.js` emotion/persona memory (separate task; T07-adjacent).
- Real-time streaming UI changes.
- Cross-session re-attention features (longer-term).
- Refactoring `backend/index.js` (independent debt).

## Schema — `CreativeMemory` v1

```jsonc
{
  "userId": "string — stable user identity",
  "version": 1,
  "updatedAt": 1746834000,
  "style": {
    "preferredTone": "wry | tender | hardboiled | clinical | manic | ...",
    "sentenceLengthBias": "short | medium | long",
    "preferredFormatting": "fountain | industry-standard | beat-sheet | ...",
    "lexicalFingerprint": ["recurring", "phrases", "characteristic", "of", "the", "user"]
  },
  "characters": [
    {
      "name": "string",
      "voice": "free-text characterization",
      "first_seen": 1746000000,
      "last_referenced": 1746834000,
      "tags": ["protagonist", "comic relief", "antagonist", "..."]
    }
  ],
  "tone": {
    "emotional_default": "string — the room temperature the user writes at",
    "humor_register": "absurd | dry | none | ...",
    "violence_tolerance": "low | medium | high"
  },
  "habits": {
    "session_pattern": "morning | late-night | burst | sporadic",
    "page_completion_rate": 0.62,
    "preferred_scene_length_pages": 2.3,
    "abandonment_signals": ["string descriptors of patterns leading to user drop-off"]
  }
}
```

### Schema rules

- Every field is optional. A new user has `{ userId, version: 1, updatedAt, style: {}, characters: [], tone: {}, habits: {} }`.
- `version: 1` is the migration anchor. Schema changes bump this and add a migrator.
- `updatedAt` is monotonic. Stale writes are rejected.
- `lexicalFingerprint` is bounded (max 64 phrases). Older phrases evict by recency × frequency.
- `characters` is bounded (max 32 active). Eviction by `last_referenced`.
- Empty fields are **omitted** when serialized into prompts (never injected as `<empty>`).

## Files to add / modify

| File | Action | Purpose |
|---|---|---|
| `backend/lib/creative_memory_store.js` | new | Read/write API, JSON persistence (MVP), Postgres adapter slot. |
| `backend/lib/prompt_assembly.js` | new | `buildModelPrompt(...)` — the only prompt-construction path. |
| `backend/lib/persona.js` | modify | Expose persona prompt template as a pure value consumable by `prompt_assembly`. No behavior change. |
| `backend/index.js` | modify (surgical) | `handleTalkRequest` calls `buildModelPrompt` instead of any inline prompt assembly. Write triggers fire from post-processing. |
| `backend/evals/run_creative_memory_eval.mjs` | new | Two-case regression: memory-present, memory-absent. |
| `backend/package.json` | modify | Add `eval:creative-memory` script; ensure `eval:gate` invokes it. |
| `backend/creative_memory_store.json` | new (gitignored) | MVP persistence file. Listed in `.gitignore` as user data. |
| `.gitignore` | modify | Add `backend/creative_memory_store.json`. |
| `docs/T08-prompt-centralization-and-memory-tier.md` | this file | Design + final shipped state. |

## API sketches

### Read

```js
// backend/lib/creative_memory_store.js
function getCreativeMemoryForPrompt({ userId }) {
  // returns CreativeMemory or null. Never throws on missing user.
}
```

### Write triggers

```js
function recordCharacterMention({ userId, characterName, sourceTurn }) { ... }
function recordSceneCompletion({ userId, scenePageCount }) { ... }
function recordToneSignal({ userId, signal }) { ... }
function recordSessionEnd({ userId, sessionDurationMs, sessionStartedAt }) { ... }
```

Each trigger is idempotent within a turn (debounced) and fast (no model call).

### Prompt assembly

```js
// backend/lib/prompt_assembly.js
function buildModelPrompt({ persona, creativeMemory, userInput, sessionContext }) {
  // returns string — the final model-bound prompt.
  // Memory block is injected immediately before user input.
  // Empty memory is silently omitted.
}
```

## Integration with `handleTalkRequest`

Before:

```js
async function handleTalkRequest(req, res) {
  // ... auth, rate limits, idempotency ...
  const personaPrompt = composePersonaPrompt(...);  // existing scattered logic
  const reply = await callModel(personaPrompt + userInput);
  // ...
}
```

After:

```js
async function handleTalkRequest(req, res) {
  // ... auth, rate limits, idempotency ...
  const creativeMemory = getCreativeMemoryForPrompt({ userId });
  const prompt = buildModelPrompt({
    persona: getPersonaForUser(userId),
    creativeMemory,
    userInput: req.body.text,
    sessionContext: getSessionContext(req),
  });
  const reply = await callModel(prompt);

  // post-processing: write triggers
  detectAndRecordCharacterMentions({ userId, transcript: req.body.text, reply });
  if (sceneCompleted(reply)) recordSceneCompletion({ userId, scenePageCount: pageCount(reply) });
  // ...
}
```

The diff against `index.js:29032` should be **small and reviewable** — no logic moves except the prompt-construction line, which becomes a single function call.

## Eval — `run_creative_memory_eval.mjs`

Two cases:

1. **Memory-present.** Seed a test user with a `CreativeMemory` containing one character, one tone preference, one habit. Submit a deliberately ambiguous prompt. Assert: the model's reply references at least one memory element OR the prompt sent to the model contains the expected memory block (the latter is more deterministic).
2. **Memory-absent.** Cold user. Submit the same prompt. Assert: the prompt sent to the model contains **no** memory block; the reply does not hallucinate a memory element.

Both run against the existing prompt-regression infrastructure. Wire into `eval:gate` so future regressions are caught.

## Sequencing of follow-up commits

This branch will land in five reviewable commits:

1. `T08: claim row, narrow scope to backend memory tier` *(this commit + the design doc commit, already done)*
2. `T08: add creative_memory_store with schema and JSON persistence`
3. `T08: add prompt_assembly.buildModelPrompt as the single path`
4. `T08: wire handleTalkRequest to buildModelPrompt + write triggers`
5. `T08: add run_creative_memory_eval and wire into eval:gate; finalize docs`

Each commit is independently reviewable. The PR opens after commit 5 and references this design doc.

## Open questions

1. **Coexistence with `memory_store.js`.** The existing 559-line memory store models personality, social sparks, rememberedPeople. Should creative memory subsume it, or stay alongside? **Proposed: alongside.** Different domain (chat companion vs. creative-writing companion); subsumption requires refactoring 559 lines of working memory and is not in this task. The existing `rememberedPeople` may eventually inform `creativeMemory.characters`, but not in T08.
2. **T07 ordering.** T07 (Postgres canonical) is independently `ready-for-claude`. If T07 lands first, T08's persistence adapter targets Postgres directly. If T07 lands second, T08 ships JSON and migrates later. Either order works.
3. **Tone-signal source.** What's the trigger for tone preference detection — explicit user setting, or implicit signal from accept/reject patterns? **MVP assumes implicit.** Explicit setting can be added later without schema changes (a `tone.userOverride` field).
4. **iOS coordination.** Once Codex centralizes iOS prompt assembly, the iOS-side `ScreenplayPromptBuilder` should call a backend endpoint that returns `{ prompt: string }` rather than constructing prompts client-side. This keeps the backend as the single source of truth. Not in T08; Codex follow-up will define the contract.

## Done when (recap)

- [x] `backend/lib/creative_memory_store.js` exists with read/write API and JSON persistence.
- [x] Schema documented at the top of the file; helper functions for the four pillar write triggers (`recordCharacterMention`, `recordSceneCompletion` + `recordSceneAttempt`, `recordToneSignal`, `recordSessionEnd`, `recordLexicalFingerprint`).
- [x] `backend/lib/prompt_assembly.js` exposes `buildModelPrompt(...)` as the canonical prompt-construction function.
- [x] `backend/evals/run_creative_memory_eval.mjs` exists; both memory-present and memory-absent cases pass.
- [x] `backend/tests/creative_memory_and_prompt_assembly.test.mjs` covers both modules (15 tests, all pass).
- [ ] **Wire `handleTalkRequest` to call `buildModelPrompt` and write triggers.** Deferred to a focused follow-up PR — see "Final shipped state" below.
- [ ] `npm run eval:gate` green. Deferred to CI; gate requires backend boot with secrets and the `handleTalkRequest` wiring landed.
- [x] This file updated with final shipped state (post-implementation summary).

## Final shipped state (this PR)

Five reviewable commits on `claude/backend-T08-memory-tier`:

1. **T08 row claim** — TASKS.md update.
2. **Design doc** — `docs/T08-prompt-centralization-and-memory-tier.md` (this file's pre-implementation version).
3. **`creative_memory_store.js`** — file-backed MVP with the full schema, six write triggers, and the read API used by prompt assembly.
4. **`prompt_assembly.js`** — `buildModelPrompt(...)` as the canonical entry point. Memory-absent users produce no memory block (no `<empty>` markers, no null serialization). Memory-present users get a compact, model-friendly block ordered: persona → memory → session → user.
5. **Tests + eval + final docs** — 15 node:test unit tests covering both modules, 9-case eval skeleton, this doc updated, `eval:creative-memory` script added.

### What is intentionally NOT in this PR

- **`handleTalkRequest` wiring.** The two-line edit that calls `buildModelPrompt(...)` and the post-processing that fires the write triggers is a follow-up commit on its own branch, since it touches the 30k-line `backend/index.js`. The follow-up's diff against the current `index.js` should be small and surgical, mirroring the T18 pattern.
- **Postgres-backed persistence.** When [T07](../../docs/T07-persistence-canonical.md) lands, a small follow-up swaps the file I/O in `creative_memory_store.js` for `createPersistence({ ... })` calls without changing the public API.
- **iOS-side prompt-path consolidation.** `ScreenplayPromptBuilder` consolidation is Codex's follow-up; the contract that the iOS side will route through the backend's `buildModelPrompt` is now established here.

### Verification

- `cd backend && node --test tests/creative_memory_and_prompt_assembly.test.mjs` → 15 pass, 0 fail.
- `cd backend && node evals/run_creative_memory_eval.mjs` → 9 pass.
- `npm run eval:gate` is **not** run in this PR — gate requires backend boot with secrets and the `handleTalkRequest` wiring; this PR adds the modules but does not yet wire them into `/talk`. The follow-up wiring PR will run the gate.
