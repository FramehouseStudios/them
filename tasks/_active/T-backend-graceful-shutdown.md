---
id: T-backend-graceful-shutdown
title: Drain in-flight requests on SIGTERM before exit
owner: support
status: ready
branch: -
pillar: infra (enables all)
v1_pillar: talk
v1_effect: closes the 'deploy interrupts in-flight talk' gap; today SIGTERM during a deploy kills every streaming /talk turn mid-response.
---

## Scope

Spec: `docs/specs/T-backend-graceful-shutdown.md`.

`lib/shutdown.js` helper wired from `index.js`: stop accepting
connections, drain in-flight (talkInFlight), drain outbox tick,
close backplane + persistence, exit 0. `/healthz` returns 503
during drain. `SHUTDOWN_GRACE_MS` default 25s.

## Done when

- SIGTERM with 2 in-flight talk turns: both finish before exit;
  exit before 25s.
- `/healthz` returns 503 within 100ms of SIGTERM.
- New connections refused during drain.
- After grace timeout, process exits even with in-flight (warn log).
