# V1 Branch Sync Status

This file records the current release-branch integration state. It is not a
feature audit; it is a shipping gate.

## Last Checked

2026-05-28 America/Los_Angeles on branch
`codex/talk-handler-live-parity`.

## Status

Resolved. The active release branch has merged `origin/main` through:

```text
9f93a9b Strengthen agent execution protocol
```

Before this sync pass, the branch was behind `origin/main` by two protocol
commits. The merge conflicted only in coordination files:

- `docs/agent-events-2026-W21.jsonl`
- `docs/support-inbox.md`

Both conflicts were resolved by preserving the current Day 14 release truth and
the newer main protocol events.

## Current Divergence

Current relationship:

```sh
git rev-list --left-right --count origin/main...HEAD
```

Result as of this check:

- `origin/main` only: 0 commits
- release branch only: 102 commits

## Remaining Release Blockers

Branch sync is no longer the blocker. The remaining V1 blockers are private or
human-gated:

- create and fill ignored `them/Release.local.env`;
- provide `DEVELOPMENT_TEAM_ID`;
- provide production `APP_TOKEN_RELEASE`;
- run the five Launch Doctor manual gates on the release path.

Do not claim TestFlight readiness until the private-input release preflight and
human V1 manual smoke are green.
