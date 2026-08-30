---
id: T141
title: Add safe local release config handoff
owner: codex
status: review
branch: codex/T141-release-config-local-runbook
pillar: mobile-first
v1_pillar: ios
v1_effect: unblocks release preflight as soon as real signing/backend/token values exist, without committing secrets
---

## Scope

Make the release configuration path safer and faster after T139 proved the
remaining blocker is missing real release inputs. Add a local-only release
config template and documentation so the Apple team ID and
`APP_TOKEN_RELEASE` can be supplied without editing tracked project files,
while the hosted backend remains the tracked `https://api.them.io` release
origin.

## Done When

- The repo ignores the local release config file that will hold secrets.
- A checked-in template documents the exact required keys.
- The runbook/preflight docs point to the template and final command.
- Existing preflight still fails cleanly when real values are absent.
- support agent remains in V1 smoke-failure support mode.

## Verification

- `bash -n scripts/run_release_preflight.sh` passed.
- `bash -n scripts/appstore_preflight.sh` passed.
- `scripts/run_release_preflight.sh` failed clearly when `them/Release.local.env` was absent.
- `env RELEASE_ENV_FILE=/private/tmp/io-them-release-placeholder.env scripts/run_release_preflight.sh` rejected placeholder values before invoking preflight.
- `scripts/appstore_preflight.sh` still reached the expected `fail=3 warn=1` release-config blocker state.
- `node --test scripts/run_release_preflight.test.mjs` passed 2/2.
- `node --test scripts/v1_launch_room.test.mjs` passed 5/5.
- `node --check scripts/v1_launch_room.mjs` passed.
