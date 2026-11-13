# Original #923 one-tap observation — 2026-11-12

## Preserved baseline and unresolved failure

Preserving merge b155f5d55980ee57c4efad32f90769bce0ed59f0 retains original923
4b15e9af and updated original919 parent4f7f787f. Only TASKS conflicted;
all stages and both complete blocks were retained. Application sources
were byte-identical to4f before this observation patch; original923's two
Node test files and original report remained byte-identical to4b.
Their earlier exact-source evidence is inherited, not a repeated execution.

Frozen hosted run43355664917 / artifact14007351380 remains writer0/1/0.
One valid native touch at(24,77) was followed by no Projects drawer/title
field. That artifact cannot distinguish a missing SwiftUI handler from a
later close/reset. This change collects that missing evidence; it does not
claim to repair or retroactively explain the frozen failure.

## Canonical, bounded change

Extend existing StudioUITestInputDiagnostics with sidebar entered/applied
events, recording only phase, visible Boolean and existing timestamps.
Reuse its explicit DEBUG/UI/environment opt-in,32-event cap and serialization.
Do not change state mutations, gestures, layout, animation or touch targets.

Extract the existing DEBUG restore Text overlay into that same diagnostics
owner, keeping its identifier,1x1size/font and0.01opacity. The original
parent UI-testing guard remains, and passes a current String value so
snapshot evaluation stays lazy and value-driven. A noninteractive trace
endpoint now survives either drawer being closed. Studio shrinks2lines;
other protected files are unchanged. No product state/framework is added.

Only the integrated writer fixture explicitly requests tracing in its own
app launch environment, including the existing relaunch. Ordinary app
launches keep it disabled. Avoid relying on test-process environment
propagation. After the exact original title-field wait finishes, attach the
metadata before asserting that saved result; same wait/start/one tap.
An existence guard records an unavailable endpoint as an evidence gap.
No original action, later assertion, timeout or outcome is weakened.
Howard independently reviewed source and caught that observation guard.

## Fresh proof on identical source bytes

Normal signing; only owned81F0FF38-9DAD-4011-907B-357DFADD094C erased,
iPhone17Pro/iOS26.2(23C54), Xcode26.3:

- Authenticated canonical writer/create/type/save/export-UI/relaunch:
  **1 passed /0 failed /0 skipped**, native/evaluator/controller0.
- Exported keepAlways attachment contains5records: installed, one touch
  began/ended at(24,77), sidebar entered(false) then applied(true).
  Exact attachment SHA256:
  88e56ca7f8d48b713676f358dd894bc858a1f59918fa670425d3b60bd1ec19f0.
  The trace was complete/un-evicted and the real title field was reachable.
- Both existing recovery consumers of the moved snapshot:
  **2 passed /0 failed /0 skipped**, exact case identities, whole-draft,
  actualACK and exactly-one assertions unchanged.
- macOS scaffold build **exit0**, covering the shared DEBUG view/nonUIKit stub.
- Source hashes remained unchanged in each run. Both native evaluators used
  a disposable auth-required31337backend; PID/nonce checked before Xcode,
  dummy provider only, known API egress guard0blocked attempts. The fixture
  also answered its metadata-only owner probe during the writer wait.
- D009 against current9199b: Studio−2, other4zero; protected parent4f blobs
  identical. Index33,626 remains the accepted early-stack exception.
  Swift parse/diff pass.

Writer and recovery are separate runs; do not report a new3-case cohort.
Host Node24.19.0 ran the fixtures, not a fresh Node20 full backend suite.
No unchanged full units/backend cohort was repeated for this metadata-only
Swift patch. Export UI/filename feedback does not establish the exported
payload opened outside THEM.

## Interpretation and landing

This one instrumented local run proves the handler opened Projects locally.
It does not explain the earlier hosted red or clear iOS26.5. A future failure
with installed, retained records spanning the native tap can distinguish
handler non-entry from applied-open followed by later closure/reset.
Missing/evicted records or process replacement remain inconclusive. UIKit
touch metadata is captured after dispatch; do not infer an invented strict
began-handler-ended order. No close-reason/generation cause is established.

Keep original bases, drafts and all history. Publish only scoped descendants
through normal pushes; no replacement PR, squash/force, main push/merge,
agent approval or protection bypass. Let existing hosted runs finish; fresh
combined-head checks and genuine non-author review remain required.
The shared navigation readiness fix also belongs to its earlier904owner;
its parent follow-up is separate. Production remains held; no paid calls,
real microphone/live Clementine or physical-phone intended-backend proof.
