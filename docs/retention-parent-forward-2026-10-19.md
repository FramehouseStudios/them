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
- Signed full themTests running through the exact-device erase runner on
  owned11CF5EFB-D8C3-4F19-8062-28AF37F27D93, iOS26.2:
  `/tmp/them-990-units.log`, native session41220. Not yet a passing result.
- Node20.20.2 full script/backend suite running with read-only source and
  dependencies, no external network, synthetic configuration:
  `/tmp/them-990-node20.log`, native session23143. Not yet a passing result.
- Initial Docker start exited125 before any test: nested dependency mount
  lacked a mountpoint under the read-only source. Created only an empty
  ignored backend/node_modules directory; retained failure log at
  `/tmp/them-990-node20-container-setup-failed.log`. No application or test
  assertion changed to repair the environment.
- Parent hosted run39312650862 on8b19d86: D009 and Backend tests completed
  success; required iOS Quality Gate still running at last API observation.
  Do not transfer old46a5b4e hosted success to the new head.

Required remaining proof: completed signed units, writer/recovery UI, pinned
backend, macOS and exact-head hosted result. Inspect first red before child
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
