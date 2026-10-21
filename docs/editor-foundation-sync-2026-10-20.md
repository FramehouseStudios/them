# Green editor on the current save/security foundation

VERIFIED local preserving merge `a69ad159be6aeb60a843f946f2d98a451e461f0b`:

- Original #919 `39ca7c3b16af04a7c5590f60cd1576df94676931`.
- Preserved #904 preparation `97ce2453b46685ea1e9d3884e63fbc1af628a4d2`,
  itself retaining original #904 and green #964 plus their complete histories.

## Integration repairs, not replacement implementation

Both task histories and both complete outbox test insertions were retained.
Adapt the child's DEBUG readiness and parked-conflict hydration guard to the
single `draftSaveSlot` owner instead of the removed private Bool. One additional
old Bool reference was caught by static preflight before any test started; this
is not a claimed failing executable regression or an unchanged test retry.

Preserve the child's explicit Keep Mine bypass of older active saves inside
`runClaimedDraftSave`, using `request.source`. Do not copy the old not-in-flight
condition into that method: its slot is already claimed by design. Ordinary
requests retain the parent's queue ordering and handoff. Existing conflict
copies retire only after server confirmation, not merely on pressing Keep Mine.

No second queue, coordinator, persistence layer, editor, export engine or
provider path. No new product UI, timeout increase or weakened typing assertion.

## Fresh bounded proof

VERIFIED signed/erased task-owned SE375pt, iOS26.2/23C54,
UDID `E8998A6B-35B1-49E3-896C-861550849927`:

- Selected save-slot6 + actual model/outbox10 + unchanged exact typing UI2:
  **18 passed / 0 failed / 0 skipped**, native exit0 and actual summary read.
  `/tmp/them-1083-focused/v1-ui-smoke-local-1-65537.xcresult`,
  `/tmp/them-1083-focused.log`.
- Selected authenticated expired-auth/conflict/Keep Mine/relaunch story:
  **1 passed / 0 failed / 0 skipped**, native and strict producer exit0.
  `/tmp/them-1083-recovery/them-save-recovery-ydWpVn/recovery-ios.xcresult`,
  `/tmp/them-1083-recovery.log`. This is one selected story, not both recovery
  stories. Its expected final complete draft/one-version assertions are intact.
- Dummy-provider localhost31337 backend, account auth required; matching secure
  cached lockfile/dependencies; no private environment files or paid calls.
  The owned temporary dependency link was removed after the completed run.
- All five D009 deltas0 versus actual remote #904 `d36d4e64`: index33626,
  Studio17431, Root15112, bridge12929, memory API10865. Same watched counts as
  the prepared lower parent. Diff check passes; accepted33626 exception retained.
- Both merge-parent ancestry checks pass. Protected editor/root/bridge,
  viewport and entire UI-test file match original #919 exactly. Backend
  index/package/lockfile, workflow and save-slot match prepared #904 exactly.
- No full backend/unit/V1/macOS repeat. Existing compilation warnings remain.

## Scope and next boundary

The affected cases cover stale observer authority, parked conflict/base
restoration, unreadable queue, owner/sign-in generation, write-failure rollback,
held admission and server-confirmed retirement. The selected UI proves this
combined source's authenticated save/recovery path with controlled faults, not
physical radio failure, paid speech/model quality or the shipping backend.

Original #964 `5faa43d6` and #919 `39ca7c3b` remain independently hosted-green;
their broad results are not falsely attributed to this new combined tree.
Original remote heads and main are unchanged. #964 is ready but still requires
genuine non-author approval; old ee5c83fd approval is dismissed.

Next: prepare original #973's existing redirect security capability on this
combined parent, preserving its old head/history. Do not publish replacement
PRs or a redundant pre-parent-landing full CI run. After lower protected parents
land, advance the same original children normally with fresh landing-head checks
and independent review. Production hold remains; real-phone journey unproven.

Continue status: READY FOR CONTINUE.
