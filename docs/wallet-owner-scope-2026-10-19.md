# T-999 — Wallet reads belong to the authenticated account

VERIFIED on main deac1a6d: a body owner_id overrides authenticated identity.
Disposable localhost accounts with distinct persisted balances reproduced
the cross-account disclosure. No production account or data was queried.
Failing-first real HTTP regression: 0 pass/2 fail, both global auth modes.
Log: /tmp/them-999-before.log. An initial sandbox invocation could not listen
on localhost; the reproduced assertion failures are from the authorized run.

Reuse memory_route_auth.js's canonical trusted identity resolver, aliased
locally for the wallet route. Ignore legacy body ownership fields for valid
signed-in clients, preserving the successful allow-listed response schema.
Anonymous reads now require sign-in even with REQUIRE_USER_AUTH=false;
arbitrary owner/session IDs are not legitimate authentication. Invalid and
revoked sessions are denied, including after restart. The existing upstream
auth error envelope is unchanged; add no-store to its protected-route401.

VERIFIED focused host Node26: 15 pass/0 fail/0 skip, including real signup,
two distinct persisted wallets, all four caller owner aliases, spoofed user
and session headers, global auth on/off, invalid tokens, logout/revocation,
restart, unchanged balances, and the successful response allow-list.
Log: /tmp/them-999-focused.log. D009 all five deltas0; diff check passes.
VERIFIED frozen runtime6f360de3 on Node20.20.2: backend2741 pass/0 fail/2
skip; scripts210 pass/0 fail/0 skip. /tmp/them-999-node20.log. No Swift/UI/provider changes or paid
calls; no physical-phone or production security certification claimed.

## Adversarial scope

- Answered: body/header impersonation cannot select another wallet; absence
  of trusted identity fails closed independently of the global auth flag.
- Answered: logout revocation survives backend restart; reads preserve both
  accounts' persisted balances. No token-rate/internal wallet fields exposed.
- Partially addressed: transport caching, canonical protected-route401 and
  wallet responses are no-store; no proxy/CDN production check performed.
- Not covered: purchases/settlement, real Apple sign-in, multi-process races,
  production infrastructure and full-system authorization audit.
- Next security target: page-cancel also accepts caller ownership; inspect
  and reproduce cancellation isolation separately before a release claim.
- Dependency debt: install warns about Multer1/jsrsasign; GitHub reports15
  main advisories (1 critical/12 high/1 moderate/1 low). No dependency upgrade
  or claim of mitigation from this narrow authorization fix.

## Exact files

- backend/lib/talk_pipeline.js
- backend/lib/user_auth.js
- backend/tests/clementine_wallet.test.mjs
- backend/tests/talk_wallet_auth.integration.test.mjs
- TASKS.md
- docs/wallet-owner-scope-2026-10-19.md
