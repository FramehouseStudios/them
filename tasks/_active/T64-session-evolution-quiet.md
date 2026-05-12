---
id: T64
title: Quiet offline session-evolution launch probe
owner: codex
status: review
branch: codex/T64-session-evolution-quiet
pillar: mobile-first + infra
---

## Scope

After T62 quieted export-format discovery, offline/test Studio launches still
surface a localhost `/session/evolution` connection failure from an automatic
launch probe. This task applies the same conservative policy: only auto-refresh
when the app has backend-backed session context and never during XCTest. While
tracing the launch path, the same XCTest/offline quieting now covers automatic
health, hydration, keychain-token, history, project-outline, preferred-project,
and navigator probes that were also surfacing localhost noise.

## Done when

App/test launches no longer surface noisy localhost `/session/evolution`
connection failures when no backend session has been loaded, and related
startup probes stay quiet during XCTest/offline startup; manual or
backend-backed refresh remains available; focused tests cover the quiet policy.
