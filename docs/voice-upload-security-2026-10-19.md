# T-1002 — Secure and recoverable voice upload boundary

VERIFIED: GitHub lists eleven Multer1 alerts; the latest reviewed fix requires
2.3.0. Read maintainer advisory, commit and MemoryStorage API before migration:
https://github.com/expressjs/multer/security/advisories/GHSA-wc9g-mqfw-jrwm
https://github.com/expressjs/multer/releases/tag/v2.3.0
https://github.com/expressjs/multer#memorystorage
Upstream crash fix87a584e catches crafted field-name overflow and returns a
Multer error. No provider calls or production exploit requests were made.

Baseline production-parser HTTP harness:2 pass/2 fail. Valid file/audio bytes
and the25MB413 limit worked; crafted/unexpected multipart fields returned500
instead of safe400. This baseline did NOT reproduce a process crash; do not
claim otherwise from the upstream advisory. /tmp/them-1002-before.log.

Migrate direct dependency to~2.3.0 and lock2.3.0. An initial caret install
selected2.4.0; constrain to the reviewed patched minor line and re-run npm ci.
Reviewed lock diff removes/replaces only the old Multer dependency subtree.
Lifecycle scripts disabled. Proxy/URI patched versions from T1001 preserved.

Wrap the production fields parser callback at its existing app.js boundary.
Known Multer errors (except FILE_SIZE) and exact malformed/truncated Busboy
errors receive safe upload400 + no-store + stable code. Unexpected errors
still go to the canonical server handler; FILE_SIZE still reaches the existing
413 handler unchanged. No god-file edits or duplicate HTTP subsystem.

Extended focused20 pass/0 fail/0 skip, host Node26:
/tmp/them-1002-focused.log. Actual production app parser in disposable child
servers: both audio fields, exact buffer bytes/text, crafted fields, unexpected
and duplicate files,25MB+1, truncated form and client disconnect. Child IPC
confirms the upload route started before the intentional disconnect; health
and process survival are checked. Initial disconnect test incorrectly let
events.once(close) reject on the expected ECONNRESET; harness corrected to
wait for close without treating intentional client abort as a server crash.

Real backend /talk integration uses REQUIRE_USER_AUTH=1 and a synthetic JWT
account: anonymous crafted form401, authenticated crafted/truncated400,
oversized413 with exact existing envelope, health200. No generation/provider
is needed for these parser rejection cases. Existing wallet/cancel and seven
HTTP dependency security cases also pass. VERIFIED frozen runtime9d018215 on
Node20.20.2: backend2759 pass/0 fail/2 skip; scripts210 pass/0 fail/0 skip.
/tmp/them-1002-node20.log. D009 all five deltas0, syntax/diff pass. Parent
proof merge changes no runtime/test/script source. No new signed UI run here.

## Adversarial scope and limits

- Answered: supported file/audio metadata and byte buffer shape unchanged;
  wrong/duplicate fields are rejected safely, not treated as server failures.
- Answered: authenticating the real route still precedes multipart parsing;
  bad uploads do not reach generation. Oversize retains the existing limit.
- Answered: truncated forms and intentional client disconnect leave a healthy
  server. Pure tests do not substitute for physical microphone/provider proof.
- Not covered: sustained attacker load or memory-leak soak, shipping proxy
  topology, all historical advisory exploit vectors, real microphone/ASR/TTS,
  production deployment or end-to-end120-page screenplay generation.
- Rollback: revert this scoped branch only; reverting to Multer1 restores known
  dependency risk and is not a release-safe long-term fallback.
- Independent review and fresh hosted checks required; production remains
  blocked pending human-owned App Store credentials. No main merge.

## Exact files

- backend/app.js
- backend/package.json
- backend/package-lock.json
- backend/tests/helpers/upload_security_server.mjs
- backend/tests/voice_upload_security.test.mjs
- backend/tests/voice_upload_security.integration.test.mjs
- TASKS.md
- docs/voice-upload-security-2026-10-19.md
