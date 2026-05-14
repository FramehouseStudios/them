---
id: T-fdx-export-schema-doc
title: docs/schemas/fdx-export.md
owner: claude
status: review
branch: claude/T-fdx-export-schema-doc
pillar: infra (schema discipline)
v1_pillar: screenplay
v1_effect: closes the schema-doc gap for the FDX export endpoint — V1 line 38 ("iOS consumes FDX export") needs the canonical envelope documented so iOS decoders + Codex review have a fixed contract to read against
---

## Scope

Adds `docs/schemas/fdx-export.md` — canonical request + response
shape for `POST /screenplay/export/fdx`. Sibling to
`fountain-export.md` (same pattern, different format).

Covers:
- Endpoint method + path.
- Schema version (`1`).
- SAFE-PUBLIC posture identical to the rest of the screenplay
  surface.
- Request shape (shared with fountain-export.md by reference).
- Validation: 400 envelopes for missing body / non-array
  scenes; 500 for serializer throw.
- Default JSON envelope `{ schemaVersion, fdx }`.
- XML response toggle via `Accept` header or `?format=xml`,
  with `Content-Disposition: attachment` for download.
- Pairing notes for iOS consumers (shared request builder
  with fountain-export).
- Compatibility rules + changelog.

Plus an INDEX.md row under the Screenplay surface section.

## V1 pillar / effect

- `V1 pillar: screenplay`
- `V1 effect: closes the schema-doc gap for the FDX export
  endpoint. V1 line 38 explicitly calls out "iOS consumes FDX
  export and backend PDF rejection alternatives cleanly" — the
  iOS consumer needs a canonical envelope to decode against.`

## Verification

- Doc matches `mountFDXExportRoute` in
  `backend/lib/fdx_export_route.js` line-by-line (endpoint,
  validation envelopes, JSON shape `{ schemaVersion: 1, fdx }`,
  XML toggle, `Content-Disposition` rule).
- INDEX.md row sits next to `fountain-export.md` for
  consistency.
- Pre-flight clean.

## Done when

`docs/schemas/fdx-export.md` lands + INDEX entry added.

## Followups (not in this PR)

- FDX deeper test (analogous to `fountain_export_deeper.test.mjs`
  #258) — pin per-line-kind FDX serialization.
- V1 line 38 second clause ("backend PDF rejection alternatives
  cleanly") is iOS-driven. Codex's call.
