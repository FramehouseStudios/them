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
