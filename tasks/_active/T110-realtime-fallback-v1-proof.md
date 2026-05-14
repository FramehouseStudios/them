---
id: T110
title: Prove realtime fallback status is user-visible
owner: codex
status: in-progress
branch: codex/T110-realtime-fallback-v1-proof
pillar: mobile-first
v1_pillar: realtime
v1_effect: closes "iOS shows degraded-mode/fallback state when stub failover is used"
---

## Scope

Add a focused Swift regression that pins the realtime fallback summary shown in
the visible realtime status text, then mark the matching V1 checklist item
complete.

## Done When

- A Swift test proves an OpenAI-primary/stub-fallback bootstrap produces a
  user-readable fallback status.
- `docs/v1-definition.md` marks the realtime fallback-state UI complete.
- `npm run v1:status` reflects the updated V1 count.

## Verification

- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' -only-testing:themTests/BackendClientCraftAPITests/testRealtimeBootstrapFallbackSummarySurfacesProviderSwitch`
- `npm run v1:status`
- `node scripts/build_tasks_md.mjs --write`
- `git diff --check`

Not run: full iOS build/themTests, because this pins a narrow already-wired
realtime UI contract.
