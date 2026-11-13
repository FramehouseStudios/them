# Inspector navigation readiness — original #919

## Problem and evidence

Original #919 head9b3d9f840047faf016bac79f17a1b824883022d2, run43354749486,
Quality job131653989289: V1 **32 passed /1 failed /9 skipped**.
The sole failed case was
test_inspector_navigation_stays_visible_while_panel_scrolls, at line775,
before any scroll or tap. Units executed714 with0 failures; their aggregate
did not separately report skips. The integrated writer step passed.

Artifact14008761418 was downloaded once and hash-verified:
161,563,660 bytes; SHA256
92035dad0717a339e2044f808bc80704d973bc03e344e77a271983b084548174.

Existence succeeded after1.417seconds. The Draft tab existed and was selected
inside the right drawer, but its native frame was x461.5,width105 and its
activation point was {-1,-1}: it was not yet onscreen/hittable.
The immediate hit read ended03:24:13.606UTC. The recording still showed
the seeded page at13.618333; the failure activity started13.740; the drawer
entered onscreen by13.835 and was open at recording PTS8.003333.
No later native hittability read exists. This proves an entrance-time
precondition race, not a permanent absent drawer, broken pinning, or a
settled hit point. The later scroll assertions never ran in that red case.

## Smallest fix

Replace only the existence-plus-immediate-hit guard with the existing
waitForHittability helper, using the same configured8-second budget.
Presence and hittability remain mandatory. No extra gesture, reveal, retry,
sleep, production change, or longer configured wait was added.
All subsequent scrolling, frame equality and Craft heading assertions
remain byte-identical. Howard inspected the artifact/source; Jarvis
independently checked the source, recording frame and one-line diff.

## Fresh focused proof

- Normal signing; only owned81F0FF38-9DAD-4011-907B-357DFADD094C erased.
  iPhone17Pro/iOS26.2(23C54), Xcode26.3.
- The one corrected original workflow: **1 passed /0 failed /0 skipped**,
  native/controller exit0. Finalized xcresult confirms exact case identity.
- Source hashes unchanged during the run. Application, backend, packages,
  project, unit tests, workflows and scripts are unchanged from9b.
- Actual original parent904 ref verified/fetched at76f53cf7; D009 has
  all five deltas0. Index remains33,626 under the accepted early-stack
  exception. Swift parse and git diff --check pass.
- Deliberately unavailable local loopback services returned503, with no
  provider credentials or paid calls. Background requests still occurred;
  this was not a network-free or live-backend proof.

No unchanged full units/backend/macOS cohort was rerun for this UI-test-only
edit. Local26.2 success does not clear hosted26.5. Preserve the original
red artifact and require fresh exact-head CI and genuine non-author review
after the pending original-parent updates are preserved. No main merge,
replacement PR, force/squash, approval or production change.
Physical microphone, live Clementine, intended shipping backend, exact
real-phone recovery and export opened outside THEM remain unverified.
