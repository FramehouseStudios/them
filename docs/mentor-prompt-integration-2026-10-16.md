# T-975 — Mentor identity reaches the provider

## Original work and decisions

Preserving merge of original #649 `2dfddbaf0f77bd523842b2d1f54303c989afa295`
above T-974 `a2b3eb1cb45da57f46dcf897c20af126f5a1c99f`. Read its full body
and eight-file diff. No original-head rewrite, squash, replacement original PR
or direct main push. Preserve the orb, Clementine and the current aesthetic.

DECIDED implementation reconciliation: retain the existing order-independent
semantic allocator and return unused shares; incorporate #649's whole mentor
identity reservation, tag protection and reduced companion-core priority.
Do not restore a second allocator or the older client dialogue-notes rule:
the server's screenplay_task is already canonical, with regression coverage.
Client mentor and conditional scene-pitch tags survive. The legacy notes flag
cannot inject a contradictory mode. Production and offline/live evaluation
import the same configurable mentor budget from system_prompt_trim.

## Root causes and adversarial evidence

VERIFIED oversized protected blocks emitted3122 characters at a2700-character
budget. compactTaggedBlock has a120-character floor, but allocation previously
reserved none before weighting shares. Reserve minimums before surplus and
reserve a whole mentor core only when other minimums still fit. Regression
checks500/2700/6200/13000 caps and balanced tags. Existing semantic page/memory/
Studio controls contracts remain tested; no watched god file grows.

VERIFIED initial merged trim suite12/1/0: original test required companion-core
compaction even when the improved allocator could fit the whole block. Retain
its presence rather than require unnecessary information loss. Do not infer
better generated quality from keeping more prompt text.

VERIFIED actual /talk HTTP regression2/1/0: late scene-pitch rule vanished
under the12000-character ingress slice, so the provider request did not even
carry the mentor contract. Final turn trimming could not recover that rule.
The persona normalizer now reuses the canonical semantic trimmer for oversized
tagged inputs, retaining the input cap; plain inputs retain legacy normalization.
Sub500 configured caps retain the old hard slice, not a false whole-block claim.
Final focused prompt/persona/real-HTTP contracts47/0/0 on host Node26.
The HTTP fixture blocks unmatched external provider calls and uses local APP
token auth with REQUIRE_USER_AUTH=0; not production/user-isolation proof.

## Proof checkpoint

Final frozen tracked source tree: `5b6825cdac4f7470060fac7c158d94837d0c721c`.
Snapshot `/tmp/them-975-final-node20.50Fryq`, no local env files copied.
Pinned image them-proof-node20-943, Node20.20.2, full backend **2864 passed /
0 failed / 2 skipped**, exit0. Explicit skips: PostgreSQL without DATABASE_URL
and opt-in live page provider. Network-disabled focused contracts **85/0/0**;
offline golden gate accepts all40 strong and rejects all40 weak exemplars.
Logs `/tmp/them-975-final-node20-backend.log` and
`/tmp/them-975-final-node20-offline.log`.
Signed full client units **852/0/0**, erased task-owned simulator11CF5EFB,
iPhone17Pro/iOS26.2. Authoritative result `/tmp/them-975-units.xcresult`,
log `/tmp/them-975-units.log`. Client source matches the final frozen tree;
backend-only ingress refinements made during this unit run do not change it.
Authenticated local Home handoffs **2/0/0**: confirmed text and fixed server
ASR reach formatted page, automatic project/save and exact relaunch restore.
Bundle `/tmp/them-975-home.xcresult`, log `/tmp/them-975-home.log`.
Provider fixture counts STT1/chat4/TTS24; external calls blocked, auth required.
This is deterministic transport/save proof, not microphone/model quality.
macOS scaffold build exit0, `/tmp/them-975-macos.log`; compile only, existing
PrintScreenplayIntent deprecation/Sendable warnings remain. Integrated writer/
Craft/native export/relaunch workflow **1/0/0**, exit0, authenticated local
backend. Bundle `/tmp/them-975-writer.xcresult`, log `/tmp/them-975-writer.log`.
No provider calls in that writer fixture; no claim that a file was opened in
another physical-phone app. All local integration criteria pass at this source.
Private retained logs/bundles (including pre-fix failures):
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-975-20261016.h6CI1M/`.
Earlier tree `2dc560a7` backend2864/0/2 is intermediate, before the ingress fix,
not evidence for the final source. Retain failed and intermediate logs.
D009 versus T-974 passes all five deltas0; cached whitespace check passes.

#906 exact `b2994b00` now has independent halfmutantpro-tech approval. Its
previous audited hosted run39002286236 passed; marking ready triggered a new
required run39006472727. Backend and D009 succeeded, Quality Gate still live
at this checkpoint. No merge or bypass while required checks are running.

No paid model calls, live quality or physical-phone proof in this task.
Shipping backend, real-phone story/rewrite/offline restore, external export
and generated120-page craft/format parity remain open. Offline golden scores
classify fixed examples, not current model responses. Next actual boundary
#650 `bf322156e1f3d4ec306529f38b8120b08433619c` by verified PR base.
Read #650's complete four-file diff and body while waiting. Before integration,
reconcile its screenplay-content logging with the current count-only policy.
Read-only direct execution of its original shaper also shows that a mentor
question containing a quoted word can bypass its one-question cap (two outside
questions remain); single-quoted dialogue needs its own preservation regression.
These are next-boundary findings, not fixes included in T-975.

## Exact files

- `backend/evals/run_mentor_golden_eval.mjs`
- `backend/index.js`
- `backend/lib/persona.js`
- `backend/lib/system_prompt_trim.js`
- `backend/lib/talk_handler.js`
- `backend/lib/talk_prompt.js`
- `backend/tests/system_prompt_trim.test.mjs`
- `backend/tests/talk_mentor_craft.integration.test.mjs`
- `them/HerVoiceSpec.swift`
- `themTests/HerVoiceSpecTrimTagsTests.swift`
- `TASKS.md`
- `docs/mentor-prompt-integration-2026-10-16.md`
