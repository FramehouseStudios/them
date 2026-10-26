# T-1169 — Interrupted voice queue and shared HTTP boundary

October 26, 2026. Branch `codex/T-1169-interrupted-talk-recovery`.
Parent `2978d4cd7e43a49d3542d8823fd2062fe2b2f93b`.
Filesystem red `46e4b64`; transport coverage red `865c851`;
transport runtime `591a925`; combined runtime `b8cfd54500864fa748dbf2a69306390f5011292c`.
Overall goal remains active. Original647, main and production remain held.

## 1. Completed and root causes

VERIFIED signed filesystem red **0/2/0**: a body written before a failed index
write disappeared from recovery after relaunch; an unassigned legacy body had
no recovery notice. Reuse preserved `c1e9255` in the existing OfflineTalkOutbox.
One protected atomic binary `.turn` record holds immutable request metadata,
exact body bytes and SHA256. `queue.jsonl` remains a reconcilable lifecycle
index. This is not a claim that two separate files commit atomically.

Validate complete records against their index rows and limits. Recover a
missing-index owned request **held**, with explicit Review/Queue Request using
its original identity/body. Never infer ownership for unassigned legacy bytes
or automatically spend credits on recovered work. Keep old `.multipart` rows
readable. Write a durable settled marker before index removal/unlink after
acknowledgement or confirmed deletion, preventing failed cleanup from renewing
the request. Corrupt/ambiguous files fail closed and remain intact.

Current caller inventory also failed **0/2/0**: remaining main client, dedicated
streaming delegate, TTS, live-sync and queue callers lacked redirect delegation.
Reuse preserved `fc759311`. Move the existing origin/response validator unchanged
to its existing guard owner; wire all reviewed callers to that same guard. No
second origin policy, auth store, HTTP framework or retry implementation.
Do not overwrite the prefix's unrelated live-sync merge behavior during this
transport port. Its overlap-retention difference remains a separate boundary.

Data Controls connects Review, confirmation, Export and exact owned deletion.
Label an interrupted entry **Recovered request needs review**, rather than
incorrectly calling it a retry failure. The confirmation warns that the original
attempt may have reached the server and retrying may use credits. Cancellation
retains the request. Export excludes credential headers; its body is private.

## 2. Verification on the combined runtime

- Full signed erased native units **867/0/0**, task-owned simulator
  `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`, iPhone17Pro/iOS26.2 (23C54), signing
  on. Real filesystem interruption/reload, quarantine, hash corruption,
  owner/origin refusal, explicit original-key/body replay, failed unlink and
  settlement against an old manifest are exercised. Existing exact-byte
  collision and foreign-owner regressions remain, decoding the new record
  instead of comparing its binary envelope to raw audio.
- Native Apple Foundation loopback experiment **8 cases**, exit0: four foreign
  302/307 data/bytes redirects stop, **zero foreign requests**; four same-origin
  requests retain expected headers/methods and synthetic POST body. Dummy
  credentials only. This is a macOS Foundation experiment; iOS caller coverage
  and native callback tests are separate evidence, not a physical-phone test.
- Focused Node20.20.2 source/provider contracts **5/0/0**. The two coverage
  failures are retained before wiring. The inventory checks the five existing
  HTTP surfaces plus dedicated streaming delegation, not an arbitrary duplicated
  call-count floor. It is coverage lint, not semantic redirect proof.
- Actual Review -> Queue Request -> relaunch UI **1/0/0**. One pending request
  survives; Review is no longer offered. Its fixture has no access token and
  targets loopback9, so it cannot call a provider. Provider counts **0/0/0**.
- Authenticated recovery/export/deletion UI **1/0/0**. Held request Review and
  credit warning, cancellation, native Files export cancellation/Save, exact
  confirmed deletion, foreign/unassigned retention. Provider counts **0/0/0**.
- Independent actual saved-file check: **307 bytes**, SHA256
  `85dbc05116bbabcf92377273cd3fb0ff5bdeaa36a17cfb1f60eef49b2fa72acd`.
  Decoded owned body exactly matches CRLF/tab/trailing whitespace. Export's
  eight-field schema excludes headers. Remaining manifest has exactly foreign
  and unassigned entries; both binary bodies, metadata and hashes match their
  original **29** and **28** bytes. Confirmed owned body is absent. Manually
  opened the actual saved JSON in iOS Files Quick Look outside THEM. This is a
  synthetic queued-turn recovery export, not screenplay export.
- Raw-audio Home -> formatted page -> one project/save -> restored draft UI
  **1/0/0**, intercepted ASR/chat/TTS **1/2/1**. Exercises the guarded normal
  transport; not real microphone, audible relevance or live-model quality.
- macOS scaffold **BUILD SUCCEEDED**, exit0. Existing concurrency/deprecation
  warnings remain; no macOS UI or warning-free claim.
- D009 against actual fetched2978d4c: all five deltas **0** — index33538,
  Studio17345, Root14933, bridge12852, MemoryAPI10463. BackendClient also shrinks
  by moving its unchanged policy, not by padding or suppressing a gate.
  Syntax and `git diff --check` pass.

Backend production/dependencies are unchanged. Do not invent a fresh full Node
result: parent T-1168 full **2882/0/2** remains explicitly inherited; this pass
adds the focused source check/probe and one existing runner allowlist entry.
All native jobs ran serially on frozen code, with only the owned simulator
erased. No paid calls, private environment reads or human-data cleanup.

Source audit confirms the origin policy moved unchanged and the outbox,
record/scope and DEBUG-reset files byte-match canonicalc1e9255. The canonical
enqueue test differs only by an extra trailing blank line. Keep the current
authenticated export fixture instead of downgrading it to an anonymous proof.

## 3. Compatibility, adversarial disposition and remaining gaps

Answered for this boundary: interrupted body/index setup; held recovery instead
of automatic replay; immutable request/body ownership; legacy quarantine;
corrupt/missing/ambiguous records; settlement before cleanup; failed unlink;
failed acknowledgement-index persistence; exact export and scoped deletion;
HTTP caller omissions and the exercised native redirect cases.

New body format version1 is additive for this client. An old reader accepting
only `.multipart` rejects a `.turn` manifest rather than sending an encoded
envelope as audio. This is fail-closed downgrade behavior, not old-client
recovery compatibility. Before downgrading, retain/export through the current
build and use a current reader to recover; automatic downgrade import is absent.
No old queue is rewritten or deleted to pretend compatibility.

Not covered: power-loss/fsync guarantees, disk-full recovery while an index
cannot be persisted, downgrade conversion, large-audio settlement IO/latency,
real provider/microphone/phone, real Postgres/collaborator authorization or main/
shipping deployment. A settled record rewrites up to25MiB atomically; its large-
audio cost is not measured. Do not call the app secure or complete from this pass.

Further source audit keeps original647 held:

- Accepted offline HTTP2xx replies are currently discarded before delivery to
  Clementine/page. Reuse preserved T-1116 reply/metadata/page handoff work next;
  a drained queue alone is not successful writing.
- Current iPhone screenplay export writes only an app-private temporary file;
  UI tests take a DEBUG `makeUITestArtifact` shortcut. Earlier writer artifact
  assertions do not prove real backend export, native Files Save or external
  screenplay opening. Port the existing real export capability and prove it.
- Verify retained initial-project setup recovery and overlapping live edits
  (preserved `e31f351`) before original648. Do not silently overwrite this
  prefix's state while restoring unrelated transport callers.

## 4. Exact changed files

- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `backend/evals/run_ios_http_redirect_boundary.mjs`
- `backend/tests/fixtures/http_redirect_probe.swift`
- `backend/tests/ios_http_redirect_boundary_contract.test.mjs`
- `them/BackendClient.swift`
- `them/BackendHTTPRedirectGuard.swift`
- `them/DataControlsScreen.swift`
- `them/ElevenLabsTtsClient.swift`
- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkRecovery.swift`
- `them/ScreenplayLiveDraftSync.swift`
- `them/UITestLaunchConfiguration.swift`
- `themTests/OfflineTalkEnqueueRecoveryTests.swift`
- `themTests/OfflineTalkOutboxTests.swift`
- `themTests/OfflineTalkRecoveryBoundaryRegressionTests.swift`
- `themTests/OfflineTalkRecoveryOwnershipTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md`, this report and the T-1168 export-proof clarification.

## 5. GitHub and evidence

Permanent evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1169-20261026.2psnxr/`.
Retain actual red/final bundles, source/probe logs, exact public source,
canonical-source comparison, independent exported bytes, serialized commands,
remote publication receipt and SHA256 readback verification.
Only a normal scoped backup push. No original PR/main advancement, replacement
PR, protection/review bypass, force/squash, deployment, DNS, secret or accepted-
decision change. Clementine, the orb and established aesthetic remain intact.

## 6. Next active task

Fix accepted offline response delivery through the existing T-1116 capabilities,
then retained setup/overlap and actual iPhone screenplay export. Follow actual
PR bases after the connected safety chain is proven; preserve all original work.

## 7. Continue status

READY FOR CONTINUE. Overall goal remains active and incomplete. Physical-phone,
shipping-backend, independent review and integrated-main proof remain distinct.
