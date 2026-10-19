# T-995 — Keep advice off the screenplay

## Problem and root fix

VERIFIED on the combined T-994 parentd68d071: a direct complete120-page
screenplay request infers no Page destination, while advice, outline and
negative writing instructions can infer Page. Task classification/context
was treated as permission to write, and finish_feature required old context.
Additional probes reproduced simple script requests missing Page and
"help me plan" / "I do not want you to write" incorrectly selecting Page.

The canonical backend/lib/screenplay_turn_target.js now checks the request
prefix for advice/planning/negative instructions before task/context/page-count
inference. Story content after a colon is not mistaken for a negative command.
Direct script/screenplay requests work without task inference or an old draft;
an explicit feature page-writing cue no longer requires old context.
resolveScreenplayTargetFromRequest still honors an explicit Page/Voice Pin
selection. No second parser, billing rule, provider or persistence path added.

This is a bounded deterministic request grammar, not universal natural-language
understanding. Conflicting multi-intent requests and implicit paraphrases remain
follow-up cases; do not claim all spoken requests are understood.

## Evidence

- Original failing-first focused suite13 pass/5 fail, no skips:
  /tmp/them-995-routing-before.log.
- Additional failing-first suite23 pass/3 fail:
  /tmp/them-995-extra-before.log.
- Final focused suite26 pass/0 fail/0 skip (host Node26):
  /tmp/them-995-routing-after.log. Real production metadata sanitizer is
  exercised with an existing project and120-page target. Also preserves
  explicit destinations, fictional negative dialogue, act-aware continuation,
  scene-doctor notes and broad feature help behavior.
- First container invocation used a nonexistent scripts/tests path: no tests
  ran. The corrected diagnostic run began before the final extra cases/fix;
  do not use it as immutable final-head proof. A fresh frozen-source run is
  required after this commit, under Node20.20.2 with external networking off.
- Final frozen runtime89fce1db2bab3a04e7618c779c355d139e9cca12:
  Node20.20.2 scripts231 pass/0 fail/0 skip; backend2942 pass/0 fail/2 skip,
  exit0. /tmp/them-995-final-node20.log. Source and Git metadata mounted
  read-only; fixture writes isolated in tmpfs; no external network/provider.
  Documentation added afterward does not change runtime/test source.
- D009 gate and git diff --check pass locally; no god file changed.

## Exact files and limits

Files: backend/lib/screenplay_turn_target.js,
backend/tests/screenplay_turn_target.test.mjs, TASKS.md and this report.
Backend-only change; no new signed/UI run claimed for T-995. T-994's ongoing
signed combined run remains separate evidence of its exact source.

Not covered: raw microphone audio is classified before STT elsewhere; late
transcript promotion must preserve Page reservation/cancellation/settlement.
This fix does not change that financial boundary or prove voice-to-page.
No live model call,120-page generated artifact, physical-phone journey,
shipping backend, external-file opening or production deployment was verified.
Production remains blocked until the human's App Store credentials clearance.
Main, original PR heads and independent review protections remain unchanged.

## Next verified failures, not hidden by this green result

The separate T-994 final SE run has a Clear Thread confirmation hittability
failure; inspect its retained screen evidence before changing product behavior.
The parent #961 hosted run39312650862 finished red on signed recovery:
test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once
failed its durable-conflict assertion after relaunch (Swift line2404), followed
by signal term. Logs /tmp/them-961-hosted-39312650862-failed.log. The snapshot
still contains the synthetic marker but no conflict/parked state; this is not
proof of text deletion or proof the recovery is safe. Parent promotion stays
held. No unchanged retry or original child-head update was performed.
