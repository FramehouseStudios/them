---
id: T-live-sync-project-readiness
title: Wait for the selected screenplay draft before opening live sync
owner: codex
status: ready
branch: codex/T-live-sync-project-readiness
pillar: mobile-first
v1_pillar: data-safety
v1_effect: prevent one screenplay's cached draft from being synchronized into another project during asynchronous project switching.
---

## Scope

Gate live-draft synchronization on the editor having loaded the selected
project's draft. Project selection changes before the network-backed project
load completes; the previous project's non-empty text must never be treated as
the new project's local draft or used as the new channel's initial snapshot.

## Done when

- A regression test switches projects while the previous draft is still in the
  editor and proves no live operation or snapshot can publish it to the new
  project's channel.
- Live sync starts once the selected project's draft has been hydrated and
  preserves the existing no-loss, checksum-base, and conflict-recovery rules.
- Focused live-sync tests and signed erased-simulator `themTests` pass; backend
  suite, god-file gate, and `git diff --check` pass.
- A draft PR stacked after the latest live-sync recovery dependency (#908 at
  discovery) names Goal 1 and records the race, fix, proof, and remaining
  coverage.
---
