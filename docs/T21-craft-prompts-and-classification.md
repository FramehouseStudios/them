# T21 — Craft-aware Prompts & Beat Classification

**Status:** in-progress
**Owner:** claude
**Branch:** `claude/T21-craft-prompts-classification`
**Pillars:** voice-to-scene + living companion
**Builds on:** T17 (Swift models), T18 (backend schemas + endpoints), T22 (persistent reports + overrides), T08 (canonical prompt assembly)

## Goal

Two related deliverables:

1. **Craft-aware prompts.** Every screenplay page-write turn that hits `/talk` should give the model structural awareness — the active framework's required major turns, the user's coverage state, what's missing or drifting. The model writes scenes that fit the structure, not against it.
2. **Beat classifier with a real LLM mode.** Replace the deterministic stub in `craft_analysis.js` with a classifier interface that has two implementations — deterministic (the prior stub) and OpenAI-driven. Pick automatically based on `OPENAI_API_KEY` presence.

## Modules added

### `backend/lib/craft_prompts.js`

Two pure functions:

- `buildCraftContextBlock({ framework, report? })` — emits a compact `<craft>...</craft>` block summarizing the framework (id, summary, required major turns, required + first-N optional beats with expected page ranges) and the user's report coverage when present (counts, drift status, up to 3 missing-or-drifting major turns). Empty string when there's nothing useful to inject. No `<empty>` markers.
- `buildClassificationPromptBlock({ framework, scene })` — emits the `<classify_scene>...</classify_scene>` instruction the LLM beat classifier sends to the model. Embeds candidate beat IDs, scene title, scene excerpt (max 1200 chars), and the strict-JSON response contract.

### `backend/lib/craft_classifier.js`

Two implementations behind one interface:

```js
classifier.kind                     // "deterministic-stub" | "openai"
await classifier.classifyScreenplay({ framework, screenplay })
                                    // -> { beats[], majorTurns[], coverage,
                                    //      drift, source, [_classifyScene] }
await classifier.classifyScene({ framework, scene })  // LLM only
                                    // -> { beatId, confidence, rationale }
```

- `createDeterministicClassifier()` — the same logic the analyzeScreenplay stub used pre-T21. Always available. Source tag: `"deterministic-stub"`.
- `createLLMClassifier({ openaiApiKey, model, fetchImpl })` — calls `https://api.openai.com/v1/chat/completions` with `response_format: { type: "json_object" }` and `temperature: 0`. Tests inject a stub `fetchImpl` to exercise the path without a real network call.
- `createDefaultClassifier({ env, fetchImpl })` — picks LLM when `OPENAI_API_KEY` is set, deterministic otherwise. The high-frequency `analyzeScreenplay` path uses this; per-scene LLM calls run via `classifyScene` from evals or future foreground UX hooks.

The classifier output is intentionally a **partial** — `analyzeScreenplay` merges it with id generation, framework-derived expectedPage values, and the final Report shape. This lets us swap implementations without rewriting the report assembly.

### Wiring in `backend/index.js`

Two surgical edits:

1. New helper `appendCraftContextToSystem(systemPrompt, { req })` — defaults to the `save-the-cat` framework when the request body does not specify a `craft_framework_id`. Returns `${systemPrompt}\n\n${craftBlock}` when a block is produced; returns the prompt unchanged for unknown frameworks.
2. The existing T08 chain at line ~30826 now flows `systemBaseRaw → wrapSystemPromptWithCreativeMemory → appendCraftContextToSystem (only when isScreenplayPageWriteTurn) → systemBase`. Non-page-write turns are untouched.

### Eval — `backend/evals/run_craft_classification_eval.mjs`

Now runs in two modes:

- **Deterministic (default):** schema-shape and source-tag assertions plus a prompt-block format check. Always runs in CI.
- **LLM (when `OPENAI_API_KEY` is set, unless `--mode=deterministic`):** runs three labeled scenes through `classifyScene` and reports an accuracy summary. **Does not fail the gate on accuracy yet** — the labeled fixture is intentionally small while the contract is still settling. Once the labeled set matures, this becomes a hard gate.

## Verification

- `cd backend && node --test tests/craft_prompts_and_classifier.test.mjs` → 12 pass, 0 fail.
- `cd backend && npm test` → 98 pass / 1 skipped / 0 fail (full suite).
- `cd backend && node evals/run_craft_classification_eval.mjs` → all deterministic-mode checks pass; LLM mode skipped without `OPENAI_API_KEY` (expected).
- `npm run eval:gate` → not run in worktree; gate requires backend boot with secrets.

## Follow-up: per-scene cache (added 2026-05-09)

`backend/lib/craft_scene_cache.js` adds an opportunistic per-scene
classification cache so per-scene LLM calls don't re-fire for unchanged
scenes. The cache is independent of the classifier — callers compose:

```js
import { createCraftSceneCache } from "./lib/craft_scene_cache.js";
import { createDefaultClassifier } from "./lib/craft_classifier.js";
import { createPersistence } from "./lib/persistence_adapter.js";

const cache = createCraftSceneCache({ persistence: createPersistence() });
const classifier = createDefaultClassifier();

const results = await cache.classifyWithCache({
  frameworkId: "save-the-cat",
  scenes,
  classifyOne: (scene) =>
    classifier.classifyScene({ framework: "save-the-cat", scene }),
});
// results[i] = { scene, value, fromCache, hash, [error] }
```

- Key shape: `<frameworkId>:<sceneContentHash>` where the hash is sha-256
  over a normalized scene representation (title + content text;
  trailing-whitespace and CRLF tolerant).
- Storage: persistence adapter under `domain="craft_classifications"`
  (Postgres in prod via the new `004_craft_classifications.sql`
  migration; JSON-file otherwise).
- TTL: optional via `ttlMs`. Default 0 means cache entries never
  expire; callers that want freshness pass a TTL.
- Cache writes are best-effort — a write failure logs and the
  classification still returns to the caller.
- Bulk path `classifyWithCache(...)` aligns results array with the
  input scenes, returning `{ scene, value, fromCache, hash }` per
  position. Per-scene errors land in the position rather than
  aborting the whole batch.

Different `frameworkId` → different cache entry for the same scene.
This is by design: a scene's beat assignment depends on the framework,
so cache hits must be framework-scoped.

## What is NOT in this PR

- **Per-scene LLM calls during `analyzeScreenplay`.** The high-frequency analyze path stays bounded — it uses the deterministic source tag and macro coverage. Per-scene LLM calls happen via `classifyScene` from evals and future explicit triggers. If/when fast per-scene classification is needed at analyze-time, it lands in a follow-up that adds caching by scene-content hash.
- **Accuracy gating.** Until the labeled fixture matures, the eval reports accuracy but does not block on it.
- **Structure-help endpoint.** The original done-when mentioned "structure-help" prompts; that endpoint does not exist on `main`. The craft-context block is built and ready; wiring an endpoint that uses it can be a focused follow-up once a UX surface needs it.

## Done when (recap)

- [x] `backend/lib/craft_prompts.js` exposes `buildCraftContextBlock` and `buildClassificationPromptBlock`.
- [x] `backend/lib/craft_classifier.js` exposes deterministic and LLM implementations behind one interface.
- [x] Page-write `/talk` turns receive a craft-context block in their system prompt.
- [x] Eval runs in deterministic mode (default) and LLM mode (when key is set).
- [x] 12 new unit tests pass; full suite remains green.
- [ ] LLM accuracy gate — deferred until the labeled fixture matures.
