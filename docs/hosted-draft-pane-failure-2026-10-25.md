# Original638 — Retained hosted Snapshots-pane failure

VERIFIED: original638 head `612bf17023854a3a5ba5890418b17ac1acc33b5e`,
run40171307411, is terminal failure. Main remains78b8c94. Backend and D009 jobs
passed; Quality Gate failed the required broad V1 UI step, and the subsequent
voice-fault/macOS step was skipped. Exact broad-summary counts have not yet
been extracted; do not infer them from earlier local proof.

The failure log identifies:
`V1SmokeUITests/test_draft_tools_tabs_route_to_each_presentation_pane`, line613,
asserting `studio.draft.snapshot-tools` after tapping Snapshots. Event trace
first finds Pages and successfully switches to Revisions. It then records one
Snapshots tap, but the snapshot-tools existence check fails within the raw4s
wait. That does not establish whether the tap, routing, visibility, accessibility
container or timing caused the failure. Inspect the actual artifact before
choosing a code or test correction. Do not just rerun the old job or increase a
timeout without evidence.

Raw failed-step log: `/private/tmp/them-638-40171307411-failed.log`.
The published PR remains draft and requires independent human approval; do not
merge while red, and do not advance original639/640. Earlier local backend2750/
0/2, signed633/0/0 and writer1/0/0 are retained, not relabeled hosted success.

Separate failure: original974's older run40170181825 failed recovery Files
readiness. Minimal UI-only candidatef4aca4a is published with fresh run40175219157
in progress. It is not declared resolved; those results do not clear638.

T-1142's next action is to fetch the exact638 test artifact, inspect the captured
screen/trace and correct the smallest verified cause in an isolated task lane.
No paid model, shipping backend, private credential or phone action is needed
for that diagnosis. All existing original heads/history and protections remain.
