# Clementine wallet (turns) — D008

> Build-order step **Wallet in turns**. Companion to `clementine-muse-runtime.md`. DI store for meters (Postgres/JSON persistence for balances + IAP ledger; reservations process-local); **IAP pack top-ups are D011** (`clementine-monetization.md`) — StoreKit in-app, not Stripe Checkout on iOS.

## Sell weeks, not TPM

Users buy **days and weeks of Clementine**, not tokens-per-minute. Product copy and API balances speak in **turns** (and calm approximations like “conversations left”). Never surface TPM, token burn rates, or supplier meters in user-facing responses.

A starter pack might read as “about two weeks of evening chats” ≈ hundreds of Companion turns plus a separate Page meter for voice→scene work.

## Two meters (never one bill)

| Meter | Lane | What it pays for |
| --- | --- | --- |
| **Companion** | Companion (and Deep when routed there later) | Spoken chit-chat, light tools, memory |
| **Page** | Page | Voice→scene, continue, rewrite, page propose |

**Page never shares a bill with “how was your day.”** Separate balances; separate reservations.

## Formula (published)

```
TOKENS_PER_TURN = 400          // ~one spoken reply or short page beat
1 turn         = 1000 milliturns (internal)
cost_milliturns = ceil(max_output_tokens / TOKENS_PER_TURN * 1000)
```

- **Reserve** against the server's actual generation cap before Page model work.
  `/talk` creates an initially unfunded provisional hold for cancellation identity,
  then `ensureReservationBudget` grows that same hold once the server knows the
  budget. Omitted, zero, tiny or inflated client caps are not billing authority.
  The lower-level wallet also supports explicit `estimatedTurns` for trusted callers.
- **Commit** actual output after a validated successful response; refund unused
  headroom. Generation records proposed usage; the adapter settles on response
  completion, not merely a successful model return. Failed/recovered/repeat/
  continue-listening responses release the hold.
- **Release** on cancel / barge-in (full refund of the hold).

Insufficient funds for the real budget stop Page generation with HTTP402 and
`wallet_empty`, before a chat request. No screenplay is truncated to fit an
understated client hint. Repeated budget preparation is idempotent; a failed
top-up leaves the balance/hold unchanged; a released hold cannot be reopened.
These holds are process-local, not an atomic cross-worker or crash-durable
billing ledger. Page enforcement does not establish complete Companion metering.

## Warn at 10%

When remaining turns on a granted pack drop to **≤10%**, `getBalance` sets `lowBalance: true`. Soft UX nudge only — still allow spend until empty.

## Calm balance shape

```json
{
  "companionTurnsLeft": 120.5,
  "pageTurnsLeft": 40,
  "approxConversationsLeft": 6,
  "lowBalance": false
}
```

`approxConversationsLeft` ≈ `floor(companionTurnsLeft / 20)`. No TPM fields.

## Modules

- `backend/lib/clementine/wallet.js` — `createWalletStore` (`reserve` / `ensureReservationBudget` / `commit` / `release` / `getBalance` / `credit`)
- Page cancel releases linked `walletReservationId` when `walletStore` is injected into `createPageReservationStore`
- Optional `POST /talk/wallet` read-only balance (same light posture as page-cancel)
- `req.clementine.prepareGenerationBudget(cap)` funds the computed cap before
  generation; `commitWallet(tokens)` records usage for response-lifecycle
  settlement. Multipass holds headroom for draft/revise and optional metered
  repair; plan/critique remain unmetered. These experimental flags stay off by
  default; T-1120 does not claim a complete provider-cost audit.

## Change log

- 2026-09-01 — v0 scaffold (T-clementine-wallet-turns).
- 2026-09-01 — D011 StoreKit pack credit seam (`creditPack` + transaction ledger); see `clementine-monetization.md`.
