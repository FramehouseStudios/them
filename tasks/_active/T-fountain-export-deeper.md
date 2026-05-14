---
id: T-fountain-export-deeper
title: Deeper tests for fountain_export
owner: claude
status: review
branch: claude/T-fountain-export-deeper
pillar: infra (test coverage)
v1_pillar: screenplay
v1_effect: closes the deeper coverage gap for fountain_export, the V1 screenplay-pillar export pipeline iOS depends on for share/save UX
---

## Scope

Ships `backend/tests/fountain_export_deeper.test.mjs` — 14
deeper tests beyond the existing smoke (17 tests).

### Targets

- Dialogue shapes (string vs array of lines).
- Character cue with parenthetical but empty dialogue is dropped.
- Section level prefixes (1/2/3 → #/##/###; missing level → #).
- Synopsis emits `=` prefix.
- Blank kind emits a blank line.
- Unknown line kind is silently dropped (defensive).
- Title page with only some fields skips empty entries.
- Title page treats whitespace-only fields as empty.
- Multi-scene output preserves scene order.
- exportToFountain tolerates missing scenes / null / empty input.

## V1 pillar / effect

- `V1 pillar: screenplay`
- `V1 effect: closes the deeper coverage gap for fountain_export.
  V1 line 27 ("Screenplay export: Fountain + FDX") depends on this
  serializer; v1_screenplay_smoke (#231) pins ordering invariants
  at a high level — this PR pins the per-line-kind serialization
  rules.`

## Verification

```
node --test backend/tests/fountain_export.test.mjs backend/tests/fountain_export_deeper.test.mjs
```

→ existing 17 smoke + 14 deeper = 31/31 pass.

## Done when

`fountain_export_deeper.test.mjs` ships and passes alongside the
existing smoke.

## Followups (not in this PR)

- Schema doc `docs/schemas/fountain-export.md` lands separately
  (#256 schema batch 4).
- FDX export deeper coverage when its smoke lands.
