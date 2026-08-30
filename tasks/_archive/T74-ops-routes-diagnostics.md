---
id: T74
title: Surface ops route manifest in diagnostics
owner: codex
status: merged
branch: codex/T74-ops-routes-diagnostics
pillar: mobile-first + infra
---

## Scope

Consume support agent PR #148's `GET /ops/routes` manifest from the app without
making it a noisy user-facing surface. The Studio/debug support path should be
able to tell which optional backend routes this deployment advertises.

## Done when

iOS has typed client/model coverage for `GET /ops/routes`; the app support
diagnostics/debug bundle includes route-manifest counts and groups when the
backend provides them; offline or older backends remain quiet; and the repo
handoff no longer marks PR #148 as awaiting an iOS consumer.
