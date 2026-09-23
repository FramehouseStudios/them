---
id: T-backend-graceful-shutdown
title: Drain in-flight requests on SIGTERM before exit
owner: codex
status: merged
branch: codex/T383-graceful-shutdown
pillar: infra (enables all)
v1_pillar: talk
v1_effect: closes the deploy-interruption gap by giving active streaming talk turns a bounded drain window before process exit.
---

## Scope

Spec: `docs/specs/T-backend-graceful-shutdown.md`. The current backend already
had a partial inline eight-second close path; this task replaces it with the
bounded project-owned lifecycle helper and closes readiness/background-work
races discovered during implementation.

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

## Local verification

- Focused shutdown, health, outbox, account-purge, and logging tests pass
  (50/50).
- A real backend subprocess drains two simultaneous streaming talk turns,
  refuses new sockets, logs `shutdown_done`, and exits `0` inside the grace
  period.
- Full backend verification passes with 2,295/2,297 tests and two expected
  environment-gated skips.

## Follow-ups

- Repeated identical OS signals currently retain Node's operator force-stop
  behavior because signal handlers use `process.once`; controller re-entry and
  mixed-signal re-entry are idempotent.
- The diagnostic outbox snapshotter should eventually serialize overlapping
  timer ticks so shutdown can await every best-effort snapshot write, not only
  the most recently assigned promise.
