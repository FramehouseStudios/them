---
id: T-fdx-export-deeper
title: Deeper tests for the FDX serializer
owner: claude
status: merged
branch: claude/T-fdx-export-deeper
pillar: infra (test coverage)
v1_pillar: screenplay
v1_effect: closes the deeper coverage gap for the FDX serializer that V1 line 38 ("iOS consumes FDX export...") depends on — pins per-line-kind serialization rules so iOS regressions surface in CI
---

## Scope

Ships `backend/tests/fdx_export_deeper.test.mjs` — 10 deeper
tests beyond the existing 17 smoke tests.

### Targets

- Dialogue shapes (string vs array of lines)
- Character cue with parenthetical but empty dialogue → dropped
- Multi-scene output preserves scene order
- Title page with only some fields skips empty entries
- Title page treats whitespace-only fields as empty
- Unknown line kind silently dropped (defensive)
- Defensive: missing scenes, null, empty input
- Output is well-formed XML root (`<?xml ... <FinalDraft ... </FinalDraft>`)
- `escapeXml` round-trips through the full export (no raw `<`,
  `>`, or `&` in text)

## V1 pillar / effect

- `V1 pillar: screenplay`
- `V1 effect: closes the deeper coverage gap for the FDX
  serializer. V1 line 38 depends on iOS being able to decode FDX
  cleanly; these tests pin per-line-kind serialization so a
  silent change to the serializer surfaces in CI.`

## Verification

```
node --test backend/tests/fdx_export.test.mjs backend/tests/fdx_export_deeper.test.mjs
```

→ 17 smoke + 10 deeper = 27/27 pass.

## Done when

`fdx_export_deeper.test.mjs` ships and passes alongside the
existing smoke.

## Followups (not in this PR)

- Schema doc `docs/schemas/fdx-export.md` lands separately
  (claude/T-fdx-export-schema-doc, PR #265).
- Section level / synopsis paragraph support (the smoke + this
  deeper PR don't pin these — the FDX serializer may or may
  not emit them; check `serializeSection` / `serializeSynopsis`
  bodies for the rules).
