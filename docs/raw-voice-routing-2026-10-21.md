# T-1119 — classify microphone words after ASR

Parent `9d897e50050bc580be962b040b7c09895cee8c89`; branch
`codex/T-1119-authoritative-audio-routing`. Local fix, not a deployment claim.
Runtime commit `be7c70d6053dd4db7a65bbc1defcbe1c3b6e1655`.

## Reproduced cause and smallest fix

Real authenticated local `/talk`, with an audio file, project and Page target
but no supplied transcript/generation instruction, returned HTTP200 Voice Pin
instead of authoritative Page output. The pre-ASR empty string had selected
the silence Reflex template; that template survived actual transcription and
became a local-action reply, bypassing Page generation.

`page_lane_adapter.js` now defers preparation for unknown audio until the
handler has actual ASR words. The existing classifier/reservation/reflex owner
then runs once, without repeating the handler or transcription. Typed and
confirmed-transcript turns retain their existing entry path. A disconnected
response cannot create a late Page reservation.

`screenplay_turn_target.js` reconciles the authoritative words and Page target
before generation, preserves write refusals, and owns the existing short-film
promotion removed from the handler. `talk_handler.js` calls that seam and stops
if wallet preparation ended the response or the caller disconnected. The
handler shrinks; no new auth, storage, wallet or conversation implementation.

## Evidence and corrections

- Initial focused HTTP regression: **0 pass / 1 fail** on the actual Voice Pin
  mismatch. The earlier sandbox EPERM was an environment failure, not a product
  reproduction; the authorized localhost run supplied the actual red result.
- The fixed authenticated HTTP request returns authoritative Page, a Page
  reservation and stored metadata containing the synthetic scene, with exactly
  one server-ASR invocation. Providers are intercepted, not paid/live.
- First combined run exposed a missing Companion header on deferred raw refusal.
  Reapplying the canonical refusal transition after lane preparation fixed it;
  the existing saved-draft/refund refusal workflow then passed unchanged.
- Two new wallet unit cases initially omitted the positive output budget used
  by the intended paid request. Those fixtures now explicitly use400 tokens;
  empty-wallet blocking, reservation/cancel refund and one preparation are
  checked. This does NOT prove a safe omitted-budget contract; see below.
- The audio result's existing URI-encoded metadata exceeds Node fetch's default
  response-header budget. The new HTTP regression uses a bounded128KiB classic
  HTTP client for that one response, not a global suite override or production
  header change. A normal test launch then passes. Oversized legacy headers are
  still transport debt, not fixed here.
- Latest focused runtime/Reflex/cancel/refusal checks: **27/0/0** on host
  Node24.19.0. Earlier handler/source/refusal contract set: **16/0/0** before
  adding the disconnected-response guard and explicit-budget test assertions.
- Syntax and diff checks pass. The five D009 files are unchanged from the exact
  parent; `talk_handler.js` is11lines shorter. The standard origin/main gate
  also passes.
- Fresh full backend `npm test`, Node20.20.2 in the existing isolated container
  with external networking disabled: **2920 pass / 0 fail / 2 skip**,2922 total,
  approximately108.4seconds. Skips: real Postgres prefix query lacks DATABASE_URL;
  optional live Page-sync case is not enabled. Neither establishes live storage
  or provider behavior. No private environment files were copied into the source.
- Signed `test_home_raw_audio_uses_current_server_transcript_writes_and_restores`:
  **1/0/0**, actual local HTTP/native formatted-page/save/relaunch workflow;
  intercepted STT1/chat3/TTS1, host Node24.19.0. Normal signing and erased
  task-owned iPhone17Pro/iOS26.2 simulator7F1A14C1-B379-4417-AFE9-331810CD9CD3.
  This is an existing client regression, complemented by the new bare raw-Page
  HTTP test; it is not a claim that every native voice path has been exercised.
- First UI launch failed before running the workflow because the frozen source
  lacked host Express dependencies. Its terminal failure was inspected, the
  existing host dependency directory was linked without changing it, and the
  same workflow then passed. The failed log is retained, not counted as a pass.
- Frozen source `/tmp/them-1119-proof.tikPXh/source` matches all five committed
  runtime/test files byte-for-byte. Durable local proof logs and signed bundle:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1119-20261021.kwp49I/`.

## Not covered / next boundaries

No paid model, physical microphone/phone, production deployment, integrated-main,
server-crash durability, first-project recovery, or complete product proof.
Native source is unchanged; inherited signed932/0/0 is not a fresh unit run.
No new macOS build was run for this backend-only fix. Both broader native gates
must still be rerun at the next combined integration boundary.

The existing wallet estimator permits a zero-cost hold for an omitted/zero
output cap. This was observed in the local reservation cases/source, not
established as a production exploit. Server-owned generation budgets and their
relation to the actual hold/settlement require a separate bounded audit/fix;
do not describe all wallet limits as proven by the positive400-token cases.
Likewise pending wallet settlement across an actual server crash remains
Zora's separate T-1118 boundary, not this routing fix.

Other unchanged limits: existing low-confidence/continuation holds; provided
generation instructions still follow their confirmed-turn path; accurate
spoken rewriting, original-context automatic delivery and physical-iPhone
sign-in/write/rewrite/save/offline/relaunch/export remain unfinished.

Exact files: `backend/lib/clementine/page_lane_adapter.js`,
`backend/lib/screenplay_turn_target.js`, `backend/lib/talk_handler.js`,
`backend/tests/raw_voice_lane.test.mjs`,
`backend/tests/raw_voice_page_lane.integration.test.mjs`, `TASKS.md`, this report.
