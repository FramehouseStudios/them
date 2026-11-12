# T-1078 — Atomic admission for a held screenplay save

## Self-audit finding

T1077's source handoff guard correctly refuses to post a waiting request
after account/project/choice changes, but its retention path made two actor
calls: enqueue as pending, then markParked. Another queue action could occur
between those calls. The canonical enqueue also deduplicates same-text,
same-base active saves by returning without storing the new ID; marking that
new ID parked would then silently do nothing. These are source-established
gaps, not a claimed native causal trace of the earlier hosted Save Now red.

## Smallest root correction

Prepare the immutable captured request as parked before entering the existing
queue. One synchronous actor transaction admits and persists it, without an
intermediate runnable state. Distinct held intent is not deduplicated against
an active save. Existing identity checks still reject owner/project misuse;
re-admitting the same ID as held persists its state transition rather than
returning an unchanged active entry. On failed persistence, in-memory queue
state rolls back and the existing UI error path reports the retention failure.

No alternate store, new queue/framework, provider, endpoint or user-facing
feature. Ordinary active retry deduplication stays unchanged. Later original
conflict/byte-exact retention capabilities remain preserved in their stack;
this does not certify every legacy normalized-dedup or authority path.

## Focused evidence plan

Use the real queue and actual persisted/reopened records:

- active and held same-text intents both survive with their own identity;
- held saves cannot be selected for forced auto-replay;
- an existing active ID can become durably held in one call;
- a real blocked destination throws and restores the in-memory queue.

VERIFIED: the three new cases and existing affected queue/slot cohort passed
**20/0/0**, native exit0, signed on the erased owned375-point SE
E8998A6B-35B1-49E3-896C-861550849927/iOS26.2(23C54). Actual native bundle:
`/tmp/them-1078-focused/v1-ui-smoke-local-1-56406.xcresult`.
No failing-before native run is claimed. Existing compiler warnings remain.
All five D009 deltas0 against main78b8c94f; diff check passed.
No broader local suite or model call; fresh
required hosted proof and non-author review still gate any main merge.
No earlier green run is a substitute for a changed source head.

## Limits

No new full unit/backend/V1/macOS, live-provider, physical-phone or external
Files proof is claimed. Current main remains separate from this original
draft PR. No direct-main, force/squash, replacement PR, automatic approval or
production action. The production-credential hold remains unchanged.
