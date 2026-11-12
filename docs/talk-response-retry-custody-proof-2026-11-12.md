# Talk response retry custody — 2026-11-12

## Result and scope

Runtime checkpoint **46d2542ee475556ed26b681121b7bf440d61c5ca** preserves the
published backup52f932fe and all six original fix commits. This is a recovery
backup, not merged main, a replacement PR, or a deployment. The fixes extend
existing talk guards, the backplane and the JSON adapter. No schema, dependency,
provider, public success contract, native view or monitored god file changed.

## Root causes fixed

1. **Session ownership before waits — 8069dcc9.** A session was claimed and
   disconnect listeners registered after awaiting a distributed lease. Two local
   requests could enter, and a closed request could continue after a late ACK.
   Claim/listen before the wait; late cleanup checks the exact owner.
2. **Owned pending retirement — b39e8c7b/d7561b9b.** Finish/error cleanup deleted
   by key while storage had already prepared a response. Capture a fresh server
   admission nonce and conditionally retire only that exact pending snapshot.
   Transition publication also requires the captured exact local owner.
3. **Cross-worker completion — 01666717.** A second worker could complete a
   prepared response while the original preparation ACK was delayed. The first
   worker lost its completion CAS but kept an unexpiring local prepared receipt,
   returning503 forever over valid completed storage. On typed conflict, read
   authority once and invalidate only the exact stale owner if a changed live
   replacement is confirmed. Rethrow the original conflict; no automatic new
   generation. Null/expired/read-error/unchanged authority remains fail-closed.
4. **Corrupt encoded responses — e38677e5.** The decoder converted malformed
   strings, unknown encodings and invalid base64 to an empty Buffer, allowing a
   blank successful replay. Reject malformed records with the constant safe
   TALK_IDEMPOTENCY_CORRUPT_RECORD error. Validate canonical base64 and legacy
   byte arrays; preserve valid empty bodies and raw Buffers. Redis malformed JSON
   uses the same typed error, including the refresh path; unrelated transport
   policy is unchanged. Stored corrupt bytes are preserved, not overwritten.
5. **JSON key presence — 46d2542e.** A literal-null stored key was treated as
   absent by expected-null CAS. Require actual absence, matching PostgreSQL's
   insert-on-conflict rule. A corrupt existing key now denies admission409,
   starts no handler, and preserves its exact domain file.

## Current checkpoint evidence

- Full `npm test`, Node20.20.2/npm10.8.2: **3120 passed / 0 failed / 5 skipped, 3125 total**. Network disabled;
  tracked source frozen into a disposable writable copy and dependencies mounted
  read-only. All1704 tracked hashes match after the run.
- The five full-run skips remain skips: four require explicit task PostgreSQL
  URLs; one is the existing talk preview-header skip. The four database cases
  separately ran at this exact checkpoint: **4 passed / 0 failed / 0 skipped**.
- Actual PostgreSQL16 + Redis7 + HTTP: finish and clearPending races in both
  stores retain prepared bytes; fresh Node processes and original workers replay
  exact207 status/header/binary body without a second handler entry. The
  PostgreSQL cross-worker overlap now also replays207 on the original worker,
  after its intentionally rethrown completion conflict. All five cases retain
  one real ledger row and9800 of10000 synthetic wallet units.
- Actual PG/Redis malformed stored-body reads raise the typed error; fixture
  HTTP error mapping returns503 with zero generation. Raw stored values remain
  exact. Legacy binary arrays and legitimate empty responses still replay207.
  The503 mapping is a fixture and does not prove production error-envelope wiring.
- Two isolated databases each apply all14 canonical migrations with0 pending.
  Cleanup finds0 fixture rows,0 failure triggers/functions and0 metadata rows;
  container identities/images checked before stopping. No host ports or external
  network, production data, credentials or paid models.
- Focused progression: T1399 **85/0/0**, T1400 **119/0/0**, T1403 **127/0/0**,
  T1405 **140/0/0**, final T1406 adapter/talk cohort **172/0/0**. Different cohorts
  and checkpoints; these are not additive product-test totals.
- Canonical D009 versus actual published
  `origin/codex/T-1398-session-lock-custody`: all five deltas0. Diff check passes.
  Native/Packages/Xcode/workflow/runner trees are unchanged; no repeated native
  suite for these backend-only changes. Earlier1566/0/0 signed units, five
  essential UI cases and macOS build are inherited component evidence only.

## Retained failures and limits

T1399's initial focused run was44/4/0. Its real HTTP/Redis old/new comparison
covers concurrent admission, disconnect while acquisition ACK is held, and
successor ownership after a real15-second lease expiry. T1400 initially55/8/0;
strict publication characterization1/2/67 filtered; an intermediate fixture
cancelled one test after blocking on its own admission queue and was corrected.
The d756 full run passed3096/0/5, but actual PG/HTTP cross-worker recovery
**failed503** on the original worker despite exact completed bytes and one debit.
That red blocked publication; no duplicate debit/text loss was observed there.
T1403 focused red5/3/70 filtered; its first Docker invocation failed125 before
any test due to a duplicated digest segment. T1405 red3/10/37 filtered; injected
corruption reproduced empty200 replay. T1406 red1/2/79 filtered. Preserve each
raw log and frozen source in the corresponding private proof archive.

Current permanent evidence:
`_proof/T-1406-combined-response-custody-20261112/proof.json`.
Earlier causal archives: T1399-session-guard-handoff,
T1400-owned-pending-retirement, T1403-idempotency-conflict-recovery and
T1405-idempotency-body-validation, each dated20261112 under `_proof/`.

Synthetic identity, responses, metadata and wallet funds were used. This does
not prove the full paid-provider pipeline, real microphone/Clementine quality,
physical-iPhone journey, shipping backend, cross-project auth or external Files
opening. Redis-only CAS, global capacity and lease-renewal policy are unchanged.
Unconfirmed/corrupt authority fails closed; this does not repair lost storage.

## Adversarial assessment

- **Answered in tested interleavings:** late ACK/finish retirement retains exact
  accepted bytes; a newer local owner survives an awaited authority read; a
  second worker can complete without stranding the first worker's retries.
- **Answered for tested settlement keys:** actual PG duplicate/concurrency and
  replay cases keep one settlement; this is not a claim about every billing path.
- **Partially addressed:** malformed receipts fail closed and stay intact; this
  does not reconstruct data already corrupted or guarantee availability during
  a persistent storage outage.
- **Not covered:** real microphone/model/phone/shipping-backend journey, external
  file opening and new auth-isolation proof. No release-readiness claim.
- **Uncertain:** earlier unrelated hosted launch-latency/Autosave failures retain
  their original evidence; these backend fixes do not establish their causes.

## Integration and next action

Original #996 now has89657886 and #979 hasc508430c; each keeps its original
history and awaits its own final hosted checks. Prepared original #995
99374e94 preserves its current896 parent locally; publication/native proof remain
held at the parent boundary. No direct main push, squash, replacement PR,
agent approval or protection bypass. #964 review is deferred by the human.
Production remains held under the existing App Store-credentials decision.
Finish the first pending/red original boundary, then continue bottom-up using
actual published bases. Do not call THEM complete until integrated gates and
the identified-backend real-phone journey are observed.
