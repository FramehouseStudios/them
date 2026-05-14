# screenplay-prompt-build envelope schema

Canonical request + response shape for `POST
/screenplay/prompt/build` — the prompt-assembly endpoint iOS
can call to preview the prompt the talk pipeline would send to
the LLM. Useful for iOS-side prompt inspection + craft context
testing without invoking the full talk turn.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/screenplay/prompt/build` | 200 envelope, 400 missing both fields |

## Schema version

`1`. Envelope carries `schema_version` from
`PROMPT_SCHEMA_VERSION` exported alongside the route.

## Owner

- **Backend**: Claude. Route in `backend/lib/prompt_routes.js`.
- **iOS**: Codex. Powers the "preview prompt" Studio surface.

## Access-control posture

**PER-USER**. User id resolved via `resolvePromptUserId(req)`;
creative memory pulled per-user if available.

## Request shape

```json
{
  "persona": "<system prompt>",
  "user_input": "<user message>",
  "session_context": { /* sessionContext object */ },
  "include_craft_context": false,
  "craft_framework_id": "save-the-cat"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `persona` | string | yes (or `user_input`) | clamped to 16,000 chars; accepts `system_prompt` + `systemPrompt` fallbacks |
| `user_input` | string | yes (or `persona`) | clamped to 8,000 chars; accepts `userInput` + `transcript` fallbacks |
| `session_context` | object | no | passed through `sanitizeSessionContext`; accepts `sessionContext` fallback |
| `include_craft_context` | bool | no | when true, appends a craft-framework block to the prompt; accepts `includeCraftContext` fallback |
| `craft_framework_id` | string | no | clamped to 96 chars; defaults to `"save-the-cat"`; accepts `craftFrameworkId` fallback |

At least one of `persona` or `user_input` must be non-empty
after trim — otherwise 400.

## Response shape (200)

```json
{
  "ok": true,
  "action": "screenplay_prompt_build",
  "schema_version": 1,
  "source": "buildModelPrompt",
  "prompt": "<assembled prompt text>",
  "memory_applied": true,
  "session_context_applied": false,
  "craft_context_applied": false,
  "craft_framework_id": ""
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | bool | yes | constant `true` |
| `action` | string | yes | constant `"screenplay_prompt_build"` |
| `schema_version` | int | yes | `PROMPT_SCHEMA_VERSION` |
| `source` | string | yes | constant `"buildModelPrompt"` |
| `prompt` | string | yes | full assembled prompt text |
| `memory_applied` | bool | yes | true when the creative_memory lookup returned a memory blob |
| `session_context_applied` | bool | yes | true when `sanitizeSessionContext` returned a non-null result |
| `craft_context_applied` | bool | yes | true when `include_craft_context` was set AND `buildCraftContextBlock` returned a non-empty string |
| `craft_framework_id` | string | yes | echoed framework id when craft block applied; empty string otherwise |

## Errors

| HTTP | `error` | Cause |
| --- | --- | --- |
| 400 | `"Provide persona or user_input."` | both fields empty after trim |

Stage on error: `"screenplay_prompt_build"`.

## Invariants

- The route does NOT call the LLM; it only assembles prompt
  text. No side effects on creative memory or session state.
- `memory_applied` / `session_context_applied` /
  `craft_context_applied` are flags — iOS can decide whether to
  show "memory included" badges in the preview UI without
  parsing the full prompt body.
- `craft_context_applied` requires BOTH `include_craft_context`
  AND a successful `buildCraftContextBlock` result.
- When `include_craft_context` is false, `craft_framework_id`
  in the response is the empty string regardless of what the
  request sent.

## Compatibility rules

- iOS keys on `prompt` and the three `*_applied` boolean flags.
- Adding new optional flags is tolerated.
- Removing `prompt`, `schema_version`, or any flag requires a
  schema bump.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  `mountPromptRoutes` in `backend/lib/prompt_routes.js`.
