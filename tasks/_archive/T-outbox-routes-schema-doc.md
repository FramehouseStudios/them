---
id: T-outbox-routes-schema-doc
title: docs/schemas/outbox-routes.md
owner: support
status: merged
branch: support/T-outbox-routes-schema-doc-fresh
pillar: infra (schema discipline)
v1_pillar: infra
v1_effect: documents the operator-facing /outbox HTTP envelopes (list + retry) — pairs with outbox-event.md (record shape) so ops dashboards have a fixed contract
---

## Scope

Ships `docs/schemas/outbox-routes.md` — canonical request +
response shapes for the two `/outbox/*` HTTP routes:

- `GET /outbox` — list with `status` + `limit` filters
- `POST /outbox/retry` — single-item retry (`id`) OR batch
  retry (`limit`); 200/404/409

Covers: endpoints + body limits, schema version (`1`),
PER-USER (internal) posture, request shapes, response
envelopes per route + status, invariants (single-item path
gating; spread fields from `processOutboxBatch`).

Sibling to `outbox-event.md` (record shape). The two together
fully document the outbox surface.

Plus an INDEX.md row under the Ops surface section.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: documents the operator-facing /outbox HTTP
  envelopes. Pairs with outbox-event.md (record shape) so ops
  dashboards have a fixed contract.`

## Verification

- Doc matches the two inline handlers in `backend/index.js`
  line-by-line for request fields, status routing (200/404/409),
  single-item vs batch path selection.
- INDEX entry placed under Ops surface alongside ops-metrics
  and ops-health-summary.
- Pre-flight clean.

## Done when

`docs/schemas/outbox-routes.md` lands + INDEX entry added.
