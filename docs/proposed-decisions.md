# Proposed `DECISIONS.md` Entries (awaiting human acceptance)

Per `AGENTS.md`, Codex proposes decisions and the human accepts them by adding them to `DECISIONS.md`. support agent (this agent) cannot author `DECISIONS.md` entries. This document aggregates proposals that have been embedded inside design docs across support agent-authored PRs so the human can review and copy them into `DECISIONS.md` in one pass.

Each entry is in ADR form ready to paste. The `Status` field is `proposed` here; flip it to `accepted` and assign the next sequential `D###` ID when copying into `DECISIONS.md`.

---

## D??? — Outbox stays on `scaleBackplane`; persistence adapter receives diagnostic snapshots only

- **Date:** 2026-05-09
- **Status:** proposed
- **Source:** [`docs/T07a-outbox-architecture.md`](./T07a-outbox-architecture.md), [PR #32](https://github.com/FramehouseStudios/them/pull/32)
- **Context:** T07's persistence adapter consolidated KV-style domain data (memory, screenplay, embeddings, craft, creative_memory). The outbox is a queue with worker semantics already running on `scaleBackplane` (Redis + Postgres). Wiring the queue onto the KV adapter would erase or duplicate the queue semantics.
- **Decision:** `scaleBackplane` remains the canonical operational layer for outbox. T07a contributes an `OutboxSnapshotter` that writes periodic counts + sample under `domain="outbox"` via the persistence adapter. Operators get a Postgres-visible health record in the same query surface as the other persisted domains, without changing the queue's hot path.
- **Consequences:** `docs/T07-persistence-canonical.md`'s "all four `*_store.json` paths deprecated" goal is satisfied for outbox via the `scaleBackplane` Postgres mode (separate from the persistence adapter but already canonical when `SCALE_POSTGRES_URL` is set). The remaining T07-cutover work targets the dual-write JSON paths in screenplay, memory, and embeddings only.

---

## D??? — Override IDs are `ov_<UUID v4>`, generated via `crypto.randomUUID`

- **Date:** 2026-05-09
- **Status:** proposed
- **Source:** [PR #20 (T22)](https://github.com/FramehouseStudios/them/pull/20), `backend/lib/craft_analysis.js:nextOverrideId`
- **Context:** T18's MVP used a process-counter override ID (`ov_<base36 timestamp>_<n>`). T22 swapped craft state to persistent storage; with persistence, IDs must be unique across process restarts.
- **Decision:** Override IDs follow the shape `ov_<UUID v4>`. Generated via `node:crypto.randomUUID`. The `craft_overrides` schema in `backend/lib/craft_schemas.js` accepts any `string, minLength: 1`; the convention is enforced by the producer.
- **Consequences:** Override IDs are 39 characters (`ov_` + 36-char UUID). Tests assert the `ov_<UUID v4>` shape at `backend/tests/craft_endpoints.test.mjs`. Future override producers — including iOS-side T19 client work — should use the same shape for consistency.

---

## D??? — `T07-eval-gate` promotion path: advisory → required after seven-day soak

- **Date:** 2026-05-09
- **Status:** proposed
- **Source:** [`docs/T07-persistence-canonical.md` "Eval gate against Postgres" section](./T07-persistence-canonical.md), [PR #33](https://github.com/FramehouseStudios/them/pull/33)
- **Context:** PR #33 ships `.github/workflows/eval-gate-postgres.yml` — a dedicated workflow that runs `npm run eval:gate` against a live Postgres service container. The workflow's *advisory vs. required* status is a release-engineering call, not a code call.
- **Decision:** The workflow is **advisory** for its first seven days of green runs (auto-runs on `support/T07*` branches + nightly cron + manual dispatch). After seven consecutive green nightly runs (or seven business days, whichever is shorter), the gate is promoted to required by:
  1. Adding it to `release-preflight.yml` via `workflow_call`.
  2. Marking T07-cutover's `blocked-T07-eval` blocker cleared.
  3. Removing the legacy `*_store.json` write paths in screenplay, memory, embeddings (the T07-cutover scope).
- **Consequences:** A seven-day red streak on the eval-gate-postgres workflow blocks T07-cutover. The dual-write paths remain in place until the gate has soaked. This is intentional belt-and-suspenders for the persistence cutover — file-mode is the rollback path until Postgres is proven canonical.

---

## D??? — Persistence domain naming convention: `<feature>_<concern>` (snake_case, plural-when-collection)

- **Date:** 2026-05-09
- **Status:** proposed
- **Source:** [PR #30 (T08-postgres)](https://github.com/FramehouseStudios/them/pull/30), `backend/lib/persistence_adapter.js:KNOWN_DOMAINS`, [PR #20 (T22)](https://github.com/FramehouseStudios/them/pull/20)
- **Context:** As stores migrate to the persistence adapter, `KNOWN_DOMAINS` accretes new entries. Without a naming rule, the list drifts (e.g., should it be `memory` or `user_memory`? `craft` or `craft_reports` + `craft_overrides`?).
- **Decision:** Persistence domain names follow the form `<feature>_<concern>`:
  - `<feature>` is the domain area (`outbox`, `user`, `screenplay`, `knowledge`, `craft`, `creative`).
  - `<concern>` is the specific record class within the feature (`memory`, `embeddings`, `reports`, `overrides`, `memory`).
  - Singular `<concern>` for KV-style records keyed by entity id (one `value` per `key`); plural `<concern>` only when the domain holds a collection of conceptually distinct records that share a feature root.
  - Already-shipped names: `outbox`, `user_memory`, `screenplay`, `knowledge_embeddings`, `craft_reports`, `craft_overrides`, `creative_memory`. (`outbox` predates this rule and is grandfathered as a single-concern domain.)
- **Consequences:** Future per-store wirings (T13's realtime supplier state, future eval caches, etc.) follow the rule. Renames are migration-cost-prohibitive once shipped, so this rule applies prospectively only.

---

## D??? — Craft beat-classification accuracy is informational until the labeled fixture matures

- **Date:** 2026-05-09
- **Status:** proposed
- **Source:** [`docs/T21-craft-prompts-and-classification.md`](./T21-craft-prompts-and-classification.md), [PR #23 (merged) — T21](https://github.com/FramehouseStudios/them/pull/23)
- **Context:** T21 shipped two classifier implementations (deterministic stub + LLM-driven via OpenAI). The eval (`backend/evals/run_craft_classification_eval.mjs`) reports a `correct/total` accuracy summary against a three-scene labeled fixture but does not block the gate on accuracy.
- **Decision:** Classification accuracy stays informational (eval logs it, doesn't fail on it) until the labeled fixture grows to ≥30 scenes spanning ≥3 frameworks. At that threshold, a future PR adds an explicit threshold (initial proposal: ≥0.6 accuracy on the held-out set) and turns the eval into a hard gate.
- **Consequences:** The LLM classifier can ship and iterate without an eval that fails on every prompt tweak. New classifier behaviors are observable in the eval log even when below threshold. The seam in the eval is explicit (`SUMMARY  LLM accuracy: X/Y`) so the threshold flip is a one-line change.

---

## D??? — Schema versioning: `schemaVersion` is the migration anchor; the wire shape never silently changes for a given version

- **Date:** 2026-05-09
- **Status:** proposed
- **Source:** [`docs/T18-craft-schemas-and-analysis.md`](./T18-craft-schemas-and-analysis.md), [PR #6 (merged) — T18](https://github.com/FramehouseStudios/them/pull/6)
- **Context:** Multiple support agent-shipped systems carry a `schemaVersion`: craft reports (`CRAFT_SCHEMA_VERSION = 1`), creative memory (`SCHEMA_VERSION = 1`), persistence-adapter-stored values that the producer chooses to version. Without a rule about how `schemaVersion` evolves, clients cannot rely on it.
- **Decision:** For every persisted shape support agent produces:
  1. The producer always writes the current `schemaVersion`.
  2. Backward-compatible additions (new optional fields) **do not** bump `schemaVersion`.
  3. Backward-incompatible changes (renamed/removed required fields, type changes) **bump `schemaVersion` and ship a migrator** in the same PR.
  4. Clients that receive a higher `schemaVersion` than they recognize SHOULD return a typed error (`craft_schema_version_unsupported` for craft) rather than fail open.
  5. Clients SHOULD NOT send a `schemaVersion` higher than the server supports without an explicit feature flag.
- **Consequences:** Any future field addition to `ScreenplayCraftReport` or `CreativeMemory` that is purely additive does not require a coordinated client release. Any breaking change requires both server and client to ship the migration path together.

---

## D??? — Snapshot retention: keep the last N snapshots per domain by default; configurable per call site

- **Date:** 2026-05-09
- **Status:** proposed
- **Source:** [PR #32 (T07a)](https://github.com/FramehouseStudios/them/pull/32), `backend/lib/outbox_snapshotter.js`
- **Context:** The outbox snapshotter writes a snapshot per interval and can grow unbounded. It currently prunes to keep the last 10 (`OUTBOX_SNAPSHOT_KEEP_LAST=10`). Future snapshotters (e.g., persistence health, eval-gate run summaries) will face the same retention question.
- **Decision:** Time-keyed snapshot domains in the persistence adapter follow a "keep the last N" retention policy by default, where N is configurable per call site via env var. The default N is 10. Pruning runs after each successful write. Pruning is best-effort — a prune failure logs but does not fail the write. The pruning predicate uses **lex order on the key prefix** (snapshots are keyed by ISO timestamp under a stable prefix), which assumes timestamps sort lexically — true for ISO-8601 in UTC (`Z` suffix).
- **Consequences:** Snapshots are bounded but not deduplicated; if two snapshots fire within the same millisecond they get distinct keys (the second's ISO has a different millisecond) and both retain. If sub-millisecond resolution is needed, future snapshotters can append a counter. The "last 10" default is a heuristic — operations may want longer retention for some domains; the env-var override exists for that.

---

## D??? — D001 amendment: them.io is the hosted domain for THEM

- **Date:** 2026-05-09 (amendment proposed 2026-09-04)
- **Status:** proposed
- **Source:** `DECISIONS.md:D001`, supervisor naming-drift review (claude/pii-safe-request-logs)
- **Context:** `DECISIONS.md:D001` historically declared `io.them` as the canonical product name; the human's current direction names the visible product **THEM**. Audits flagged `them.io` hosts (`api.them.io`, `them.io/privacy`, `support@them.io`, `privacy@them.io`) as potentially competing names. `them` is not a TLD, so neither `THEM` nor the historical `io.them` spelling can be a hostname.
- **Decision:** The canonical hosted domain remains `them.io`. Hostnames, URLs, and emails that use `them.io` are infrastructure for the THEM product, not competing product names. User-facing surfaces (README, App Store metadata, display name, onboarding) must use `THEM`.
- **Consequences:** No URL, email, or hostname change is required to satisfy `D001`. A domain migration to a different host would require a separate accepted decision and rollout.

---

## D??? — D011 amendment: production boot refuses to start without App Store Server API secrets

- **Date:** 2026-09-01 (amendment proposed 2026-09-04)
- **Status:** proposed
- **Source:** `DECISIONS.md:D011`, `backend/config.js:assertProductionEnv`, `backend/lib/clementine/iap_app_store_verify.js:hasCompleteAppStoreVerifyConfig`, `backend/render.yaml` (APP_STORE_* sync: false)
- **Context:** `D011` requires IAP verification fail-closed before wallet credit. `POST /billing/iap/credit` already 503s when secrets are missing, but a prod server could still boot and serve voice/screenplay without the ability to credit purchases.
- **Decision:** Production boot (`NODE_ENV=production` with `RUN_SERVER != 0`) refuses to start when any of `APP_STORE_ISSUER_ID`, `APP_STORE_KEY_ID`, `APP_STORE_PRIVATE_KEY`, or `APP_STORE_BUNDLE_ID` is missing or blank. Completeness is defined by `hasCompleteAppStoreVerifyConfig` (single source of truth). Per-variable error text names the missing key and its App Store Connect source so an operator knows which Render env var to set.
- **Consequences:** Voice, screenplay, and all routes are unavailable until the four App Store secrets are set in Render (not in `them/Release.local.env`). The guard is skipped when `RUN_SERVER=0`, which is intentional for tests (`TEST_SPAWN_BACKEND=1` / config unit tests) that do not need a live IAP verifier.
- **Trade-off:** Stricter boot means a missing IAP key blocks the entire V1 backend, not just `POST /billing/iap/credit`. This is intentional for launch: revenue integrity outranks partial availability. After launch, a separate decision could relax this to route-level fail-closed only.

---

## How to apply

Copy each entry above into `DECISIONS.md`, replacing `D???` with the next sequential ID and `Status: proposed` with `Status: accepted` (or `rejected` if you choose not to accept). Keep the `Source:` line so future readers can trace back to the design doc and PR. Reject entries you disagree with by adding them with `Status: rejected` and a one-line `Rejected because:` note.

After acceptance, this `proposed-decisions.md` file can be deleted; new proposals get added to it as design docs land in future PRs.

---

## Note — F1 page craft eval started (2026-09-01)

- **Date:** 2026-09-01
- **Status:** note (not a formal D###; awaiting human if a decision ID is needed)
- **Source:** F1 audit follow-up / docs/product/page-craft-eval.md
- **Context:** Page/scriptwriting quality was not yet measurable against the owner bar (smartest creative writer craft). Clementine voice eval (D008) covers companion voice, not page craft.
- **Decision (working):** Ship Page craft eval v1 with a six-dimension rubric, heuristic scorer (CI), optional model judge behind env flag, and synthetic PASS/FAIL Fountain fixtures. Multi-pass revise product is deferred to F2 and will consume this scorer.
- **Consequences:** backend/evals/page_craft/* and eval:page-craft enter the heuristic CI path. No god-file refactors in F1.
