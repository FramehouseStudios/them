# V1 Deterministic Smoke Proof

This artifact records the latest deterministic V1 smoke pack result. It proves
fixture-level contracts only; it does not replace the human app smoke in
`docs/testflight-v1-preflight.md`.

## Last Verified

2026-05-15 01:08 America/Los_Angeles on branch
`codex/T125-deterministic-v1-smoke-proof`.

## Command

```sh
cd backend && npm run eval:v1-smokes
```

## Result

Passed.

## Covered Smokes

- `v1-voice-to-page-smoke`: prompt shape, required content, ordering, and
  determinism passed.
- `v1-screenplay-smoke`: Fountain export fixture, ordering, and determinism
  passed.
- `v1-memory-recall-smoke`: cold-state, character-record, recall, determinism,
  and isolation checks passed.
- `v1-realtime-failover-smoke`: primary success, fallback success, fallback
  failure, and pinned-provider failure cases passed.

## Boundary

This proof is deterministic and local. It does not prove live audio capture,
live backend credentials, real supplier minting, signed release settings, or
human TestFlight readiness.
