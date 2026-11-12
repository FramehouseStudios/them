# Session-lock custody — 2026-11-12

## Reproduced cause and smallest fix

VERIFIED locally on base317c6c76: releaseSessionLock read owner A, then Redis
expired that lease and owner B acquired it, then A's stale DEL removed B's lock.
The unchanged production session-serial HTTP guard consequently admitted a third
request while B still owned the turn. This is a local causal reproduction, not a
claim of a production incident.

Runtime43bd192e replaces that GET/DEL pair with the existing raw compare-delete
Lua. Only the current owner can release the key. Missing eval or an evaluation
failure retains the lease for its existing TTL; no unsafe delete fallback.
Default Redis import/connect, owner strings, lease duration, session key, HTTP
contract, unrelated store domains, index and Swift code remain unchanged.
Identical owner-token reuse remains indistinguishable under the existing contract.

## Executed proof

| Check | Result |
| --- | --- |
| Before, pinned Node20.20.2 | 26 passed / 3 failed / 0 skipped |
| Focused after: production backplane + adapter/outbox controls | 62 passed / 0 failed / 0 skipped |
| Real Redis before: actual TTL expiry, NX reacquisition, stale completion | B's lock removed; third HTTP request returned200 |
| Real Redis after: same boundary, actual Lua | B retained; third request409 with0 continuations |
| Current owner releases, then HTTP retry | Retry200; finish released its own lease |
| Valid/wrong-owner controls | Valid owner releases; wrong owner leaves lease intact |
| Missing eval / injected pre-execution evaluation failure | Lease retained, rival denied; reacquisition succeeds after real TTL |
| Five protected files vs actual317 base | Identical blobs;0 growth |
| Diff/ancestry/static checks | Passed |

Real Redis7 and Node20 ran in new task-owned containers sharing an otherwise
network-disabled namespace, no published ports, read-only frozen old/new source,
and read-only cached dependencies. The guard used synthetic session identity over
local HTTP. No model was called. The new Redis container's ID/image were checked
before stopping it. Actual server ACL denial was not injected; the error case
throws before eval execution.

The preceding1c7 full backend checkpoint remains3,057/0/5; it is not a new full
run on43bd. No unchanged native suite was repeated: app/unit/UI/project/Packages/
scripts/workflow trees are unchanged from the signed934 checkpoint, with its
1,566 units,5 essential UI cases and macOS build evidence retained separately.
Fresh required full hosted checks remain necessary at the publication boundary.

Exact commands, retained red source and hashes:
`_proof/T-1398-session-lock-custody-20261112/proof.json`.

## Integration and limits

Scoped branch work, preserving317 and all original ancestors. A backup does not
advance original PR heads or authorize landing. No original PR replacement,
force push, main merge, human approval, deployment or paid call. Main review is
still deferred. Physical microphone/model quality, the complete /talk pipeline,
physical iPhone and intended shipping backend remain unproven. Production remains
held under the existing App Store-credentials decision.

Redis acquisition failure behavior, Redis-only replay CAS and global capacity
bounds are separate concerns; this commit does not claim to resolve them.
