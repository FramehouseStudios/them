# T07a — Outbox Architecture (snapshot pattern, not migration)

**Status:** in-progress
**Owner:** support
**Branch:** `support/T07a-outbox-snapshots`
**Pillar:** longitudinal learning + infra (enables all)
**Builds on:** T07 (persistence adapter foundation)
**Proposes:** a new entry in `DECISIONS.md` (human authors).

## Decision being proposed

**Outbox keeps `scaleBackplane` as its canonical operational layer. The T07 persistence adapter receives periodic, diagnostic-grade snapshots of outbox state under the `outbox` domain.**

This intentionally diverges from the dual-write pattern used for T07b (screenplay), T07c (memory), T07d (embeddings), and T22 (craft). Those four are KV-style domain stores — read often, written occasionally, no per-record state machine. Outbox is a **queue** with worker semantics: claim, retry, status transitions, due-time scheduling. Forcing the queue onto the KV adapter would either erase those semantics or duplicate them poorly.

## Why not dual-write the queue itself

`scaleBackplane` already supports Postgres mode via `SCALE_POSTGRES_URL` (separate from `DATABASE_URL`'s domain-data role). Outbox already gets durable Postgres-backed queue persistence in production. A second copy of the same queue under the persistence adapter would create two sources of truth and require coordinated writes that any consumer of the outbox would have to reason about.

The audit recommended *resolving dual persistence* — the dual-write we built for memory/screenplay/embeddings is intentionally transient (a cutover bridge per `docs/T07-persistence-canonical.md`). Promoting outbox to the same dual-write would mean introducing **a different** dual-write that is not transient — outbox would then permanently coexist between scaleBackplane's Postgres store and persistence_adapter's Postgres store. Worse than the problem it was meant to solve.

## What this PR delivers instead

A thin **`OutboxSnapshotter`** that:

1. Periodically calls `scaleBackplane.listOutbox({ status: "all", limit: 2000 })`.
2. Builds a small JSON snapshot — counts by status (pending / completed / failed / other), plus a 25-item sample with `id / status / type / attempts / retryAt / updatedAt` for the most recent items.
3. Writes the snapshot under `domain="outbox"`, key `snapshot:<ISO timestamp>` via the persistence adapter (Postgres in prod, JSON-file in dev).
4. Prunes to keep at most `OUTBOX_SNAPSHOT_KEEP_LAST` snapshots (default 10).
5. Runs every `OUTBOX_SNAPSHOT_INTERVAL_MS` (default 60s).
6. Is **best-effort** — every error path logs and swallows. Snapshotting must never affect the queue's hot path.

## What operators get

- Postgres-visible record of outbox health under `persistence_outbox` (already a table from T07's `001_init_persistence.sql`). Same query surface as memory, screenplay, embeddings, craft.
- Audit trail across restarts: the last 10 snapshots remain visible even if the queue has drained or rolled forward.
- Diagnostic snapshots independent of the realtime cross-process Redis stream.

## What operators do NOT get (intentional)

- Recovery of in-flight queue items from snapshot. The snapshot is a counts + sample summary, not full per-item state. `scaleBackplane`'s Postgres mode is the source of truth for full item recovery.
- Cross-process queue coordination via the persistence adapter. That stays on Redis + Postgres via `scaleBackplane`.

If a future project needs full snapshot fidelity, the snapshot payload can grow to include per-item state. The seam is intentionally open.

## Configuration

Three env vars, all optional:

- `OUTBOX_SNAPSHOT_ENABLED` (default `1`) — flip to `0` to disable snapshots without removing the wiring.
- `OUTBOX_SNAPSHOT_INTERVAL_MS` (default `60000`) — seconds between snapshots.
- `OUTBOX_SNAPSHOT_KEEP_LAST` (default `10`) — how many snapshots to retain. Older ones are pruned.

## Files

- **`backend/lib/outbox_snapshotter.js`** (new) — `createOutboxSnapshotter({ scaleBackplane, persistence, intervalMs, keepLast, logger })`. Returns `{ start, stop, takeSnapshotOnce }`. Idempotent start/stop.
- **`backend/index.js`** — imports `createOutboxSnapshotter`, instantiates after `sharedPersistence` and before `configureOutboxStore`. Calls `start()` when `OUTBOX_SNAPSHOT_ENABLED` is truthy.
- **`backend/tests/outbox_snapshotter.test.mjs`** — 7 tests covering payload shape, single-snapshot writing, pruning oldest first, scaleBackplane-failure tolerance, idempotent start/stop, construction guards.
- **`docs/T07a-outbox-architecture.md`** (this file).

## Verification

- `cd backend && node --test tests/outbox_snapshotter.test.mjs` → **7 pass, 0 fail**.
- `cd backend && npm test` (full suite) → **108 pass / 1 skipped / 0 fail**. No regressions.
- `npm run eval:gate` → not run; requires backend boot with secrets.

## Proposed `DECISIONS.md` entry (human authors)

```
## D??? — Outbox stays on scaleBackplane; persistence adapter receives diagnostic snapshots only

- **Date:** 2026-05-09
- **Status:** accepted
- **Context:** T07's persistence adapter consolidated KV-style domain
  data (memory, screenplay, embeddings, craft, creative_memory). The
  outbox is a queue with worker semantics already running on
  scaleBackplane (Redis + Postgres). Wiring the queue onto the KV
  adapter would erase or duplicate the queue semantics.
- **Decision:** scaleBackplane remains the canonical operational layer
  for outbox. T07a contributes an OutboxSnapshotter that writes
  periodic counts + sample under domain="outbox" via the persistence
  adapter. Operators get a Postgres-visible health record in the same
  query surface as the other persisted domains, without changing the
  queue's hot path.
- **Consequences:** docs/T07-persistence-canonical.md's "all four
  *_store.json paths deprecated" goal is satisfied for outbox via the
  scaleBackplane Postgres mode (separate from the persistence adapter
  but already canonical when SCALE_POSTGRES_URL is set). The remaining
  T07 cutover work targets the dual-write JSON paths in screenplay,
  memory, and embeddings only.
```

## Done when (this PR)

- [x] OutboxSnapshotter created with best-effort, fire-and-forget semantics.
- [x] Wired in `index.js` between `sharedPersistence` and `configureOutboxStore`.
- [x] 7 tests pass; full suite green.
- [x] Configurable via three env vars.
- [x] Docs propose the architectural decision for human acceptance.
- [ ] `DECISIONS.md` entry — human-authored once accepted.
