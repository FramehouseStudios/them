# fdx-export envelope schema

Canonical request + response shape for `POST /screenplay/export/fdx` —
the screenplay-to-Final-Draft-XML serializer endpoint. Sibling to
`fountain-export.md`; same shape, different format.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/screenplay/export/fdx` | JSON envelope OR raw XML (see below) |

Two response modes:
- **Default** (no `Accept` magic): JSON envelope
  `{ schemaVersion: 1, fdx: "<xml>" }`.
- **`Accept: application/xml | text/xml` OR `?format=xml`**: raw
  FDX body with `Content-Disposition: attachment; filename="<base>.fdx"`.

## Schema version

`1`. JSON envelope carries an explicit `schemaVersion` field.

## Owner

- **Backend**: support agent. Route in
  `backend/lib/fdx_export_route.js`; serializer in
  `backend/lib/fdx_export.js` (`exportToFDX`).
- **iOS**: Codex. Consumes the FDX text for share / save to
  Final Draft.

## Access-control posture

**PER-USER**. Screenplay body is user-authored content. The
route operates on the body passed in the request, not on a
stored project. Same posture as `fountain-export.md`.

## Request shape

Same input shape as `fountain-export.md` — the two endpoints
consume the same `{ title?, scenes? }` document and just emit
different output formats. See `docs/schemas/fountain-export.md`
for the request body description.

The additive `centered` and `lyrics` line kinds render as an FDX `General`
paragraph with `Alignment="Center"` and an FDX `Lyrics` paragraph,
respectively. A transition with `forced: true` preserves its supplied text
without inventing a `TO:` suffix.

`dualDialogue` is retained by the shared canonical request and by Fountain
round trips. The current FDX exporter deliberately emits its character and
dialogue content as ordinary sequential paragraphs; it does not yet claim
Final Draft dual-dialogue grouping support.

## Validation

| HTTP | `error` | When |
| --- | --- | --- |
| 400 | `craft_invalid_screenplay` (`message: "body required"`) | request body missing / not an object |
| 400 | `craft_invalid_screenplay` (`message: "scenes must be an array"`) | `body.scenes` is present but not an array |
| 500 | `fdx_export_failed` (with `message`) | `exportToFDX` throws |

Empty `scenes` is **valid** — title-only FDX documents are
allowed.

## Default (JSON) response shape

```json
{
  "schemaVersion": 1,
  "fdx": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\n<FinalDraft DocumentType=\"Script\" Template=\"No\" Version=\"3\">\n  <Content>\n    <Paragraph Type=\"Scene Heading\">\n      <Text>INT. ROOM - DAY</Text>\n    </Paragraph>\n  </Content>\n</FinalDraft>\n"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes | constant `1` |
| `fdx` | string | yes | full FDX-formatted XML payload |

HTTP 200. `Cache-Control: no-store`.

## XML response (Accept-driven)

When the request carries `Accept: application/xml` /
`Accept: text/xml` OR the query string includes `?format=xml`,
the response is the raw FDX string (no JSON wrapper) with:

- `Content-Type: application/xml; charset=utf-8`
- `Content-Disposition: attachment; filename="<base>.fdx"`
  where `<base>` is `body.title.title` sanitized via
  `sanitizeFilenameBase()` (alnum / space / `._-` only,
  truncated to 80 chars, falls back to `screenplay` when empty).

The FDX body itself is identical between the two response
modes — only the wrapper differs.

## Compatibility rules

- iOS keys on `fdx` (string) as the primary payload.
- Adding optional metadata fields to the JSON envelope is
  tolerated.
- Changing the FDX text-generation rules requires:
  1. A note on the agent-event lane.
  2. A regression test for the FDX serializer in
     `backend/tests/fdx_export.test.mjs` capturing the new
     shape.
- Removing `fdx` or `schemaVersion` from the JSON envelope
  requires a schema bump.

## Pairing with fountain-export.md

`fdx-export.md` and `fountain-export.md` share the same request
shape and the same JSON-vs-raw response toggle pattern. iOS
consumers can use the same request builder; only the output
extension and `Content-Type` differ. The two endpoints are
mounted via separate `mount<X>ExportRoute` factories
(`mountFDXExportRoute`, `mountFountainExportRoute`) so each can
evolve its body limit / cache headers independently.

## Changelog

- v1 (compatible extension, 2026-08-30) — add centered and lyrics paragraphs,
  preserve forced transition text, and document the current dual-dialogue
  degradation explicitly.
- v1 — initial documented shape, matched line-by-line against
  `mountFDXExportRoute` in `backend/lib/fdx_export_route.js`
  (#90 era). Mirrors `fountain-export.md` so iOS consumers can
  use a shared request builder.
