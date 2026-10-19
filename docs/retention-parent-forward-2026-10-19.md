# T-990 — Preserve exact retention above the recovery parent

## Scope and current state

Previous goal turn was progress: existing #961 was fast-forwarded to
8b19d86b12f247106475109442b7b1b3c2008468 with completed local proof retained.
The full product goal remains active; no production or physical-phone claim.

Normal merge e1027bd31fd2373bddba061d2c0975ffb147c720 has parents:

- Original #962 aef3250b06435e39d86da63c44cee73273081ff8.
- Updated #961 8b19d86b12f247106475109442b7b1b3c2008468.

Read the current #962 body and original byte-distinct persistence commit
783fbc99 before merging. Only TASKS.md conflicted; both histories retained.
Against the updated parent, the sole runtime difference is the original
exact-byte didSet guard; its original regression test remains unchanged.
The parent stored-snapshot/deferred editor correction and auth hydration
policy remain present. No replacement, squash, force push or main merge.
Original #962 remote is not updated pending combined proof and parent CI.

## VERIFIED / running proof

- Working and staged whitespace checks passed before merge commit.
- D009 against freshly fetched origin/codex/T-979-mentor-ending-integration
  at8b19d86: all five deltas0. Initial --base argument was unsupported and
  therefore compared origin/main; it was not treated as parent-relative
  evidence. Explicit GITHUB_BASE_REF plus fresh ref is authoritative.
- Signed full themTests864/0/0, exit0, through the exact-device erase runner on
  owned11CF5EFB-D8C3-4F19-8062-28AF37F27D93, iOS26.2:
  `/tmp/them-990-units.log`; authoritative summary confirms owned UDID and
  iOS26.2. Bundle `/tmp/them-990-units/v1-ui-smoke-local-1-76960.xcresult`.
- Node20.20.2 scripts231/0/0 on the corrected disposable environment.
  First backend process completed2765/9/2, exit1, retained at
  `/tmp/them-990-node20-persistence-root-failed.log`.
  Actual first failure: craft analysis creates its default persistence root
  under read-only backend/data. Other index-import tests hit the same root.
  Corrected canonical PERSISTENCE_JSON_ROOT to disposable /tmp, leaving
  source read-only and networking disabled. Final unchanged full backend
  suite2897/0/2, exit0, Node20.20.2: `/tmp/them-990-node20.log`.
- Initial Docker start exited125 before any test: nested dependency mount
  lacked a mountpoint under the read-only source. Created only an empty
  ignored backend/node_modules directory; retained failure log at
  `/tmp/them-990-node20-container-setup-failed.log`. No application or test
  assertion changed to repair the environment.
- Two subsequent environment-only failures were retained: fixture executables
  could not execute on noexec /tmp and a global APP_TOKEN overrode a script's
  expected fixture value (scripts205/26/0); then release-config fixtures could
  not write their intentional temporary output under read-only them/
  (scripts228/3/0). Corrected with executable disposable /tmp, backend-only
  synthetic configuration and a tmpfs them/ overlay populated from tracked
  HEAD. Final script suite231/0/0; host source and signing files untouched.
  Logs `/tmp/them-990-node20-fixture-environment-failed.log` and
  `/tmp/them-990-node20-readonly-fixture-failed.log`.
- Parent hosted run39312650862 on8b19d86: D009 and Backend tests completed
  success; required iOS Quality Gate still running at last API observation.
  Do not transfer old46a5b4e hosted success to the new head.

Completed unit/recovery/writer/Home bundles compared byte-identical in private retention:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-990-20261019.vL07YH/`.
Final backend and all environment-failure logs also retained there. This is
same-computer retention, not an off-device backup.

Signed authenticated UI pipeline active, native session33553, using the
same exact erased owned device for each stage, stopping at first failure:
five-story recovery → writer/export/relaunch → fixed-provider Home → V1 →
voice-fault/macOS. Logs `/tmp/them-990-{recovery,writer,home,v1,voice}.log`.
Recovery completed5/0/0; writer/Craft/native MD+FDX export/relaunch1/0/0,
both authoritative xcresult summaries inspected. Fixed-provider Home2/0/0,
fixture STT1/chat4/TTS24; no real microphone or live model claim. Original
bundles:
`/tmp/them-990-recovery/them-save-recovery-p9djES/recovery-ios.xcresult`,
`/tmp/them-990-writer/them-studio-ios-writer-loop/run-BSQSjs/writer-loop.xcresult`,
`/tmp/them-home-voice-79731.xcresult`.
V1 and voice/macOS remain active/pending; do not call them completed until
actual terminal summaries are inspected.

Required remaining proof: writer/recovery UI, macOS and exact-head hosted
result. Inspect first red before child
publication. Current task is preparation, not a verified child promotion.

## Long-form requirement audit (not a new implementation)

The current view model supplies ScreenplayFeatureProgressionGuide.defaultTargetPages
to its feature compass. Original #861 body/head316abb4d was independently
read: it contains later account-persisted target length and the additive
project settings endpoint. Preserve/review that original work in dependency
order rather than re-implementing it here. Its historical tests/live claims
are not new current-tree proof.

Current backend has a distinct bounded per-turn page batch resolver; this
does not establish autonomous120-page completion, continuity, output quality
or print parity. A configured target alone cannot satisfy the human goal.

## Release hold

DECIDED: keep production blocked until App Store credentials exist. No beta
purchase bypass, deployment, credentials entry or paid provider call here.
Real microphone, shipping-backend account journey, generated120-page script,
physical offline/relaunch and export opening outside THEM remain unproven.

Next: inspect active exact test handles, fix first failure, then preserve
the child PR only when parent and combined evidence permit it.
Continue status: READY FOR CONTINUE.
