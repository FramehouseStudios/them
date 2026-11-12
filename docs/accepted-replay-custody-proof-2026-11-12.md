# Accepted replay custody — 2026-11-12

## Reproduced causes and changes

VERIFIED locally, not a claimed production incident:

1. Expiry cleanup read an old snapshot and then deleted by key. A second worker
   could prepare/complete that key between those operations; cleanup removed the
   newer accepted result. Both durable paths now compare-delete the original raw
   encoded value. Lost deletion refetches current work, and admission counts an
   undeleted snapshot as occupied. Redis-only expiry uses atomic Lua comparison
   against the exact raw GET string. Missing atomic deletion retains evidence.
2. A delayed durable pending read could warm Redis after newer prepared output
   had been saved. Trace: durable=prepared, cache=pending, writes=prepared,pending.
   A fresh owner consequently returned pending. One get+put capability now makes
   durable storage authoritative for this domain, bypassing Redis reads/warming/
   writes. Durable failure cannot fall back to stale Redis. Redis-only replay,
   locks and streams retain their separate paths. The newly unreachable duplicate
   CAS cache-write block was removed.

The existing JSON/PostgreSQL adapters and schema are reused. No provider, HTTP
contract, default endpoint, framework, index or Swift runtime change. Cold replay
uses the durable authority rather than an unversioned cache; no latency benefit
is claimed. Optional redisClientFactory preserves default import/connect behavior.

Local commits: expiry `cc126626a5e2e4af9b1075e4a57459bcfc782429`, then cache
`1c7f603eda63bf87ec6e19298bae719757af2fdf`, on preserved base `934f6ad5`.
Only `backend/lib/scale_backplane.mjs`, its existing production-entry-point tests,
and this document change. All original ancestors remain intact.

## Executed evidence

| Check | Result |
| --- | --- |
| Expiry causal red, with approved DI seam but before cleanup fix | 9 passed / 10 failed / 0 skipped |
| Expiry focused JSON/adapter/outbox proof | 52 passed / 0 failed / 0 skipped |
| Mixed-cache causal red | 19 passed / 1 failed / 0 skipped |
| Final combined focused proof, Node20.20.2 | 57 passed / 0 failed / 0 skipped |
| Final full backend, Node20.20.2 | 3,057 passed / 0 failed / 5 skipped;3,062 total |
| Four dedicated PostgreSQL cases, separate configured run | 4 passed / 0 failed / 0 skipped |
| Actual expiry interleavings | PostgreSQL4 + real Redis/Lua2, exact newer bytes retained |
| Actual mixed PostgreSQL+Redis interleavings | prepared/completed2, stale cache ignored |
| HTTP production idempotency guard after the8 interleavings | Exact207/header/body replay;0 generation continuations |
| Actual mixed-store durable-read outage | Rejects without consulting stale Redis |
| Actual Redis locks/commit stream with durable authority | Passed |
| Canonical D009 vs verified currently published #99790362d4f | Five zero deltas |
| Tracked source integrity before/after full run | 1,702 files;0 mismatches |

Real-store proof used two new loopback-only, network-isolated task databases,
14 canonical migrations each,0 pending. Post-checks found0 fixture rows or failure
triggers/functions in the checked tables. Only the newly created container IDs
were verified and stopped; no published ports or external network. The guard
used fixture identity over local HTTP; this is not the full authenticated /talk
provider pipeline. No model calls were made.

The full suite intentionally had no database URL: its four PostgreSQL skips are
covered by the separately configured4/0/0 above, not relabeled as full-run passes.
The fifth remains the explicit talk preview-header skip. No paid live-case skip
is involved. Cached dependency version/integrity metadata matched136 lock entries;
that cache was mounted read-only. This is not a new package-content audit.

## Retained setup failures

The first real-store container could not mount dependencies beneath a read-only
source lacking the mountpoint; Node never executed. Correcting only the disposable
mountpoint yielded real-store success. That preflight failure is retained.

The initial full expiry checkpoint returned2,902 passed /25 failed /5 skipped
(2,932 total). Its proof setup made source read-only and /tmp non-executable:
default persistence fixture creation failed and Apple-tool/compiled fixture
programs could not launch. The final combined run used a writable disposable
tracked-source copy, an executable tmpfs, and explicit shell/compiler execution
preflights. No assertion was weakened. Every tracked source byte remained equal
after the successful run. Do not attribute a green full run to the earliercc head.

The first parent-ref precondition was unavailable. Fetching and verifying the
real published #997 ref established canonical D009; no fabricated ref or gate
exception. Intended future parent #997f143af47 must be compared after its actual
publication, not treated as already published.

## Component inheritance, GitHub and remaining boundaries

App, unit/UI tests, project, Packages, scripts and workflow trees are byte-identical
to local #997 runtime934f6ad5. Its current exact erased81F/iOS26.2/Xcode26.3 proof
is inherited rather than rerun: signed units1,566/0/0; raw-audio1/0/0; writer
save/export/relaunch1/0/0; recovery3/0/0; macOS build passed. Providers were synthetic.
The corresponding origin-client document records its own preserved failures.

Private manifests/commands/hashes:
`_proof/T-1396-expiry-custody-20261112/proof.json` and
`_proof/T-1397-replay-authority-20261112/proof.json`.

These changes are verified locally pending the chosen original-parent publication
and fresh checks. A scoped backup branch may preserve them without advancing
original PR heads or main. Original #995/#997 work is preserved, not replaced. Main is unchanged;
#964 human review is deferred. No independent human approval, main merge,
deployment, protection bypass, secret exposure or paid call is claimed.

Not covered: global capacity across paginated rows/processes, Redis-only CAS,
the separately identified session-lock GET/DEL race, complete production /talk
routing, real microphone/model quality, physical iPhone, intended shipping backend
or opening export outside THEM. No new incident is asserted for these source-traced
risks. Production remains held under the existing App Store-credentials decision.
