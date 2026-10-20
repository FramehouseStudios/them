# T-1059 — Live word separators are writer text

Preserve integration5391567: original #919c80c073 and #972571592e remain
ancestors. Red full signed SE run678/2/9 is retained, not retried unchanged.
Native video shows `lightsbefore`; To Page also fails visibility separately.

The live iOS/macOS line-normalization wrappers trim the current line before
calling completed-line formatting. Hypothesis: a just-typed separator can
be lost when those callbacks normalize the live line. That code observation
alone does not prove the intermittent Action UI cause. Character names and
scene headings also require word separators while typing.

Six actual native coordinator/binding cases run before any product change:
character-name word boundary, scene-heading trailing separator, Action and
dialogue binding-refresh paths, ordinary Action delegate control and the
existing completed-line formatting contract. No fake formatter or model API.

If confirmed, keep completed formatting unchanged and use one explicitly
live-line rule in the existing shared formatter; preserve trailing spaces/
tabs without adding a second text-binding policy or disabling screenplay
formatting. Require the unchanged exact uninterrupted native UI and broader
integration/recovery proof; no throttled typing, weakened assertion or
success claim from a small passing cohort. Main/production remain unchanged.

## Actual failing-first and correction

**VERIFIED:** unchanged product native before **2 passed /4 failed /0 skipped**,
native65, erased signed owned SE/iOS26.2. Bundle
`/tmp/them-1059-before/v1-ui-smoke-local-1-68534.xcresult`.
Actual coordinator collapses `JOHN DOE` to `JOHNDOE`, strips the heading/
dialogue suffix, and an Action binding refresh turns `lights ` into `lights.`.
Ordinary Action delegate and completed-line trim controls pass. This proves
those destructive native normalization paths; it does not alone prove the
timing origin of every intermittent uninterrupted Action failure.

Add one explicitly live-line operation to the existing FountainFormatter.
Live Action/dialogue return the exact raw input: do not run completed-line
cleanup that invents sentence punctuation or consumes a word separator.
Structural cue/heading/parenthetical/transition normalization retains its
existing core behavior while preserving the exact trailing whitespace suffix.
Both native iOS/macOS live wrappers pass raw text to that shared owner.
Completed `normalizeEditorLine`/document/import/export contracts are unchanged.
No new framework, binding policy, timer, delay or ignored assertion.

**VERIFIED:** same signed erased owned SE after **7/0/0**, native0: all six
unchanged native cases plus the exact single-call uninterrupted sentence.
Actual bundle `/tmp/them-1059-after/v1-ui-smoke-local-1-69312.xcresult`.
An initial summary lookup used a wrong filename and returned no evidence;
the actual discovered path above was read and confirms7 passes.

**VERIFIED:** full shared package: XCTest5/0 and Swift Testing10/0, native0;
`/tmp/them-1059-package.log`, separate `/tmp/them-1059-spm` scratch build,
two jobs. Includes Unicode NBSP, tabs/multiple spaces, structural formatting,
unchanged completed formatting and existing binding-policy tests. D009 vs
actual parent04a993f: bridge-24, other deltas0; whitespace passes.

Broader integration/recovery/macOS proof still required. The separate To Page
and clear-confirmation reveal defects are handled by the existing preserved
#625 reveal owner (T1060/T1058), not by weakening this exact-text test. Do not
promote this small7/0/0 result as universal word safety or phone completion.

## Full integration remains red; do not promote

Preserving merge095a327 combines this correction with original #904's
verified inspector reveal owner3e96d43. **VERIFIED:** full signed erased
owned SE/iOS26.2 actual **684 passed /2 failed /9 skipped**, native65:
units655/0/0; V1 UI29/2/9. To Page/navigation pass. Both exact typing cases
lose `n` in `motel sign` (chunk9 and the uninterrupted sentence). The actual
native editor recording agrees. This is not fixed by the live-separator
correction, and no unchanged retry or universal data-safety claim is made.

Actual bundle `/tmp/them-1059-full/v1-ui-smoke-local-1-71140.xcresult`.
Complete bundle/logs retained byte-for-byte under private
`_proof/T-1059-20261020.WIK7c1/full-integration-red.xcresult`.
The previous integration red is separately retained under
`_proof/T-1057-20261020.2aTKZQ/red-integration.xcresult`.
Fresh Node20.20.2 backend on exact095a327 tracked-source archive:
**2753/0/2**, native0, network disabled, no environment/credential files.
D009 against actual original-parent3e96d43: bridge-24, other deltas0.

Next: gated DEBUG-only native input/model-render count/hash diagnostics,
never screenplay text or provider credentials. Trace the unchanged two
exact typing workflows once to distinguish input delivery from a model
overwrite. No proposed binding change is justified merely by timing or
another smaller passing run. Original #919/#972 heads and main remain held;
no physical phone, paid model or shipping-backend completion is claimed.

## Delayed native publication echo: captured root cause

**VERIFIED:** diagnostic-only signed native run1/1/0, exit65, actual bundle
`/tmp/them-1059-trace/v1-ui-smoke-local-1-72818.xcresult`. Both native input
streams receive all **68 insertions**. The chunked case passes; uninterrupted
typing ends at66 characters. In that failing process, a model render carries
the editor's published27-character value after UIKit has already reached28
(last rendered model26). Later, its published48-character value replaces
UIKit49 (last rendered model47). These two writes remove the two spaces.
Thus the older same-render guard does not cover delayed, changed echoes.
This is direct input/render evidence, not attribution from a passing retry.

The trace records only event kinds, lengths, process-local hashes, selection
and focus. No screenplay/provider/credential content. Diagnostic helper,
native hooks and launch flag were removed before the after check. Metadata
and complete red native bundle are privately retained with the proof above.

**VERIFIED failing-first:** actual coordinator/binding tests5 passed /2
failed /0 skipped, signed erased same SE, native65. Both delayed-echo cases
(focused and just unfocused) fail. Existing genuine rewrite, historical
snapshot and project-switch controls pass. Bundle
`/tmp/them-1059-echo-before/v1-ui-smoke-local-1-73524.xcresult`, complete
private `delayed-echo-before.xcresult` retained byte-for-byte.

Small root correction extends the existing canonical text-binding policy:
record native editor publications until a render acknowledges them; a
matching older publication is an acknowledgement, not a new rewrite.
Retire acknowledged/coalesced entries, reset on document change, leave
unrelated model changes on the existing policy. Immediate and existing
generation/request-guarded deferred publications share the same owner.
No prefix heuristics, indefinite focus lock, timer, input delay or retry.
Pending values are per native coordinator, not persisted or shared between
projects. An acknowledged prior value remains eligible for later real undo;
unrelated rewrites do not consume pending native echoes. These boundaries
have explicit native/package checks. No universal distributed revision or
multi-device proof is inferred from this local acknowledgement mechanism.

**VERIFIED after:** diagnostic-free signed erased owned SE/iOS26.2:
**17 passed /0 failed /0 skipped**, native0. Nine actual binding/coordinator
cases, six live-separator native cases and both unchanged exact typing UI
workflows. Bundle
`/tmp/them-1059-echo-after/v1-ui-smoke-local-1-74176.xcresult`.
An initial summary lookup guessed a nonexistent filename and returned64;
the discovered actual path above confirms all counts. That lookup is not
a test failure or additional execution. Full package: XCTest9/0 and Swift
Testing10/0, native0 (`/tmp/them-1059-echo-package.log`).

At the focused checkpoint, broader integration/recovery remained pending.
D009 against original parent
3e96d43: bridge-23, other deltas0; whitespace checks pass. No original PR
promotion, main merge, paid call or physical-phone success claim.

## Full after-fix integration

**VERIFIED:** exact e86af97 full signed unit/V1 UI run, erased owned
375-point SE/iOS26.2: **692 passed /0 failed /9 skipped**, native0,
701 total reported. Native per-bundle tree: units661/0/0 and V1 UI31/0/9.
Both exact typing cases and the inspector navigation/callbacks pass in
the full run, not just in the earlier focused cohort. Actual bundle:
`/tmp/them-1059-final-full/v1-ui-smoke-local-1-74910.xcresult`;
full private `final-full-after.xcresult` retained beside the red evidence.

The nine skipped tests require separate backend/transport fixtures: the
integrated writer, two save-recovery cases, project restore/cross-platform
memory/canon, two-device live following and writer-block/canon rescue.
They are not claimed passed by this default cohort. Explicit authenticated
writer and both recovery cases were then run separately against the isolated
dummy-provider backend (results below). No live microphone, paid model, real-phone,
shipping-host, universal long-session safety or main completion claim.

Node20 backend2753/0/2 above is on095a327. A fresh `git diff --quiet`
confirms its entire backend tree is byte-identical to e86af97; it is not
described as another full backend execution. No ignored environment file
or credentials were copied into its source archive.

**VERIFIED explicit writer:** signed erased same owned SE, actual native
**1/0/0**, harness/native0. Auth-required local backend: project/create,
formatted fixture insertion, save, Markdown export and relaunch. Actual
bundle `/tmp/them-1059-final-writer/writer-loop-0e6122bb-5b4a-4165-939c-4e9fb3f9319b.xcresult`;
private `final-writer-after.xcresult` retained byte-for-byte. This tests real
UI/API/persistence with synthetic generation, not Clementine's live model
quality or opening an export in another app on a physical iPhone.

**VERIFIED explicit recovery:** signed erased same owned SE, actual native
**2/0/0**, harness/native0; auth required, dummy provider, isolated storage.
Both exact-text/reconnect/relaunch and expired-auth/stale-conflict cases
execute, no skips. Actual bundle
`/tmp/them-1059-final-recovery/them-save-recovery-NOhW0U/recovery-ios.xcresult`;
private `final-recovery-after.xcresult` retained byte-for-byte. Controlled
DEBUG faults do not prove physical airplane-mode/network behavior.
Both owned backend processes stopped and the validated temporary dependency
symlink was removed; the dependency directory itself is untouched.

**VERIFIED:** macOS scaffold native build exit0, exact e86af97; log
`/tmp/them-1059-final-macos.log`. Compile-only, not macOS interactive proof.
Existing Swift6 concurrency/Sendable and platform-deprecation warnings remain.
D009 against actual original-parent3e96d43 remains bridge-23, others0;
whitespace passes. Final source/proof branch is backed up normally, not
merged into main or substituted for an original PR.

Original heads/main/production remain unchanged at this checkpoint;
genuine independent reviews and real-phone proof remain required. T1061
prepares the exact original #919 boundary without swallowing separate #972;
T1058 still needs its queued native proof. No further paid model call.

Post-proof comment-only clarification: remove the old V1 typing comment's
unsupported attribution to synthetic keyboard delivery; the trace received
all68 keys. Executable instructions/assertions are unchanged. Its UI source
again matches original #919ae88bff exactly. That original now retains its
history/base and has fresh exact-head hosted checks pending, not a main merge.

## Adversarial review before promotion

| Concern | Classification and evidence |
| --- | --- |
| Delayed editor echo, including focus loss | Answered for the reproduced case: native before5/2, after9/0 binding cases; captured all68 input events and actual overwrites. |
| Genuine rewrite, project switch and later undo | Answered for explicit native controls; pending receipts reset per document and retire after acknowledgement. Full unit/UI cohorts remain green. |
| Stale/cancelled deferred writes | Existing generation, expected-text and request-ID guards remain intact; the shared publication hook runs only after those guards accept. Full units and writer/recovery controls pass. |
| Offline/auth/conflict/relaunch | Answered for controlled local fixtures2/0/0, not physical airplane mode or real network interruption. |
| Live multi-device ordering and identical-value external mutations | Partially addressed by unchanged project/fresh-value policy; two-device workflow is skipped here. This is not a versioned distributed reconciliation protocol. |
| Long120-page sessions, IME composition and hardware keyboards | Not covered by this native cohort. No long-session performance or universal exact-byte safety claim. |
| Actual microphone/model and external-open export on iPhone | Not covered. Requires the real-phone journey; no paid model calls without fresh approval. |
| Shipping deployment and main | Not covered by local proof. Production hold and genuine independent approvals/checks remain required; do not bypass them. |
