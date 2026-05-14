---
id: T-state-schema-doc
title: docs/schemas/state.md
owner: claude
status: review
branch: claude/T-state-schema-doc
pillar: infra (schema discipline)
v1_pillar: memory
v1_effect: documents the GET /state combined-delta envelope iOS uses for one-call refresh of history + memories — load-bearing for the V1 living-companion experience that depends on cheap delta polling
---

## Scope

Ships `docs/schemas/state.md` — canonical response shape for
the `GET /state` combined-delta endpoint. Covers:

- Endpoint + 4 query parameter dual-namings.
- Schema version (`1`).
- PER-USER posture.
- Delta-no-change short-circuit envelope.
- Full / partial delta envelope.
- Side effects (background theme backfill).
- Invariants (delta arrays empty when `delta_no_change: true`;
  three naming conventions per limit param).
- Compatibility rules + changelog.

Plus an INDEX.md row under a new "Combined state surface"
section.

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: documents the one-call refresh surface iOS uses
  to pull history + memories deltas in a single round-trip.
  Load-bearing for the living-companion polling pattern.`

## Verification

- Doc matches the inline `app.get("/state", ...)` handler in
  `backend/index.js` line-by-line for query params, both
  response envelopes, and the dual-naming invariants.
- INDEX entry placed under new "Combined state surface"
  section.
