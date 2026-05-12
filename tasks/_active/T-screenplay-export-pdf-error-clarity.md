---
id: T-screenplay-export-pdf-error-clarity
title: Add human-readable help payload to PDF export rejection
owner: claude
status: review
branch: claude/T-screenplay-export-pdf-error-clarity
pillar: layer-1-craft (export)
---

## Scope

`POST /screenplay/export` with `format=pdf` returns 400 with just
`{ stage, error: "pdf_export_not_supported_locally" }`. iOS / API
callers have to know in advance that this is a "not implemented"
situation rather than a transient failure, and they have to
re-derive the right fallback path from memory.

This PR extends the rejection payload with three additional fields
while keeping the existing `error` class string for backwards
compatibility:

- `message`: human-readable explanation pointing at Fountain /
  Markdown / FDX as alternatives.
- `alternative_formats`: array `["fountain", "fdx", "md"]` —
  caller can surface a chooser.
- `docs_path`: `"/screenplay/export/formats"` — points at PR #135's
  discoverable list.

No backwards-incompatible change for existing clients reading the
error class. Adds 4 integration-style tests that mirror the
production branch through a small fixture.

## Done when

`POST /screenplay/export` with `format=pdf` returns the augmented
payload; existing clients reading `error` still work; `npm test`
green.
