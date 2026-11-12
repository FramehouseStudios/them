# Export saved and opened outside THEM — 2026-11-12

## Observed failure and smallest correction

At published backup `ecbd163a`, the dedicated authenticated export workflow
produced **0 passed / 1 failed / 0 skipped**. It failed waiting for the Markdown
choice after its first Export tap. Retained native activities, video and AX
hierarchies show Export still **Collapsed**, the underlying editor focused and
the keyboard present. The button frame was y463.7–509.7 while the actual drawer
content ended at y486.7: the control was clipped despite reporting hittable.

`953d583a` changes only four reveal calls in
`themUITests/V1SmokeUITests.swift`, inside the existing export workflow. They now
use the existing full-containment helper with the same eight-swipe limit. It
checks the current drawer-content viewport before resolving hittability. No
production callback, endpoint, timeout, assertion, native-picker behavior or
retry was changed. This is a corrected test interaction boundary, not a claim
that screenplay export encoding was broken.

## Fresh proof

The changed-source signed workflow passed **1/0/0** on the exact erased task-owned
iPhone 17 Pro simulator `81F0FF38-9DAD-4011-907B-357DFADD094C`, iOS26.2(23C54),
Xcode26.3. The existing test uses a real auth-required task-owned local backend
and synthetic sample text. It verifies project/version load, picker cancellation
without false Saved, a second explicit export, native Files save acknowledgement
and unchanged editor bytes. The backend was stopped afterward; no paid call.

Afterward, Jarvis opened **Files**, found `native-export-proof.md` (103 bytes),
and invoked its exposed **Quick Look** action. CUA visibly showed the external
Quick Look title/close/search/share controls, scene heading, accented name,
emoji, character cue and final dialogue line. The file was outside THEM, not an
in-app preview. A direct read from that exact simulator File Provider location
then matched all expected Markdown bytes, SHA256:
`a30cbf7cc1bfb414281be3c66dcb9e22904bfc1d8d3a1859b1aab17bdc4a1536`.

Canonical D009 against the genuine published backup `ecbd163a` passes with all
five deltas zero; diff checks pass. App, unit, backend, scripts, workflows,
Packages and Xcode project/workspace trees are unchanged. Their prior full
signed1582/0/0, macOS build and Node20 backend3121/0/5 are inherited component
proof, not rerun for this test-only correction. Existing compiler warnings remain.

Raw red/green native bundles, failure video/hierarchies, driver metadata and the
exact synthetic exported file are retained outside Git at
`_proof/T-1418-external-export-20261112/proof.json`. The external Quick Look
observation is in this chat's CUA screenshot; no separate external-preview PNG
was saved. An initial local gate inspection used stale2a tracking authority;
genuine fetch established the final comparison against actualecbd without
altering the gate.

This completes the **local simulator** external-open step only. Physical iPhone,
real microphone/model quality, intended shipping backend and integrated-main
proof remain open. Production hold, deferred #964 human review and all original
PR histories/protections remain intact. The separate private #422/custody
integration is unproven and is not included in this checkpoint.
