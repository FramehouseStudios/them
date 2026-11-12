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

## Current-source proof

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
skips require dedicated PostgreSQL and one live case requires fresh approval.

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
