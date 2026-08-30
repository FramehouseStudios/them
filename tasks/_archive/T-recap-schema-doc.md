---
id: T-recap-schema-doc
title: docs/schemas/recap.md
owner: support
status: merged
branch: support/T-recap-schema-doc
pillar: infra (schema discipline)
v1_pillar: memory
v1_effect: documents the GET /recap + /recap/today daily-recap envelope iOS uses for the "look back at your day" surface — feeds the living-companion experience the memory + talk pillars rely on
---

## Scope

Ships `docs/schemas/recap.md` — canonical response shape for
the daily-recap endpoints:

- `GET /recap?window=<key>` (default `today`)
- `GET /recap/today` (hardcoded shorthand)

Both share the same response shape. Covers:
- Endpoint + query params + If-None-Match → 304 cycle.
- Schema version (`1`).
- PER-USER posture.
- Full 200 envelope (24+ fields documented).
- Read-state header cycle.
- Invariants (`/recap/today` ignores `window` query; local_day
  uses server TZ; generated_at is server-stamped).
- Compatibility rules + V1 alignment + changelog.

Plus an INDEX.md entry under a new "Daily / weekly surfaces"
section.

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: documents the daily-recap surface that feeds the
  broader living-companion experience. Read-only and side-
  effect-free — safe for frequent iOS polling.`

## Verification

- Doc matches `sendRecapResponse` in `backend/index.js`
  line-by-line for the response field set, read-state cycle,
  and `If-None-Match` behavior.
- INDEX entry placed under new "Daily / weekly surfaces"
  section (no existing section for recap-style endpoints).
- Pre-flight clean.

## Done when

`docs/schemas/recap.md` lands + INDEX entry added.

## Followups (not in this PR)

- Document `highlights` / `outcomes` / `next_actions` /
  `stats` sub-shapes once `buildDailyRecapPayload` stabilizes.
  Today they're treated as opaque arrays/objects iOS reads
  via convention.
- Cross-link from `memories-list.md` if iOS uses the same
  read-state cycle to share cache state with /recap.
