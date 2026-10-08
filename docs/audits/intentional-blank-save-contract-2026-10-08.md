# Intentional blank writer-save contract — 2026-10-08

## Requirement and boundary

Writer deletions must be saved just like insertions. An empty AI result must not
erase an existing script. This is the server prerequisite; the current Swift
client still rejects blank saves and is not claimed fixed by this PR.

VERIFIED: `handleDraftDebouncedChange` clears recovery for blank text and returns;
`saveCurrentDraft`, `performDraftSave`, and `upsertScreenplayProjectVersion` reject
it. Recovery lookup and queued-hydration policies also exclude blank drafts.
The connected client follow-up must fix those paths together, not merely remove
the network validator. Keep the historical versions so deliberate deletion is
reversible.

## Additive API contract

`POST /screenplay/projects/:projectId/version` accepts empty or whitespace-only
text only with:

- a literal JSON boolean `allow_empty_draft: true` and an actual string `draft`;
- an explicit `studio_manual`, `studio_autosave`, or `studio_conflict_resolve` source;
- nonempty `base_version_id` and `client_request_id`, plus an existing server version;
- `conflict_strategy: reject_if_stale` (also the existing default).

The existing authenticated-owner lookup precedes the project lookup and blank
validation. Stale bases return the existing 409 conflict envelope. Saves retain
the exact string, including spaces, tabs and CRLF. Existing durable persistence,
version history and request-ID replay remain canonical; no parallel store or
generation path was added. Older nonblank clients behave unchanged. Missing
payloads, non-string drafts, non-boolean flags, generation sources and explicit
conflict bypasses remain rejected with the existing `draft_required` envelope.

The flag is an intent guard, not an authorization boundary. Server-side user and
project authorization still supplies that boundary. No generation code sends
the new flag. The client follow-up must send it only for intentional writer edits,
persist that intent across offline retry, and never infer consent from blankness.

## Evidence

VERIFIED red: two handler tests failed before the route change, including the
expected stale-deletion 409 receiving 400 instead. `/tmp/them-930-blank-red.log`.

VERIFIED focused: all 70 actual route-handler tests pass, including byte-exact
blank saves for all three writer sources, rejected bypass cases and versionless
rejection. Final focused log: `/tmp/them-930-final-routes.log`.

VERIFIED actual backend: two authenticated cross-device tests pass. The new one
starts the backend, creates synthetic localhost users, seeds writer text, saves
an empty version and a whitespace-only version, stops/restarts with the same
durable data directory, and reads all three exact versions. Retry is 200 with
the same version ID; changed-ID-content and stale-base writes are 409; anonymous
write is 401 and another owner is 404. Version count remains exactly three.
`/tmp/them-930-restart.log`. No live paid model calls or human credentials.

VERIFIED full backend: Node 20.20.2, Docker with external networking disabled,
2,743 pass, 0 fail, 2 skip. Final `/tmp/them-930-final-node20.log` includes the
strengthened source/versionless regressions. The first container
was stopped because my mount omitted repository-wide fixtures; the corrected
full-repository mount was then used. That abandoned run is not proof.

## Signed client regression proof and remaining risks

VERIFIED: signed erased-simulator units: 659 pass, 0 fail, 0 skip,
`/tmp/them-930-units.xcresult`. Existing auth-required recovery UI: 2 pass, 0 fail,
0 skip, `/tmp/them-930-ui/screenplay-save-network-fault-9775.xcresult`. The existing
exact-text, relaunch, expired-auth, conflict-choice and exactly-once assertions
were unchanged. This is regression proof, not a new blank-deletion client test.
Both used owned simulator `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iPhone 17 Pro,
iOS 26.2, signing on, erased first. No human device was erased.

VERIFIED macOS scaffold build exit 0: `/tmp/them-930-mac-isolated.log`, unsigned
build-only. Existing Swift concurrency warnings remain. God-file gate and diff
check pass; protected files remain unchanged, including index.js at 33,626 under
the approved pre-stack exception. The first macOS attempt hit a concurrent
build-database lock; the successful build used an isolated directory.

Read-only adversarial review found no critical blank-save bypass. Existing replay
identity compares request ID and exact draft, not every source/base field; a
same-ID/same-draft request with a different valid base may replay, without a new
mutation. Broader request-payload binding remains separately tracked.

Not covered: client delete-all/offline/relaunch/reconnect, physical microphone,
provider balance, production Postgres soak, export parity, 120-page performance,
release configuration and shipping-host proof. Main stays unchanged; independent
review and hosted checks are still required before bottom-up merges (#766 first,
then #770). This draft does not make the app release-ready.
