---
id: T141
title: Add safe local release config handoff
owner: codex
status: in-progress
branch: codex/T141-release-config-local-runbook
pillar: mobile-first
v1_pillar: ios
v1_effect: unblocks release preflight as soon as real signing/backend/token values exist, without committing secrets
---

## Scope

Make the release configuration path safer and faster after T139 proved the
remaining blocker is missing real release inputs. Add a local-only release
config template and documentation so the Apple team ID, hosted backend URL, and
production app token can be supplied without editing tracked project files.

## Done When

- The repo ignores the local release config file that will hold secrets.
- A checked-in template documents the exact required keys.
- The runbook/preflight docs point to the template and final command.
- Existing preflight still fails cleanly when real values are absent.
- Claude remains in V1 smoke-failure support mode.

## Verification

- Pending.
