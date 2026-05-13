---
id: T-ops-health-summary-eval
title: Deployment-level eval pinning /ops/health-summary features map
owner: claude
status: merged
branch: claude/T-ops-health-summary-eval
pillar: evals (contract stability)
---

## Scope

PR #134 ships `GET /ops/health-summary` with unit tests over the
pure helper. This PR adds a deployment-level eval that pins the
**specific list of features** the production deployment advertises:

- `creative_memory`
- `block_signal`
- `block_signal_history`
- `talk_pipeline`
- `screenplay_export_markdown`
- `screenplay_export_formats`

A future refactor that removes one of those keys (or accidentally
flips one off) would silently regress every uptime dashboard reading
this endpoint. The eval mounts the route with the exact features
map from `backend/index.js` and asserts:

- HTTP 200 + `Cache-Control: no-store`
- `schemaVersion === 1`
- Envelope keys: `status`, `reasons`, `uptimeMs`, `uptimeHuman`,
  `node.version`, `node.platform`
- `features` contains exactly the canonical set; each value is `true`

Wired via `npm run eval:ops-health-summary`.

## Done when

`backend/evals/run_ops_health_summary_eval.mjs` exits 0 with all
16 checks passing; `npm test` still green.
