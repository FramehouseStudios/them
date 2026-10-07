---
id: T-outbox-manifest-recovery
title: Preserve queued turns when the outbox manifest is unreadable
owner: codex
status: review
branch: codex/T-outbox-manifest-recovery
pillar: mobile-first
v1_pillar: voice-to-scene
v1_effect: goal 1 — prevent queued writer input from being silently discarded after local outbox metadata corruption.
---

## Scope

Treat the offline talk outbox manifest as an all-or-nothing durable record. If
any line cannot be decoded, do not drain the partial queue or overwrite the
manifest on a later enqueue. Surface a clear writer-facing recovery error
instead of reporting that the device has no queued turns.

## Done when

- Malformed JSONL and invalid UTF-8 both fail closed, and the original manifest
  bytes remain unchanged after snapshot, retry, and enqueue attempts.
- The writer-visible status says local queued data is preserved and does not
  offer a retry action when no entry could be safely decoded.
- Focused and full signed `themTests` pass on an erased simulator; the god-file
  gate and `git diff --check` pass.
- The PR states this advances goal 1 and names the separate, still-required
  physical-device offline/relaunch proof.

## Not covered

This does not implement export/import of a corrupt recovery bundle, nor does it
prove offline delivery on a physical iPhone. Those remain follow-up work before
goal 1 can be called complete.
