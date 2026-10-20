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

## Initial implementation contract (planning checkpoint afb67a4)

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

No runtime correction was present at that planning checkpoint. The executed
correction and verification are recorded below; the original evidence is
retained rather than rewritten as a passing-before result.

## Session record / next owner

Completed this session: parent #90410167e3 conflict-choice fix and original
child #919fd2fe9c preserving merges published normally. Parent actual-model
before1/2/0 → full signed units652/0/0; recovery2/0/0; Node20 backend2753/0/2;
macOS build0. Child merged editor/conflict/typing20/0/0; D009/diff pass.
Detailed files/provenance/limitations are in the two parent/child proof docs.
Fresh exact-head hosted gates are still required. Green #964/#909 still
require genuine independent non-author approval; no approval was fabricated.

At that checkpoint this worktree changed only TASKS and this document.
Goal active, production/real-phone journey incomplete.

## Executed correction and proof

**VERIFIED implementation:** move BackendAPIResponseValidator out of
BackendClient unchanged (byte comparison passed). One stateless per-task
BackendHTTPRedirectGuard rejects a redirect unless **both** the response and
proposed target match the original request's scheme, host and effective port.
71 existing async data/bytes calls opt into it; the one dedicated talk task
delegates its redirect callback to the same owner. Auth, session bootstrap,
saved pages, offline talk, live sync/streams and ElevenLabs BYOK are covered.
Injected sessions, cancellation APIs, bodies and session lifetime owners stay.
No parallel session factory, permissive host allowlist or new framework.

The first actual guarded-wire run stopped all foreign requests but failed
the same-origin Authorization assertion: Foundation stripped that header
even on a legitimate same-origin hop. The retained diagnostic confirms it.
Only after both strict origin checks pass, restore missing Authorization
from the original request; never overwrite an already proposed value or
change the method/body. Final actual wire run passes, no weakened assertion.

**VERIFIED wire:** `node backend/evals/run_ios_http_redirect_boundary.mjs`
compiles the actual product guard with a tracked dummy-only fixture against
native macOS Foundation. Data + bytes, cross/same origin,302/307 = **8 cases**.
Foreign destination **0 requests**; four same-origin results preserve dummy
app/client/BYOK/Authorization headers, GET/POST and the exact expected body
length. Servers close normally. This is host-wire proof, **not iPhone wire
or real credential/provider proof**. Native iOS proof below covers the actual
delegate callback and app workflows. No real user text or keys are used.

**VERIFIED signed erased owned SE/iOS26.2:** full units **667/0/0**, native0;
all five new callback cases read from the actual result tree, including20
origin/status combinations, HTTPS downgrade/port/lookalike rejection,
same-origin preservation, stripped-auth restoration and foreign earlier hop.
Bundle `/tmp/them-1065-native-full/v1-ui-smoke-local-1-90394.xcresult`.

**VERIFIED actual authenticated local fixture workflows:** writer **1/0/0**,
recovery **2/0/0**, native0, signed/erased same owned SE. Create/save/Markdown
export/relaunch and offline/relaunch/reconnect/expired-auth/stale-conflict/
Keep Mine with exact-text and exactly-one-version assertions unchanged.
Dummy providers, auth required, native Node24.22.0, no private env files;
owned servers stop, validated dependency symlink removed. Bundles:
`/tmp/them-1065-writer/writer-loop-04a96702-58e5-4b28-924a-0054661fd408.xcresult`
and `/tmp/them-1065-recovery/them-save-recovery-uEe6Yv/recovery-ios.xcresult`.
Synthetic voice-fault UI **1/0/0**, native0; macOS scaffold compile native0,
canonical combined runner; `/tmp/them-1065-voice/voice-network-fault-local-1-92353-ios.xcresult`.
Existing Swift6/concurrency/deprecation warnings remain. No new full V1 UI
cohort, interactive macOS, real speech/model or physical airplane-mode claim.

**VERIFIED Node20.20.2:** full backend **2755/0/2**, native0, isolated
tracked-source tree53edcee, archive `/tmp/them-1065-node20.8hcVCQ`, no external
network/private environment. Final tree4eb63a9 only adds the saved wire
fixture/eval and stronger recursive call-site lint afterward; all Swift/app
source byte-identical. Final exact two coverage-lint cases **2/0/0** and
new eval syntax pass under Node20 in `/tmp/them-1065-final-node20.T5cIRk`.
That full result is attributed to53edcee, not called a second final full run.
Coverage lint is not semantic proof; native callbacks and actual wire are.

Actual base #919fd2fe9c D009 and whitespace pass. All five monitored counts
unchanged; BackendClient separately shrinks **46 lines**. index33626 retains
the human-approved early-stack exception; no padding or line-count trick.
Complete red diagnostic, final source archive, logs and complete byte-compared
native bundles retained privately at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1065-20261020.FQTfBh`.

### Adversarial review and limitations

- Answered: hostile host/port/scheme and foreign-response redirects; no
  forwarded dummy credentials/body on tested Foundation paths; same-origin
  auth/method/body preservation; request fallback coverage; real local save
  and recovery; existing session injection/lifetime and cancellation APIs.
- Partially answered: dedicated talk guard wiring is checked and synthetic
  voice interruption passes, but no actual provider-redirected spoken stream
  or native iPhone packet capture was performed.
- Not covered: trust in the initially configured host, a compromised legitimate
  server/DNS/TLS authority, cookie policy, Apple sign-in provider experience,
  production deployment, real-phone network, model quality,120-page sessions,
  external-app export opening. This does not make the whole app secure/ready.
- Original #972 lifetime, #909 dependency patch, and later #925/#928/#933
  durable conflict work remain separate preserved originals, not silently
  imported or declared merged. Production hold stays; api.them.io's parking
  redirect still needs correct domain/backend configuration before phone auth.

### Final session record

Completed: pre-forward redirect boundary plus same-origin auth correction,
reproducible wire fixture and all scoped verification above.

Exact changed files: `them/BackendHTTPRedirectGuard.swift`,
`them/BackendClient.swift`, `them/BackendMemoryAPI.swift`,
`them/ScreenplayLiveDraftSync.swift`, `them/OfflineTalkOutbox.swift`,
`them/ElevenLabsTtsClient.swift`, `themTests/BackendHTTPRedirectGuardTests.swift`,
`backend/evals/run_ios_http_redirect_boundary.mjs`,
`backend/tests/fixtures/http_redirect_probe.swift`,
`backend/tests/ios_http_redirect_boundary_contract.test.mjs`, TASKS and this
document. Accepted decisions, orb/aesthetic/Clementine and unrelated work stay.

Publication: scoped branch `codex/T-1065-backend-redirect-boundary`; distinct
draft PR stacked on original #919, not a replacement. Exact-head hosted gates
and real independent approval remain required; no main merge/push, force,
squash, production mutation or paid model calls. This chat already has100
attachments: do not remove another attachment just to make room for this PR.
Next: inspect exact-head parent/child/security checks; stop at first failure,
then continue original bottom-up integration and intended-backend/phone proof.
Goal active and incomplete. READY FOR CONTINUE.
