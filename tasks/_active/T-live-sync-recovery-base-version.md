---
id: T-live-sync-recovery-base-version
title: Preserve live-sync recovery base across reinstall
owner: codex
status: review
branch: codex/T-live-sync-recovery-base-version
pillar: mobile-first
v1_pillar: data_safety
v1_effect: preserve original screenplay base version in account-backed recovery so stale restores cannot silently overwrite newer work
---

## Scope

Preserve the original active screenplay version ID with each account-backed live-sync recovery copy, so restoring a copy after reinstall still uses stale-base conflict detection instead of silently overwriting newer server work.

## Done when

- Recovery upload accepts and durably stores `base_version_id` without activating the recovery copy.
- The serialized recovery version returns that base ID after persistence/reload.
- iOS sends the captured base version and uses the server-backed recovery's base when offering Recover Local; legacy records with unknown bases fail closed instead of assuming the latest version.
- Tests prove the exact base survives the request, store, and response, and a recovered stale base cannot overwrite the newer active version.
- Focused and full backend/iOS checks, god-file gate, and `git diff --check` pass. Do not grow `backend/index.js`.
