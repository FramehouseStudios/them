# T-1154 — Pages preview compiler compatibility

## Failure and root repair

Original641a45d904 completed all required checks, run40232439824. Actual logs:
backend2809/0/2;units682/0/0;strict writer pass;V1 28/0/14 (42 total);voicefault
1/0/0;Macbuild. Original642 then advanced normally7c40428b→78dc3be, retaining
base/draft/history and exact original893/613/597 ancestors. No main change.

642 run40234585048: backend and D009 SUCCESS, Quality FAILURE during native
compile, before test bodies. Exact error at ScreenplayStudioDraftPageTools.swift
line167, nested Text(row.visiblePreviewLines.joined(separator: "\n")):
compiler unable to type-check within reasonable time. Local Xcode26.3 proof
did not establish hosted Xcode26.6 compatibility; preserve that red, do not
retry unchanged, increase a timeout, disable a test or call local green hosted.

e2a5f9cf5f6070142789dce78da2a0391f5fd7ca precomputes the preview String and
gives unchanged modifiers to a private concrete Text(verbatim:) subview.
Same filtered lines, font, contrast, spacing, five-line limit, frame, padding,
background, action, accessibility value and source mapping. No AnyView, new
framework, dependencies, god-view state or line padding. No production/backend
code change. Diff from78dc3be: only Pages view and task/handoff documentation.

## Current proof and limitations

- Signed units705/0/0 on erased owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A,
  iPhone17Pro/iOS26.2/23C54/Xcode26.3, sourcee2a5f9c, positive xcresult inspected.
- Unchanged authenticated Pages workflow1/0/0: real paginationHTTP8 successes
  across setup/density/recalculate; exactly1 additional request and success per
  Recalculate; Prev/Next,53/54/reset/card selection, exactUTF8/one saved version.
  Synthetic providers blocked, no ASR/chat/TTS calls. Actual card screenshot
  inspected. Not physical speech, paid model, Files external-open or production.
- Complete230pt component rendered by current test and inspected. Exported PNG
  SHA1 **94f2b548612f6ef306c3df84edf2dd47cc25b7c1** is identical to the previous
  T1152 sample. This is exact sample-render preservation, not all sizes/modes.
- Mac scaffold BUILD SUCCEEDED, sourcee2a5f9c, after native UI completed.
- D009 versus published parent641a45d904 passes: index33557,Studio17423(-8),
  Root14992,bridge12926,Memory10865; other four deltas0. Diff check passes.
- Backend source byte-identical to T1152's final2839/0/2 run; explicit zero
  diff retained. Do not claim a new backend run solely for this UI decomposition.
  Existing native warnings and original backend two skips remain unresolved.

All local invocations terminal. Only the task-created borrowed dependency
symlink is removed; target untouched. No private .env, key or signing material
read/copied. Proof archive:
/Users/halfmutantfilms/io.them-worktrees/_proof/T-1154-20261025.jvO4hT/.

Candidate must advance ORIGINAL642 normally, preserving78dc3be, then receive
fresh required hosted checks. That hosted result is still unverified by these
local commands. No replacement PR, force/squash, approval bypass, main merge,
deployment or paid model call. Current643 is held until parent clearance.

## Next boundary and session state

Isolated643 at da05e289 preserves original643/879 plus existing2299191b,
dd2f3db8,ebcaaa0,04bc973. New action-retry regression failed0/1/0: two actions
after one logical turn's headers/connection loss/retry. Fix8c50e09 creates the
response lease once per logical request; Root uses existing submission state/
fingerprint/time to fence late actions after Stop/new turns. No new Root state
or line growth, existing metadata forwarding kept distinct from actions.
Signed full units722/0/0 pass on that separate source. No current live control
or general metadata/speech ownership claim; original648 remains necessary.

643 first full backend2852/1/2 had fetch-failed cancellation fixture. Reuse exact
existing ephemeral_server from ed670e0d+b3849b9c, identical to original864's
36c94d03, in only its four fixture servers. No handler/assertion changes; seven
focused assertions pass; final Node20 backend2853/0/2. The failure is consistent
with the documented pooled-socket lifecycle defect; the failed log alone does
not prove which socket/port was reused. Both results retained, no blind retry.

Next: preserve this parent repair into643; final combined native/actual inspector+
writer/Home/macOS proof, then guarded original643 publication after current642
hosted clearance. Original638 non-author human review, intended shipping backend
configuration and physical-iPhone journey remain separate. Goal active/incomplete.

READY FOR CONTINUE.
