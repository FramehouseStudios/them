# T-1023 — Owner/session-scoped turn result recovery

## Root cause

VERIFIED by source inspection and focused post-fix HTTP proof:

- `storeTalkTurnMeta` keyed the process-wide map only by session-local turn
  labels. A second writer/session could overwrite the first one's result.
- Owner IDs were prefixed by `normalizeScreenplayOwnerValue` at storage,
  again at read and again at authorization. Comparing this with a once-
  normalized current identity did not establish matching ownership.
- Failure to match an owner fell through to session/IP/debug authorization.
  Those fallbacks are not valid authority for another writer's owned result.

## Fix

Key the existing map by owner/session/turn, preserving its TTL/max-entry cleanup.
Keep the raw trusted owner ID; normalize it once at the comparison boundary.
The route now passes its request into the canonical read function. Select an
authorized matching session first, otherwise accept only a single authorized
candidate; return not-found rather than guessing between multiple readable
sessions. An unauthorized existing candidate still gets the established
forbidden envelope. No new endpoint, response fields, dependency or store.

Extract result selection/access into `backend/lib/talk_turn_result_access.js`.
`index.js` supplies its existing owner/token/IP canonical normalizers. Owned
results require the server-attached writer identity before legacy token/IP or
local debug paths can apply. Caller `X-User-Id` is not authority. Ownerless,
session-bound legacy results remain readable through their existing session.
Completely unscoped results fail closed outside the local debug path.

The `user_id` response field now contains the actual stored writer ID rather
than an accidentally repeatedly prefixed owner-key string. Fields and error
envelopes are unchanged. Existing iOS decoder accepts this string; physical
device verification is still pending.

## Proof and actual failures

Node runtime: existing local image `them-proof-node20-983:local`, verified
`v20.20.2`; host dependency lock matches the mounted dependency directory.
Source and dependencies mounted read-only; all writable persistence paths
directed into the disposable container's `/tmp`. Dummy key only.

Focused files: `talk_turn_result_ownership.test.mjs`,
`talk_turn_meta_screenplay_length.test.mjs`, `talk_turn_meta_contract.test.mjs`,
`talk_turn_rate_limit_route.test.mjs`.

VERIFIED: final focused 16 passed, 0 failed, 0 skipped, exit 0;
`/tmp/them-1023-focused-http.log`. Covers actual production store/read/access
functions mounted behind the actual Express route over loopback HTTP:
two writers' same turn ID, same writer's two sessions, ambiguous renewed
session refusal, single-result owner recovery after renewal, owner mismatch
and signed-out denial despite a matching session/debug token/forged header,
legacy ownerless session success/denial, and complete 8k+ screenplay text.
The fixture installs known verified identities; it does not prove signature
validation, token issuance or the full production auth middleware chain.

Earlier attempts retained honestly:

- `/tmp/them-1023-focused.log`: 11 pass / 2 failed files. Index import tried
  the default read-only persistence directory; no writable root was supplied.
- `/tmp/them-1023-focused-fixed.log`: 15/1/0. Legacy request fixture omitted
  `headers`, which the real client-IP helper reads.
- `/tmp/them-1023-focused-final.log`: 15/1/0. That fake request still omitted
  `socket`. Replace this incomplete mock with the actual loopback route instead
  of changing production IP handling to accommodate it.
- First full run `/tmp/them-1023-backend-node20.log` failed providerless startup
  (201 vs expected 503) because my command globally selected the stub realtime
  provider. Verified the task-owned container identity and stopped that run;
  terminal exit 1, no completed-suite claim. The corrected full run removes
  that override and retains network isolation.

VERIFIED: corrected full `npm test` on Node 20.20.2 finished exit 0:
2,992 passed, 0 failed, 2 skipped, 2,994 total checks, 47 suites,
111,394 ms. Log: `/tmp/them-1023-backend-canonical.log`.
This proves the combined candidate backend, not main or the original #962
head. No skipped case is counted as a pass.

Reproduction command:

```sh
docker run --rm --network none \
  -v /Users/halfmutantfilms/io.them-worktrees/codex-replay-conversation-sync:/opt/them:ro \
  -v /Users/halfmutantfilms/io.them-worktrees/codex-outbox-load-safety/backend/node_modules:/opt/node_modules:ro \
  -w /opt/them/backend -e RUN_SERVER=0 -e OPENAI_API_KEY=test-openai-key \
  -e PERSISTENCE_JSON_ROOT=/tmp/them-1023-persistence \
  -e BACKEND_SQLITE_PATH=/tmp/them-1023.sqlite \
  -e USER_STORE_PATH=/tmp/them-1023-users.json \
  -e USER_MEMORY_STORE_PATH=/tmp/them-1023-memory.json \
  -e SCREENPLAY_STORE_PATH=/tmp/them-1023-screenplay.json \
  -e OUTBOX_STORE_PATH=/tmp/them-1023-outbox.json \
  -e ASSISTANT_IDENTITY_STORE_PATH=/tmp/them-1023-identity.json \
  them-proof-node20-983:local npm test
```

Positive and negative logs retained under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1023-20261019.1P8b5j/`.

No real credentials/model calls. The full run uses `--network none`; local
loopback remains available to its HTTP fixtures. No iOS source changed in this
candidate, so signed iOS/visual results belong to the parent, not a new run.

VERIFIED: D009 vs parent `04ca8a06`: index.js 33,557 to 33,541 (-16);
other four protected files unchanged; `git diff --check` passes.

## Adversarial boundary review

Answered locally: cross-writer result overwrite, same-label session selection,
stale/shared token overriding a different owner, forged identity header,
unscoped result refusal, ambiguous credential-refresh lookup, long page output.
Partial: a unique owned turn can survive token renewal, but two readable
same-number sessions cannot be reconciled without the original session.
Not covered: process restart/durable receipts (existing 30-minute in-memory
metadata expiry remains), identical owner/session/turn after a counter reset,
automatic page application, offline audio, full shipping auth/phone journey.
Never describe this as exactly-once delivery or complete product security.

Original #962 remains at `527c58d6`. Its backend, D009, hosted signed units and
writer-loop steps passed; V1 UI was still running when checked. No next
original integration head, main, production deployment or protection changed.
