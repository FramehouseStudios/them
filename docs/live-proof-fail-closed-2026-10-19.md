# T-1009 — Do not turn provider failure or fixtures into live proof

## Root issues and correction

Real CLI subprocess regressions failed0/3 before the correction:
`/tmp/them-1009-before.log` (host Node26.7). The live runner continued40
cases after an authentication failure, accepted the app's fixed-reply bypass
as live output, and could pass an empty offline selection. It also copied
raw provider error bodies into console/reports, risking echoed credentials.

The existing runner now stops after the first render failure, retains a
partial failed report with selected/unattempted counts and safe HTTP status,
refuses fixed-reply live mode, and rejects empty selections. Preflight blocks
overwrite an existing green report with an explicit blocked report. Normal
model/scorer thresholds and the production renderer/fallback policy remain
unchanged; this is not a new adapter or generation path.

Official OpenAI error guidance distinguishes invalid authentication and
quota/billing failures; repeating quota requests does not restore access.
For this explicitly scoped proof, the stricter policy is to stop on any
render failure rather than continue spending through the case list:
[OpenAI error codes](https://developers.openai.com/api/docs/guides/error-codes).
No available platform-key tool was found. No real key file read or paid call.

## Evidence

- Final focused20/0/0, `/tmp/them-1009-focused-final.log`: actual CLI imports
  the real renderer, actual shaping/scorer, transport fixture only. A401
  makes exactly one fixture request, records1of40, leaves39 unattempted,
  and does not expose the synthetic secret canary. Blank selection, missing
  key and fixed-reply mode make zero provider requests. Every case starts
  with a stale green fixture report and requires it to be overwritten.
- Positive control uses the existing `pitch-talk-to-me` golden through
  renderer/shaping/scorer and passes the unchanged3.5 register floor. An
  earlier `pitch-hello` fixture failed that floor (register3), despite its
  overall PASS; preserved `/tmp/them-1009-focused.log`. Changed the control
  fixture, NOT the scorer, bar or golden set. These are NOT live model results.
- Syntax/diff pass. Actual fetched T1007 baseline D009 all five deltas0.
  A first missing-base invocation failed closed; baseline fetched and rerun.
- VERIFIED frozen cb1e0caf, pinned Node20.20.2 with external network disabled:
  backend2988 pass/0 fail/2 skip; scripts238/0/0; offline golden OK;
  native25103 exit0. `/tmp/them-1009-node20.log`. No paid model calls.
  D009 all five actual deltas0; syntax/diff pass. Swift/app/
  project/package bytes unchanged from T1007's868 signed-unit tree; no fresh
  iPhone, macOS or actual generated feature result is claimed here.
- Direct completed T1007 xcresult tree confirms mentor parity/core cases
  actually executed; source literal and shared persona file are4043 characters
  each and equal. An apparent extra line in concatenated tool output came
  from the following source excerpt, not a real parity defect. No speculative
  parity repair or weakened assertions. T1009 changes no Swift/app bytes.

## Exact files

- backend/evals/run_mentor_golden_eval.mjs
- backend/tests/mentor_eval_fail_closed.test.mjs
- backend/tests/helpers/mentor_eval_provider_failure.mjs
- TASKS.md
- docs/live-proof-fail-closed-2026-10-19.md

## Holds and next

Human has said they will add the local key, but has NOT confirmed ready.
Do not read that file or run paid proof yet. Once ready and local gates pass,
run the scoped live evaluation once, retain each attempted model result and
any failure, and do not treat fixture output as live evidence. Physical
iPhone, shipping backend, actual feature craft and external export-open remain
unproven.120 pages is the recommendation, not a quota. Production remains
held until App Store credentials exist. No main/original-head change here.
