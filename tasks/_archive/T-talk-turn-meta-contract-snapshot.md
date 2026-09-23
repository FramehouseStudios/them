---
id: T-talk-turn-meta-contract-snapshot
title: Pin /talk/turn/:turnId response key set + error codes
owner: support
status: merged
branch: support/T-talk-pipeline-error-class-snapshot
pillar: evals (contract stability)
v1_pillar: talk
v1_effect: infrastructure for V1 line 17 'Backend /talk path exists and prompt assembly is centralized' (pins talk-turn-meta envelope)
---

## Scope

`GET /talk/turn/:turnId` is a load-bearing iOS contract — the client
reads every field of the success body and switches on the error
code. A silent rename or shape change in `lib/talk_pipeline.js`
would silently regress every iOS consumer at once.

This PR adds `backend/tests/talk_turn_meta_contract.test.mjs` which
pins:

1. The full set of canonical error codes: `invalid_turn_id`,
   `turn_not_found`, `forbidden`.
2. The exact key set of the success response body (14 keys, listed
   explicitly in the test).
3. The 3 default keys on `render_contract` for legacy turns
   (`reply_role`, `authoritative_page_text_available`, `sync_ready`).
4. `Cache-Control: no-store` on the response.

The test mounts the route in isolation with stub middleware so it
runs fast and deterministic; no real talk pipeline state required.

## Done when

`backend/tests/talk_turn_meta_contract.test.mjs` covers the four
contract surfaces; `npm test` green.
