# T-trait-library — Per-character voice/trait inventory

Layer 2 of the Craft Intelligence Suite. Gives every character on a
user's creative-memory record a `traits` object so the prompt-assembly
path can render a voice-aware system block (anxious, terse, fragmented
syntax, etc.) without per-scene prompting.

## North-star pillar
**Living creative companion** + **longitudinal learning**. The
character voice the user wrote yesterday should still feel like the
same character today.

## Architecture

Three pieces, all backend-only:

1. **`backend/lib/trait_library.js`** — pure, deterministic.
   - `extractTraits({ characterName, lines, hint? })` → Traits
   - `mergeTraits(existing, next)` — idempotent + bounded
   - `buildTraitsBlockForPrompt(traits)` — compact one-line summary
     suitable for embedding in the existing system prompt.
2. **Additive `traits` field on `creative_memory.characters[]`** —
   stored when `recordCharacterMention(..., traits)` is called. Merged
   via `trait_library.mergeTraits`. No new persistence domain.
3. **Two endpoints**:
   - `POST /memory/character-trait` records a trait delta (either
     pre-extracted `traits` or `lines` + optional `hint`).
   - `GET /memory/character-traits?characterName=` returns one or all
     characters for the requesting user.

## Trait shape

```
{
  schemaVersion: 1,
  vocabulary: string[],         // recurring short phrases (2-8 words)
  keywords: string[],           // adjective/role tags
  speech_style: {
    pace: "terse" | "measured" | "ornate" | "",
    syntax: "fragmented" | "flowing" | "declarative" | ""
  },
  emotional_default: string,
  goals: string[],
  relationships: { [name: string]: string }
}
```

## Extraction heuristics (deterministic, no LLM)

- **Vocabulary** — sentence-fragment splits, kept if 2–8 words; deduped
  case-insensitively; capped at 12.
- **Keywords** — bounded canonical trait vocabulary (anxious, weary,
  guarded, etc.) detected in lowercased word stream. `hint.keywords`
  always wins.
- **Speech style** — avg words/sentence determines pace (`terse` ≤5,
  `measured`, `ornate` ≥14); fragment rate ≥0.5 → `fragmented`,
  long avg → `flowing`, otherwise `declarative`.
- **Emotional default** — mapped from the strongest present keyword
  (anxious → anxious, haunted → haunted, ambitious → driven, etc.).
- **Goals / relationships** — caller-supplied via `hint`. The
  extractor doesn't try to infer narrative intent from dialogue.

## Merge semantics

`mergeTraits(existing, next)` is the canonical merge — idempotent and
bounded:
- Arrays union + dedupe + cap (VOCAB_MAX=12, KEYWORD_MAX=16,
  GOALS_MAX=8).
- Speech style: newer non-empty wins per field; empty falls back to
  existing.
- Emotional default: newer non-empty wins.
- Relationships: shallow object merge; capped at 24 entries; value
  trimmed to 120 chars.

The same `next` applied twice yields the same merged record — safe to
call from an iOS retry path or a backend write trigger.

## Endpoint contracts

### `POST /memory/character-trait`

```
Request:
  character_name | characterName   string (required)
  lines          string[]?         dialogue lines → extractTraits
  hint           { keywords?, goals?, relationships? }?
  traits         Traits?           pre-extracted; overrides extraction
                                   for the supplied fields

Response (200 unless validation fails):
  {
    ok: boolean,
    action: "recorded" | "updated" | "skipped" | "rejected",
    characterName: string,
    traits: Traits | null
  }
```

When both `traits` and `lines` are supplied, the explicit `traits`
wins over the inferred subset (caller-asserted facts beat the
extractor).

### `GET /memory/character-traits?characterName=<name>`

```
Response (200):
  {
    schemaVersion: 1,
    userId: string | null,
    characters: [{ name: string, traits: Traits | null }]
  }
```

Omitting `characterName` returns the full library. Unknown users
return `characters: []`.

## Prompt integration

The existing `wrapSystemPromptWithCreativeMemory` reads
`characters[]` from creative memory and feeds it into
`buildModelPrompt`. With `traits` populated, the prompt assembly path
gets per-character voice context for free — no new wiring. The
`buildTraitsBlockForPrompt` helper exists for callers that want a
compact one-liner per character; the default prompt-assembly path
keeps using the full object.

## Tests

`backend/tests/trait_library.test.mjs` — 21 tests:
- 12 pure module unit tests (extract on empty, vocabulary dedupe,
  keyword detection, hint precedence, terse/ornate pace inference,
  emotional default mapping, hint.goals + relationships, mergeTraits
  idempotence, mergeTraits caps, speech_style newest-wins,
  buildTraitsBlockForPrompt format).
- 2 trigger-effect tests (recordCharacterMention persists traits;
  subsequent calls merge).
- 7 endpoint integration tests (extract+persist, pre-extracted
  payload, missing payload rejected, empty name rejected, full
  library fetch, single-character fetch, unauthenticated → 200 +
  skipped).

## iOS follow-up (Codex)

Natural Codex follow-ups (out of scope for this PR):
1. iOS extractor that surfaces canonical traits from rendered
   dialogue and POSTs to `/memory/character-trait`.
2. Studio side-rail that consumes `GET /memory/character-traits`
   and lets the writer edit traits inline (writes back via the same
   POST).
