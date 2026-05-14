---
id: T90
title: V1 memory and realtime diagnostics in iOS
owner: codex
status: in-progress
branch: codex/T90-v1-memory-realtime-diagnostics
pillar: ios
v1_pillar: ios
v1_effect: surfaces live memory-count and realtime-fallback state in the app so V1 support/debug flows reflect backend truth
---

## Scope

- Correct the `/memory/stats` schema doc to match the live backend envelope.
- Decode `/memory/stats` in iOS.
- Surface a compact memory-shape summary and realtime supplier controls in Data
  Controls.
- Preserve realtime fallback metadata from `/realtime/client_secret` in the
  app model and tests.

## Done when

Data Controls can refresh memory stats, realtime fallback metadata decodes, and
focused tests cover the new contracts.

## Verification

- Not run yet.
