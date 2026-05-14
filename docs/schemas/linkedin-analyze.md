# linkedin-analyze envelope schema

Canonical request + response shape for `POST /linkedin/analyze` —
the LinkedIn-profile analyzer surface gated by
`LINKEDIN_ANALYSIS_ENABLED`. Not currently in the V1 checklist;
documented for contract stability if/when it ships to iOS.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/linkedin/analyze` | 200 analysis envelope, 400 missing/invalid, 503 disabled |

Body limit: `1mb`.

## Schema version

`1`. No explicit `schemaVersion` field; iOS keys off the field
set itself.

## Owner

- **Backend**: Claude. Inline handler in `backend/index.js`.
- **iOS**: Codex. Surfaces the analyzer UI when enabled.

## Access-control posture

**TIER-3 SENSITIVE**. The profile payload may carry full career
history and personal details. Production deployments should
enable `LINKEDIN_ANALYSIS_ENABLED` only when the feature is
intentionally exposed. The handler does NOT persist the payload.

## Request shape

```json
{
  "profile_text": "<plain-text LinkedIn profile>",
  "headline": "...",
  "about": "...",
  "experiences": [ /* structured */ ],
  "skills": [ /* skill array */ ],
  "target_role": "Senior Engineer",
  "goals": "Move into staff-track in 12 months"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `profile_text` | string | yes (or structured) | plain-text dump |
| `headline` / `about` / `experiences` / `skills` | various | yes (alt) | assembled by `buildLinkedInProfileTextFromPayload` |
| `target_role` | string | no | `normalizeSnippet` 160-char clamp; accepts `targetRole` + `goal_role` fallbacks |
| `goals` | string | no | clamped to 320 chars; accepts `goal` fallback |

EITHER `profile_text` OR a non-empty combination of structured
fields. 400 when both empty.

## Success response (200)

```json
{
  "mode": "llm_v1",
  "profile_score": 78,
  "summary": "<one-paragraph synthesis>",
  "strengths": [ /* string array */ ],
  "weaknesses": [ /* string array */ ],
  "action_plan": [ /* string array */ ],
  "rewritten_headline": "<rewritten>",
  "rewritten_about": "<rewritten about>",
  "target_role": "Senior Engineer",
  "input_chars": 4280
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `mode` | string | yes | analyzer mode (`"llm_v1"`, `"heuristic_fallback"`, etc.) |
| `profile_score` | int | yes | 0-100 (clamped) |
| `summary` | string | yes | clamped to 320 chars |
| `strengths` | array | yes | string array (defaults to empty) |
| `weaknesses` | array | yes | string array (defaults to empty) |
| `action_plan` | array | yes | string array (defaults to empty) |
| `rewritten_headline` | string | yes | clamped to 180 chars |
| `rewritten_about` | string | yes | clamped to 1200 chars |
| `target_role` | string \| null | yes | echo (null when not supplied) |
| `input_chars` | int | yes | character count of assembled `profile_text` |

## Error responses

### 400 — missing content

```json
{
  "stage": "linkedin_analysis",
  "error": "Missing profile content. Provide profile_text or structured fields.",
  "expected_fields": ["profile_text", "headline", "about", "experiences", "skills"]
}
```

`expected_fields` is a stable list — iOS can render it as a
form-completion hint.

### 400 — analyzer rejected

```json
{ "stage": "linkedin_analysis", "error": "Invalid profile payload." }
```

### 503 — feature disabled

```json
{ "stage": "linkedin_analysis", "error": "LinkedIn analysis is disabled." }
```

## Invariants

- `profile_score` clamped to `[0, 100]`.
- All three array fields are guaranteed to be arrays — never null.
- `target_role` in the response is `null` when not supplied.
- `input_chars` reflects the size of
  `buildLinkedInProfileTextFromPayload`'s output, not the raw
  `req.body` size.
- Profile content is NEVER persisted.

## Compatibility rules

- iOS keys on `mode`, `profile_score`, `summary`, three array
  fields, two rewritten-* strings.
- Adding new optional fields is tolerated.
- Removing any documented field requires a schema bump.
- `mode` values are open-ended; iOS treats unknowns as opaque.

## V1 alignment

Not in the V1 checklist. Feature-flag-gated secondary surface.
Documenting the contract keeps it stable through future routing
changes.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the inline `app.post("/linkedin/analyze", ...)` handler in
  `backend/index.js`.
