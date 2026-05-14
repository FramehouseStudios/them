---
id: T-visual-context-schema-doc
title: docs/schemas/visual-context.md
owner: claude
status: review
branch: claude/T-visual-context-schema-doc
pillar: infra (schema discipline)
v1_pillar: talk
v1_effect: documents the POST /visual/context envelope iOS uses to ground talk-pipeline replies in what the user is looking at — TIER-3 SENSITIVE surface that needed a canonical contract
---

## Scope

Ships `docs/schemas/visual-context.md` — canonical request +
response shape for `POST /visual/context`. Covers:

- Endpoint + 2mb body limit + `requireClientTokenForTalk` guard.
- Schema version (`1`).
- TIER-3 SENSITIVE posture (image payload may carry PII).
- Request shape: `image_data_url`, `transcript` + camelCase
  fallbacks, `is_screenplay_mode`, `app_name`, `window_title`.
- Success envelope: `summary`, `prompt_addendum`, `app_name`,
  `window_title`, `source`, `captured_at`.
- Error envelopes: 400 missing image, 503 missing API key,
  502 (or err.status) from the vision supplier.
- Privacy invariant: image never persisted by this route.
- Compatibility rules + V1 alignment + changelog.

Plus an INDEX.md row under a new "Visual surface" section.

## V1 pillar / effect

- `V1 pillar: talk`
- `V1 effect: documents the visual-context surface iOS uses to
  ground talk replies in what the user is looking at. TIER-3
  SENSITIVE — the image payload may carry credentials / PII so
  the canonical contract is load-bearing for the
  "image-never-persisted" invariant.`

## Verification

- Doc matches the inline `app.post("/visual/context", ...)`
  handler in `backend/index.js` line-by-line for request +
  response field set, error envelopes, and headers.
- INDEX entry placed under a new "Visual surface" section
  (no existing surface for image routes).
- Pre-flight clean.

## Done when

`docs/schemas/visual-context.md` lands + INDEX entry added.

## Followups (not in this PR)

- Extract `app.post("/visual/context", ...)` into
  `backend/lib/visual_context_route.js` per the established
  `mount<X>Route` pattern. Not on the 5b chain — would be its
  own decomp PR after Phase 6.
- A deterministic V1-style smoke for the visual-context shape
  (stub `summarizeVisualContextFromImage`, assert envelope).
  Out of scope here; would need a separate fixture + smoke.
