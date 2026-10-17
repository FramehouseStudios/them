# T-976 — Mentor questions, quoted dialogue and matching audio

## Original history and root fixes

Preserving merge of original #650 `bf322156e1f3d4ec306529f38b8120b08433619c`
above T-975 `c65fda315ce31d68c9eee324a885fada2c43e899`. Read the original
body and complete four-file diff. Keep its one-question handoff and label/
continuation behavior; retain prior praise-classification and scorer fixes.
No original-head rewrite, squash, replacement original PR or main push.

VERIFIED shaper before10 passed/2 failed: merely containing a quoted word
hid an external mentor question, while single-quoted dialogue was split and
damaged. Quote-aware sentence boundaries now keep quoted dialogue punctuation
inside its unit. Production and evaluator share one same-length quote mask,
including tested ASCII/curly, nested, multiline and contraction cases.
Only outer quote closures delimit units. Unclosed dialogue is conservatively
protected through the end. This remains a prose heuristic, not a semantic
guarantee for every ambiguous use of apostrophes/quotes. An external mentor
question containing quoted words may be removed whole; do not claim that all
quoted material in conversation is universally retained. Page-write output
and the writer's primary screenplay are never modified by this shaper.

VERIFIED final focused shaper/scorer/actual-HTTP contracts26/0/0 on host Node26.
Actual /talk response x-reply retains a complete quoted line, removes the
extra mentor question and retains the final handoff. Shaping logs record
only an occurrence/count, never the dropped question or its story nouns.
This is a narrow logging assertion, not a claim that every historical log is
content-free. These HTTP tests use local APP-token auth with user auth off,
not production authorization/isolation proof. External provider calls blocked.

VERIFIED cache-hit regression before4/1/0: the corrected x-reply was paired
with audio for the old words. Before TTS, reuse is now invalidated when final
reply differs from prepared text, preserving the existing page-sync guard.
Actual prepare/consume HTTP regression proves a cache hit and inspects the
new TTS request input; unchanged-text control still reuses audio without a
second synthesis. No acoustic listening or real voice quality is claimed.
Initial fixture versions missed the cache due to differing voice lanes, then
mistook a background chat for fresh reply generation. Those failures are
retained; corrected fixture checks the explicit cache-hit signal. Only after
that correction did the authoritative stale-audio failure reproduce.

## Proof checkpoint

Frozen tracked production/test tree `5cc0635cd0003c581a5e6796a8b9c092ba4a44fe`.
Tracked-only snapshot `/tmp/them-976-node20.51DtIE`; no secret env files copied.
Pinned image them-proof-node20-943, Node20.20.2: full backend **2875 passed /
0 failed / 2 skipped**, exit0. Skips are real PostgreSQL without DATABASE_URL
and opt-in live page provider. Network-disabled focused contracts **64/0/0**,
offline golden gate accepts all40 strong/rejects all40 weak exemplars.
Logs `/tmp/them-976-node20-backend.log`, `/tmp/them-976-node20-offline.log`.
Signed authenticated Home handoffs **2/0/0**, exit0: confirmed text and fixed
server-ASR reach formatted page, automatic project save and exact relaunch
restore. Owned simulator11CF5EFB erased before the run, iPhone17Pro/iOS26.2.
Bundle `/tmp/them-976-home.xcresult`, log `/tmp/them-976-home.log`.
Fixed provider counts STT1/chat4/TTS24, external providers blocked and user auth
required. This is deterministic transport/persistence, not live model output.
Private retained logs and bundle, including failed fixture/before runs:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-976-20261016.OpdXMs/`.

Client/project/Packages/UI-test trees are byte-identical to T-975 (git diff
empty). Its signed units852/0/0, writer/export/relaunch1/0/0 and macOS compile
exit0 are prior-head, source-identical evidence, not reruns in this task.
Existing macOS PrintScreenplayIntent warnings remain. D009 versus T-975 all
five growth deltas0; syntax and whitespace checks pass.

#906 remains independently approved at b2994b00, required hosted run39006472727
still active at this checkpoint. No bypass, direct main push or merge while
required checks run. All original branches remain intact.

No paid model calls or physical-phone/shipping proof. Offline exemplars are
not generated quality. Shipping deployment, real microphone/rewrite/offline
restore/external export and generated120-page craft/format parity remain open.
Next actual original boundary #651 `0b2496f3f054b25e7d94b99f7d8c776f4700bb50`.
Its complete four-file diff/body has been read; reconcile its quote detection
with the shared speech mask and preserve metadata-only logs before promotion.

## Exact files

- `backend/evals/mentor_conversation/score_mentor_reply.js`
- `backend/lib/mentor_reply_shape.js`
- `backend/lib/talk_handler.js`
- `backend/tests/mentor_golden_scorer.test.mjs`
- `backend/tests/mentor_reply_shape.test.mjs`
- `backend/tests/talk_mentor_craft.integration.test.mjs`
- `TASKS.md`
- `docs/mentor-question-integration-2026-10-16.md`
