---
id: T-schema-docs-scaffold
title: Bootstrap docs/schemas/ with README + 3 first envelope docs
owner: support
status: review
branch: support/T-schema-docs-scaffold
pillar: infra (cross-agent contracts)
v1_pillar: infra
v1_effect: infrastructure for every iOS-consumer V1 checklist item; prevents backend ↔ iOS envelope drift
---

## Scope

Bootstrap `docs/schemas/` per the round-22 protocol: one canonical
source of truth per response envelope. Each schema doc carries the
field set, the schema version, the access-control posture, the
owner agent, sample response, and compatibility rules.

This PR ships:

- `docs/schemas/README.md` — directory contract, naming, update rule.
- `docs/schemas/auth.md` — `/auth/*` family (success + error
  envelopes, 11 routes).
- `docs/schemas/talk-turn-meta.md` — `GET /talk/turn/:turnId`.
- `docs/schemas/ops-metrics.md` — `GET /ops/metrics`.

Plus stubs / followup list for the rest of the V1 surface (talk
response, screenplay project / version, ops health summary, realtime
health / client_secret, memory stats, block signal).

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for every iOS-consumer V1 checklist
  item. Prevents backend ↔ iOS envelope drift, which today produces
  the same envelope description in three places (backend lib header,
  iOS decoder, human reconciliation).`

## Update rule (codified in README)

Every PR that touches a response envelope must:

1. Edit the corresponding `docs/schemas/<name>.md`.
2. If the change is non-additive, bump the schema version in the
   doc and in the response payload.
3. Mention the doc by path in the PR body / commit message.
4. Add a row to the doc's changelog.

If a PR ships an envelope change without touching the doc, review
should request the update before merge.

## Done when

The 3 starter docs reflect the shapes currently emitted by:
- `backend/lib/user_auth.js` `buildAuthEnvelope`
- `backend/lib/talk_pipeline.js` `GET /talk/turn/:turnId`
- `backend/lib/ops_metrics_route.js` `mountOpsMetricsRoute`

If Codex spots a field mismatch with the iOS decoder, the doc is
the source of truth; the doc amends and the decoder follows. If
the doc is wrong about backend behavior, the doc amends.

## Followups

Both agents can add docs for envelopes they own without
coordination. Adding is always safe. Renames/deletes need both
agents' sign-off. Suggested next-to-write list lives in the
README's "Future scaffolding to fill in" section.
