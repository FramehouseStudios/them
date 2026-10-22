# T-1117 — Owned talk metadata authorization

Parent `a2ad8d6c7fab31e70f9a4f5fa71b2c51edbcbabc`.
Branch `codex/T-1117-turn-metadata-isolation`.
Runtime `6b2d83df81dfe5d0f93ad36b2b9bd4397d01a68b`.
Local verified fix; not merged, deployed or a claim about current production.

## Root issue: reproduced through real local HTTP

The prior source-level concern is now verified at the actual route. Two real
local accounts signed up, authenticated and obtained separate sessions. A's
authenticated `/talk` produced a turn. B's JWT plus A's previous client token
read A's reply: HTTP200, where the regression required403. Baseline **0 passed /
1 failed / 0 skipped**. No production probing or real user data was involved.

This requires the turn identity and earlier owner's client token; it is not
evidence that arbitrary signed-in users can enumerate all other writers' work.
The probe used REQUIRE_USER_AUTH=true and a non-`them-dev` app token. STT/chat/
TTS were intercepted; signup, JWT attachment, session, route and storage were
real local backend behavior. External networking was disabled in the container.

Two bugs interacted: known-owner mismatch fell through to legacy session/IP
authorization, and metadata user IDs acquired repeated `user:` prefixes on
store/read/comparison. Legitimate JWT-only reads therefore could not reliably
establish equality. Domain-key normalization does not belong in this identity
field.

## Fix and exact files

- `backend/lib/talk_turn_read_policy.js`: one extracted read capability. An
  owned turn requires the matching server-attached identity; it never falls
  back to session/IP or caller-supplied owner headers after mismatch.
- `backend/index.js`: wires that capability and keeps the raw canonical auth
  ID in metadata. Removes the inline policy, including its developer override.
  Ownerless legacy turns still need a matching client token or named IP session;
  missing owner plus missing session no longer means unrestricted access.
- `backend/tests/talk_turn_owner_isolation.test.mjs`: real two-account HTTP,
  canonical returned user ID, prior token/header impersonation and owner reads.
- `backend/tests/talk_turn_read_policy.test.mjs`: known-owner/missing-session,
  header rejection, trusted identity precedence and ownerless compatibility.
- `TASKS.md` and this report: current proof and next implementation target.

Existing JSON field names, the 403 `forbidden` envelope and route rate limiting
are unchanged. `user_id` now contains the actual auth ID, not a repeatedly
prefixed storage key. The Swift turn payload does not decode this field; the
current client was also exercised against the corrected backend. This is a
bug correction, not a new authentication mechanism or a global owner-key
migration. Existing in-memory turn metadata is not a persistent migration.

## Final route evidence

| Authenticated reader | Client token / header | HTTP |
|---|---|---:|
| A | A's client token | 200 |
| A | No client token | 200 |
| B | B's client token | 403 |
| B | A's previous client token | 403 |
| B | A's token plus claimed A owner header | 403 |
| Signed out | A's token plus claimed A header | 401 |

The regression checks error envelopes, absence of leaked reply on denial, and
that returned owner ID equals A's actual signup identity. The focused green run
preceded only stronger raw-ID/exact-envelope assertions; the full suite contains
those final assertions.

## Verification

- Node20.20.2 focused owner/route/shape/rate-limit cases: **14/0/0**.
- Fresh full `npm test`, Node20.20.2: **2915 passed / 0 failed / 2 skipped**,
  2917 total, approximately88.46s. Skips: real Postgres prefix query has no
  DATABASE_URL; optional live page-sync case lacks TALK_TEST_PAGE_SYNC_LIVE.
  Neither skip is represented as live storage/provider proof.
- Signed actual Home raw-audio → server transcript → formatted page → saved
  restoration UI against this fixed backend: **1/0/0**. Local Node24.19.0 host;
  intercepted STT1/chat2/TTS1. No real microphone/model-quality claim.
- Native source is unchanged from a2ad8d6. No fresh themTests or macOS build was
  run just for this backend-only change; prior native proof is referenced in
  `offline-talk-metadata-custody-2026-10-21.md`, not relabeled as a new run.
- D009: index33538 →33513 (**-25**); Studio17337, Root14937, bridge12860 and
  MemoryAPI10463 unchanged. Syntax checks and `git diff --check` pass.

Native UI proof uses normal signing and erased task-owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2. No unsigned tests
or unrelated simulator erase. No paid calls, secrets, deployment, main push or
original PR-head rewrite. All four code files match frozen final source
`/tmp/them-1117-final-source.wr28rM/source`. Signed result/logs are preserved at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1117-20261021.DpgNFZ/`.

## Adversarial disposition and remaining work

Answered at this boundary: known-owner mismatch, retained previous client token,
claimed owner header, missing client token for a legitimate owner, signed-out
owned access, ownerless token/IP compatibility, missing owner/session rejection,
unchanged response shape/rate limits and actual client continuity.

Not claimed: entire-system security, live Postgres, a production deployment,
production incident scope, real model quality or physical-phone validation.
Ownerless legacy IP sessions still share the existing address-based scope; this
fix must not be marketed as private-account isolation for that legacy mode.

Return to T-1116: connect the retained response to intended-document playback,
page insertion and a durable delivery identity before acknowledgement. Preserve
newer writer edits and prevent crash/relaunch double insertion. Publish the
existing owner-scoped update after full metadata becomes ready. The server-
restart-before-capture durability window remains open and must be handled or
explicitly bounded in the final real-world proof. The overall goal stays active.
