---
id: T-preflight-schema-doc-missing-endpoint
title: pre-flight rule: warn when schema doc references a missing backend route
owner: claude
status: review
branch: claude/T-preflight-schema-doc-missing-endpoint
pillar: infra
v1_pillar: infra
v1_effect: closes the reverse-direction schema-doc-vs-code drift gap so docs/schemas/*.md can't silently document a route that was removed or never shipped.
---

## Scope

Adds the `schema-doc-missing-endpoint` pre-flight rule. Companion
to `schema-doc-backend-drift` (which checks field-name drift); this
rule checks endpoint-existence drift in the other direction.

## Rule design

For each `docs/schemas/*.md` (excluding `INDEX.md` and `README.md`):

1. Look for `## Endpoints` (or `## Endpoint`) section.
2. Parse markdown table rows that follow.
3. Extract `(METHOD, /path)` pairs.
4. Search `backend/index.js` + `backend/lib/**/*.js` for
   `app.<method>(<whitespace>"<path>"` or single-quote/backtick
   variants. `:param` in the doc is treated as wildcard
   (`:[a-zA-Z_]+`) so param-name divergence (`:turnId` vs `:id`)
   doesn't trip the check.
5. Fire warning if no registration exists.

Skipped docs:

- Record-shape docs without an Endpoints section
  (`outbox-event.md`, `persona-snapshot.md`, etc.).
- `INDEX.md`, `README.md`.
- Table header + separator rows.

Warn-only by default; `--strict` makes the rule fail the run.

## Bug surfaced + fixed during implementation

Initial regex `app\.<method>\(["'\`]<path>["'\`]` failed against
multi-line registrations like:

```js
app.post(
  "/screenplay/export/fdx",
  express.json({ limit: FDX_BODY_LIMIT }),
  ...
);
```

Fixed by allowing whitespace/newline between `app.method(` and the
string literal. All 3 initial false positives
(`fdx-export.md`, `talk-response.md`, `visual-context.md`) cleared.

## Tests

`scripts/pre_flight.test.mjs` — 7 new tests:

- Fires on missing route.
- Accepts a route in `backend/lib/`.
- Matches multi-line registrations.
- Handles `:param` divergence (doc says `:turnId`, code says `:id`).
- Skips docs without an Endpoints section.
- Skips INDEX.md and README.md.
- Handles multiple endpoints per doc (fires per-row).

Full test suite: 59 pass, 0 fail.

## Done when

- Rule lands in `scripts/pre_flight.mjs`.
- 7 new tests pass.
- Real-repo pre-flight produces 0 `schema-doc-missing-endpoint`
  findings (all current docs match real routes).
