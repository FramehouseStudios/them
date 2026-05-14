---
id: T-screenplay-export-formats-schema
title: docs/schemas/screenplay-export-formats.md
owner: claude
status: review
branch: claude/T-screenplay-export-formats-schema
pillar: infra (schema discipline)
v1_pillar: screenplay
v1_effect: documents the GET /screenplay/export/formats discovery envelope iOS uses to populate the export-format picker — V1 line 38 PDF-rejection alternative depends on this surface
---

## Scope

Ships `docs/schemas/screenplay-export-formats.md` — canonical
response shape for the export-format discovery endpoint.

Covers: endpoint, schema version (1), SAFE-PUBLIC posture
(static config; no per-user content), full response envelope
with 6 format descriptors (fountain, txt alias, fdx, md,
markdown alias, pdf-rejected), invariants (frozen array; `pdf`
documented-but-unsupported), V1 line 38 alignment.

Plus INDEX.md row under Screenplay surface.

## V1 pillar / effect

- `V1 pillar: screenplay`
- `V1 effect: documents the format-discovery surface iOS uses
  for the V1 line 38 "iOS consumes FDX export and backend PDF
  rejection alternatives cleanly" — the supported:false flag
  on the pdf entry is what powers iOS's "PDF not available
  locally" UI without silently omitting the option.`

## Done when

`docs/schemas/screenplay-export-formats.md` lands + INDEX entry
added.
