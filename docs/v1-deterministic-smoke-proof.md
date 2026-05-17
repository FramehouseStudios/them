# V1 Deterministic Smoke Proof

This artifact records the latest deterministic V1 smoke pack result. It proves
fixture-level contracts only; it does not replace the human app smoke in
`docs/testflight-v1-preflight.md`.

## Last Verified

2026-05-16 13:57 America/Los_Angeles on branch
`codex/T137-post-phase7b-v1-smoke-proof`.

## Command

```sh
cd backend && npm run eval:v1-smokes
```

## Result

Passed.

Latest refresh is after Phase 7b talk-handler extraction and the Launch Doctor
CLI proof recorder landed on `main`.

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
