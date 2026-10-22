# T-1123 — Initiating-project custody for queued scene delivery

Date: 2026-10-21. Branch: `codex/T-1123-queued-page-origin`.
Parent: `e85b487b1f21dc744497eecaf989f5a3efe9e5d5`.
Worktree: `/Users/halfmutantfilms/io.them-worktrees/codex-mentor-current-parent`.

## Reproduced failure

VERIFIED: a real isolated outbox request contains multipart
`screenplay_project_id=project-a`. Its accepted response omits a project trace.
After creating a fresh outbox instance against the same files, calling the
canonical `preparePageDelivery` for projectB succeeded and persisted a plan for
B. Signed regression: **0 pass / 1 fail / 0 skip** with the assertion
“A missing response trace allowed an original-project scene into another
screenplay.” This was a failing native storage test, not an observed physical
phone incident or evidence of another account accessing the data.

The UI controller already checks a response's project trace. That is insufficient
when the response has none: the original authenticated request remains the
stronger initiating-project evidence. The request body and entry were already
durably stored and integrity-validated, so another context journal is unnecessary.

## Root fix and exact files

- `them/OfflineTalkPageDelivery.swift`: bounded recovery-only multipart extraction
  of the original project from bytes. It parses part headers, never arbitrary text
  inside audio. Quoted boundaries and case-insensitive header names work; duplicate
  project fields/boundary parameters, malformed declared multipart, invalid text
  and oversized fields/headers fail closed. Limits:256parts,8KiB part headers,
  70byte boundary,1KiB raw project field and96character canonical project ID.
- `them/OfflineTalkOutbox.swift`: verify the existing record's request project
  against the requested destination before returning/reusing or persisting a
  delivery plan. Mismatch refuses delivery and leaves the received reply intact.
  A subsequent attempt in its original project succeeds without re-generation.
- `themTests/OfflineTalkPageDeliveryTests.swift`: actual persisted/relaunched
  request with omitted response trace, refusal in B without a wrong-project plan,
  unchanged receipt and permitted delivery in A; plus binary-audio, quoted-header,
  duplicate/malformed multipart and legacy unknown-origin checks.
- `TASKS.md` and this report: current evidence, limitations and next action.

No backend, provider routing, wallet, native god-file, schema, credentials,
production, original PR head or unrelated file changed. No UI assertion was
weakened and no live response was replaced with a simulated success.

## Verification

Normal signing; each native proof erased task-owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3` first (iPhone17Pro/iOS26.2).

- Reproducer: `ONLY_TESTING=themTests/OfflineTalkPageDeliveryTests/testOriginalRequestProjectSurvivesRelaunchAndCannotBeDeliveredToAnotherProject`
  via `scripts/run_ios_unit_tests.sh`: **0/1/0**, retained red bundle.
- Fixed `ONLY_TESTING=themTests/OfflineTalkPageDeliveryTests` via that runner:
  **6 pass / 0 fail / 0 skip**.
- Full `scripts/run_ios_unit_tests.sh`: **934 pass / 0 fail / 0 skip**.
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`, selecting
  `test_queued_talk_reply_plays_appends_saves_and_restores_once`:
  **1 pass / 0 fail / 0 skip**. Actual local account/authenticated HTTP, synthetic
  funding, metadata and native save/relaunch; intercepted STT1/chat2/TTS23.
  It proves correct-project recovery still plays, preserves the exact original
  prefix, appends one scene, saves one matching version and restores exact bytes.
- `scripts/desktop_preflight.sh`: **exit0**, macOS scaffold compile only.
- `node scripts/check_god_files.mjs` and `git diff --check`: **pass**;
  all five watched files unchanged against this slice's exact parent.

Backend runtime and dependency sources are unchanged. Full backend
**2,939 pass / 0 fail / 2 skip** is inherited from T-1121, not a fresh run.
Existing Swift concurrency/deprecation warnings remain. No paid model, real
microphone, production backend, physical-phone or external export proof occurred.

Evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1123-20261021.YMjpTD/`.

## Adversarial scope and remaining work

Answered locally: original request survives relaunch; response omission cannot
change a known initiating project; refusal writes no incorrect plan and does not
consume the receipt; correct-project recovery remains functional; binary audio
cannot masquerade as the project field; ambiguous multipart refuses insertion.
The existing owner/origin/integrity checks remain in force before extraction.

Malformed declared multipart blocks append only. The read/review/export paths
do not call this parser, so they remain available; interactive malformed-record
export was not separately exercised in the UI run. Legacy non-multipart or
well-formed requests without a project return unknown scope and retain existing
explicit manual recovery behavior. Do not interpret unknown scope as permission
for future automatic delivery.

This is initiating-project custody, not complete original-document recovery.
It does not bind an unbound request to a new project, infer document identity
from a revision string, automatically select a project, apply precise queued
rewrites or validate feature-length recovery latency. Those remain in T-1116's
end-to-end completion criteria. Zora's T-1122 settlement implementation remains
separate pending independent integration review and actual wiring/proof.

Next: resolve the missing-idempotency/expiry settlement boundaries before
integrating T-1122; continue original-document delivery and the real-phone
journey afterwards. Main and production remain unchanged. READY FOR CONTINUE.
