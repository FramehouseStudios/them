# Primary backend origin authority — 2026-11-11

## Scope and root cause

Base: original #995 at `e91f0898f8e2f5760ddfe385a3273e80efb157f7`.
Runtime fix: `97d7f37e`. Branch: `codex/T-1383-backend-origin-authority`.
This is a new scoped bug fix above the preserved original stack, not a
replacement for any original PR. All inherited history remains intact.

VERIFIED through actual client constructors and intercepted health requests:
when only BACKEND_BASE_URL=A was configured, sign-in and memory chose A while
voice chose bundled localhost:3000. With BACKEND_BASE_URL=A and BACKEND_URL=B,
voice chose B while sign-in and memory chose A. The legacy-only control passed.
This can separate voice from the authenticated project backend; no real
credential was used in the reproducer and no exfiltration is claimed.

The existing BackendDefaultBaseURLPolicy now owns ordered primary configuration:
environment alias, environment legacy key, plist alias, then plist legacy key.
All three clients use that owner. Values are trimmed, validated and loopback
normalized once. Invalid candidates fall through. UI-test overrides, explicit
client injection, memory's healthy URL cache, stored/default behavior and the
separate explicit voice-fallback path retain their precedence.

No default endpoint, purchase behavior, auth contract, framework or provider was
changed. BackendMemoryAPI shrinks34lines by removing duplicate selection blocks.
Clementine, the orb, screenplay/recovery behavior and project isolation remain.

## Failure record

The first new-test attempt did not compile: the fixture omitted the required
await for the BackendMemoryAPI actor. It executed zero test bodies and is not
runtime failure evidence. The fixture was corrected on otherwise unchanged code.
Corrected before: 1 passed / 2 failed / 0 skipped. Each failing case captured the
wrong voice URL while auth/memory selected the expected fixture backend.

The focused after set passed7/0/0, retaining those exact assertions and adding
invalid-alias fallback, plist/environment precedence, separate explicit voice
fallback and Release-versus-Debug loopback validation. All proof requests use
fixture URLs and URLProtocol; they do not call a model.

The first D009 attempt lacked the actual parent remote-tracking ref and failed
closed. Fetching and verifying the published e91f0898 established the comparison;
no gate or source assertion was relaxed.

## Original runtime proof — 2026-11-11

Xcode26.3 (17C529), erased task-owned iPhone17 Pro/iOS26.2 (23C54), simulator
`81F0FF38-9DAD-4011-907B-357DFADD094C`; normal signing enabled for tests.

| Check | Result |
| --- | --- |
| Actual-client before matrix | 1 passed / 2 failed / 0 skipped |
| Focused origin/compatibility cases | 7 passed / 0 failed / 0 skipped |
| Full signed themTests on runtime97d7f37e | 1,566 passed / 0 failed / 0 skipped |
| Authenticated writer/create/save/export/relaunch UI | 1 passed / 0 failed / 0 skipped |
| Three affected Node20.20.2 cross-file contract files | 11 passed / 0 failed / 0 skipped |
| macOS scaffold compile | Passed |
| D009 vs actual parent #995; diff check | Passed; BackendMemoryAPI -34, other four zero |

Node contracts ran in the existing local node:20-bookworm-slim image, verified
v20.20.2, with network disabled and source read-only. They check redirects,
voice/header wiring and cross-device memory contracts that inspect changed Swift
files. The full backend suite was not rerun locally. Backend module tree remains
`2c40a5c3d1022c583462ad71014c0e173fed1ee8`; prior full Node20.20.2 proof3042/0/5
is explicitly inherited. Fresh hosted full checks remain required. Four inherited
skips require dedicated PostgreSQL; the fifth is the explicit talk preview-header
skip, not a paid live-model case. The earlier description was incorrect.

The writer UI uses authenticated local persistence and synthetic providers:
zero ASR calls, one mocked chat call, zero TTS calls. It is not live speech,
model-quality, physical-iPhone or integrated-main proof. macOS is compile-only.

## Adversarial and readiness boundaries

Answered by focused execution: alias-only/conflicting primary routing, legacy
compatibility, invalid candidates, plist/environment priority, Debug normalization,
Release loopback rejection and separate explicit fallback selection. Existing
redirect-guard coverage remains intact; no claim of complete security is made.
Explicitly different fallback origins remain supported and were not redesigned.
EINSTEIN independently reviewed this scoped source change read-only and found no
concrete compatibility blocker. That is not required human GitHub approval.

Current physical device inventory: paired iPhone15 Pro/iOS26.6.1, disconnected,
DDI services unavailable. Public intended shipping URL https://api.them.io/healthz
returned302 to hostname introvert.com using system curl with normal TLS and no
credentials. This does not identify the Render deployment's internal health.
Python's first probe failed local CA verification; system TLS succeeded, so a
server TLS defect is not established.

Production remains held under the human's App Store-credentials decision. Do not
change DNS/deploy or run the release preflight's default paid canary silently.
The human must provide/clear the existing App Store verification prerequisites,
confirm intended domain ownership/routing, connect the phone, and freshly approve
any paid live proof before the shipping-backend journey can be observed. No secret
values, credentials, paid provider calls, production changes or main merge here.
#964's independent human review is explicitly deferred; do not re-request unchanged.

## Exact changed files and retained artifacts

- `them/BackendClient.swift`
- `them/BackendMemoryAPI.swift`
- `themTests/BackendOriginAuthorityTests.swift`
- This proof document.
- `/private/tmp/them-t1383-origin-before.log` and `.xcresult` — fixture compile error.
- `/private/tmp/them-t1383-origin-before2.log` and `.xcresult` — real1/2/0.
- `/private/tmp/them-t1383-origin-before2-tests.swift` and
  `/private/tmp/them-t1383-origin-before2-summary.json`.
- `/private/tmp/them-t1383-origin-after.log` and `.xcresult`;
  `/private/tmp/them-t1383-origin-after-summary.json`.
- `/private/tmp/them-t1383-origin-units.log` and `.xcresult`;
  `/private/tmp/them-t1383-origin-units-summary.json`.
- `/private/tmp/them-t1383-origin-writer.log` and `.xcresult`;
  `/private/tmp/them-t1383-origin-writer-summary.json`.
- `/private/tmp/them-t1383-origin-node-contracts.log`.
- `/private/tmp/them-t1383-origin-mac.log`.


## Preserving parent integration — 2026-11-12

VERIFIED runtime checkpoint `934f6ad56b1fd3af20415c7f48ebac3261ff37c1`
is a preserving merge with parents original #997 `90362d4f` and locally proven
original #995 `d1ab98e3`. The three original code-file blobs remain byte-identical
to #997; all original heads remain ancestors. Newer parent UI assertions,
diagnostics, frame guards and session isolation are retained. No app runtime hunk
was rewritten during the integration.

On the integrated checkpoint, normal signed Xcode26.3 tests used the exact
canonical erased/booted/tested81F simulator above:

| Current local check | Passed / failed / skipped |
| --- | --- |
| Full themTests, actual native summary | 1,566 / 0 / 0 |
| Raw audio → server transcript → page → save/relaunch | 1 / 0 / 0 |
| Authenticated writer/create/save/export/relaunch | 1 / 0 / 0 |
| Reconnect, real auth refresh and conflict/relaunch | 3 / 0 / 0 |
| Separate macOS scaffold build | BUILD SUCCEEDED |

The raw-audio workflow counted1 mocked ASR,2 mocked chat and23 mocked TTS calls;
the writer workflow counted0/1/0. These are local transport, authorization,
persistence and recovery proofs, not microphone, live-model or phone proof.
The fixture harness used host Node24.19.0. Unchanged full backend Node20 proof
remains explicitly inherited; it was not rerun merely for this Swift merge.

Canonical D009 passed against the freshly verified currently published #995
`e91f0898`: BackendMemoryAPI -34, all other deltas0. An exact manual count against
intended local parent `d1ab98e3` has the same deltas. The canonical comparison to
that intended parent must be repeated after its real publication; no fake remote
ref or relaxed gate is used. Diff and ancestry checks passed.

Artifacts and hashes are retained privately in
`_proof/T-1395-original-997-parent-20261112/proof.json`. Native summaries explicitly
record the tested simulator,1,571 passed tests across these four cohorts,0 failed
and0 skipped. This does not count inherited/hosted results a second time.

Earlier published #997 `90362d4f` remains RED in hosted run43170334977:
V1 37 passed / 2 failed / 36 skipped, with dedicated recovery and voice/macOS
skipped. The stale117pt Review frame miss has causal source/native evidence and
its parent helper correction is retained. The other held-preview failure's
original cause remains unobserved; subsequent local callback/token/onAppear
probe success does not prove that cause. Fresh exact-head hosted checks are
required after publication. No unchanged retry was dispatched.

Current publication is held behind the chosen parent's fresh required checks.
No main merge, human approval, paid call or production change occurred. The
November11 device/domain observations above are dated checkpoint evidence,
not a fresh inventory. The real-phone/intended-backend journey remains unverified;
production remains held, and #964 human review is still deferred.
