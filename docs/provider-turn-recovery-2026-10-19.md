# T-1016 — Retain provider-rejected story requests

## Root and correction

Source inspection: the first `/talk` provider-auth401 or quota rejection
did not enter OfflineTalkOutbox, because its queue decision reused automatic
retry policy. Later queued failures could be parked, but Data Controls had
no usable per-turn retry. Retention and automatic retry are different choices.

Reuse BackendProviderFailurePolicy to classify explicit provider_auth401/403
and existing quota detection as requiring manual retry. Store the original
multipart request and idempotency key directly parked. Keep ordinary client
session refresh/rate-limit policies unchanged. Inject the existing outbox
into BackendClient (shared by default) so real HTTP tests use isolated files.

Data Controls shows all parked rows plus up to three active previews. Each
parked row has an explicit Retry retained turn action and a turn-cost hint.
Retry validates readable payload/current owner through the canonical replay
builder before reactivating it, persists the transition, then drains only the
selected ID. Existing current-auth replacement and account guard remain.
Provider rejection on that retry re-parks it; network events never reactivate
parked entries. No additional storage format, framework or provider API.

## Verification status

First signed focused run completed exit65:57 pass/1 fail/0 skip. Actual
bundle `/tmp/them-1016-focused/v1-ui-smoke-local-1-48447.xcresult` was read,
cloned and compared in private proof directory
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1016-20261019.OXosGm/`.
The new combined loopback client test threw CancellationError; the retained
action log confirms a real HTTP401 followed by local enqueue before that
failure. Its cause is unresolved, not labeled a harmless flake. Runtime code
was uncommitted at this stage. A single-case diagnostic run added static phase markers only;
do not rerun all57 passing checks while locating the failure.

The god-file checker initially correctly failed closed because the exact
parent tracking ref was missing; fetching it confirmed parent457c1f19 and
all five actual deltas0. Whitespace check passes. No assertion was weakened.

Subsequent diagnostics and actual correction:

- Single-case phase diagnostic0/1/0 showed the initial HTTP401 was retained,
  but explicit replay refused an anonymous fixture as a different account.
- Attempted synthetic owner fixture1/1/0: wrong-account denial passed, while
  the positive fixture had omitted auth_signed_in. Its owner-read assertion
  failed; it was not counted as valid same-owner replay proof.
- Adding that marker allowed provider401 replay but the next quota429 case
  failed (0/1/0): writing user_id directly to UserDefaults did not replace
  the prior Keychain owner. Credential migration correctly preferred Keychain.
- Fix only the fixture: install/restore synthetic identity via
  BackendAuthClient.persistSharedUserID/clearSharedUserID and preserve prior
  owner metadata. Do not relax the production replay account guard.
- Corrected signed real-HTTP case completed exit0,1/0/0, covering both401
  provider_auth and429 provider_quota; each sends one session and one talk
  request, is retained across actor relaunch without automatic replay, then
  explicitly replays original multipart transcript bytes and idempotency key.
  Actual summary read at
  `/tmp/them-1016-canonical-owner/v1-ui-smoke-local-1-52039.xcresult`.
  Synthetic owner metadata is not Apple/password sign-in proof.
- Wrong-account denial already passed separately and leaves the exact entry
  parked without any transport call. The initial57 passing checks include
  rate-limit/legacy client-refresh behavior and the new exact-body/selected-ID/
  repeated-quota actor check. These are results across separate runs, not
  a claimed single59-test green run. Initial CancellationError cause remains
  uncertain; do not erase or relabel that evidence as a proven harmless flake.

All completed negative bundles were cloned and compared in the private proof
directory. Final changes after the last compile are retained-turn label/
confirmation wording only; source-reference and diff checks cover that copy.
No new backend files changed or backend suite was rerun for this Swift-only
follow-up. No full signed suite, macOS build, real audio capture or live
model quality is claimed for this candidate. Narrow UI proof follows below.

### Narrow recovery UI follow-up

VERIFIED on task-owned iPhone SE3 simulator E8998A6B, iOS26.2,375x667pt:
urgent retained work now appears above the existing Data Handling explanation,
and completion appears near the heading. The retry button has a44pt minimum
height, scalable callout font, explicit icon/label and selected-entry progress.
The generic queue retry is hidden when only retained work exists because it
cannot reactivate those entries. Privacy wording is unchanged.

The first combined ViewBuilder failed compilation with a type-check complexity
error at DataControlsScreen.swift:477. Extracting typed visible-entry filtering,
row and retry-button helpers fixed compilation; no timeout/check weakened.
Signed simulator build then completed exit0 and codesign verification passed.
Log: /tmp/them-1016-recovery-decomposed-build.log; failed log:
/tmp/them-1016-recovery-final-ui-build.log.

Manual app interaction against a private loopback HTTP fixture recorded zero
talk requests before tapping Retry retained turn, then exactly one request:
original26 bytes, original idempotency key and expected synthetic owner all
matched. App displayed Retained turn sent.; queue manifest was0bytes. Closing
and relaunching without erasing showed no waiting turns and still one receipt.
The retained fixture survived installation over the previous build before this
action. Screenshots recovery-final-before-retry.png and
recovery-final-after-retry.png are preserved in the private proof directory.
Default text size was inspected: no vertical label wrapping. Larger Dynamic
Type and in-flight spinner visibility were not manually proven.

This fixture is not production multipart/model generation or actual sign-in;
real client multipart preservation is covered by the focused HTTP case above.
No paid call, live microphone, generated page or shipping-backend claim.

## Self-review and remaining gaps

Retention does not authorize automatic retry: only the per-entry action
reactivates parked work, with readable-body/owner validation before mutation.
Busy UI state blocks repeated taps; the actor only admits a parked ID and
targets that ID during drain. Retry preserves the stored URL, payload,
metadata and request key; it does not silently create a new project/request.
Successful replay handling is inherited: server-side page effects can persist,
but this outbox does not deliver returned audio to the foreground conversation.
Broader integration and physical-phone proof remain pending.
Self-review found inherited owner-unscoped allEntries/snapshot/deletion in
OfflineTalkOutbox: retry checks owner, but Delete retained turns currently
selects all parked accounts. No deletion was exercised. Next root task must
scope recovery presentation/deletion and preserve another account's requests;
this candidate is not ready to merge with that isolation gap unresolved.
Existing transport/credential storage behavior is not a new security audit.

## Exact changed files

- them/BackendClient.swift
- them/BackendProviderFailurePolicy.swift
- them/OfflineTalkOutbox.swift
- them/DataControlsScreen.swift
- themTests/BackendClientCraftAPITests.swift
- themTests/OfflineTalkOutboxTests.swift
- themTests/TalkAuthHTTPFixture.swift
- TASKS.md
- docs/provider-turn-recovery-2026-10-19.md

The initial rejection was supplied by a real test-only loopback HTTP
server, not OpenAI; replay transport assertions cover exact request bytes/key
and request selection, not actual model quality. No paid model calls allowed.

Planned negative boundaries: user-auth failures and ordinary rate limits are
not classified as provider manual recovery; successful replies containing
quota-like text are not rejected; repeated quota stays parked; manual retry
does not send a different pending turn. Existing storage/normal retry tests
must remain intact. Physical microphone, UI interaction/visual check and
shipping backend are not proven by compilation or actor tests.

## Scope and integration

Implementation committed and pushed as e03f605b on the scoped T1016 branch;
no new replacement PR, original-head update or main merge. Full integration
and UI proof remain pending, not implied by this backup.

Base457c1f19 preserves the combined T1013 work. Original #962 was separately
advanced with explicit human approval to87a62a6c and hosted39349393133 is
running. Hold the next original boundary until it is green. Do not replace
any original PR, merge main or deploy production from this follow-up.
Preserve Clementine, the orb and the existing aesthetic. No key values are
read or required by this fix.
