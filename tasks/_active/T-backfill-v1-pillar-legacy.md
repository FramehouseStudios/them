---
id: T-backfill-v1-pillar-legacy
title: Backfill V1 pillar/effect on 13 legacy non-merged task files
owner: claude
status: review
branch: claude/T-backfill-v1-pillar-legacy
pillar: infra
v1_pillar: infra
v1_effect: closes the 13 task-missing-v1-pillar pre-flight findings against current main (rule added in #235)
---

## Scope

The V1 pillar pre-flight rule shipped in #235 flagged 13 active
task files with YAML front matter, `status: review`, and no
`v1_pillar` / `v1_effect` declarations. This PR adds the
declarations.

Pillar mapping:

| Task | Pillar | Effect |
| --- | --- | --- |
| T-block-signal-history-bounds-eval | memory | V1 line 49 guard |
| T-block-signal-history-route | memory | V1 line 49 (history surface) |
| T-block-signal-history-tracking | memory | V1 line 49 (persist samples) |
| T-coord-refresh-batch-12 | infra | round-17 merge train |
| T-coord-refresh-batch-15 | infra | round-19 merge train |
| T-decompose-phase5a-realtime-reads | realtime | V1 line 68 |
| T-protocol-infra-batch | infra | lane reminder + lib README + audit |
| T-screenplay-export-formats-list-route | screenplay | V1 line 37 |
| T-screenplay-export-markdown | screenplay | V1 line 37 |
| T-talk-turn-meta-contract-snapshot | talk | V1 line 17 |
| T-task-files-cleanup | infra | TASKS.md drift |
| T-trust-tiers | infra | operating-model |
| T-untested-libs-followups | infra | lib-test gap |

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the 13 task-missing-v1-pillar pre-flight
  findings against current main (rule added in #235).`

## Verification

- `node scripts/pre_flight.mjs` after this PR → only 10
  pre-existing `eval-missing-determinism-check` findings remain.
  Zero `task-missing-v1-pillar` findings.

## Done when

The 13 legacy task files have v1_pillar + v1_effect lines in
their YAML front matter. Pre-flight is clean for the V1 pillar
rule against current main.
