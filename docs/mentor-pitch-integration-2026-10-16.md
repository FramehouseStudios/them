# T-978 — A spoken pitch is not a rewritten screenplay

## Preserved original work

Preserving merge of original #651 `0b2496f3f054b25e7d94b99f7d8c776f4700bb50`
above T-977 `0f974164adb67ad26b74830d72fb05ce81d4a2ac`. Read its full body
and four-file diff. Preserve original commits/heads, prior question/opener
repairs, server-owned notes, writer-command authority and matching-audio guard.
No second-assistant workflow, replacement original PR, squash or main push.
Orb, Clementine and the established aesthetic are unchanged.

## Root defects and reconciliation

VERIFIED first adversarial shaper/scorer run24 passed/4 failed: quote ownership
was inferred from unmatched opening counts, conversion collapsed unrelated
whitespace, existing articles became doubled, and the evaluator missed supported
heading forms. Reuse the shared quote mask and one unquoted heading detector;
ignore quoted headings when finding the lone spoken heading. The conversion
edits only that span, preserving unaffected spaces/newlines in this pure shaper.
Do not infer byte-perfect preservation by every upstream conversation normalizer
from that narrow assertion. Primary screenplay page-write output is bypassed.

VERIFIED separate abbreviated-location regression18 passed/1 failed: INT. DR. LEE'S OFFICE -
NIGHT was truncated to INT. DR., leaving the rest of the heading behind.
Prefer complete timed matches over overlapping abbreviated prefixes, including
standalone headings. Keep untimed fallback behavior and the page-text guard
for multiple unquoted headings/character cues. Both patterns derive supported
times from the same time-phrase map. Runtime conversion and scorer share the
detector rather than divergent lists of INT/EXT forms.

Final focused shaper/scorer/actual-HTTP contracts35/0/0 on host Node26.
Three actual /talk cases inspect x-reply and the TTS request input: normal
spoken pitch, preceding paired curly quotes/existing article, and a quoted
heading left unchanged. Logging records only mentor_slugline_spoken=true,
not location/story text. This is a narrow metadata-log assertion, not a claim
that every historical log is content-free. Existing actual cache-hit tests
still prove changed text invalidates old speech and unchanged text reuses it.
Fixtures use local APP-token auth with user auth off; not production isolation
or acoustic/model-quality proof. Unmatched external provider calls are blocked.

These are prose/heading heuristics, not universal grammar, name-pronunciation
or semantic-quotation guarantees. Multiple-heading/cue text is intentionally
not rewritten. Complex/untimed abbreviations and proper-name pronunciation
still need real-user listening; do not claim every possible heading is solved.

## Proof checkpoint

Frozen tracked production/test tree `e54ab7c04d99360a14f2ee577a34e592741c3e4e`;
tracked-only snapshot `/tmp/them-978-node20.MSUM3S`. No local env files copied.
Pinned image them-proof-node20-943, Node20.20.2: full backend **2884 passed /
0 failed / 2 skipped**, exit0. Explicit skips: real PostgreSQL without
DATABASE_URL and opt-in live page provider. Network-disabled contracts
**72/0/0**; offline golden accepts all40 strong/rejects all40 weak exemplars.
Logs `/tmp/them-978-node20-backend.log`, `/tmp/them-978-node20-offline.log`.
Signed authenticated local Home handoffs **2/0/0**, exit0, erased owned
simulator11CF5EFB, iPhone17Pro/iOS26.2. Confirmed text and fixed server-ASR
reach formatted page, automatic project save and exact relaunch restore.
Bundle `/tmp/them-978-home.xcresult`, log `/tmp/them-978-home.log`.
Fixed provider counts STT1/chat4/TTS24, external calls blocked, user auth
required. Deterministic transport/persistence proof, not acoustic/live quality.
Private retained before/intermediate/final logs and signed result bundle:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-978-20261016.vZ7xvH/`.

Client/project/Packages/UI-test trees are byte-identical to T-977/T-975.
Signed units852/0/0, writer/export/relaunch1/0/0 and macOS compile exit0 are
source-identical prior-head evidence, not fresh runs here. Existing macOS
PrintScreenplayIntent warnings remain. D009 versus T-977 all five growth
deltas0, syntax/whitespace pass. No paid model calls or physical-phone proof.

#906 b2994b00 remains independently approved; required hosted run39006472727
is still executing V1 UI smoke at this checkpoint. No merge or bypass while
required checks run. Shipping backend/phone/rewrite/offline/external export
and generated120-page craft/format parity remain unproven.

Next actual original boundary #652 `ece8cf76fdb2bd0d92261d25c4c2b5586523b2e4`.
Its PR body and complete four-file diff have been read. Preserve target-aware
mentor landmarks, shared alias/page-evidence tests and the semantic allocator
when reconciling its core wording, synonyms and companion-weight change.
Historical live scores are not current integrated model proof.

## Exact files

- `backend/evals/mentor_conversation/score_mentor_reply.js`
- `backend/lib/mentor_reply_shape.js`
- `backend/lib/talk_handler.js`
- `backend/tests/mentor_golden_scorer.test.mjs`
- `backend/tests/mentor_reply_shape.test.mjs`
- `backend/tests/talk_mentor_craft.integration.test.mjs`
- `TASKS.md`
- `docs/mentor-pitch-integration-2026-10-16.md`
