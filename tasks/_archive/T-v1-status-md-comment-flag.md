---
id: T-v1-status-md-comment-flag
title: v1_status.mjs --md-comment flag
owner: claude
status: merged
branch: claude/T-v1-status-md-comment-flag
pillar: infra (V1 visibility)
v1_pillar: infra
v1_effect: lets either agent paste a PR-comment-shaped V1 status block directly into a GitHub PR or issue — closes the "I want to share V1 progress in a PR comment" gap without manual formatting
---

## Scope

Adds a `--md-comment` flag to `scripts/v1_status.mjs`. Output is
PR-comment-shaped:

- `## V1 status` heading.
- `**Overall:** N/M (P%)` headline.
- The same Pillar / Done / Total / % / Next-remaining markdown
  table the default mode emits.
- A `<details><summary>Remaining work by pillar</summary>` block
  with the per-pillar remaining items (collapsed by default in
  GitHub's renderer).
- Sub-footer with the regenerate command.

When `--pillar=<filter>` matches nothing, the details block is
omitted (empty content).

## Use cases

- Paste current V1 status into a coordination PR or weekly issue.
- Use as the body of an automatic CI comment when
  `docs/v1-definition.md` changes (Codex owns that wire-up;
  this PR just provides the formatter).

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: lets either agent share V1 progress in a PR
  comment without copy-paste-and-reformat. Pairs with the
  --diff flag (#269) for "what changed this week" PR comments.`

## Verification

`node --test scripts/v1_status.test.mjs` → **7/7 pass**:
- 5 existing tests (envelope shape, wrapped-line parsing,
  grandfathered headings, single-line items, full-text recall).
- 2 new tests:
  - `--md-comment` emits the canonical PR-comment shape
    (`## V1 status`, headline, table, details block, footer).
  - `--md-comment` + non-matching `--pillar` filter omits the
    details block.

## Done when

`--md-comment` ships; output pastes cleanly into a GitHub PR
comment.

## Followups (not in this PR)

- Combine `--md-comment` with `--diff` so PR comments can
  include "since this branch's base" diff. Each flag works
  independently today; merging them is a small followup.
- Optional: a GitHub-action wrapper that runs
  `v1_status.mjs --md-comment` and posts the result on PRs
  that touch `docs/v1-definition.md`. Codex's call.
