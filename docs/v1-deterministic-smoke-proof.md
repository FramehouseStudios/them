# V1 Deterministic Smoke Proof

This artifact records the latest deterministic V1 smoke pack result. It proves
fixture-level contracts only; it does not replace the human app smoke in
`docs/testflight-v1-preflight.md`.

## Last Verified

2026-09-05 America/Los_Angeles on branch
`claude/launch-doctor-refresh-2026-09-05`, based on current `main`
(9c74759, after #437 / #439 / #441 merged).

Previous verification: 2026-08-30 on `codex/T-v1-release-clearance-refresh`.

## Command

```sh
cd backend && npm run eval:v1-smokes
```

## Result

Passed.

All five commands in the current `eval:v1-smokes` chain passed on the first
attempt (the fifth smoke's loopback-only local backend bound without a
permission prompt this time). The full backend unit suite on the same `main`
was green the same day (2522 tests).

## Covered Smokes

- `v1-voice-to-page-smoke`: prompt shape, required content, ordering, and
  determinism passed.
- `v1-screenplay-smoke`: Fountain export fixture, ordering, and determinism
  passed.
- `v1-memory-recall-smoke`: cold-state, character-record, recall, determinism,
  and isolation checks passed.
- `v1-realtime-failover-smoke`: primary success, fallback success, fallback
  failure, and pinned-provider failure cases passed.
- `v1-realtime-learned-answer-voice-smoke`: authenticated persistence,
  turn-commit, grounding refresh, same-peer-connection continuity, and the next
  simulated spoken reply using the learned fact all passed without repeating
  the resolved question.

## Boundary

This proof is deterministic and local. It does not prove live audio capture,
live backend credentials, real provider behavior or acoustic quality, signed
release settings, or human TestFlight readiness.
