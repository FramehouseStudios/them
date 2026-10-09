# T-935 — Delayed base hydration is not a conflict resolution

## Goal and evidence

Goal items 1 and 4: preserve writer bytes and a real, explicit conflict choice
through delayed responses. Base: #932 `bace7ae33b6009e954f5347ec85fb6a1310d780f`.

Hosted #929 run `37858536990` completed red in signed recovery UI: **1 pass,
1 fail, 0 skip**, iOS 26.5. Writer marker remained visible, but conflict IDs,
parked count and dirty state were absent on the third launch. Exact bundle:
`/tmp/them-929-hosted-artifacts/Users/runner/work/_temp/them-screenplay-save-network-fault-smokes/screenplay-save-network-fault-86969.xcresult`.
Failure attachment:
`/tmp/them-935-hosted-recovery-attachments/3F55AFC5-0FBD-4E3A-BDEF-E2F26F4CAFFA.txt`.
This proves a false-clean presentation, not lost text or a particular request
ordering. A second read-only review independently reached that distinction.

## Independently reproduced root

Real Studio model and isolated durable queue: enqueue raw writer text against
server v1, restore it, observe/park v2 conflict, then hydrate a delayed v1 detail
response. `applyServerDraft` protects the writer text, but its no-new-conflict
branch unconditionally clears the already-known v2 conflict. That opens a path
to autosaving without the writer's choice. No paid/provider call is involved.

Signed erased-simulator baseline: **0 pass, 1 fail**, exactly the conflict-state
assertion (`nil` versus v2); raw bytes and parked entry assertions remained green.
Log: `/tmp/them-935-stale-hydration-red.log`.
Bundle: `/var/folders/27/kqhcss0n7t1dh_fj2wn98ynm0000gn/T/them-v1-ui-smoke/v1-ui-smoke-local-1-37956.xcresult`.
The originally supplied result-path variable was not the wrapper's accepted
override; this is the actual retained bundle, not a claimed nonexistent path.

## Fix and boundaries

The initial no-new-conflict conditional fixed the v1 case, but review found
delayed v2 could still downgrade a known v3 conflict. A second real-model
sequence reproduced **1 failed test, 15 failed assertions** with that partial
fix: `/tmp/them-935-ordering-red.xcresult` and matching `.log`. Some assertions
are downstream consequences, not fifteen independently reproduced defects.

The no-new-conflict presentation branch now runs only when no conflict is active.
A canonical hydration guard runs before applying anchors/text or scheduling
outbox cleanup: accept the known server version, or a non-base version with a
finite timestamp strictly newer than a positive known server timestamp. Reject
missing, equal, older or otherwise unorderable heads. Version IDs are opaque,
never sorted. The production version route assigns both timestamps from its
server `Date.now()`; this policy does not substitute for request generations or
claim ordering across skewed server clocks.

Fresh, proven newer conflicts and explicit Keep Mine / Load Server still work.
Confirmed known-version text may retire the exact matching copy; a stale or
unproven version may not. No new framework, route, request retry, timeout, skip
or broad hydration rewrite.

Review also exposed a sparse known-head response erasing its timestamp. Retained
signed red: **1 failed test, 3 failed assertions**,
`/tmp/them-935-sparse-head-red.xcresult` and matching `.log`. Reconstruction now
preserves the maximum known/incoming timestamp for the same immutable version.
The regression verifies a subsequent v4 remains eligible and the parked writer
bytes survive. A separate real-model case verifies an authoritative known head
with exact raw writer bytes acknowledges/clears the matching queue without a
new write; unknown/older byte-identical heads cannot use that cleanup path.

This reproduces and fixes one concrete ordering defect. It is **not yet proof**
that the same ordering caused #929's hosted relaunch failure. Same-project
hydration requests still lack request-generation ordering. `saveCurrentDraft`
also lacks an explicit conflict guard across awaited work; track separately.
Load Server currently uses a cached nonempty conflict draft instead of refetching
the latest head. That existing freshness defect needs a separate real action
regression/fix before this recovery lane lands, particularly when server clocks
are equal or missing. Do not call the entire recovery workflow fixed here.
No claim of physical voice, release, production Postgres, fsync, reinstall,
120-page performance or export parity. Required hosted gates and independent
review remain mandatory, with #766 then #770 first; main remains untouched.

## Verification

Final full signed units: **676 pass, 0 fail, 0 skip**,
`/tmp/them-935-final-units.xcresult`, `/tmp/them-935-final-units.log`.
Earlier partial fixes passed 35 then 36 outbox cases and 673 full units; those
are intermediate evidence, not the final proof. Their newly uncovered review
regressions were retained instead of weakening the tests.

Final Node 20.20.2 full backend with external networking disabled: **2,744 pass,
0 fail, 2 skip**, `/tmp/them-935-final-node20.log`; source/dependencies read-only,
only ephemeral persistence writable. Final macOS scaffold production build:
**exit 0**, `/tmp/them-935-final-mac.log` (unsigned build-only, never unsigned
tests). God/diff gates pass, no protected god file grows; index.js remains the
human-approved pre-stack 33,626-line exception.

Final authenticated signed recovery UI: **4 pass, 0 fail, 0 skip**,
`/tmp/them-935-final-recovery-ui/screenplay-save-network-fault-43663.xcresult`,
output `/tmp/them-935-final-recovery-ui.log`. Offline/relaunch/reconnect,
expired-auth/stale conflict/Keep Mine, delete-all and blank Snapshot/Restore all
execute. Final integrated authenticated writer check: **1 pass, 0 fail, 0 skip**,
`/tmp/them-935-final-integrated-writer.log`: create/save/export/relaunch/restore
passed the strict summary verifier. The existing evaluator deletes its bundle
on completion; output is retained, not a claimed persistent xcresult. All iOS proof
runs erase the owned iPhone 17 Pro simulator and keep signing enabled. No live
model calls. Full V1 suite is not rerun locally on this slice; required hosted
checks must still execute on this head, and local 26.2 is not hosted 26.5 proof.

While this work ran, #930 run `37860327627` completed **success** at exact head
`fc8157df2556e2ad04e2925f1ecb099328bb7152`: all five required iOS/unit/writer/
V1/recovery/voice-fault+macOS stages and backend/D009 jobs succeeded. This is
not evidence for #929's different head or the final T-935 head. Main remains
`647e01fcf17730d301aaa8a5072255ca7494c53c`; no merge or approval bypass occurred.
