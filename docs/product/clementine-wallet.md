# Clementine wallet (turns) — D008

> Build-order step **Wallet in turns**. Companion to `clementine-muse-runtime.md`. In-memory / DI store for meters; **IAP pack top-ups are D011** (`clementine-monetization.md`) — StoreKit in-app, not Stripe Checkout on iOS.

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

- **Reserve** from `max_output_tokens` (or explicit `estimatedTurns`) before Muse.
- **Commit** with actual output tokens after success (refund unused).
- **Release** on cancel / barge-in (full refund of the hold).

Hard stop at zero: `reserve` fails with `wallet_empty` — fail like a person (“You’re out of Page turns”), not a JSON TPM dump.

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

- `backend/lib/clementine/wallet.js` — `createWalletStore` (`reserve` / `commit` / `release` / `getBalance` / `credit`)
- Page cancel releases linked `walletReservationId` when `walletStore` is injected into `createPageReservationStore`
- Optional `POST /talk/wallet` read-only balance (same light posture as page-cancel)
- **Commit stub:** after successful Muse generation call `walletStore.commit(id, actualOutputTokens)` or `req.clementine.commitWallet?.(tokens)` — prefer talk_handler / muse completion once usage is known (adapter has no response-success seam)

## Change log

- 2026-09-01 — v0 scaffold (T-clementine-wallet-turns).
- 2026-09-01 — D011 StoreKit pack credit seam (`creditPack` + transaction ledger); see `clementine-monetization.md`.
