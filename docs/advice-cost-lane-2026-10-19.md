# T-998 — Advice is not a Page reservation

## Root defect and smallest correction

VERIFIED against parent6d94c08f: advice/planning/negative requests infer no
Page destination, but cost intent still selects Page. Real in-memory wallet
and Page reservation stores reproduce credit holds and false wallet_empty.
Failing-first suite3 pass/9 fail/0 skip: /tmp/them-998-before.log.

Extract the existing advice/planning predicate from screenplay_turn_target.js
to one pure canonical owner, screenplay_request_guard.js, and import it into
both inference and cost classification. Add explicit knowledge-question
prefixes; do not confuse quoted story material after a colon with commands.
Skip lexical Page/beta promotion for these requests, then use existing
non-Page intent rules. Explicit Page/continue/forced-intent controls retain
their existing contract. No rates, billing arithmetic, provider or release
policy changed; Deep/Companion accounting is outside this correction.

Focused52/0/0 on host Node26: /tmp/them-998-focused.log. Covers real store
holds, no Page credit for advice, Page balance enforcement/cancel release,
explicit controls, existing mentor intents and the production sanitizer.
Real authenticated /talk handler, transport-only provider stub: advice reaches
generation with Page balance0, returns200 without error_recovered, preserves
the entire saved project; subsequent actual Page request returns402. Anonymous
project read remains401. Fixed generated advice is not model-quality proof.

Full pinned Node20 regression remains required before readiness. No new signed
Swift/UI run claimed: no Swift, project, package or UI source changed here.
Integrated writer/UI proof is still required when these branches combine.
Production remains blocked until App Store credentials exist. No paid calls.

## Separate security finding

A loopback-only probe with two synthetic authenticated accounts reproduced
an unrelated wallet-read ownership defect. Sanitized output is retained at
/tmp/them-wallet-owner-probe-20261019.log; no production records, credentials
or identities were queried or printed. T999 owns that correction and its
server-side authorization proof. This branch does not claim to fix it or
certify complete billing security.

## Exact files

- backend/lib/clementine/intents.js
- backend/lib/screenplay_turn_target.js
- backend/lib/screenplay_request_guard.js
- backend/tests/screenplay_advice_lane.test.mjs
- backend/tests/talk_empty_billing.integration.test.mjs
- backend/tests/helpers/billing_provider_stub.mjs
- TASKS.md
- docs/advice-cost-lane-2026-10-19.md
