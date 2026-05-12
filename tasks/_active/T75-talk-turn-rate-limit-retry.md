---
id: T75
title: Surface talk-turn rate-limit retry affordance
owner: codex
status: merged
branch: codex/T75-talk-turn-rate-limit-retry
pillar: mobile-first + infra
---

## Scope

Consume Claude PR #170's optional `GET /talk/turn/:turnId` `429 rate_limited`
contract from the app. Turn-meta enrichment is secondary to the main talk
response, so the UI should keep the response and show a friendly retry interval
instead of surfacing raw HTTP JSON.

## Done when

The app parses `error=rate_limited` plus `retry_after_ms`/`Retry-After` from
talk-turn metadata reads; `BackendTalkResult` carries a typed retry notice; the
root experience shows a transient human-readable retry banner when metadata is
rate-limited; focused tests cover parsing and banner copy; and the repo handoff
no longer marks PR #170 as awaiting an iOS consumer.
