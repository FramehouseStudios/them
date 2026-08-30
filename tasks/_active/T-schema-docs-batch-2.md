---
id: T-schema-docs-batch-2
title: Schema docs batch — talk + screenplay + realtime + ops + memory + block-signal
owner: support
status: review
branch: support/T-schema-docs-batch-2
pillar: infra (cross-agent contracts)
v1_pillar: infra
v1_effect: infrastructure for every iOS-consumer V1 checklist item; prevents backend ↔ iOS envelope drift across 8 more envelopes
---

## Scope

Extends `docs/schemas/` per the round-22 protocol. The first batch
(#226) shipped 3 docs (auth, talk-turn-meta, ops-metrics). This
batch adds 8 more, covering every V1-critical envelope:

| File | Endpoint(s) | V1 pillar |
| --- | --- | --- |
| `talk-response.md` | `POST /talk` | talk |
| `screenplay-project.md` | `GET /screenplay/projects[/:id]` | screenplay |
| `screenplay-version.md` | `POST .../version` (+ 409 conflict) | screenplay |
| `realtime-health.md` | `GET /realtime/health` | realtime |
| `realtime-client-secret.md` | `POST /realtime/client_secret` | realtime |
| `ops-health-summary.md` | `GET /ops/health-summary` | infra/ops |
| `memory-stats.md` | `GET /memory/stats` | memory |
| `block-signal.md` | `/memory/block-signal*` | memory |

Each carries the full field table, sample response, compatibility
rules, and changelog. README catalog updated.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for every iOS-consumer V1 checklist
  item. After this PR + #226, every V1-critical response envelope
  has a canonical doc; backend lib headers + iOS decoders both
  read from the same source of truth.`

## Compatibility rules pinned in each doc

- Additive new optional keys are fine within a schemaVersion.
- Type narrowing (e.g. `string | null` → `string`) is a version
  bump.
- Removing keys is a version bump.
- iOS decoders MUST tolerate unknown keys (drop them, don't fail).

## Done when

The 8 docs exist with accurate field tables matching the current
backend behavior; the README catalog lists them all.

## Followups

Future docs (not in this batch): per-decomp-phase envelope docs
that ship alongside their extraction PR. E.g. when Phase 5b.1
extracts `/realtime/client_secret`, the doc here is amended (or
referenced) to reflect any changes — though the design rule says
extraction PRs are byte-identical, so the doc shouldn't need to
change.
