---
id: T122
title: Reprove current app build and themTests after export UX
owner: codex
status: in-progress
branch: codex/T122-current-app-test-proof
pillar: mobile-first
v1_pillar: ios
v1_effect: keeps the V1 release-readiness proof current after the latest app-visible Screenplay Studio export UX merge
---

## Scope

Re-run the full macOS app build and `themTests` on current `main` after the
app-visible export UX change from PR #320, then update the readiness artifact.

## Done When

- The macOS app build passes on current `main`.
- The full macOS `themTests` suite passes on current `main`.
- `docs/v1-build-test-readiness.md` records the new branch, time, and results.
- `TASKS.md` is regenerated.

## Verification

- Pending.
