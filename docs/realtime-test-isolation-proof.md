# Realtime turn-commit test isolation

Base: main 647e01fc. This change affects only the test harness, not production.

## Evidence and changes

The audit branch full run reproduced a fetch UND_ERR_SOCKET in the memory-read
failure case; its isolated suite passed 32/32. Historical 300-second hangs have
not been reproduced here. Do not claim one proven root cause for both symptoms.

The old harness used process-global fetch pooling across short-lived ephemeral
listeners, no request deadline, an unbounded polling loop waiting for a storage
callback, and server.close without forcing fixture connections closed.

The replacement uses node:http with agent:false and a five-second AbortSignal,
loopback-only destinations, strict JSON decoding, and deterministic connection
teardown. A deferred promise signals storage entry; request failure/early reply
ends that wait. Storage is released in finally even when assertions fail.
The existing five-millisecond negative observation window is retained; it is
not used to wait for storage entry. All provider/storage dependencies remain
injected fakes. A stalled-storage regression exercises request abort/teardown.

## Verification

- Focused suite: 33 pass, including new stalled-storage regression.
- Twenty fresh-process focused runs: 660 pass, zero failures.
- God-file gate and git diff --check: pass.
- Full backend: 2,740 pass, zero failures, 2 skips; 44.99 seconds (Node 24).
- Second full backend run: 2,740 pass, zero failures, 2 skips; 45.63 seconds.
- iOS/quality-provider tests not run: no client or production behavior changes.
- Physical-phone speech-to-page and deployment readiness remain unverified.

Local evidence: /tmp/them-realtime-isolation-repeat-{1..20}.log and
/tmp/them-realtime-isolation-backend.log. These temporary files are not shipped.
