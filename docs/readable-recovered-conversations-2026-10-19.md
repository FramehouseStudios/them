# T-1022 — Readable saved conversation recovery

## Root and implementation

VERIFIED by source inspection: ConversationThread already contains the saved
user and assistant messages. The destination named
`ConversationThreadDetailPlaceholder` displayed only a title and empty space.
`ConversationHistoryViewModel.export` only printed an identifier. Consequently
T-1019's restored History refresh alone did not let a writer read the reply.

Replace the placeholder with a scrollable conversation detail: full title,
You and Clementine sections, selectable verbatim messages, Dynamic Type body
fonts, no line cap and explicit unavailable-message copy. Keep the existing
peach gradient, colors and soft button style. No orb/persona changes.

Replace the log-only Export controls with native ShareLink actions in detail,
row swipe actions and context menus. Share a labeled text copy containing
both original message strings, not the short preview. Sharing is explicit;
no automatic upload. This is a text share, not a screenplay PDF/file export.
No new backend request, store, framework or paid provider call.

## Proof scope

Focused signed command:
`IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=11CF5EFB-D8C3-4F19-8062-28AF37F27D93' ONLY_TESTING=themTests/ConversationThreadPresentationTests ARTIFACT_DIR=/tmp/them-1022-history-detail XCODEBUILD=/tmp/them-994-xcodebuild scripts/run_v1_ui_smoke.sh`

VERIFIED: 1 passed, 0 failed, 0 skipped, runner exit 0. Actual bundle:
`/tmp/them-1022-history-detail/v1-ui-smoke-local-1-66942.xcresult`.
Log: `/tmp/them-1022-history-detail.log`.
Presentation check compares the entire shared
text, including CRLF, Unicode and the final line of a long reply, and rejects
use of the truncated preview. It is not a share-sheet interaction or server
recovery proof. D009 against parent `375cef05` passes, all five guarded files
unchanged. Whitespace check passes.

Separate focused render check (not a repeated unchanged suite):
`ConversationThreadPresentationTests/testConversationDetailRendersAtNarrowWidth`,
using the same signed runner and erased owned simulator, passed 1/0/0,
runner exit 0. Actual bundle:
`/tmp/them-1022-history-visual/v1-ui-smoke-local-1-67530.xcresult`.
Log: `/tmp/them-1022-history-visual.log`.

The check mounts a native UIHostingController containing the real detail view,
with synthetic conversation data, at 375 by 667 points. Inspected its retained
normal and maximum accessibility-size attachments: message text is present,
word wrapping is readable, no letter-per-line labels; normal view includes the
Share action. Accessibility-size content continues below the fold in the
ScrollView. These are native rendered snapshots, not UI automation proving
scrolling, selection, opening a record, server refresh, or share-sheet use.
Test window is removed and previous key window restored afterwards.

Both bundles, logs and the exported screenshot attachments are retained in
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1022-20261019.YIslNm/`.
No paid call, broad local suite or production change.

## Remaining gaps

Opening a history record is not automatic screenplay application. Existing
history may contain only a preview, and the dedicated `/talk/turn/:id`
metadata path has its own lifetime/ownership contract. Do not append a reply
to the currently open project without its original project/revision/write
identity and a checked application/reconciliation path. Audio recovery,
foreground playback, actual native share destination opening, integrated
main and physical-phone journey remain unproven.

The original #962 head remains `527c58d6`; at the last check Backend tests,
D009 and hosted signed units passed, with the integrated writer-loop step
still running. This candidate does not replace original PRs or merge main.
