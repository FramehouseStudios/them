# THEM Technical Architecture Blueprint

> Recommended implementation reference derived from product-lead material
> supplied on 2026-08-30 and normalized against the current repository. Accepted
> entries in [`DECISIONS.md`](../../DECISIONS.md) and current code/contracts
> remain authoritative when they differ from this proposal.

## Architecture decision

Build THEM as a native iPhone application with a focused SwiftUI client and
screenplay-domain packages, backed by a modular Node.js/Express API, PostgreSQL
as the production system of record, and optional Redis coordination. Keep model
and realtime access behind server-side adapters. Treat the accepted page as the
authoritative document and reconcile voice, stream, local edit, backend
acknowledgement, and restore paths explicitly.

V1 deploys one backend instance. The current auth snapshot and some global
cost/coordination semantics are not safe to market as horizontally scalable;
multi-instance operation requires the durable row-scoped work and measured
trigger documented in [`backend/DEPLOY.md`](../../backend/DEPLOY.md).

## Logical boundaries

| Boundary | Primary responsibility | Non-negotiable rule |
| --- | --- | --- |
| SwiftUI client | Interaction quality, local continuity, voice capture, and final rendering | Streamed partials and suggestions are not accepted page content. |
| Domain packages | Fountain parsing/formatting and screenplay/draft state | Keep consequential rules testable and versioned. |
| API | Validation, authorization, commands, queries, and export | Enforce ownership and idempotency where retries can duplicate effects. |
| Creative orchestration | Talk, craft, memory, and realtime coordination | Call providers only through adapters and reconcile before authoritative persistence. |
| Auth and session | Identity, rotation, revocation, verification, reset, and Apple exchange | Server-side session authority; never trust a caller-supplied identity alone. |
| Provider adapters | Model generation and realtime session behavior | Define health, timeout, fallback, metering, and failure mapping. |
| PostgreSQL | Production record for users, projects, pages, memory, history, and operational evidence | Use ordered migrations, transactions, and ownership-scoped access. |
| JSON adapters | Explicit local/test fallback | Never mistake fallback persistence for a production scaling boundary. |
| Redis | Optional distributed coordination | Do not make correctness depend on Redis in single-instance development. |

## Authoritative data flow

```text
writer intent
  -> local client handling
  -> authenticated and authorized API contract
  -> product orchestration
  -> provider adapter, when required
  -> durable authoritative write
  -> reconciled state returned to the client
```

Manual edits take precedence over generation. Optimistic or partial content
must not silently become the durable accepted page.

## Repository and deployment shape

```text
them/         SwiftUI application, clients, orchestration, privacy, release
Packages/     screenplay and draft-domain Swift packages
themTests/    application, client, state, and regression tests
themUITests/  sequential connected UI stories and fixture-gated scenarios
backend/      API, auth, stores, adapters, migrations, tests, and evals
scripts/      quality, smoke, migration, release, and project automation
docs/         contracts, decisions, launch evidence, product and runbook docs
tasks/        reviewable task records and implementation history
```

Current deployable units are the iOS app, a single V1 API service, a one-shot
migration job, and the CI/release gate. Optional workers or additional replicas
require an explicit operational need and the corresponding durability proof.

## Data architecture

Core bounded contexts are identity/sessions, projects/ownership, screenplay
documents and history, creative memory/craft/companion state, realtime session
coordination, exports, and recovery evidence.

Rules:

- every project-scoped operation proves ownership;
- memory is explicit and correctable by its owner;
- accepted page history supports recovery;
- provider output that affects the page retains only the provenance needed for
  debugging, reconciliation, and evals;
- cross-user access requires an explicit future grant model;
- the production database role must not become a shortcut around application
  ownership rules.

## Authentication and authorization

- Support email/password and Sign in with Apple as distinct real identity
  paths. A debug demo identity is not an Apple account.
- Rotate, list, revoke, verify, and reset sessions through server-owned
  contracts.
- Protect paid/provider routes with both application and user/session
  boundaries where required.
- Recheck project and memory ownership for every relevant mutation.
- Exclude credentials, tokens, screenplay content, and unnecessary personal
  data from logs.

## API and provider contracts

REST/JSON contracts use stable identifiers, additive evolution, the canonical
error envelope, bounded filters/cursors, and idempotency keys for retriable
writes with harmful duplicate effects.

Each provider adapter owns:

- structured generate/stream or realtime lifecycle operations;
- capability and health reporting;
- timeout, retry, cancellation, and fallback rules;
- cost/metering behavior;
- product-owned failure mapping.

Do not leak a provider SDK or provider-specific response shape into domain
packages.

## Reliability and failure controls

| Failure | Required behavior | Strongest proof |
| --- | --- | --- |
| Concurrent voice, edit, and stream | Reconcile explicitly and preserve accepted edits. | Deterministic reconciliation tests plus device smoke. |
| Provider timeout or partial stream | Bound retries, explain failure, and avoid a partial authoritative write. | Adapter/integration tests and live canary when credentials exist. |
| Session or device restore | Recover the last authoritative page and useful conversation context. | Restore evals plus real-device relaunch. |
| Duplicate command | Apply one durable effect through idempotency and conflict handling. | Backend contract/integration tests. |
| Ownership violation | Reject without revealing another writer's data. | Cross-account isolation tests. |
| Network partition | Preserve local continuity and show a clear offline/degraded state. | Client state and recovery UI tests. |

## Security, privacy, and observability

Threat-model unauthorized project access, session fixation/replay,
prompt/memory injection, export abuse, provider credential exposure, and supply
chain risk. Keep provider credentials server-side, use PII-safe logging, and
make deletion/export rights implementable rather than merely promised.

Collect content-safe signals for capture latency/success, reconciliation
outcomes, restore success, provider fallback, auth/ownership rejection, and
export fidelity. Secured diagnostic paths may carry scoped detail; routine
telemetry should not carry screenplay text.

## Complexity triggers

| Do not add by default | Reconsider only when |
| --- | --- |
| Additional client platforms | iPhone reliability and retention are measured and the new platform has an accepted product decision. |
| Client-side large models | A measured offline/latency benefit outweighs privacy, battery, size, and maintenance costs. |
| Workflow engine or event bus | Existing state machine, outbox, and reconciliation paths show sustained loss/backpressure or ownership bottlenecks. |
| Heavy multi-writer presence | Single-writer reliability is proven and the grant/conflict model is accepted. |
| Additional datastores | PostgreSQL plus optional Redis coordination is demonstrably insufficient. |
| Training on user content | Legal review and an explicit, transparent product opt-in are accepted. |

## Architecture proof

The architecture is ready for broader product claims only when a real
voice-to-page session can be captured, edited, interrupted, restored, and
exported without unexplained loss; ownership isolation survives adversarial
tests; provider failure cannot corrupt the accepted page; memory is inspectable
and correctable; clean-machine quality/release gates pass; and a skeptical
writer trusts the app with a real scene.
