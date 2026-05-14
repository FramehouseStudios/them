---
id: T-v1-status-diff-flag
title: v1_status.mjs --diff=<ref> flag
owner: claude
status: review
branch: claude/T-v1-status-diff-flag
pillar: infra (V1 visibility)
v1_pillar: infra
v1_effect: lets either agent + the human see which V1 checkboxes flipped between two refs (e.g. since last week, since v0.9-tag) without comparing two `v1_status` runs by hand
---

## Scope

Adds a `--diff=<ref>` flag to `scripts/v1_status.mjs`. The flag
reads `docs/v1-definition.md` at the given git ref, parses it
through the same parser, and surfaces:

- **✓ newly done** — items that flipped `[ ]` → `[x]`.
- **✗ flipped back to undone** — items that flipped `[x]` → `[ ]`.
- **→ moved pillar** — items whose H2 section changed.
- **+ added** — items only in the current doc.
- **- removed** — items only in the historical doc.

Item identity is the trimmed text after the checkbox. Two items
with the same text in different pillars are tracked as
`movedPillar` rather than `removed + added`.

## Output modes

- **Default** — appends a `Diff vs <ref>:` section under the
  remaining-work listing, with sub-sections for each diff
  category. Empty diff prints `(no changes)`.
- **`--json`** — adds a `diff: { ref, flippedDone[],
  flippedUndone[], movedPillar[], added[], removed[] }` block
  to the JSON envelope.

## Use cases

- **Weekly status** — `node scripts/v1_status.mjs --diff=HEAD~50`
  to see "what flipped this week."
- **Pre-release sanity** — diff against the tag of the last
  successful smoke run to confirm no V1 items regressed.
- **PR review** — surface checkbox flips a PR introduces (useful
  when a PR docs-change touches v1-definition.md).

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: lets either agent + the human see which V1
  checkboxes flipped between two refs. Closes the "what changed
  since last week?" question that previously required diffing
  two raw status outputs by hand.`

## Verification

`node --test scripts/v1_status.test.mjs` → **8/8 pass**:
- 5 existing tests (envelope shape, wrapped-line parsing,
  grandfathered headings, single-line items, full-text recall)
- 3 new tests:
  - `--diff=HEAD` against itself shows no changes (each list
    empty, ref echoed)
  - `--diff=<bad-ref>` exits non-zero with descriptive error
  - Text mode includes `Diff vs <ref>:` header

## Done when

`--diff=<ref>` flag ships, both output modes render the diff,
regression tests pass.

## Followups (not in this PR)

- Optional `--diff-only` flag to suppress the current-state
  output and emit only the diff block. Useful for CI comments.
- Optional `--diff-from=<ref> --diff-to=<ref>` for comparing two
  arbitrary refs (not just current vs ref). Nice to have.
