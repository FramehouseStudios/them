# visual-context envelope schema

Canonical request + response shape for `POST /visual/context` —
the vision-context surface that summarizes a screenshot iOS
provides so the talk pipeline can ground replies in what the
user is looking at.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/visual/context` | 200 visual-context envelope, 4xx/5xx error envelopes |

Body limit: `2mb` (base64-encoded image payload). Mounted behind
`requireClientTokenForTalk` — the same session/token middleware
used by the talk pipeline.

## Schema version

`1`. No explicit `schemaVersion` field in the envelope today;
iOS keys off the field set itself.

## Owner

- **Backend**: support agent. Inline handler in `backend/index.js`
  (no extraction yet; not in any phase of the 5b/6 decomp
  chain).
- **iOS**: Codex. Captures the screenshot, base64-encodes,
  POSTs.

## Access-control posture

**TIER-3 SENSITIVE**. The image payload may contain anything on
the user's screen — including credentials, PII, or other-app
content. The route uses `requireClientTokenForTalk`, which may
accept a valid existing session, auto-bootstrap a talk session,
or pass through when the deployment has client-token enforcement
disabled. The image MUST NOT be stored beyond the summarization
call; the response only carries the summarized prompt-addendum
text. If a future change persists the image, re-evaluate this
posture before merging.

## Request shape

```json
{
  "image_data_url": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "transcript": "What does this say?",
  "is_screenplay_mode": false,
  "app_name": "Studio",
  "window_title": "Rooftop — Scene 3"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `image_data_url` | string | yes | data-URL form: `data:image/<mime>;base64,<body>`. Accepts the snake_case + the camelCase fallback `imageDataUrl`. Validation via `normalizeVisualContextImageDataUrl`. |
| `transcript` | string | no | what the user said when they captured the image; ≤ 2,400 chars (clipped by `normalizeSnippet`). Accepts snake_case + `user_message` + `userMessage` fallbacks. |
| `is_screenplay_mode` | bool | no | hint: viewer is in the screenplay studio. Accepts `isScreenplayMode` fallback. |
| `app_name` | string | no | ≤ 80 chars after `normalizeVisualDescriptor`. Accepts `appName` fallback. |
| `window_title` | string | no | ≤ 140 chars after `normalizeVisualDescriptor`. Accepts `windowTitle` fallback. |

## Success response shape

```json
{
  "ok": true,
  "summary": "The screen shows a Fountain-formatted scene called 'Rooftop'. INT. ROOFTOP - NIGHT. JUNE stands at the edge.",
  "prompt_addendum": "VISUAL CONTEXT: ...",
  "app_name": "Studio",
  "window_title": "Rooftop — Scene 3",
  "source": "openai-vision",
  "captured_at": 1715620920000
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | bool | yes | constant `true` |
| `summary` | string | yes | one-paragraph summary from `summarizeVisualContextFromImage` |
| `prompt_addendum` | string | yes | precomputed `buildVisualContextAddendum(context)` — caller can drop straight into a prompt block |
| `app_name` | string | yes | echo of normalized `appName` (empty string when not provided) |
| `window_title` | string | yes | echo of normalized `windowTitle` |
| `source` | string | yes | which vision supplier produced the summary (e.g. `"openai-vision"`) |
| `captured_at` | int | yes | server-side `Date.now()` at success time (NOT a request-supplied stamp) |

HTTP 200. `Cache-Control: no-store`.

## Error responses

| HTTP | `error` | `stage` | When |
| --- | --- | --- | --- |
| 400 | `Visual context image was empty.` | `visual_context` | `normalizeVisualContextImageDataUrl` returns empty (missing/malformed `image_data_url`) |
| 503 | `OpenAI API key is missing for visual context.` | `visual_context` | `OPENAI_API_KEY` env not set |
| `<status>` | `<err.message>` | `<err.stage>` or `"visual_context"` | thrown from `summarizeVisualContextFromImage`. Default status is 502 when err carries no `.status`. |

Envelope shape: `{ stage, error }`.

## Invariants

- The image is never persisted by this route. It is consumed
  in-memory, passed to the vision supplier, and discarded.
- `summary` and `prompt_addendum` together are the entire
  iOS-visible result of the call. iOS does not see the raw
  vision-supplier response.
- `captured_at` is server-stamped to prevent client clock
  drift from affecting downstream cache decisions.
- `requireClientTokenForTalk` keeps this route aligned with
  `/talk` session behavior; do not replace it with a separate
  ad hoc guard without updating this schema.

## Compatibility rules

- iOS keys on `summary`, `prompt_addendum`, `captured_at`.
- New optional fields on the success envelope are tolerated.
- Removing `summary` or `prompt_addendum` requires a schema
  bump.
- The `source` field is informational; iOS may surface it for
  debugging but is not required to.

## V1 alignment

Not directly called out in `docs/v1-definition.md`'s 25-item
checklist, but powers the talk-pipeline's "I can see what
you're looking at" behavior. Bearer-protected with the same
guard as `/talk`, so the auth+ownership story stays consistent
with V1 line 17 / 22.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the inline `app.post("/visual/context", ...)` handler in
  `backend/index.js`.
