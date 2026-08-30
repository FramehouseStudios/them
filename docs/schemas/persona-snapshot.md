# persona-snapshot envelope schema

Canonical shape for a persona snapshot — the materialised view of
a user's writing-partner persona at a point in time. Produced by
`backend/lib/persona.js`'s snapshot helper; consumed by the talk
pipeline (`talk_pipeline.js`) for prompt assembly and by iOS to
display the active persona surface.

## Owner

- **Backend**: support agent. Snapshot shape defined in
  `backend/lib/persona.js`.
- **iOS**: Codex. Decoded into the persona-surface UI.

## Access-control posture

**PER-USER**. Personas carry user-authored content (name, voice,
notes). Treat as PII-adjacent; do not log full snapshots — log the
persona id and updated_at only.

## Schema version

`1`. Additive only.

## Snapshot fields

```json
{
  "persona_id": "p_abc",
  "user_id": "u_xyz",
  "name": "The Notebook",
  "voice": "warm, dryly funny, prone to tangents",
  "tone_hint": "warm",
  "self_name": "Notebook",
  "notes": "Prefers em-dashes. Avoids exclamation marks.",
  "updated_at": 1715620920000,
  "created_at": 1715000000000,
  "version": 7,
  "source": "user"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `persona_id` | string | yes | stable id for this persona record |
| `user_id` | string | yes | owner; ties snapshot to a single account |
| `name` | string | yes | display name shown in iOS |
| `voice` | string | no | short prose describing voice; max ~280 chars |
| `tone_hint` | string | no | one-word descriptor (`warm`, `dry`, `neutral`, etc.) used by prompt-assembly |
| `self_name` | string | no | name the assistant uses when referring to itself in talk turns |
| `notes` | string | no | freeform user-authored stylistic notes |
| `updated_at` | int | yes | epoch ms of last write |
| `created_at` | int | yes | epoch ms of first write |
| `version` | int | yes | monotonic counter; bumps on every write |
| `source` | string | yes | `"user"` \| `"system_default"` \| `"imported"` |

## Where it flows

1. **Read** — `talk_pipeline.js` reads the active snapshot per
   request to inject into the prompt-assembly stage.
2. **Write** — iOS PUTs to `/persona` (covered by
   `persona_routes`); backend bumps `version` + `updated_at`.
3. **Display** — iOS reads via `/persona` for the persona-surface
   UI; field set is stable.

## Invariants

- `version` is monotonic per persona_id. Concurrent writes lose
  cleanly — the higher version wins; tie-breaks by `updated_at`.
- `name` is required. Other text fields fall back to empty strings
  in prompt-assembly; never to `null`.
- `self_name`, when present, is the name the assistant uses for
  itself in `talk_pipeline` output — load-bearing for memory
  recall (the memory store keys character mentions by this name).

## Compatibility rules

- New optional text fields are tolerated by prompt-assembly.
- iOS keys on `name`, `voice`, `tone_hint`, `self_name`, `notes`,
  `updated_at`, `version`. Adding fields does not break the
  decoder.
- Removing or renaming any of those six fields requires a schema
  bump.

## Changelog

- v1 — initial documented shape. `self_name` is the key field
  that connects this envelope to the memory_store's character
  mention index.
