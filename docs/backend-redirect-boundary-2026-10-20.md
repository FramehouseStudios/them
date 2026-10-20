# T-1065 — Stop credentials and request bodies before cross-origin redirect

## Verified boundary and evidence

Isolated owned worktree/branch `codex/T-1065-backend-redirect-boundary`,
starting from original child #919fd2fe9c. Main/production untouched. Existing
AGENTS, DECISIONS and founder brief hashes match the accepted working root.

**VERIFIED:** controlled local macOS Foundation URLSession.shared probe,
two owned loopback HTTP servers, native Swift interpreter, Node24.22.0,
native0. Origin changes from127.0.0.1 tolocalhost on another local port.
Synthetic headers/body only; no real app/provider/account key, sign-in,
production request or paid call. Observed booleans:

| Redirect | Target method | Authorization | App token | Client token | Body |
| --- | --- | --- | --- | --- | --- |
|302|GET|absent|present|present|absent|
|307|POST|absent|present|present|present|

Probe `/private/tmp/them-1065-redirect-probe.mjs`, native source
`/private/tmp/them-1065-redirect-probe.swift`, boolean-only result
`/tmp/them-1065-redirect-probe.log`. Owned servers closed normally. No real
secret or screenplay text was sent to a redirect destination.

**VERIFIED source:** BackendClient, BackendMemoryAPI (including the auth
client defined inside it), live draft sync, offline talk transport, and
ElevenLabs BYOK convenience transport use the default data/bytes behavior.
Dedicated TalkStreamingDelegate has no redirect callback. Existing
BackendAPIResponseValidator.hasMatchingOrigin checks responses **after**
transport; it cannot prevent transmission of headers or a307 body.

**Inference / scope:** this is an app security risk based on actual default
transport behavior and call sites, not a captured production disclosure or
an executed native iPhone request. Do not claim any real token leaked from
this probe or that macOS behavior alone proves the shipped iPhone flow.
Unauthenticated api.them.io/healthz still returned302 to a parking page
this session; no auth request was sent there. Production hold remains.

## Next implementation contract — NOT YET FIXED

1. Reuse the canonical scheme/host/effective-port comparison in a single
   request-level URLSession redirect delegate; reject origin changes
   **before** forwarding, including HTTPS downgrade and different port.
2. Preserve same-origin routing and injected sessions. Prefer per-task
   delegates, not a second session factory or another lifetime owner.
   Protect data, bytes, dedicated talk delegate and offline fallback paths;
   BYOK must not silently forward a user key to another host either.
3. Move the existing response-policy capability out of BackendClient only
   if needed to keep D009; do not duplicate it or grow god files. No new
   framework, permissive host allowlist or production configuration bypass.
4. Prove actual Foundation wire behavior with dummy-header loopback
   requests: cross-origin302/307 destinations receive **zero** requests;
   same-origin legitimate redirects still deliver the intended method/body.
   Add native request/callback and coverage assertions at the existing seam;
   identify native-iPhone versus host-only evidence precisely.
5. Verify sign-in/save/talk cancellation/streaming fallbacks still work in
   the existing auth-required local flows; no private environments or paid
   calls. Exact-head signed units, scoped UI, Node20/D009/diff/macOS as
   appropriate before a distinct draft security PR stacked on original #919.
   Preserve originals; do not merge this unimplemented plan or bypass review.

No runtime correction is present in this planning commit. Continue from
this exact repro, not another unchanged broad test run.

## Session record / next owner

Completed this session: parent #90410167e3 conflict-choice fix and original
child #919fd2fe9c preserving merges published normally. Parent actual-model
before1/2/0 → full signed units652/0/0; recovery2/0/0; Node20 backend2753/0/2;
macOS build0. Child merged editor/conflict/typing20/0/0; D009/diff pass.
Detailed files/provenance/limitations are in the two parent/child proof docs.
Fresh exact-head hosted gates are still required. Green #964/#909 still
require genuine independent non-author approval; no approval was fabricated.

This worktree changes only TASKS and this document; no security runtime fix
or tests are claimed. Next: implement the pre-forward redirect guard above.
Goal active, production/real-phone journey incomplete. READY FOR CONTINUE.
