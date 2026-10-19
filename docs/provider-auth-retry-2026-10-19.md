# T-1011 — A provider credential failure is not an expired writer session

## Root and preserving correction

The real `/talk` client treated every non-user-auth401 as client-session
expiry. A canonical talk_chat/provider_auth401 therefore cleared a valid
client token, POSTed/session again and resent the writer's turn. This does
not repair an upstream key and can repeat transcription/generation work.
It is a verified client defect, not a proven explanation of an old phone
incident and not a claimed fix for provider credentials or microphone access.

Extend the existing BackendProviderFailurePolicy, extracted into its own
Foundation-only file. Preserve its quota and ordinary HTTP-retry methods
byte-for-byte (source comparison actually run). Only401 auth_client or an
unstaged legacy401 qualifies for the generic client-session refresh branch.
Explicit provider, user and app-auth errors do not. Existing user-auth
refresh remains separate/unchanged. No new retry framework or auth surface.
BackendClient.swift shrinks53 lines. Existing five watched god files do not
grow. Writer text, wallet, tokens, owner checks and server routes unchanged.

## Actual evidence, including the invalid first attempt

- First signed characterization0/2 failed for DNS: `/talk` uses a separate
  delegate session, bypassing the existing URLProtocol stub. That is NOT
  reproduction of the product bug. Preserve `/tmp/them-1011-before.log` and
  its completed bundle; do not relabel or discard the negative evidence.
- Corrected fixture uses real HTTP over a task-local ephemeral listener,
  synthetic responses only. Signed before1 pass/1 fail on erased owned
  Pro11CF/iOS26.2. Completed summary AND test-details read: provider case
  performs2/session and2/talk when exactly1 each is required. Actual expired
  client control passes. `/tmp/them-1011-http-before.log` and bundle
  `/tmp/them-1011-http-before/v1-ui-smoke-local-1-29321.xcresult`.
- After: full focused BackendClientCraftAPITests46/0/0, signed/erased Pro,
  native60529 exit0; actual completed summary read from
  `/tmp/them-1011-focused/v1-ui-smoke-local-1-30048.xcresult`.
  Provider401 sends once; legitimate auth_client and unstaged legacy401
  still refresh exactly once. Pure status/stage cases cover additional
  provider/user/app failures. Final listener binds127.0.0.1 only and is
  stopped after each test; it uses Apple's already-used Network framework
  in test code, never a real provider, secret or account.
- Source comparison confirms extracted quota/HTTP methods unchanged.
  Actual fetched T1010 D009 all five deltas0; whitespace clean.
- Full signed units, connected Home/writer/fault workflows and macOS build
  pending. Do not substitute parent counts for this changed transport policy.

## Adversarial scope

Answered by focused HTTP tests: explicit provider-auth failure cannot renew
the writer's session or resend the turn; legitimate/legacy session recovery
still retries once. Existing quota retry behavior is unchanged by extraction.
Not covered yet: physical device, actual provider keys/availability, every
proxy stripping diagnostic bodies, or preservation of every unsent spoken
command after provider failure. Legacy unstaged401 retains one refresh for
compatibility, not a claim to distinguish every old upstream error.

## Exact files

- them/BackendClient.swift
- them/BackendProviderFailurePolicy.swift
- themTests/BackendClientCraftAPITests.swift
- themTests/TalkAuthHTTPFixture.swift
- TASKS.md
- docs/provider-auth-retry-2026-10-19.md

## Holds

Original #962 hosted full gate is still in progress at last read; #963 is
held until that parent boundary clears. No main/original-head replacement,
force push, deployment, sign-in bypass or paid call here. Local key readiness
remains unconfirmed.120 pages is a recommendation, not a quota; real-phone
speech/write/rewrite/recovery and actual feature/export proof remain required.
