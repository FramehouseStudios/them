---
id: T-decompose-phase7c-talk-supplier-glue
title: Decompose backend talk supplier glue
owner: codex
status: review
branch: codex/T150-phase7c-takeover
pillar: infra
v1_pillar: talk
v1_effect: completes the approved Phase 7 talk-pipeline decomposition by extracting STT/chat/TTS supplier glue without changing V1 talk behavior
---

## Scope

Codex is taking over this implementation after the Phase 7c lane sat
unclaimed with no Claude branch or PR after T149 unblocked it.

Implement the merged Phase 7c design note from
`tasks/_proposals/T-decompose-phase7c-supplier-glue-design.md`.

Extract the STT, chat, and TTS supplier-selection and supplier-call glue from
`backend/lib/talk_handler.js` into `backend/lib/talk_supplier_glue.js`.

The approved public shape is exactly three factories:

- `createSttSupplier(...)`
- `createChatSupplier(...)`
- `createTtsSupplier(...)`

`handleTalkRequest` should receive/use those suppliers without changing the
observable `/talk` contract.

## Constraints

- Byte-identical behavior only.
- No new suppliers.
- No retry, timeout, stage-name, error-code, error-counter, payload, streaming,
  or audio-metadata changes.
- No route/API contract changes.
- No module-level mutable state.
- No setter exports.
- Do not touch release config, auth, privacy, memory delete, PR #33, Phase 6.1,
  or schema-only docs in this task.

If implementation exposes a required contract change, stop and write the
specific blocker instead of broadening the PR.

## Done When

- `backend/lib/talk_supplier_glue.js` exists and exports the three approved
  factories.
- `backend/lib/talk_handler.js` uses the extracted suppliers with unchanged
  behavior.
- Focused tests cover the supplier factories in
  `backend/tests/talk_supplier_glue.test.mjs`.
- Deterministic dependency-closure proof from the Phase 7b acorn/acorn-walk
  tooling is recorded in the PR description.
- Verification passes:
  - `node scripts/pre_flight.mjs --strict`
  - `node --test backend/tests/talk_*.test.mjs`
  - `cd backend && npm test`
  - `git diff --check`
- PR description includes:
  - `V1 pillar: talk`
  - `V1 effect: infrastructure for V1 talk-pipeline maintainability`
  - exact commands run and not run.
