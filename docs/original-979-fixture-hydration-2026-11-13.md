# Original #979 — hydrate the seeded page before injecting an offline edit

VERIFIED: exact head 4afc2c6d, required run43398759567/job131796049174,
failed recovery1/1/0. The ordinary reconnect case failed its initial full-text
queue assertion at V1SmokeUITests.swift1869. A durable queue entry existed,
but its48-character page contained only the injected marker, without the
seeded scene. The stale-conflict/explicit-choice case passed. No claim that
an actual writer draft was lost in production or that the queue failed to persist.
Official artifact14028295916 SHA256:
`b75f7ae317d4104a2ff7c3dc39d1b7617d4dfa08581b93459162d411979a41fe`.

## Smallest existing correction

The DEBUG helper admitted injection on selectedProject != nil and !isLoading.
Project selection publishes the summary before awaiting durable draft hydration;
selectProject does not own the generic isLoading flag. Summary readiness therefore
cannot authorize editing the seeded page. The eventual editor_ready ACK does not
prove which text existed at the earlier injection instant. The exact overlapping
load interleaving is not captured by this artifact; the missing admission boundary
is verified in source and matches the previously recorded marker-only failure.

Reuse the complete existing helper from preserved original919 preparationb24c6f85,
whose original capability is39ca7c3b16af04a7c5590f60cd1576df94676931,
adapted there from original962856d7624. Require the matching selected model and
loaded-draft project, nonempty selection and cancellation safety; retain the same
40x250ms loading/save-idle budget. Only this DEBUG helper changes. All other model
bytes, all41 UI test identities and all UI assertions/deadlines/taps remain exact4af.
Original919 history stays intact; no parallel readiness implementation is added.

## Verification and limits

Preparation: exact-method/source comparison and git diff --check pass.
Native execution is pending at this commit. Run only the two existing recovery
journeys once, signed on erased owned81F with an authenticated disposable local
fixture and dummy providers. Do not treat an inherited DEBUG auth override as
proof of a real401/refresh exchange. No paid-model or physical-phone proof.

Inherited exact4af hosted results: backendNode20 2758/0/2; signed units709 passed,
0 failures (skip count not printed in the log); full V1 UI32/0/9; writer step passed;
D009 and Docker passed. Voice recovery/macOS skipped after recovery failed.
These are not fresh results of this new source change. Required hosted checks and
genuine non-author review must be renewed at its published head.

No main merge, replacement PR, squash/force, deployment or provider call.
Main71's original Autosave failure and the separate actual-auth freeze remain
unresolved. Production is held; the live physical-phone journey remains unproved.
READY FOR CONTINUE.

## Root execution — exact sourcefd03fdfa

VERIFIED: one canonical two-case recovery execution on erased owned81F,
iOS26.2/Xcode26.3, native/producer exit0: **2 passed/0 failed/0 skipped**.
Both exact identities occurred once. The ordinary reconnect case retained the
complete seeded scene plus marker through queueing, termination and reconnect.
The stale-conflict case preserved the full writer copy, explicit choice, exact
version-set and final clean-relaunch assertions introduced at4af.

All1411 tracked source files and four proof-driver hashes remained unchanged.
The fixture required authentication; its live PID and per-run nonce were verified
before Xcode. Known Node HTTP/fetch/WebSocket guards recorded zero external
attempts; this is not OS-wide network isolation. No real provider key was used.
Exact136 locked packages were copied from our already-verified task-owned offline
install and version-checked, without network or another npm installation.
HostNode26.7.0; not a fresh fullNode20 suite. The inherited DEBUG auth override
still prevents claiming an actual401/refresh exchange.

Bundle: /private/tmp/them-t1472-focused-recovery/native-run/them-save-recovery-SogPrH/recovery-ios.xcresult.
Completion/source/driver/ownership receipts are adjacent. Swift syntax and diff
checks passed. CanonicalD009 against exactmain71 passed with five zero deltas.
All other model bytes, UI identities/assertions, runners, backend and dependencies
remain exact4af. This documentation update follows execution and does not alter
its tested source. No unchanged broad local suites were repeated.

The hosted4af1/1/0 failure remains retained. Publish this proven descendant only
through a normal original979 fast-forward; do not replace its PR or rewrite
history. Fresh hosted checks and genuine non-author review remain mandatory.
Main Autosave and separate auth-freeze investigations remain open; production
hold and real-phone verification gap remain unchanged. READY FOR CONTINUE.
