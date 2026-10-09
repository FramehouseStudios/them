# Retained writer-gate evidence — 2026-10-08

Branch `codex/T-941-export-handoff`, based on #939 exact
`08a0b1089d6fb12a6eda35a923df9aead3e07375`. Goal item 7; prerequisite for
item 4's export handoff. Main is unchanged. No provider calls, credential
changes, physical-device operations or human simulator erasure.

## Root and characterization

VERIFIED: #938 hosted run `37874741945` failed at the Markdown filename
assertion. Its evaluator deleted the `.xcresult` unconditionally in `finally`.
Downloaded failure artifacts contain only its unit bundle, not the writer's
screenshots/hierarchy. The export failure's cause cannot be inferred from that
missing evidence, and this change cannot recover the past deleted bundle.

The unchanged-evaluator harness `/tmp/them-941-evidence-red.log` reports zero
pass, five fail: terminal outcomes delete their evidence, including a first
bundle before a second invocation. This runs the actual evaluator against a
real isolated authenticated local backend, with fake Apple tools; it is runner
characterization, not an iOS product failure or physical-device test.

## Smallest fix

- Allocate a unique `run-*` directory with private mode 0700 beneath
  `RUNNER_TEMP/them-studio-ios-writer-loop` (OS temporary directory fallback).
- Keep the real writer `.xcresult` on success and failure. Delete only this
  invocation's generated restore configuration (mode 0600).
- Emit child diagnostic output before summary JSON/count checks. Preserve
  bounded failure tails and the exact one-pass, zero-failure, zero-skip rule.
- Include these bundles in the existing hosted failure upload, without adding
  provider calls, retries, unsigned tests or a weaker gate.
- Put the regression harness in `backend/tests`, so required `npm test`
  executes it. A fixture path contains spaces and an unrelated sentinel file.

## Proof so far

VERIFIED: `/tmp/them-941-evidence-final-v2.log`, six pass, zero fail/skip: failed,
passing, zero-executed and malformed-summary runs retain diagnostic output and
bundles; repeated runs preserve earlier evidence; hosted upload glob matches.
`/tmp/them-941-runner-contracts-final.log`: 12 pass, zero fail/skip. Both changed
JavaScript files pass `node --check`; god-file and diff whitespace gates pass.

An extra sandboxed harness invocation failed before reaching fake Apple tools:
one pass, five fail (`/tmp/them-941-evidence-post-proof.log`). Its missing
`args.json` error masked startup. Added a bounded startup diagnostic assertion;
the diagnostic invocation `/tmp/them-941-evidence-sandbox-diagnostic.log`
identifies `listen EPERM` on 127.0.0.1, not a writer failure. Final harness proof
above runs with authorized local socket permission, not a silent skipped test.

VERIFIED final harness code: `/tmp/them-941-backend-final.log`, Node 20.20.2 complete suite in a
network-disabled Docker container: 2,750 pass, zero fail, two skip.
Generated dependencies reused only after matching the base lockfile.
Read-only review found no blocking issue in this evidence-stage diff;
it is not an independent GitHub approving review.

VERIFIED: signed authenticated writer workflow, one pass, zero fail/skip,
`/tmp/them-941-signed-writer.log`. Real retained bundle:
`/tmp/them-941-signed-writer/them-studio-ios-writer-loop/run-ATwtv1/writer-loop.xcresult`.
Direct `xcresulttool` summary confirms exact counts. Its private parent remains
0700 and generated `restore.xcconfig` is absent after exit zero. The task-owned
simulator `11CF5EFB-D8C3-4F19-8062-28AF37F27D93` was erased first; iOS 26.2,
Xcode 26.3, normal signing enabled. Real local-auth creation, typing, save,
Markdown status and relaunch pass; no native share or artifact-content claim.

VERIFIED: full signed units on the same owned simulator, erased again first:
730 pass, zero fail/skip, `/tmp/them-941-units.xcresult` and matching `.log`.
Direct `xcresulttool` summary confirms counts. macOS scaffold build-only exits
zero (`/tmp/them-941-mac.log`); no unsigned test invocation was used.

VERIFIED: authenticated offline-save recovery, five pass, zero fail/skip,
`/tmp/them-941-recovery-ui/screenplay-save-network-fault-99590.xcresult` and
`/tmp/them-941-recovery-ui.log`, evaluator exit zero and direct result summary.
The owned simulator was erased first. Coverage includes reconnect, expired auth
and stale-version resolution; this is not production/two-device proof.

## Existing export work and boundaries

Read original #868 body and exact head
`a6428e3deb1d58a3f811b32b5913bc9ce6778d1e`: native iPhone
`UIActivityViewController`, iPad popover anchoring, usable filename status,
macOS save panel unchanged. That work is preserved, not replaced, closed or
duplicated. Its UI-test branch suppresses the share sheet, so an integrated
writer pass alone cannot prove native handoff or actual artifact contents.

The full T-941 export target remains unfinished. Next: source-preserving
review/proof of #868 and inspect retained hosted failure evidence to establish
the filename assertion's cause. iPhone PDF remains a human-owned decision.
Local bundles intentionally accumulate until explicitly reviewed/cleaned;
hosted runners are ephemeral. Keep fixture screenplay/account data synthetic.
No shipping backend, physical speech, export/page parity, 120-page performance
or release-readiness claim follows from these runner tests.
