# Clementine monetization — StoreKit packs (D011)

Companion to `clementine-wallet.md` (D008). **iPhone V1 sells turn packs in-app via StoreKit / IAP.** Stripe Checkout is out of band for v1 in-app unlocks.

## What we sell

Users buy **days/weeks of Clementine** framed as Companion + Page **turns**. Never TPM, token burn, or supplier meters in App Store copy, Settings, or API JSON.

| Pack id (internal) | Example framing | companionTurns | pageTurns | App Store productId |
| --- | --- | --- | --- | --- |
| `starter_evening` | About a week of evening chats | 140 | 25 | `io.them.clementine.pack.starter_evening` |
| `writer_fortnight` | About two weeks of writing nights | 280 | 60 | `io.them.clementine.pack.writer_fortnight` |
| `page_boost` | Extra Page voice→scene turns | 0 | 80 | `io.them.clementine.pack.page_boost` |

Exact prices and final SKUs are set in App Store Connect; the catalog in `backend/lib/clementine/pack_catalog.js` is the server map from `productId` → turns.

Packs may be configured as **consumable** (re-buyable turn top-ups) or **non-consumable** unlock packs — product type is an ASC choice; credit semantics are always “add turns once per verified `transactionId`.”

## Verify → credit flow

```text
iOS StoreKit 2 purchase
  → Transaction.jwsRepresentation (or verified transaction id + JWS)
  → POST /billing/iap/credit  (Authorization: Bearer <Keychain session>)
       body: { signedTransaction: "<JWS>" }
  → server iap_verify.verifyTransaction (App Store Server API / JWS)
       fail closed on missing secrets, bad sig, wrong bundle, revoked
  → pack_catalog.byProductId(productId)
  → wallet.creditPack({ ownerId, companionTurns, pageTurns, transactionId })
       idempotent: same transactionId never double-credits
  → calm balance JSON (companionTurnsLeft, pageTurnsLeft, …) — no TPM
```

Alias: `POST /talk/wallet/credit` mounts the same handler for talk-adjacent clients.

## Fail closed

- Unauthenticated → `401`
- Verify failure / not configured in production → `402` or `503` with `iap_verify_*` code — **no credit**
- Unknown productId → `400` `iap_unknown_product`
- Missing signedTransaction → `400`

## DNS / live API host

`them.io` marketing DNS may still be parked. **Verify+credit still requires a live API host** (Render default — see `backend/DEPLOY.md` / `render.yaml`).

- Prefer `https://api.them.io` once the custom domain returns io.them `/healthz` directly (no parked redirect).
- Until DNS is clean, point the app / TestFlight `BACKEND_URL` at the **Render service URL** so IAP credit can complete.
- Do not ship Stripe Checkout inside iOS for these unlocks (D011).

## Modules

| Module | Role |
| --- | --- |
| `backend/lib/clementine/pack_catalog.js` | pack id / productId → turns |
| `backend/lib/clementine/iap_verify.js` | verifyTransaction interface; fail-closed without secrets |
| `backend/lib/clementine/iap_credit_route.js` | auth + verify + creditPack |
| `backend/lib/clementine/wallet.js` | `creditPack` + in-process `transactionId` ledger |
| `them/ClementinePackStore.swift` | StoreKit 2 purchase → backend credit |

## Persistence note

Wallet balances and the IAP `transactionId` ledger are **process memory by default** (DI-ready `createWalletStore`). That is **not prod-ready** across multi-instance Render or restarts. Until a durable persistence domain is wired, run a **single** API instance for credit, or accept that a restart can lose balances (ledger still prevents double credit *within* a process lifetime). Prefer extending `persistence_adapter` domains in a follow-up before multi-instance prod.

## App Store Connect setup

1. Create In-App Purchases under the io.them iOS app (bundle id must match `APP_STORE_BUNDLE_ID`).
2. Add products whose Product IDs match `pack_catalog` `productId` values (start with the three examples above).
3. Choose Consumable (recommended for re-buyable turn packs) or Non-Consumable per product strategy.
4. Set pricing, localization (“Companion + Page turns” / weeks framing — never TPM).
5. For server verify: create an App Store Connect API key (Issuer ID, Key ID, `.p8` private key) with access to App Store Server API; set on the API host:
   - `APP_STORE_ISSUER_ID`
   - `APP_STORE_KEY_ID`
   - `APP_STORE_PRIVATE_KEY` (PEM contents)
   - `APP_STORE_BUNDLE_ID` (e.g. `studio.framehouse.them` / shipping bundle id)
6. Sandbox + StoreKit Configuration file for local; production verify must use real secrets (fail closed otherwise).

## Change log

- 2026-09-01 — D011 scaffold: catalog, fail-closed verify, credit route, iOS PackStore sketch.
