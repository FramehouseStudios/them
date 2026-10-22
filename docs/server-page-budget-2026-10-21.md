# T-1120 — server-owned Page reservation budgets

Parent `fb8a7f2c23a9004a7567f0a3ee8e0232f9a855bc`; branch
`codex/T-1120-server-page-budgets`. Local product fix; not deployed or main proof.
Runtime `d832be876ed0c9ea9f6d1149084b46518fd75b5b`.

## Root and execution change

The real Page adapter/generate call path accepted a missing, zero or one-token
client cap with only0.1Page turns, then called the synthetic provider with a
server900-token budget. Settlement is deliberately capped at the reserved
amount, so that tiny/zero hold cannot pay for the generated output. Initial
regressions were3failures (generation ran instead of rejecting); this was a
local production-call-path reproduction, not a live production exploit probe.

The Page adapter now creates an unfunded provisional wallet hold solely to keep
the existing cancellation identity/link. Immediately before generation,
`talk_generate` supplies the actual server cap to the adapter's budget callback.
The canonical wallet grows the same reservation synchronously/monotonically,
checking available funds before mutation. Repeated preparation cannot charge
twice; insufficient top-up does not mutate either value; settled/released holds
cannot reopen. Cancellation still releases the full linked hold.

Client caps no longer set the funded hold or truncate the screenplay. Standard
stream/nonstream work is budgeted before model work; short-film generation also
funds its actual existing cap. Multipass holds the2draft/revise caps, or3when
the already-metered repair is enabled; plan/critique remain unmetered. No new
pricing decision or provider was introduced. Reservation infrastructure errors
no longer fall through to unreserved generation. Budget denial uses the existing
support-safe error envelope, HTTP402/`wallet_empty`, with a draft-preservation
message rather than misleading recovery audio.

## Verification

- Focused real adapter/generate red: **0/3/0**, on missing expected rejection.
- Authenticated localhost raw-audio HTTP, no developer app-token bypass:
  omitted/zero/one client caps each return402; intercepted STT3/chat0/TTS0.
  Balance remains0.1. After explicitly funding the synthetic account through
  canonical persistence and restarting, a one-token client hint returns an
  authoritative Page with one ASR invocation. No paid provider calls.
  A final stronger HTTP assertion confirms actual80-token usage debits0.2turns
  (100→99.8), not the caller's one-token hint. That strengthened regression
  passes1/0/0 on host Node24.19.0 after the full backend run. Runtime is unchanged;
  the full run predates only those stronger settlement assertions, not a code fix.
- Funded unit path holds900tokens, sends900 to the provider, settles actual800
  once and refunds unused headroom. It also rejects inflated client authority,
  failed/duplicate top-ups, invalid budgets, reopening released holds and
  infrastructure fallthrough. Existing held-budget refusal/cancel proof remains.
- Latest focused runtime/persistence/fixture/diagnostics: **19/0/0**. Earlier
  HTTP/multipass/short-film batch: **30/0/0** before the additional headroom case.
- Frozen exact-source Node20.20.2 full backend: **2927 pass / 0 fail / 2 skip**,
  2929total, approximately96.66seconds. External networking disabled; no private
  environment files. Skips: no live Postgres DATABASE_URL; optional live Page-sync
  case not enabled. Neither is live-model or shared-storage proof.
- Syntax, D009 and diff checks pass; all five gated files and talk_handler are
  unchanged from the exact parent.
- Signed funded `test_home_raw_audio_uses_current_server_transcript_writes_and_restores`:
  **1 pass / 0 fail / 0 skip**; normal signing and erased task-owned
  iPhone17Pro/iOS26.2 simulator7F1A14C1-B379-4417-AFE9-331810CD9CD3.
  Intercepted STT1/chat3/TTS1, host Node24.19.0; actual local login/session,
  native formatted page, save and restored relaunch. Not physical microphone or
  live model proof. Runtime/eval/UITest setup files match the frozen source
  `/tmp/them-1120-proof.cHYAZv/source` byte-for-byte; only the final HTTP test's
  settlement assertions were strengthened afterward.
- Durable local logs and signed result bundle:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1120-20261021.DZdq8M/`.

The earlier timing fixtures assumed the client hint had already funded a hold
before authoritative words/budget were known. They now invoke the actual server
budget callback and retain the full hold/refund assertions, rather than deleting
those checks. The production wallet was not relaxed to accommodate test fixtures.

## Honest funded UI setup

The deterministic UI runner now creates a real synthetic local auth account,
stops its own backend, seeds test funds through the existing JSON wallet adapter,
and restarts/hydrates the same data/port. A loopback/test/explicit-fixture-only
discovery route advertises that setup without granting funds or returning keys.
The UI fixture authenticates through the real login/session routes. Ordinary
unseeded backends keep the original signup setup; real app auth is unchanged.

This synthetic grant is NOT an App Store purchase/crediting proof, production
balance change, new public API or shipping authorization bypass. It exists only
in the intercepted-provider eval module, which refuses production/non-loopback
or implicit loading. No application Swift source was changed; only UITest setup.

## Limits and next boundary

Wallet balances/holds and synchronous top-ups here are process-local. This is
not shared-Postgres atomic concurrency, cross-worker accounting or crash-proof
exactly-once charging. Existing persistence write-queue and provider-fallback/
quality-repair overhead require their own proof. No complete Companion meter,
real model quality, physical microphone, shipping-host or iPhone journey claim.

No fresh full signed-unit/macOS rerun for this backend-only implementation;
those gates remain required at the combined integration boundary. Main,
original PR heads, production hold and release credentials are untouched.

Next: review and preserve Zora's T-1118 commits6385dcb/c8e2b1a, integrate canonical
storage/facade wiring, then run a funded accepted-result restart probe with an
actual initial debit before asserting no repeat debit. Byte-equal regeneration
is not replay. Original-context/unbound response delivery also remains open.

Changed files: wallet.js, page_lane_adapter.js, page_multipass.js,
short_film_lane.js, talk_generate.js, talk_failure_diagnostics.js under backend/lib
(Clementine modules under lib/clementine); server_page_budget.test.mjs,
raw_voice_lane.test.mjs, raw_voice_page_lane.integration.test.mjs,
screenplay_write_refusal.test.mjs under backend/tests;
backend/evals/home_voice_provider_fixture.mjs,
backend/evals/run_home_voice_handoff_ui_smoke.mjs,
themUITests/V1SmokeUITests.swift, docs/product/clementine-wallet.md,
TASKS.md and this report.
