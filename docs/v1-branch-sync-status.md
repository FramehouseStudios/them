# V1 Branch Sync Status

This file records the current release-branch integration blocker. It is not a
feature audit; it is a shipping gate. A TestFlight/release candidate cannot be
called stable while the active release branch and `main` disagree about core
backend, iOS, release, and V1 proof surfaces.

## Last Checked

2026-05-28 America/Los_Angeles on branch
`claude/backend-post-v1-audit`.

## Divergence

```sh
git rev-list --left-right --count HEAD...main
```

Result:

- `HEAD` only: 90 commits
- `main` only: 56 commits

The branches diverged after:

```text
4561ed5 Merge pull request #319 from FramehouseStudios/codex/T118-v1-readiness-proof
```

## Dry-Run Merge Result

Command used in a temporary worktree:

```sh
git merge main
```

Result: automatic merge failed with conflicts.

Conflicted files:

- `.gitignore`
- `backend/index.js`
- `docs/agent-events-2026-W20.jsonl`
- `docs/agent-events-2026-W21.jsonl`
- `docs/claude-inbox.md`
- `docs/decisions-queue.md`
- `docs/testflight-v1-preflight.md`
- `docs/v1-build-test-readiness.md`
- `docs/v1-definition.md`
- `docs/v1-two-week-free-first-schedule.md`
- `scripts/appstore_preflight.sh`
- `scripts/release_config_status.mjs`
- `scripts/release_config_status.test.mjs`
- `scripts/run_release_preflight.sh`
- `scripts/v1_manual_qa_checklist.mjs`
- `scripts/v1_manual_qa_checklist.test.mjs`
- `them.xcodeproj/project.pbxproj`
- `them/DataControlsScreen.swift`
- `them/RELEASE_RUNBOOK.md`
- `them/Release.local.env.example`
- `them/ScreenplayStudioScreen.swift`

## Integration Risk

The conflict is not just docs. The split crosses:

- backend route ownership (`backend/index.js`, auth routes, talk handler,
  account/data-control routes, release smoke behavior);
- release tooling (`appstore_preflight`, release config status, release wrapper);
- iOS data controls and Studio surfaces;
- Xcode project wiring;
- V1 proof/status artifacts.

The next sync pass must preserve the post-audit security fixes from this branch
while bringing in `main`'s route extraction, launch room, release config, and
memory export work.

## Next Safe Action

Resolve the merge in a clean worktree, then run at minimum:

```sh
node scripts/pre_flight.mjs --strict
node --test scripts/pre_flight.test.mjs
node --test scripts/v1_status.test.mjs
node --test scripts/v1_manual_qa_checklist.test.mjs
cd backend && npm test
xcodebuild build -project them.xcodeproj -scheme them -configuration Release -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```

Run the full release/manual smoke gates after the sync branch is green.
