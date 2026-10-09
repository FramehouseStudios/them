# T-939 — Collaboration belongs to the current account and project

Goal items 1, 3 and 6. Base #937 `2d5cc7b495bda7fc5c9e99012c5665599c381691`.

## Reproduced roots

VERIFIED: unchanged production: three failed real-model delayed-response tests,
one passed, 11 failed assertions. Late collaborator/comment payloads reselect
the previous project; a late comment save clears the newly selected project's
composer. The background timeout already preserves feedback; no reproduced
timeout overwrite is claimed. Corrected fixture evidence:
`/tmp/them-939-collaboration-red-v2.xcresult` and `.log`.
The first red run includes an assertion against collaboration data legitimately
loaded before the simulated switch; it is not the final root-proof artifact.

## Scope and boundaries

Capture existing auth identity, selection generation (including A→B→A), and
per-collection response generation. Check after awaited work and before fallback
requests. Keep fallback fields immutable. A collection response cannot replace
project selection, draft/history metadata, or the other collection. Reject
explicit mismatched project IDs before any mutation; absent additive IDs remain
compatible. Empty collaborator lists are legitimate current snapshots.
Clear comment or collaborator form fields only if their exact submitted UTF-8
bytes still match. Older completions cannot clear a newer collaboration busy ID.

Read-only review identified two additional ordering gaps, reproduced with
13 passing tests and two failing tests, five assertions:
`/tmp/them-939-ordering-red-v2.xcresult` and `.log`. Duplicate comment save
dispatched two mutations; a refresh overtook a pending write and suppressed its
acknowledgement. Collaboration writes now serialize within the current selection;
refresh cannot overtake an active write. A mutation invalidates old refresh error
ownership; selection changes release the old UI ownership without admitting old
results. A rejected duplicate does not dispatch or mutate the composer.
No source rewrite, backend contract or server authorization change.
Claude #854's script-scoped memory and #910's loaded-draft sync boundary were
inspected and retained. No Claude branch is closed, squashed or reimplemented.

## Proof / not covered

Initial focused fix: four pass, zero fail/skip,
`/tmp/them-939-focused.xcresult` and `.log`. Expanded 13 pass, then ordering-fix
focused 16 pass, zero fail/skip, `/tmp/them-939-focused-expanded.xcresult` and
`/tmp/them-939-focused-final.xcresult`, matching logs. The first ordering selection
incorrectly combined case names into a single unsupported filter: zero tests,
`/tmp/them-939-ordering-red.xcresult`; explicitly invalid as proof.
Final signed full units: **711 pass, zero fail/skip**, including all 18 collaboration
cases, `/tmp/them-939-full-units.xcresult` and `.log`; exact summary checked.
Cases cover five late mutation paths, two read paths, auth invalidation, ABA,
preserving new comment/form words, ordinary save/refresh, malformed project IDs,
duplicate dispatch, pending-write refresh and superseded manual-error feedback.
Authenticated recovery UI: **five pass, zero fail/skip**,
`/tmp/them-939-recovery-ui/screenplay-save-network-fault-79072.xcresult` and
`/tmp/them-939-recovery-ui.log`; exact summary checked. Integrated writer pending.
All iPhone runs erase only the owned simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2, signing enabled.
Node 20.20.2 backend, external network disabled: 2,744 pass, zero fail, two skip,
`/tmp/them-939-node20.log`. Offline npm cache lacked yallist; reused generated
dependencies from #937 only after comparing identical lockfiles. No dependency
manifest change or lifecycle script execution. God/diff gates pass.
Final macOS scaffold build exit zero, `/tmp/them-939-mac-final.log`; unsigned
build-only, not an unsigned test. Four recovery-runner tests pass. Read-only
adversarial review found
no remaining scoped blocker after admission guards; not a GitHub approval.

Shared `isSaving` remains adjacent concurrency/UX debt: other Studio operations
also use that flag. The collaboration UUID does not establish global operation
ownership; screenplay saves retain their independent in-flight/outbox guards.
This does not establish production database transaction ordering, cross-device
collaboration convergence, or account authorization from a client guard. Server
authorization remains canonical. Physical microphone, paid providers, shipping
configuration, export parity and 120-page performance are not proved. Main
unchanged; #766 then #770 remain first, with hosted gates and independent approval.

Release check on this pass: `https://api.them.io/health` responds HTTP 200 with
`text/html; charset=UTF-8`, not the expected API JSON. Only status/content type
were inspected. HUMAN_INPUT_REQUIRED: authorize the hosting/DNS owner to route
that domain to the intended API service, then verify its JSON health response
before shipping configuration proof. This is not a production-health pass.
#766 remains draft/open, REVIEW_REQUIRED/BLOCKED; main remains `647e01fc`.
