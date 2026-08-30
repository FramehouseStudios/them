# Throughput Protocol

This file used to describe a multi-lane helper workflow. That workflow is no longer live.

## Current Rule

Throughput now means:

1. Pick the highest-value unfinished product or release blocker.
2. Make the smallest safe change that fixes the root cause.
3. Verify it with focused tests, then broader tests when risk justifies it.
4. Keep branches scoped and reviewable.
5. Do not open coordination-only churn unless it directly helps a human or future maintainer act.

## Backend Backlog Use

The compact backend backlog still lives in `docs/support-inbox.md` because existing scripts read that path. Treat the file as a backlog table, not as a live separate-owner instruction.

## Merge Discipline

- Do not push directly to `main`.
- Do not merge dirty, stale, or assistant-branded branches wholesale.
- Port useful work into a current `codex/` branch.
- Keep the README, launch proof, and human-clearance steps current when work changes release posture.
