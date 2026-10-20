# Page cancellation: request identity and durable admission

Goal criteria: 1 (no unwanted/duplicate writes), 4 (honest recovery), 6 and 7.

## Reviewed sources

- Current integration #884 at `7d48102eb639815cc7926cb2359d1517e1e0de89`.
- Original #632 at `d3505e2b7bc7b5d26a4be18bbb1075d1fab4ca6c`:
  lifecycle identity, ordered MainActor events and interruption policy.
- Original #635 at `a7350a91ea4fa141e9a2c7ab407354a6a1e4f9ce`:
  exact request cancellation and acknowledgement, preserving queued older stops.
- Both original PR bodies were read. Original branches remain untouched.

## VERIFIED: characterization, not shipping acceptance

Run `node --test docs/audits/page-cancel-admission-repro-2026-09-30.test.mjs`.
This deliberate red review fixture imports the current #884 production store and
the exact #635 store from its Git object. It uses synthetic identities, no server
credentials, network, model call or writer content. Git objects and the local
#884 worktree must be available. It is not part of the passing backend gate.

Five tests: **2 passed, 3 failed**.

1. Current session-wide stop also cancels the newer reservation: **failed**.
2. #635 exact older-request stop leaves newer reservation usable: **passed**.
3. After #635 acknowledges an early stop, reconstruction of the store forgets
   it; the delayed request can proceed: **failed**.
4. A second independent store does not see the acknowledged stop: **failed**.
5. Owner quota is finite and fails closed; an earlier stopped request remains
   stopped in the original process: **passed**.

Tests 3/4 characterize real store boundaries, not a deployment test. They do not
prove how the current hosting configuration routes requests or restarts workers.
They do prove the store supplies no shared/durable stop admission.

## DECIDED: preserve the useful work, do not overclaim it

Preserve #632's client lifecycle and #635's exact-target/explicit-ack contract.
Do not call the process-local stop map production-safe across restart or workers.
Do not add a TTL or evict old stops without a corresponding admission boundary:
that could make an acknowledged cancellation silently restart its original work.
The original #635 body already identifies this limit; this review independently
reproduces it instead of dismissing the original work.

Next implementation must extend the canonical persistence adapter (JSON locally,
PostgreSQL in production), with owner-scoped, atomic request admission/cancel
transitions. A missing/unavailable durable store must not acknowledge a durable
stop or admit expensive work optimistically. Current page reservation factory
receives only walletStore, not persistence; current wallet persistence does not
make the page stop map durable. Hydrating a cache once is insufficient for workers.

Required proof: stop-before-admission, admission-before-stop, delayed duplicate,
restart, second worker, storage failure, owner isolation, retention boundary,
provider abort and settlement; then signed client identity/ack tests and full
backend/iOS/god-file checks. Provider billing and physical acceptance remain
unverified while paid calls are prohibited.

## GitHub / release boundaries

#766 and #770 still require an independent authorized GitHub reviewer. The current
authenticated account authored both and cannot supply its own approval. No merge,
main push, protection bypass or deployment occurred in this review.

No application code changed. Full backend and iOS suites were not rerun for this
documentation/characterization pass; earlier #884 proof is not evidence that the
new restart/cross-worker safety criteria pass.
