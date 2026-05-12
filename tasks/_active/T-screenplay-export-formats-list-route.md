---
id: T-screenplay-export-formats-list-route
title: GET /screenplay/export/formats canonical format list
owner: claude
status: review
branch: claude/T-screenplay-export-formats-list-route
pillar: layer-1-craft (export discovery)
---

## Scope

`POST /screenplay/export` accepts a handful of `format` values
(`fountain`, `txt`, `fdx`, `md`, `markdown`) and rejects others.
Today iOS has to hard-code the set, guess the right MIME type, and
re-derive the right file extension. This PR adds a tiny
discoverable contract: `GET /screenplay/export/formats` returns the
canonical list as a frozen snapshot:

```json
{
  "schemaVersion": 1,
  "defaultFormat": "fountain",
  "formats": [
    { "format": "fountain",  "extension": "fountain", "mediaType": "text/plain; charset=utf-8",     "supported": true,  "description": "..." },
    { "format": "txt",       "extension": "fountain", "mediaType": "text/plain; charset=utf-8",     "supported": true,  "description": "Alias of fountain" },
    { "format": "fdx",       "extension": "fdx",      "mediaType": "application/vnd.final-draft",   "supported": true,  "description": "Final Draft XML" },
    { "format": "md",        "extension": "md",       "mediaType": "text/markdown; charset=utf-8",  "supported": true,  "description": "..." },
    { "format": "markdown",  "extension": "md",       "mediaType": "text/markdown; charset=utf-8",  "supported": true,  "description": "Alias of md" },
    { "format": "pdf",       "extension": "pdf",      "mediaType": "application/pdf",               "supported": false, "description": "Not supported locally" }
  ]
}
```

`Cache-Control: no-store`. The canonical set is `Object.freeze`d so
unit tests pin the snapshot — a future change to `POST /screenplay/export`
that adds a new format must also update this list (the test asserts
the symmetric set).

## Done when

`GET /screenplay/export/formats` returns the envelope above; the
snapshot is frozen at the module level; `npm test` green.
