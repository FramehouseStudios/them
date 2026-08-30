---
id: T-runbook-smoke-section-drift-fix
title: Correct v1_voice_to_page and v1_screenplay smoke sections in runbook
owner: support
status: merged
branch: support/T-runbook-smoke-section-drift-fix
pillar: infra (operator docs)
v1_pillar: infra
v1_effect: corrects two smoke-section descriptions in `docs/runbook-v1-smoke.md` against the actual smoke bodies — operators were being sent to the wrong file when a smoke failed
---

## Scope

`docs/runbook-v1-smoke.md` shipped via #251 with two drifted
smoke-section descriptions:

### Section 1: `v1_voice_to_page_smoke`

Original text claimed the smoke verifies:
- "Response envelope keys match `docs/schemas/talk-response.md`."
- "Meta block matches `docs/schemas/talk-turn-meta.md`."
- "Block-signal stamping fires when fixture content triggers it."
- "Memory record is enqueued."

None of those are what the smoke actually does. The smoke
verifies **prompt-assembly shape** (what we send the LLM), not
response envelopes (what we return to iOS). The smoke header in
`scripts/v1_voice_to_page_smoke.mjs` says so directly.

### Section 2: `v1_screenplay_smoke`

Original text claimed the smoke verifies:
- "Character lines render before action lines under the same
  scene."
- "Transitions render between scenes."

The smoke is **fixture-driven**: it checks against
`expected_fountain_contains[]` and `expected_fountain_ordering[]`
in `backend/fixtures/v1_screenplay_export.json`. Neither of the
specific behavioral claims is in the fixture's expected lists,
and the fixture has no transitions to verify. The per-line-kind
serialization rules live in
`backend/tests/fountain_export_deeper.test.mjs` (#258), not in
this smoke.

## How this happened

I authored #251 with these claims and self-audited the
v1_voice_to_page section in a follow-up push, but the PR was
merged from an earlier state. The v1_screenplay drift was
caught in the second self-audit pass after merge.

This PR lands both corrections against current main.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: corrects the operator runbook so a smoke failure
  reading sends operators to the file that actually produced
  the failure. Same class of issue as the #245 docs-vs-code
  drift Codex caught.`

## Verification

- Both rewritten sections match the actual smoke bodies in
  `scripts/v1_voice_to_page_smoke.mjs` and
  `scripts/v1_screenplay_smoke.mjs`.
- The fixture-driven nature of v1_screenplay_smoke is now
  pointed to + cross-referenced with fountain_export_deeper
  (#258) which pins the serializer rules.
- Pure documentation change; no code touched.

## Done when

Two smoke sections in the runbook match what the scripts
actually do.
