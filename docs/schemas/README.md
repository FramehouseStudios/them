# docs/schemas — canonical response envelope schemas

This directory is the **single source of truth** for the JSON
response envelopes THEM's backend produces and THEM's iOS
client consumes. Each file documents one envelope: its schema
version, its field set, its access-control posture, and which
agent owns it.

## Why this exists

Today the same envelope is described in three places:

1. The backend lib's module header (support agent maintains).
2. The iOS decoder struct (Codex maintains).
3. The human reconciles drift when the two diverge.

Drift produces real bugs: a backend that adds a field without
updating the iOS decoder leaves the field invisible to users;
an iOS decoder that asserts a missing optional crashes on
deploy. The fix is one canonical doc per envelope that **both
agents read from and write to in the same PR that changes the
field**.

## Naming

One file per envelope: `<endpoint>.md`. For routes that share an
envelope shape (e.g. `/auth/signup`, `/auth/login`, `/auth/refresh`
all return the same auth envelope), one file covers the shared
shape and lists the routes that emit it.

## Each schema doc carries

- **Endpoint(s)**: the HTTP method + path that produce the envelope.
- **Schema version**: the integer in the response payload's
  `schemaVersion` field (or `schema_version` for legacy envelopes).
  Bump when a non-additive change ships.
- **Owner**: which agent is the canonical author of the shape
  (typically backend = support agent, iOS decoder = Codex; field changes
  go through the owner first).
- **Access-control posture**: SAFE-PUBLIC | PER-USER | TIER-3
  SENSITIVE.
- **Field table**: every key, its JSON type, whether it's required,
  what produces it, what consumes it.
- **Sample response**: a known-good JSON payload, copy-pasteable.
- **Compatibility rules**: what counts as an additive change vs. a
  breaking change for this envelope. Default rule: additive new
  optional fields are fine within a schemaVersion; removals or
  meaning-changes require a schemaVersion bump.

## Update rule

Every PR that touches a response envelope must:

1. Edit the corresponding `docs/schemas/<name>.md`.
2. If the change is non-additive, bump the schema version in the
   doc and in the response payload.
3. Mention the doc by path in the PR body (or commit message).
4. Add a row to the doc's changelog at the bottom.

If a PR ships an envelope change without touching the doc, the
review should request the doc update before merge.

## Catalog

- [`auth.md`](./auth.md) — `/auth/*` envelopes (success + error).
- [`talk-response.md`](./talk-response.md) — `POST /talk` (V1 magic
  moment).
- [`talk-turn-meta.md`](./talk-turn-meta.md) — `GET /talk/turn/:turnId`.
- [`screenplay-project.md`](./screenplay-project.md) — list +
  detail.
- [`screenplay-version.md`](./screenplay-version.md) — version
  save + 409 conflict shape.
- [`realtime-health.md`](./realtime-health.md) — `GET /realtime/health`.
- [`realtime-client-secret.md`](./realtime-client-secret.md) —
  `POST /realtime/client_secret` (mint + failover envelope).
- [`ops-metrics.md`](./ops-metrics.md) — `GET /ops/metrics`.
- [`ops-alerts.md`](./ops-alerts.md) — `GET /ops/alerts`.
- [`ops-health-summary.md`](./ops-health-summary.md) —
  `GET /ops/health-summary`.
- [`memory-stats.md`](./memory-stats.md) — `GET /memory/stats`.
- [`block-signal.md`](./block-signal.md) — `/memory/block-signal*`.

Future scaffolding should ship alongside the route or response-envelope
change that needs it. After the first two schema batches, every
V1-critical response envelope has a starter doc.

Both agents are encouraged to add docs for envelopes they own.
Adding a doc is always non-blocking; deleting or renaming one
needs both agents' sign-off.
