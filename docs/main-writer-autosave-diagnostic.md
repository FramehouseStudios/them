# T1468 — diagnose the failed main Autosave activation

Integrated main71 passed709signedunits with0failures/0skips and failed its
required writer case0/1/0 before typing. One centered tap reached a fully visible
Autosave switch; visual and AX state remainedOn through the existing32-second
wait. Clipping is refuted. No root cause or runtime repair is claimed.

The writer launch opts into the existing metadata-only native input trace. A
DEBUG/UIKit-only wrapper records the Autosave binding setter's previous/requested/
applied Bool, preserving its SwiftUI Transaction. Without the opt-in it returns the
original binding unchanged; Release and macOS use the original binding directly.
The original input trace endpoint exposes canonical autosave state independently
of native AX state, with a dedicated second opt-in THEM_UITEST_TRACE_AUTOSAVE=1.
No extra view or accessible child is added; other trace sessions keep their array
schema and original binding. No screenplay, auth, token or personal data is added to it.

Attachments immediately after the single action and after the native-state wait
retain these observations. An absolute deadline is captured immediately after tap
and passed through the AX attachment callback into the original polling helper. The known-on guard, single tap, native off predicate,
original post-tap time budget and full downstream writer assertions remain. No required workflow
or protected god file changes. This is evidence scaffolding, not an activation repair.

The earlier trace-only local writer passed1/0/0. Its ended touch loses touch.view
after UIKit dispatch, so it could not distinguish absent setter delivery from a state
reset or native presentation mismatch. That healthy baseline is not an explanation
for the hosted failure. The first setter/state attempt failed compilation (missing explicit self in the
new callback); zero tests ran. After that one-line correction, the signed erased
owned81F writer passed1/0/0 on local iOS26.2/Xcode26.3, host Node26.7. Both retained
attachments show exactly one entered/applied setter (true to false) and canonical
autosave false; the original native AX assertion and downstream workflow passed.
Source hashes stayed unchanged and the local API guard reported zero blocked
external attempts. This does not establish the hosted26.5 failure cause.

The separate branch-only writer-autosave-diagnostic workflow captures exactly
this existing scenario on the hosted runner configuration. Its check name differs
from every required gate. It does not retry a failed run, skip or weaken a required
gate, use a provider secret, alter protections or deploy. It has read-only repository
permission, dummy local auth and no paid provider credential. The temporary workflow
must be removed before any actual repair is proposed for main. This branch is an
evidence branch, not a replacement for904or979 and not a completed product fix.

Main's original failure artifact14021436280 is preserved with official SHA256
2033c8c3490ed11524fc1371e7742ad559c076a38e79344666ef0240bfe3df4d.
Local proof: /private/tmp/them-t1468-main-writer-autosave/local-writer-binding-trace-capture-fix/.
Swift syntax, diff, CI safety18/0/0 and canonical D009 against exactmain71 passed
(five zero deltas). YAML parsed; actionlint is unavailable. No full unchanged
backend, unit or macOS rerun is attributed to this diagnostic.
Further main merges are held for this activation failure and979's parked-chain
predicate failure. Render's live Auto-DeployOff/repository identity was verified
read-only after human sign-in; no production or environment values changed.
No paid model, microphone, real-phone or external-file-open proof. READY FOR CONTINUE.

Howard's read-only review of55fc found that its immediate attachment callback ran
before the old helper constructed its deadline, and its extra overlay changed the
Toggle AX subtree. These diagnostic observer effects were real. The corrected
candidate captures the absolute deadline before the callback and reuses the existing
trace endpoint;55fc's local1/0/0 is not attributed to this updated source.

The first branch push run43397375249 failed workflow validation before any job.
The temporary workflow had used runner.temp in job-level env, where that context
is unavailable. Artifact-directory setup now runs as a step using RUNNER_TEMP.
Official context restrictions: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability.
The corrected push is a new source head, not a retry of executed native tests;
no hosted native case has run yet. Required workflow files remain byte-identicalmain.
