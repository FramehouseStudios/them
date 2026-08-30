---
id: T-v1-status-reporter
title: V1 status reporter script
owner: support
status: merged
branch: support/T-v1-status-reporter
pillar: infra (V1 checklist visibility)
v1_pillar: infra
v1_effect: infrastructure for every V1 checklist item — both agents (and the human) can answer "what's left to V1?" in one command without scrolling docs/v1-definition.md
---

## Scope

Ships `scripts/v1_status.mjs` — a tiny zero-dep Node script that
parses `docs/v1-definition.md` and emits a single-screen status
report of the V1 checklist:

- Overall completion: `N/M (P%)`.
- Per-pillar table: Done / Total / % / next remaining item.
- Full "remaining work by pillar" listing under the table.
- `--json` for machine-readable output (used by future tooling).
- `--pillar=<slug-or-substring>` filter for focusing on one pillar
  (e.g. `--pillar=talk`, `--pillar=ios`, `--pillar=memory`).

## Why this is parallel-safe

Pure read of `docs/v1-definition.md` + stdout. Does not touch
`coordination.json`, `support-inbox/`, `backend/`, or any live
route. Cannot conflict with any decomp PR in flight.

## Usage

```
node scripts/v1_status.mjs            # markdown table + remaining
node scripts/v1_status.mjs --json     # machine-readable
node scripts/v1_status.mjs --pillar=talk
```

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for every V1 checklist item — gives
  both agents (and the human) a single command that reports V1
  status without scrolling the doc. Closes the "where do we stand
  on V1?" question that currently requires reading docs/v1-
  definition.md top to bottom.`

## Verification

- `node scripts/v1_status.mjs` runs from repo root and emits the
  overall total, per-pillar table, and remaining-work listing.
- `node scripts/v1_status.mjs --json` emits valid JSON with
  `overall`, `pillars[]`, and `sourcePath`.
- `node scripts/v1_status.mjs --pillar=talk` narrows to one pillar.
- Manual: counts cross-check against the `- [x]` / `- [ ]` lines
  in `docs/v1-definition.md`.

## Done when

Script ships, three invocations work, task file lands.

## Followups (not in this PR)

- Optional CI hook that emits the V1 status as a PR comment when
  `docs/v1-definition.md` changes. Out of scope here — Codex owns
  PR-comment surfaces.
- Optional `--diff <ref>` flag that shows which checkboxes flipped
  between two refs. Nice to have, not load-bearing.

## Review-blocker history

Initial v1 of this script truncated checklist items whose text
wrapped onto a continuation line (e.g.
`- [x] Character mentions, ... twists, and block` /
`      history have backend/iOS surfaces.`). The parser stopped
at the first line and dropped the tail silently.

**Fix in this PR** — `scripts/v1_status.mjs` now collects
indented (≥ 2 spaces) non-checkbox / non-heading lines that
follow a checkbox into the same item, finalizing on the next
checkbox, heading, blank, or EOF.

**Regression test in this PR** — `scripts/v1_status.test.mjs`
includes a `wrapped checkbox text is joined into a single item`
assertion that pins the full text of an actual wrapped item
from `docs/v1-definition.md` (the iOS-release-readiness "Current
iOS build ... after the next app-visible feature." line).
