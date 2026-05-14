# docs/schemas — INDEX

Canonical envelope and record schemas for the io.them backend.
Each doc captures the field set, access-control posture, owner,
invariants, and compatibility rules for one envelope or record.

## Auth surface

| Doc | Covers | Posture |
| --- | --- | --- |
| [auth.md](auth.md) | shared `/auth/*` success + error envelope (11 routes) | TIER-3 SENSITIVE |
| [apple-auth.md](apple-auth.md) | `POST /auth/apple` request + response | TIER-3 SENSITIVE |
| [password-reset.md](password-reset.md) | `request_password_reset` + `reset_password` | TIER-3 SENSITIVE |
| [email-verification.md](email-verification.md) | `request_email_verification` + `verify_email` | TIER-3 SENSITIVE |
| [session.md](session.md) | `POST /session` lifecycle envelope (client token + bootstrap) | TIER-3 SENSITIVE |

## Talk surface

| Doc | Covers | Posture |
| --- | --- | --- |
| [talk-response.md](talk-response.md) | `POST /talk/turn` response envelope | PER-USER |
| [talk-turn-meta.md](talk-turn-meta.md) | meta block embedded in talk responses | PER-USER |
| [talk-errors.md](talk-errors.md) | `GET /talk/errors` ops error-rate envelope | SAFE-PUBLIC |
| [talk-turn-stats.md](talk-turn-stats.md) | `GET /talk/stats` aggregate talk-turn stats | SAFE-PUBLIC |

## Screenplay surface

| Doc | Covers | Posture |
| --- | --- | --- |
| [screenplay-project.md](screenplay-project.md) | `GET /screenplays` + project list shape | PER-USER |
| [screenplay-version.md](screenplay-version.md) | per-version record shape | PER-USER |
| [fountain-export.md](fountain-export.md) | `POST /screenplay/export/fountain` request + response | PER-USER |
| [fdx-export.md](fdx-export.md) | `POST /screenplay/export/fdx` request + response | PER-USER |

## Memory surface

| Doc | Covers | Posture |
| --- | --- | --- |
| [memory-stats.md](memory-stats.md) | `/memory/stats` envelope | PER-USER |
| [block-signal.md](block-signal.md) | block-signal record shape | PER-USER |
| [block-signal-history.md](block-signal-history.md) | `GET /memory/block-signal/history` envelope | PER-USER |
| [memories-list.md](memories-list.md) | `GET /memories` iOS memory-list envelope | PER-USER |
| [memories-mutate.md](memories-mutate.md) | `POST /memories/{update,forget,promote,feedback}` mutation envelopes | PER-USER |
| [memories-export.md](memories-export.md) | `GET /memories/export` full memory dump | PER-USER |
| [history.md](history.md) | `GET /history` + `POST /history/annotate_turn` envelopes | PER-USER |

## Tasks surface

| Doc | Covers | Posture |
| --- | --- | --- |
| [tasks.md](tasks.md) | `GET /tasks` + `POST /tasks/update` envelopes | PER-USER |

## Realtime surface

| Doc | Covers | Posture |
| --- | --- | --- |
| [realtime-client-secret.md](realtime-client-secret.md) | `POST /realtime/client_secret` | TIER-3 SENSITIVE |
| [realtime-health.md](realtime-health.md) | `GET /realtime/health` | SAFE-PUBLIC |

## Visual surface

| Doc | Covers | Posture |
| --- | --- | --- |
| [visual-context.md](visual-context.md) | `POST /visual/context` request + response | TIER-3 SENSITIVE |

## Ops surface

| Doc | Covers | Posture |
| --- | --- | --- |
| [ops-metrics.md](ops-metrics.md) | `/ops/metrics` | SAFE-PUBLIC |
| [ops-health-summary.md](ops-health-summary.md) | `/ops/health/summary` | SAFE-PUBLIC |
| [outbox-routes.md](outbox-routes.md) | `GET /outbox` + `POST /outbox/retry` operator HTTP envelopes | PER-USER (internal) |

## Daily / weekly surfaces

| Doc | Covers | Posture |
| --- | --- | --- |
| [recap.md](recap.md) | `GET /recap` + `GET /recap/today` daily-recap envelope | PER-USER |

## Internal records

| Doc | Covers | Posture |
| --- | --- | --- |
| [outbox-event.md](outbox-event.md) | outbox store record shape | PER-USER (internal) |
| [persona-snapshot.md](persona-snapshot.md) | persona record shape | PER-USER |

## Coordination records

| Doc | Covers | Posture |
| --- | --- | --- |
| [agent-events.md](agent-events.md) | `docs/agent-events-*.jsonl` event-lane record shape | SAFE-PUBLIC |

## Access-control posture key

| Tier | Meaning |
| --- | --- |
| **SAFE-PUBLIC** | No PII, no tokens, no rate-limit-bypassing data. Safe to expose under public-facing observability. |
| **PER-USER** | Carries data scoped to one user. Authenticated read; never bulk-exposed. |
| **TIER-3 SENSITIVE** | Carries tokens, session ids, or auth state. Must not leak into logs or non-production responses except via `allowDebugTokens`. |

## Schema versioning rule

Every envelope is `v1` today. Additive changes stay at v1; field
removals or meaning-changes bump to v2 and add an explicit
`schema_version` field at the same time.

## Owners

Each doc names a Backend owner (Claude) and an iOS consumer
(Codex) where applicable. Schema changes that affect the iOS
decoder are coordinated via a `note` event on the agent-event
lane and a DECISIONS.md entry before the PR opens.

## How to add a new schema doc

1. Create `docs/schemas/<name>.md` matching the section pattern
   in any existing doc: Endpoint(s), Schema version, Owner,
   Access-control posture, Field tables, Errors, Invariants,
   Compatibility rules, Changelog.
2. Add the doc to this INDEX under the appropriate surface.
3. Reference the new doc from the relevant `backend/lib/*.js`
   header comment so future readers find it.
