import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  listPacks,
  getPackById,
  getPackByProductId,
  publicPackShape,
  createWalletStore,
  createIapVerifier,
  createMockIapVerifier,
  mountIapCreditRoute,
} from "../lib/clementine/index.js";

test("[iap] pack catalog maps productId → companion+page turns (no TPM)", () => {
  const packs = listPacks();
  assert.ok(packs.length >= 3);
  const starter = getPackById("starter_evening");
  assert.equal(starter.companionTurns, 140);
  assert.equal(starter.pageTurns, 25);
  assert.equal(
    getPackByProductId("io.them.clementine.pack.starter_evening").id,
    "starter_evening"
  );
  const pub = publicPackShape(starter);
  const serialized = JSON.stringify({ packs, pub });
  assert.ok(!/tpm/i.test(serialized));
  assert.ok(!/tokensPerMinute/i.test(serialized));
  for (const p of packs) {
    assert.equal(typeof p.companionTurns, "number");
    assert.equal(typeof p.pageTurns, "number");
    assert.ok(p.productId.startsWith("io.them.clementine.pack."));
  }
});

test("[iap] verifyTransaction fails closed in production without secrets", async () => {
  const verifier = createIapVerifier({
    isProduction: () => true,
    env: { NODE_ENV: "production" },
  });
  const result = await verifier.verifyTransaction("fake.jws.payload");
  assert.equal(result.ok, false);
  assert.equal(result.failClosed, true);
  assert.equal(result.code, "iap_verify_not_configured");
});

test("[iap] verifyTransaction fails closed without secrets even in non-prod", async () => {
  const verifier = createIapVerifier({
    isProduction: () => false,
    env: { NODE_ENV: "test" },
  });
  const result = await verifier.verifyTransaction("anything");
  assert.equal(result.ok, false);
  assert.equal(result.failClosed, true);
  assert.equal(result.code, "iap_verify_not_configured");
});

test("[iap] verifyTransaction fails closed when ASC env incomplete (no bundle id)", async () => {
  const verifier = createIapVerifier({
    isProduction: () => false,
    env: {
      NODE_ENV: "development",
      APP_STORE_ISSUER_ID: "issuer",
      APP_STORE_KEY_ID: "key",
      APP_STORE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----",
      // APP_STORE_BUNDLE_ID intentionally omitted
    },
  });
  const result = await verifier.verifyTransaction("signed");
  assert.equal(result.ok, false);
  assert.equal(result.code, "iap_verify_not_configured");
  assert.equal(result.failClosed, true);
  assert.equal(verifier.isVerifyImplWired(), false);
});

test("[iap] mock verifier accepts JSON transaction payload", async () => {
  const verifier = createMockIapVerifier({
    expectedBundleId: "studio.framehouse.them",
  });
  const ok = await verifier.verifyTransaction(
    JSON.stringify({
      transactionId: "txn_1",
      productId: "io.them.clementine.pack.page_boost",
      bundleId: "studio.framehouse.them",
    })
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.transactionId, "txn_1");
  assert.equal(ok.productId, "io.them.clementine.pack.page_boost");
});

test("[iap] creditPack is idempotent by transactionId", async () => {
  const wallet = createWalletStore();
  const first = await wallet.creditPack({
    ownerId: "u1",
    companionTurns: 10,
    pageTurns: 4,
    transactionId: "asc-txn-99",
  });
  assert.equal(first.alreadyCredited, false);
  assert.equal(first.companionTurnsLeft, 10);
  assert.equal(first.pageTurnsLeft, 4);
  assert.equal(wallet.hasCreditedTransaction("asc-txn-99"), true);

  const second = await wallet.creditPack({
    ownerId: "u1",
    companionTurns: 10,
    pageTurns: 4,
    transactionId: "asc-txn-99",
  });
  assert.equal(second.alreadyCredited, true);
  assert.equal(second.companionTurnsLeft, 10);
  assert.equal(second.pageTurnsLeft, 4);

  const other = await wallet.creditPack({
    ownerId: "u1",
    companionTurns: 5,
    pageTurns: 0,
    transactionId: "asc-txn-100",
  });
  assert.equal(other.alreadyCredited, false);
  assert.equal(other.companionTurnsLeft, 15);
});

test("[iap] creditPack requires transactionId", async () => {
  const wallet = createWalletStore();
  await assert.rejects(
    () => wallet.creditPack({ ownerId: "u", companionTurns: 1 }),
    (err) => err && err.code === "wallet_transaction_required"
  );
});

function mountTestApp({ wallet, verifier, userId = "writer-1" } = {}) {
  const app = express();
  mountIapCreditRoute(app, {
    walletStore: wallet,
    requireAuthenticatedUser: (req, res, stage = "iap_credit") => {
      const auth = String(req.get("Authorization") || "");
      if (!auth.startsWith("Bearer ")) {
        res.status(401).json({ stage, error: "user_auth_required" });
        return null;
      }
      return { id: userId };
    },
    iapVerifier: verifier,
  });
  return app;
}

test("[iap] POST /billing/iap/credit verify fail → no credit (fail closed)", async () => {
  const wallet = createWalletStore();
  const verifier = createIapVerifier({
    isProduction: () => true,
    env: { NODE_ENV: "production" },
  });
  const app = mountTestApp({ wallet, verifier });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/billing/iap/credit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({ signedTransaction: "not-real" }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.failClosed, true);
    assert.equal(wallet.getBalance("writer-1").companionTurnsLeft, 0);
    assert.equal(wallet.getBalance("writer-1").pageTurnsLeft, 0);
    assert.ok(!/tpm/i.test(JSON.stringify(body)));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("[iap] POST /billing/iap/credit auth required", async () => {
  const wallet = createWalletStore();
  const verifier = createMockIapVerifier();
  const app = mountTestApp({ wallet, verifier });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/billing/iap/credit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedTransaction: "{}" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("[iap] POST /billing/iap/credit success + idempotent replay; no TPM in body", async () => {
  const wallet = createWalletStore();
  const productId = "io.them.clementine.pack.starter_evening";
  const verifier = createMockIapVerifier();
  const app = mountTestApp({ wallet, verifier });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  const signedTransaction = JSON.stringify({
    transactionId: "txn-replay-1",
    productId,
  });
  try {
    const res1 = await fetch(`http://127.0.0.1:${port}/billing/iap/credit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({ signedTransaction }),
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.ok, true);
    assert.equal(body1.alreadyCredited, false);
    assert.equal(body1.companionTurnsLeft, 140);
    assert.equal(body1.pageTurnsLeft, 25);
    assert.equal(body1.pack.id, "starter_evening");
    assert.ok(!/tpm/i.test(JSON.stringify(body1)));
    assert.ok(!/tokensPerMinute/i.test(JSON.stringify(body1)));

    const res2 = await fetch(`http://127.0.0.1:${port}/talk/wallet/credit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({ signedTransaction }),
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.alreadyCredited, true);
    assert.equal(body2.companionTurnsLeft, 140);
    assert.equal(body2.pageTurnsLeft, 25);
    assert.ok(!/tpm/i.test(JSON.stringify(body2)));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("[iap] unknown productId does not credit", async () => {
  const wallet = createWalletStore();
  const verifier = createMockIapVerifier();
  const app = mountTestApp({ wallet, verifier });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/billing/iap/credit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({
        signedTransaction: JSON.stringify({
          transactionId: "txn-x",
          productId: "io.them.clementine.pack.does_not_exist",
        }),
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "iap_unknown_product");
    assert.equal(wallet.getBalance("writer-1").pageTurnsLeft, 0);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
