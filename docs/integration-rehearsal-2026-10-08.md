# THEM first integration boundary — 2026-10-08

## Scope and exact source

Local branch `codex/T-943-integration-rehearsal`, based on main
`647e01fcf17730d301aaa8a5072255ca7494c53c`.

Preserving merge commits integrate the original current heads, not ports or
squashes:

- #766: `f0c565c4d71bf26cbe320aeb0a0bfe51ebfdca98`.
- #770: `fc252cdfbff78d4e2d3a9807580d035c808d6e6a`, including its later local
  recovery preservation commit; do not use the earlier `beac6304` proof alone.
- #638: `6ad41171276e9c314ef2b12d818d5eff7463ab71`, including the scene-pitch
  test follow-up to the mentor-core port.

VERIFIED: these heads merge locally without conflicts. Combined source at
`59fa12687e54530ced04c3e2815dfde52436012a` passes 631 signed iOS units, zero
failures/skips, on explicitly erased task-owned simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2, Xcode 26.3.
Bundle `/tmp/them-943-units.xcresult`; matching `/tmp/them-943-units.log`.
Normal signing remains enabled. No human simulator or physical phone erased.

D009 and `git diff --check` pass. All five god files are unchanged against
main, including index.js at 33,626 lines. The human accepted that pre-stack
count for the data-safety fixes; enforce 33,603 once the product stack
establishes it. This is not an exception allowing growth.

## Review and landing boundaries

VERIFIED GitHub snapshot: 342 open PRs, 330 drafts; no missing open-PR base
branches in the retrieved inventory. Follow actual bases, not numeric order.
The product chain begins at #638, while #766 → #770 is a separate data-safety
lane. #941 forks above original #868; preserve and reconcile that follow-up
when reaching the export boundary. This inventory is not a claim that every
PR has been code-reviewed or tested.

Read the current bodies, commits and evidence comments on #766/#770/#638.
#766 remains draft and REVIEW_REQUIRED, with zero GitHub reviews. The signed-in
author account cannot approve it; chat approval does not satisfy protection.
Require a genuine authorized non-author review. Main protection currently
requires one approving review and D009, with stale approval dismissal and
strict base checks. Our release proof also requires backend, units and UI
checks, even though those additional contexts are not all protection-required.

#766 and #770 are a coupled release fix: never deploy/promote an intermediate
main containing #766 alone. #770 preserves differing dirty local text before
adopting a channel without an agreed base. Its old overall workflow SUCCESS
does not prove all smoke steps passed: its body documents continue-on-error
failures. Later required-gate follow-ups must retain this distinction.

#638's old hosted jobs have no steps. That proves tests did not execute; it
does not establish the historical billing cause or any code defect. Require
fresh exact-landing-head hosted proof after integration.

## Deployment and provider clearance

VERIFIED public probes: `https://api.them.io/healthz` returns a direct 302;
following the related health redirect ends at HTML domain parking. It is not
API health. The documented #626 fallback `https://them-backend.onrender.com`
returns 200 JSON with `ok: true` at `/healthz`. `/api/version` returns 401,
so its deployed commit was not established. No authenticated production
mutation, secret access or promotion occurred.

DECIDED: the human confirmed credits are topped up and authorized scoped live
proof. No paid provider call has been made in this rehearsal. Deterministic
fixture results must not be presented as physical-phone/model proof.

## Remaining proof

Authenticated writer UI proof passed: one test, zero failures/skips, retained
`/tmp/them-943-writer.xcresult` and `/tmp/them-943-writer.log`. It exercised
project creation, exact typed draft, authenticated save, Markdown export and
relaunch restore. Attachment export found no screenshot attachments; the bundle
retains test results, but this is not a recorded physical-phone journey.
The generated fixture xcconfig was confirmed absent after completion.

Final full backend proof: 2,745 pass, zero fail, two skip, exit zero;
`/tmp/them-943-backend-final.log`, Node 20.20.2, complete isolated checkout,
required shell fixture tools present, Docker networking disabled. Earlier
environment failures below are retained, not retroactively green.
Initial uncached
`node:20` runtime download was stopped before a container or tests started;
verified cached `node:20-alpine` reports Node 20.20.2. The full suite uses
that runtime with Docker networking disabled and no production credentials.
Generated dependencies were reused only after exact lockfile comparison.

First actual backend invocation mounted only backend at /app: 2,654 pass,
22 fail, two skip. Root-level source contracts could not read sibling Swift
files/scripts/fixtures, including ENOENT for /them/BackendClient.swift,
/scripts/apply_migrations.mjs and /backend/index.js. This was a faulty test
environment, not a passing run or a reason to weaken assertions. Corrected
invocation mounts the complete isolated checkout at /workspace, runs from
/workspace/backend, and retains the same Node 20.20.2 and offline policy.
Logs: `/tmp/them-943-backend-node20.log` (red) and
`/tmp/them-943-backend-full-checkout.log` (corrected run).

The complete-checkout run ended 2,743 pass, two fail, two skip. Both failures
were at the shell fixture compiler invocation (`spawnSync("cc")` status null);
the minimal Alpine image lacks a compiler and Bash. A disposable local image
adds `bash build-base procps` for verification only. Verified Node version
20.20.2 and tool availability; the unchanged formerly failing test file now
passes 13/13, zero skips, `/tmp/them-943-shell-focused.log`. Final full suite
uses this image with networking disabled; no runtime dependency or test
assertion change in the app repository.

Combined macOS scaffold build succeeds, `/tmp/them-943-mac.log`. This is an
unsigned build-only; the iOS unit and writer UI proofs use normal signing.

The writer UI orchestration reuses the original authenticated fixture helper,
uses an ephemeral server/port and normal signed runner, and retains its
xcresult instead of the old harness deleting it. Its server uses host Node
26.7.0, so it is explicitly not production Node/runtime proof. Its generated
0600 xcconfig is removed when the fixture stops. This test exercises local
authorization and persistence, not a paid model or native external export.

Not covered: merged-main proof, actual voice/audio, physical iPhone, shipping
backend/configuration parity, external export contents, two-device/reinstall
recovery, 120-page responsiveness, privacy/release clearance or completion of
the remaining PR stack. Original PRs remain open and unchanged.
The paired iPhone 15 Pro is currently unavailable in CoreDevice; do not claim
a connected/unlocked physical device based on an earlier session.

## Next boundary and public evidence

Read #639 body and both current commits (tip `57225143908b8fa0b3c832372f9f8676d4cdf43c`).
It is the next original product PR: golden set, scorer, persona parity and
weekly live workflow. The live mentor workflow is not registered in GitHub at
this snapshot; do not claim a live golden result. Integrate and prove its
original source next, retaining the distinction between offline exemplars and
actual model output. Human credit clearance is confirmed, not a live result.

This rehearsal branch may be published for reproducible review evidence, but
is not a replacement pull request or a candidate to shortcut the original
landing sequence. No original head or main was altered. Local docs/task
updates after the proof do not change the tested app/backend source.

## #639 preserving integration — T-944

VERIFIED: merge `88d5697f1d52282a094b076d7f497f4835d15301` retains original
#639 head `57225143908b8fa0b3c832372f9f8676d4cdf43c` with a no-ff merge,
without conflicts. Original heads and main remain untouched.

- Full backend: Node 20.20.2, isolated full-checkout container
  `them-proof-node20-943`, network disabled: 2,750 pass / 0 fail / 2 skip.
  Output: `/tmp/them-944-backend.log`. Offline exemplar gate: MENTOR GOLDEN SET OK.
- Signed full units after erasing task-owned simulator
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`: 632 pass / 0 fail / 0 skip.
  Bundle: `/tmp/them-944-units.xcresult`.
- Signed authenticated writer UI workflow after another owned-device erase:
  1 pass / 0 fail / 0 skip; `/tmp/them-944-writer.xcresult`.
  This uses the local deterministic fixture, not live model or physical-phone proof.
- macOS scaffold build succeeds: `/tmp/them-944-mac.log`.
  Signing disabled for this build-only target, never for iOS tests.
- D009 vs `claude/mentor-core-port`: all five monitored files unchanged;
  index.js remains 33,626 lines. `git diff --check` passes.

HUMAN_INPUT_REQUIRED: the exactly-one authorized live-golden attempt exited 2:
`MENTOR GOLDEN LIVE BLOCKED: OPENAI_API_KEY is required.` Zero provider calls;
no per-case live scores or report were produced. Log: `/tmp/them-944-mentor-live.log`.
Credit authorization remains documented, but is not credential provisioning or
model-quality evidence. Do not source secret files or retry automatically.
Clearance: provision the key through a secure process environment, then explicitly
authorize another scoped attempt. No key should be pasted into chat or committed.

Next: fix #640's upheld review findings on a branch retaining its original head,
before integrating it. No main merge, squash, or replacement PR is authorized.

## Corrected #640 preserving integration — T-946

VERIFIED: `40bdf1db039a0a9c368f914c8fd7627f71298085` merges the correction
branch without conflicts. It preserves original #640
`c8eb36bad5979748130e2da7ed9ea2b9b6abe061` and correction
`62828f32f254eea840f9eece4504b69221e31ebc` as ancestors. No original remote
head or main was altered. Details, red characterization and decisions are in
`docs/three-act-review-corrections-2026-10-08.md`.

- Combined full backend Node 20.20.2: 2,765 pass / 0 fail / 2 skip;
  `/tmp/them-946-backend.log`. Offline exemplar golden gate passes.
- Combined full signed iOS units on the erased task-owned simulator:
  635 pass / 0 fail / 0 skip; `/tmp/them-946-units.xcresult`.
- Combined macOS scaffold build succeeds: `/tmp/them-946-mac.log`.
- Combined signed authenticated local-fixture writer UI after another owned
  simulator erase: 1 pass / 0 fail / 0 skip; `/tmp/them-946-writer.xcresult`.
  Temporary backend stopped and fixture config removed; result bundle retained.
- D009 against `claude/mentor-golden-port` passes; all five monitored files
  unchanged and index.js exactly 33,626. Diff checks pass.

VERIFIED: #641 `claude/filmmaker-dialogue-port` is the actual next base-chain
boundary, tip `232098ba46d1572fdb86f2c64490e3d997e66092`. Its body and diff scope
were inspected. It has no posted reviews/comments at this snapshot; do not
promote its own reported numbers to independent combined-tree proof.

Original #639/#640 hosted checks still show failed September 22 runs. A recent
October 8 quality-gate run on `codex/T-942-export-share-proof` succeeded; therefore
Actions billing is not established as a current universal blocker. That success
does not clear checks or independent review requirements for this stack.
Original #640 remains unchanged remotely: do not merge its uncorrected head to
main. The correction commits require the normal review-controlled landing path.

## Copy-and-paste handoff to Claude

Codex completed preserving rehearsal integration of #639 and original #640 plus
review corrections. Tested combined source merge: `40bdf1db039a0a9c368f914c8fd7627f71298085`.
Correction branch: `codex/T-945-three-act-review-fixes` at `62828f32`.
All original heads remain untouched. No squash, replacement PR or main merge.

#640 fixes: remove broad knowledge lexicon; protect craft through actual rich6200
persona/mentor trimming; canonical JS default and aligned Swift fallback;
feature-map precedence instead of contradictory fixed craft ranges; lexical
craft topic retrieval; unchanged 110 cards restored to compact format and copy.
Production flags made the milestone motivation_coaching before #640; tests
preserve that measured baseline rather than the no-flags reflective shorthand.

Combined VERIFIED proof: backend Node20.20.2 2765/0/2 skipped; signed full units
635/0/0 skipped; signed authenticated local-fixture writer UI 1/0/0 skipped;
macOS scaffold build, offline mentor golden, D009 and diff checks pass. index.js
is exactly 33626 lines. Correction-focused Swift tests separately pass 9/9.
Proof comments are posted on original #639 and #640; artifact paths are above.

The exactly-one live-golden attempt exited 2 before provider calls because the
process lacked OPENAI_API_KEY. No live scores, no automatic retry. Provision a
secure process environment and obtain explicit authorization for a new attempt.
Original hosted checks still display old failures; recent other-branch Actions
success does not clear them. Non-author approvals and shipping/physical-phone
proof remain required. Original #640 must not land uncorrected.

Next actual boundary: #641 claude/filmmaker-dialogue-port @232098ba, based on
claude/three-act-port. Body and diff scope read; not independently proven yet.
READY FOR CONTINUE.
