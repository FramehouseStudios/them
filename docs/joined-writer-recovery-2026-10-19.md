# T-1030 — One candidate for repaired saves and owned voice recovery

## Scope and preserving inputs

Local mergee42c5e1d85c635a2a52195d95d59c009177b8cba has parents001a7d43
(recovered-reply review and T1013–T1026 recovery fixes) and4c99a59c (repaired
save/database/mentor parent). Both full histories remain ancestors, including
original #962f5e746c2, #9637459a8fa and #6538f5f4f2f. No original heads/bases,
main or production changed. This is a local integration candidate, not a
replacement PR or claim that the original stack has landed.

The goal is one usable client source, rather than separately proven fixes
that have never been combined: failed/ambiguous voice retention, owned result
review, complete History, exact screenplay-save recovery and intact mentor
dialogue. Automatic recovered-page application remains unfinished; this
merge does not pretend a review card means the story reached the editor.

## Conflict decisions

- Preserve both task histories, with one copy of the identical T990 entry.
- Mentor shaping: keep canonical quote masking and both causal/critical
  advice protections. Production conflict was explanatory comments, not a
  choice to discard either behavior.
- The independently added mentor HTTP tests used different provider fixtures.
  Extend the existing shared billing-provider fixture with quoted dialogue,
  because-contract and TTS-input assertions. Keep the full response and
  unchanged-project assertions and robust test cleanup. Do not restore the
  parallel mentor-only transport; no executable reference remains to it.
- Save dispatcher/queue/policy and save-authority regression file are byte-
  identical to repaired parent4c99a59c. OfflineTalkOutbox/recovered review
  source and DECISIONS are byte-identical to recovery parent001a7d43.
- An overbroad identity check also included the entire UI test file and
  correctly reported its existing narrow drawer-reveal differences. Keep
  those geometry-based helpers from001a7d43 plus the repaired recovery
  assertions from4c99a59c; no assertion/skip/timeout is relaxed.
- D017 flexible120-page recommendation remains intact; orb/Clementine and
  the established aesthetic are not redesigned here.

## Verified local integration boundary

Frozen combined sourcee42c5e1d: pinned network-disabled Node20.20.2 completed
exit0, scripts238/0/0, backend2994/0/2 (2996 checks,47 suites), offline mentor
golden gate OK. Skips remain live Postgres-prefix and opt-in model page-sync
cases, not asserted green. Shared-fixture mentor quote/causal/TTS/unchanged-
project test passes in this full suite; no parallel mentor transport needed.

Actual canonical Node20.20.2/PostgreSQL16.15 restart completed exit0/PASS:
12 migrations, exact422,201-byte synthetic draft/rewrite, backend/database
restart with fresh local files, retained authentication, denied cross-user
read and idempotent replay. Owned fixture cleanup precedes PASS. This is not
a generated or craft/format-validated120-page screenplay or either skipped
assertion above. No host database/real provider/production credential used.

Signed full units completed893 passed/0 failed/0 skipped on erased task-owned
Pro11CF5EFB/iOS26.2, signing on, terminal exit0. Actual summary read:
`/tmp/them-1030-full-units/v1-ui-smoke-local-1-81393.xcresult`.
Completed bundle cloned and byte-compared privately. Unchanged signed five-
case recovery completed5/0/0, authenticated loopback backend, actual summary
read: `/tmp/them-1030-recovery/them-save-recovery-Z3wTUU/recovery-ios.xcresult`.
Bundle cloned/compared. Covers exactly-one exact-byte reconnect, auth/stale
conflict/Keep Mine, delete-all, blank snapshot, fresh Load Server/relaunch.
Signed writer/create/save/export/relaunch completed1/0/0, actual summary read:
`/tmp/them-1030-writer/them-studio-ios-writer-loop/run-keW3Wr/writer-loop.xcresult`.
Signed lost-project-creation-reply completed1/0/0, actual summary read:
`/tmp/them-1030-creation-loss/them-studio-ios-writer-loop/run-JjtEZr/writer-loop.xcresult`.
Both bundles cloned/compared. Provider replies are deterministic fixtures,
not physical microphone/live model or audible-speech proof. Voice-network
fault completed1/0/0, actual summary read:
`/tmp/them-1030-voice/voice-network-fault-local-1-82513-ios.xcresult`.
Bundle cloned/compared. macOS scaffold BUILD SUCCEEDED; serialized native UI/
macOS runner completed exit0. Final log `/tmp/them-1030-voice-macos.log` retained
privately. Existing warnings remain, not a warning-clean claim. No runtime,
test or workflow change aftere42c5e1d; this follow-up changes proof docs only.
UI orchestration used host Node24.19.0, not a new claim of Node20 UI tooling.
All signed runs use erased task-owned Pro/iOS26.2 with signing on; no human
device or simulator was erased. No broad V1 repetition on this local tree;
fresh hosted original-head V1 remains required and is not replaced by these
affected-path checks.

Private evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1030-20261019.W8eFTl/`.
Logs: `/tmp/them-1030-node20.log`, `/tmp/them-1030-postgres.log`.

D009 versus fetched4c99a59c: index33557→33541(-16), BackendMemoryAPI10716→10700
(-16), other three deltas0. Syntax and whitespace pass. No allow-growth or
new dependency/provider. No paid model call, physical-phone or release proof.

## Remaining integration boundary

Original #962 hosted run39367137834 remains active at last actual snapshot,
now in V1 UI smoke after the writer step; backend and D009 succeeded. Original
#9637459a8fa/#6538f5f4f2f and maindeac1a6d remain unchanged. Do not advance
children or bypass independent review/protections based on this local merge.
Intended shipping-backend/domain, human production hold, and actual microphone
→ complete reply → page → rewrite → exact recovery → external export remain
unproven. Report actual failures/skips and keep the full objective active.

Next product gap: keep immutable original generation project/version context,
retrieve authoritative output when a full page is missing from headers, then
apply through the existing guarded page/save path on explicit writer action.
Do not auto-apply an old response to the currently open project or promote a
preview to a complete screenplay. This remains incomplete, not a hidden toggle.
