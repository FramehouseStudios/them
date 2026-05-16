---
id: T139
title: Clear V1 release smoke and config gap
owner: codex
status: in-progress
branch: codex/T139-v1-release-smoke-clearance
pillar: mobile-first
v1_pillar: ios
v1_effect: attempts to clear the remaining Launch Doctor, Xcode, release preflight, and manual smoke blockers with evidence
---

## Scope

Audit the current V1 launch/release path, configure real release values when
available without committing secrets, run the Xcode build/test lane, run release
preflight with real values when available, record or block the manual smoke with
Launch Doctor evidence, and document exact results.

## Done When

- Release docs/code paths are audited.
- Xcode build/test results are recorded.
- Release preflight either passes with real values or records the exact missing
  real value/blocker.
- Launch Doctor either has a real smoke report or records why a truthful report
  cannot be generated.
- Claude has a precise backend support instruction for any smoke failure.

## Verification

- Pending.
