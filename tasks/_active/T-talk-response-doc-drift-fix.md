---
id: T-talk-response-doc-drift-fix
title: Remove non-emitted fields from talk-response.md
owner: claude
status: review
branch: claude/T-talk-response-doc-drift-fix
pillar: infra (schema discipline)
v1_pillar: talk
v1_effect: corrects talk-response.md against the live `handleTalkRequest` body — removes `talk_status` and `recovery_applied` entries that the route does not emit; iOS decoders that key on these names would have crashed on missing-key in strict-decode mode
---

## Scope

Self-audit caught two fields in `docs/schemas/talk-response.md`
that are not emitted by the live `handleTalkRequest` in
`backend/index.js`:

- `talk_status` — claimed as `yes` (required) with enumerated
  values `"ok" | "recovered" | "degraded" | "streaming"`. Not
  in the response body. The string `talk_status` does appear in
  `backend/lib/ops_metrics_route.js` where the ops metrics
  aggregator computes a status across saved turns, but it is
  NOT a per-turn field in the `/talk` response.
- `recovery_applied` — claimed as `optional`. Not present
  anywhere in the codebase.

## Fix

- Removed both rows from the response-fields table.
- Removed the `talk_status` entry from the sample JSON.
- Removed the `talk_status` line from the compatibility rules.
- Added a changelog entry documenting the drift fix and pointing
  at where the names came from (ops metrics aggregation, not the
  per-turn response).

## V1 pillar / effect

- `V1 pillar: talk`
- `V1 effect: corrects the canonical envelope doc for the V1
  talk surface. Strict-decode iOS clients keying on these names
  would have crashed on missing-key. Closes a latent blocker
  before iOS bumps into it.`

## Verification

- `grep "talk_status\|recovery_applied" backend/index.js` →
  no matches in the /talk response builder.
- `grep "talk_status" backend/lib/ops_metrics_route.js` →
  matches; this is where the name lives, in a different surface.
- Pre-flight clean.

## Done when

Doc shipped, no claimed field that isn't emitted.

## Followups (not in this PR)

- If a future Phase 7b extraction adds `talk_status` /
  `recovery_applied` to the response, the doc + the schema-
  doc-backend-drift rule should land in the same PR.
