# screenplay-export-formats envelope schema

Canonical response shape for `GET /screenplay/export/formats` —
the discoverable list of supported export formats iOS / API
consumers query to populate the export menu without hard-coding
the set.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/screenplay/export/formats` | 200 envelope (no query parameters, no body) |

## Schema version

`1`. Envelope carries `schemaVersion` from
`SCREENPLAY_EXPORT_FORMATS_SCHEMA_VERSION`.

## Owner

- **Backend**: Claude. Route in
  `backend/lib/screenplay_export_formats_route.js`.
- **iOS**: Codex. Powers the export-format picker UI.

## Access-control posture

**SAFE-PUBLIC**. The format list is static configuration — no
per-user content, no auth gating.

## Response shape

```json
{
  "schemaVersion": 1,
  "formats": [
    {
      "format": "fountain",
      "extension": "fountain",
      "mediaType": "text/plain; charset=utf-8",
      "description": "Fountain plain-text screenplay format",
      "supported": true
    },
    {
      "format": "txt",
      "extension": "fountain",
      "mediaType": "text/plain; charset=utf-8",
      "description": "Alias of fountain (.fountain filename)",
      "supported": true
    },
    {
      "format": "fdx",
      "extension": "fdx",
      "mediaType": "application/vnd.final-draft",
      "description": "Final Draft XML",
      "supported": true
    },
    {
      "format": "md",
      "extension": "md",
      "mediaType": "text/markdown; charset=utf-8",
      "description": "Markdown projection (H2 slug, bold character, italic parenthetical, blockquote transition)",
      "supported": true
    },
    {
      "format": "markdown",
      "extension": "md",
      "mediaType": "text/markdown; charset=utf-8",
      "description": "Alias of md",
      "supported": true
    },
    {
      "format": "pdf",
      "extension": "pdf",
      "mediaType": "application/pdf",
      "description": "Not supported locally — POST returns 400 pdf_export_not_supported_locally",
      "supported": false
    }
  ],
  "defaultFormat": "fountain"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes | constant `1` |
| `formats` | array | yes | frozen array of format descriptors |
| `defaultFormat` | string | yes | constant `"fountain"` |

### Per-format descriptor

| Key | Type | Notes |
| --- | --- | --- |
| `format` | string | identifier the caller passes to `POST /screenplay/export?format=<X>` |
| `extension` | string | filename extension (no leading dot) |
| `mediaType` | string | MIME type for the download |
| `description` | string | human-readable summary; safe to show in UI |
| `supported` | bool | `true` for formats that produce output; `false` for documented-but-rejected formats (currently just `pdf`) |

## Aliases

- `txt` → aliases `fountain` (output identical; the filename
  still gets `.fountain` extension via the `extension` field).
- `markdown` → aliases `md`.

## `pdf` is documented-but-unsupported

`pdf` is in the list with `supported: false` so the iOS UI can
surface the option (greyed out, with the description as
hover/help text) rather than silently omitting it. Calling
`POST /screenplay/export?format=pdf` returns 400 with
`pdf_export_not_supported_locally`.

## Read-state headers

- `Cache-Control: no-store`

(No read-meta headers — the route is static; etag/state-version
machinery doesn't apply.)

## Invariants

- The `formats` array IS the contract. Calling `POST
  /screenplay/export?format=<X>` with `X` not in this list
  returns 400 `unsupported_format`.
- `Object.freeze` is applied to the array AND each descriptor
  in the lib (`SUPPORTED_FORMATS`); the route returns those
  frozen values directly.
- The `pdf` entry's `supported: false` is the SINGLE source of
  truth — iOS keys on this flag to decide whether to render the
  option as available.

## V1 alignment

V1 line 38: "iOS consumes FDX export and backend PDF rejection
alternatives cleanly." This endpoint's `supported: false` entry
for `pdf` is what powers iOS's PDF-rejection UI — the format is
listed (so the user sees it's a known option) with a clear
description (so the user knows why it's unavailable locally).

## Compatibility rules

- iOS keys on `formats[]` (the full array) and the per-format
  `supported` flag.
- Adding new formats is additive — old iOS clients still see
  the formats they understand.
- Removing or renaming a format requires a schema bump.
- Aliases (`txt`, `markdown`) are stable; removing one would
  break consumers that hard-coded the alias.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  `SUPPORTED_FORMATS` in
  `backend/lib/screenplay_export_formats_route.js`.
