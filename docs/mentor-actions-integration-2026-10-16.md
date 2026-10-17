# T-974 — Mentor voice and writer-authorized Studio actions

## Original history and scope

Preserving merge of original #648 `210c5ef02d075b0bd359d4c55f5b8c0917d15554`
above T-973 `b6dd4baa01c83f23fe64a059321c4353a1dbc620`. Both `ab05fb5d`
mentor shaping and `210c5ef0` live controls/coverage prompt protection remain
ancestors. Read the body and current two-commit range; not merely its first
commit. No original-head rewrite, replacement original PR or main merge.
The diff exceeds the approximate400-line preference to keep the preserved
change and its necessary authority/HTTP regressions together, not publish an
unsafe intermediate implementation as ready.

## Root causes fixed

VERIFIED initial action regressions **16 pass / 7 fail / 0 skip**: negated,
quoted and hypothetical commands produced actions; model tags overrode refusal.
The shared action owner now recognizes direct/polite/compound directives,
preserves quoted labels, rejects quoted dialogue (including multiline/curly/
unfinished quotes), and makes the writer's explicit arguments authoritative.
Explicit refusals and action-specific assistant refusals cannot become actions
or promises. Undo requires explicit writer intent when a transcript is supplied.
The existing `allowActions` gate survives both merge conflicts: page-write and
non-control turns still strip tags without executing screenplay dialogue.

VERIFIED real `/talk` regression observes headers and `x-reply` for four cases:
unsupported scene, denied save, open Craft, requested pink versus generated
blue revision. The handler always adopts corrected spoken text, including when
no action survives. Past-tense model saves become pending requests, not durable
receipts. Client acknowledgement remains the only proof of a completed write.
These four HTTP contracts use local APP-token fixtures with user auth disabled;
they are not production/user-isolation proof. Home workflows below require
user auth. Keep those scopes separate.
New logs record validated action types, rejection counts and shaping occurrence, not removed sentences or
scene names. This is not a claim that every historical log is content-free.

VERIFIED mentor adversarial regressions **10 pass / 2 fail / 0 skip**: original
shaping classified real craft criticism as removable praise, and a quoted rewrite suppressed unrelated
replace-the-writer penalties. Shaping now preserves the tested craft statements;
the rewrite exception applies to its own clause only. Real page output remains
unshaped. The rich-budget trim test now uses the actual6200-character API,
not ignored `tier/maxChars` options. Keep prior craft protections and scorer
page-evidence/alias checks intact.

These are English heuristics, not a complete semantic intent/quality verifier.
Ambiguous indirect commands, negation scope, complex quotes and multi-action
explanations still need real-user evaluation. Do not call them universally safe
or a substitute for server authorization and client context guards.

## Proof

Final frozen source tree `3181e98655d2dfee7b1bf29c6134414f72c6ce2a` archived
from tracked files only into `/tmp/them-974-head-node20.Tfhd4n`; no local env.
Pinned image `them-proof-node20-943`, Node20.20.2: full backend **2860 pass /
0 fail / 2 skip** (2862 total), exit0. Skips: real PostgreSQL without DATABASE_URL
and opt-in live page provider. Log `/tmp/them-974-head-node20-backend.log`.
Final offline contracts **65/0/0**, networking disabled; golden gate accepts
all40 strong and rejects all40 weak exemplars. Log
`/tmp/them-974-head-node20-offline.log`. This is not live model output.

Authenticated local Home workflows **2/0/0**, exit0: confirmed transcript and
fixed server-ASR, formatted full fixture scene, automatic title/project save and
exact relaunch restoration. Bundle/log `/tmp/them-974-verified-home.xcresult`,
`/tmp/them-974-verified-home.log`. STT1/chat4/TTS24 fixture calls, external
providers blocked. This run precedes only the last logging-only change from
rejected type strings to counts; response/action behavior is unchanged. Do not
present it as an exact-final-backend-head rerun or physical/live-model proof.

Signed full client units **849/0/0**, erased owned iPhone17Pro/iOS26.2:
`/tmp/them-974-final-units.xcresult`, `/tmp/them-974-final-units.log`.
Client/project sources are byte-identical to T-973; its final macOS exit0 is
source-identical prior-head compile evidence, not a fresh build in this task.
D009 versus T-973 all5 deltas0. Syntax and whitespace checks pass.
Intermediate full suites and failures are retained, not substituted for the
final frozen-tree results. No paid live calls or physical-phone proof.
Private retained logs and result bundles:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-974-20261016.h4JpFk/`.
Next actual base-chain PR #649 `2dfddbaf0f77bd523842b2d1f54303c989afa295`
protects the complete client mentor identity through the backend trimmer.

## Exact files

- `backend/evals/mentor_conversation/score_mentor_reply.js`
- `backend/evals/run_mentor_golden_eval.mjs`
- `backend/lib/mentor_reply_shape.js`
- `backend/lib/studio_actions.js`
- `backend/lib/system_prompt_trim.js`
- `backend/lib/talk_handler.js`
- `backend/tests/mentor_reply_shape.test.mjs`
- `backend/tests/mentor_golden_scorer.test.mjs`
- `backend/tests/studio_voice_actions.test.mjs`
- `backend/tests/system_prompt_trim.test.mjs`
- `backend/tests/talk_mentor_craft.integration.test.mjs`
- `TASKS.md`
- `docs/mentor-actions-integration-2026-10-16.md`

Real on-device control switching is not proven by parser/HTTP/client-unit
composition alone. Shipping backend, phone speech/rewrite/offline restore,
external export and full120-page generation remain open. Main is unchanged.
