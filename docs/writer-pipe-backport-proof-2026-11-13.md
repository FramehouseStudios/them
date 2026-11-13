# Writer workflow pipe drain — T1471

The writer eval blocked its own Node event loop with spawnSync while owning the
backend stdout/stderr listeners. A backend request waiting for those pipes could
not finish while the native child waited for that request. Reuse the existing
asynchronous capability from preserved4386d5f8d44a559c31aa17a37d2ba98d4f65db27.
Its original branches remain untouched; this is a bounded backport over9794af,
not a wholesale integration of the later private stack or a replacement PR.

The runner now awaits native close asynchronously, streams stdout/stderr and
retains the existing bounded failure tails. Native selector, one-action writer
case, deadlines, signed/erased simulator path, strict summary, result paths and
finally cleanup are unchanged. The new canonical evidence test reuses4386's exact
fixture and sole pipe-pressure case. Its other private-artifact-path cases remain
preserved with that separate, unlanded capability; none was deleted from main.

## Current execution

One initial Node20 attempt failed infrastructure: generated fake xcrun could not
execute on the disposable noexec tmpfs. It did not reach the pressure condition
and is retained as0pass/1fail, not a valid counterfactual. A new private environment
allowed execution only in its disposable tmpfs; source/test bytes stayed identical.

On cached Node20.20.2 with networknone, read-only modules/rootfs, host UID and dummy
keys, the original runner reproduced the exact3-second pressure timeout:0pass,
1fail,0skip. The asynchronous runner passed the SAME sole case:1pass,0fail,0skip.
All739 source inputs and136 installed package versions remained unchanged. This
uses fake Apple tools to prove orchestration only; it is not native app proof.

Separately, root ran the unchanged real signed writer workflow once on erased
owned81F, iOS26.2/Xcode26.3, host Node26.7.0:1pass/0fail/0skip, producer/native exit0.
The exact requested case occurred once; source hashes stayed unchanged. The
loopback fixture required local user auth and its live PID/nonce were verified.
Known Node HTTP/fetch/WebSocket guards recorded zero external attempts. No real
provider key, microphone, model or phone was involved. No Autosave binding/AX
probe, action retry, longer deadline or UI assertion change is included.

Canonical D009 against exactmain71 passes five zero deltas; syntax/diff pass.
After the focused pressure and native checks, one complete Node20.20.2 backend
suite on exactd899 passed2759/0/2 (2761total), including the new regression. The
existing skips are the unconfigured live-Postgres query and talk preview-header
case. All1412 frozen tracked inputs and the read-only dependency contents stayed
unchanged. The cached container had no external network; no install/model/native
run was part of this backend pass. Receipt:
/private/tmp/them-t1471-full-backend/completion.json.
No unchanged full Swift-unit or macOS cohort was repeated. Fresh required hosted
gates still belong to the eventual integrated published head; this is not main
or shipping-backend certification.

## Limits and next step

This repairs a demonstrated eval mutual wait, NOT an established cause of main71's
first Autosave activation failure. That old0/1/0 stays unresolved. All further
main merges and production remain held; current9794af CI is left intact. Real
microphone/model/physical-phone/shipping-backend/external-file-open proof remains.

Private receipts: /private/tmp/them-t1471-node20-proof-exec-tmp/outcomes/{before,after}/receipt.json
and /private/tmp/them-t1471-native-writer/completion.json. Earlier infrastructure
failure remains /private/tmp/them-t1471-node20-proof/outcomes/before/receipt.json.
Root reviewed the original change, exact backport and driver before execution.
Howard prepared source; Einstein prepared isolation/proof inputs; neither supplies
independent human GitHub approval. Scoped commit/branch backup only until the
current protected integration boundary is resolved. READY FOR CONTINUE.

## Parent preservation — original9792ea

Preserving merge1047291908126171a56c2c4e890d32b3e61e8cf3 retains both
published writer-pipece7 and original9792ea2042220e6f440ab9d6552f8f4059e5af71880.
Only TASKS conflicted; all three stages and working output were saved before
resolution. Both additive task blocks and the entire common body were retained.
The model is byte-identical2ea, including preserved919's DEBUG readiness guard;
writer runner and pressure regression are byte-identical testedce7. No test
identity/assertion/deadline, production app behavior or dependency was changed.
Relative2ea, implementation remains only the original pipe-drain capability and
its regression. Original979 fresh required CI continues untouched.

Verification of this preserving merge is source/static only. Earlier signed
writer1/0/0 and fullNode20backend2759/0/2 remain inherited pipe-source proof;
parent's focused recovery2/0/0 remains separate parent proof, not a new combined
execution. Required integration checks remain for the actual future PR head.
Normal backup push only; no replacement PR/main merge/deploy. The main Autosave
first-red and production hold remain. READY FOR CONTINUE.
