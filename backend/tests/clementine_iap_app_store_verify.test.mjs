import test from "node:test";
import assert from "node:assert/strict";

import {
  createIapVerifier,
  createAppStoreServerVerifyImpl,
  hasCompleteAppStoreVerifyConfig,
  resolveAppStoreEnvironment,
  decodeJwsPayloadUnverified,
} from "../lib/clementine/index.js";
import { Environment } from "@apple/app-store-server-library";

const BUNDLE = "studio.framehouse.them";
const PRODUCT = "io.them.clementine.pack.starter_evening";
const TXN = "1000000123456789";

/** Build a compact JWS-shaped string (header.payload.sig) with an unverified payload. */
function fakeJws(payload) {
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", typ: "JWT" })
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fakesignature`;
}

const COMPLETE_ENV = {
  NODE_ENV: "test",
  APP_STORE_ISSUER_ID: "00000000-0000-0000-0000-000000000001",
  APP_STORE_KEY_ID: "KEYID12345",
  APP_STORE_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nMIGHAwEBAQ...test...\\n-----END PRIVATE KEY-----",
  APP_STORE_BUNDLE_ID: BUNDLE,
  APP_STORE_ENVIRONMENT: "Sandbox",
};

test("[iap-asc] hasCompleteAppStoreVerifyConfig requires all four secrets", () => {
  assert.equal(hasCompleteAppStoreVerifyConfig({}), false);
  assert.equal(
    hasCompleteAppStoreVerifyConfig({
      APP_STORE_ISSUER_ID: "i",
      APP_STORE_KEY_ID: "k",
      APP_STORE_PRIVATE_KEY: "p",
    }),
    false
  );
  assert.equal(hasCompleteAppStoreVerifyConfig(COMPLETE_ENV), true);
});

test("[iap-asc] resolveAppStoreEnvironment respects explicit + prod default", () => {
  assert.equal(
    resolveAppStoreEnvironment({ APP_STORE_ENVIRONMENT: "Sandbox" }),
    Environment.SANDBOX
  );
  assert.equal(
    resolveAppStoreEnvironment({ APP_STORE_ENVIRONMENT: "Production" }),
    Environment.PRODUCTION
  );
  assert.equal(
    resolveAppStoreEnvironment({ NODE_ENV: "production" }),
    Environment.PRODUCTION
  );
  assert.equal(
    resolveAppStoreEnvironment({ NODE_ENV: "development" }),
    Environment.SANDBOX
  );
});

test("[iap-asc] decodeJwsPayloadUnverified reads fixture payload", () => {
  const jws = fakeJws({ transactionId: TXN, productId: PRODUCT });
  const decoded = decodeJwsPayloadUnverified(jws);
  assert.equal(decoded.transactionId, TXN);
  assert.equal(decoded.productId, PRODUCT);
});

test("[iap-asc] verifyImpl success via injected apiClient (no live Apple)", async () => {
  const applePayload = {
    transactionId: TXN,
    originalTransactionId: TXN,
    bundleId: BUNDLE,
    productId: PRODUCT,
    environment: "Sandbox",
    purchaseDate: 1_700_000_000_000,
  };
  const signedFromApple = fakeJws(applePayload);
  const clientJws = fakeJws({
    transactionId: TXN,
    productId: PRODUCT,
    bundleId: BUNDLE,
  });

  const verifyImpl = createAppStoreServerVerifyImpl({
    env: COMPLETE_ENV,
    apiClient: {
      async getTransactionInfo(id) {
        assert.equal(id, TXN);
        return { signedTransactionInfo: signedFromApple };
      },
    },
  });

  const result = await verifyImpl(clientJws);
  assert.equal(result.ok, true);
  assert.equal(result.transactionId, TXN);
  assert.equal(result.productId, PRODUCT);
  assert.equal(result.bundleId, BUNDLE);
  assert.equal(result.environment, "Sandbox");
});

test("[iap-asc] createIapVerifier auto-wires when env complete + DI apiClient", async () => {
  const applePayload = {
    transactionId: TXN,
    originalTransactionId: TXN,
    bundleId: BUNDLE,
    productId: PRODUCT,
    environment: "Sandbox",
  };
  const verifier = createIapVerifier({
    env: COMPLETE_ENV,
    expectedBundleId: BUNDLE,
    appStoreVerifyOptions: {
      apiClient: {
        async getTransactionInfo() {
          return { signedTransactionInfo: fakeJws(applePayload) };
        },
      },
    },
  });
  assert.equal(verifier.isVerifyImplWired(), true);
  const result = await verifier.verifyTransaction(
    fakeJws({ transactionId: TXN, productId: PRODUCT })
  );
  assert.equal(result.ok, true);
  assert.equal(result.productId, PRODUCT);
});

test("[iap-asc] rejects revoked / refunded transactions", async () => {
  const applePayload = {
    transactionId: TXN,
    originalTransactionId: TXN,
    bundleId: BUNDLE,
    productId: PRODUCT,
    environment: "Sandbox",
    revocationDate: 1_700_000_100_000,
    revocationReason: 1,
  };
  const verifyImpl = createAppStoreServerVerifyImpl({
    env: COMPLETE_ENV,
    apiClient: {
      async getTransactionInfo() {
        return { signedTransactionInfo: fakeJws(applePayload) };
      },
    },
  });
  const result = await verifyImpl(fakeJws({ transactionId: TXN }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "iap_transaction_revoked");
  assert.equal(result.failClosed, true);
});

test("[iap-asc] rejects bundleId mismatch", async () => {
  const applePayload = {
    transactionId: TXN,
    originalTransactionId: TXN,
    bundleId: "com.evil.other",
    productId: PRODUCT,
    environment: "Sandbox",
  };
  const verifyImpl = createAppStoreServerVerifyImpl({
    env: COMPLETE_ENV,
    apiClient: {
      async getTransactionInfo() {
        return { signedTransactionInfo: fakeJws(applePayload) };
      },
    },
  });
  const result = await verifyImpl(fakeJws({ transactionId: TXN }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "iap_bundle_mismatch");
});

test("[iap-asc] rejects productId not in pack catalog", async () => {
  const applePayload = {
    transactionId: TXN,
    originalTransactionId: TXN,
    bundleId: BUNDLE,
    productId: "io.them.clementine.pack.not_a_real_sku",
    environment: "Sandbox",
  };
  const verifyImpl = createAppStoreServerVerifyImpl({
    env: COMPLETE_ENV,
    apiClient: {
      async getTransactionInfo() {
        return { signedTransactionInfo: fakeJws(applePayload) };
      },
    },
  });
  const result = await verifyImpl(fakeJws({ transactionId: TXN }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "iap_unknown_product");
});

test("[iap-asc] rejects transactionId mismatch vs Apple response", async () => {
  const applePayload = {
    transactionId: "9999999999999999",
    originalTransactionId: "8888888888888888",
    bundleId: BUNDLE,
    productId: PRODUCT,
    environment: "Sandbox",
  };
  const verifyImpl = createAppStoreServerVerifyImpl({
    env: COMPLETE_ENV,
    apiClient: {
      async getTransactionInfo() {
        return { signedTransactionInfo: fakeJws(applePayload) };
      },
    },
  });
  const result = await verifyImpl(fakeJws({ transactionId: TXN }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "iap_transaction_mismatch");
});

test("[iap-asc] maps App Store API errors fail-closed", async () => {
  const verifyImpl = createAppStoreServerVerifyImpl({
    env: COMPLETE_ENV,
    apiClient: {
      async getTransactionInfo() {
        const err = new Error("not found");
        err.httpStatusCode = 404;
        err.errorMessage = "Transaction id not found";
        throw err;
      },
    },
  });
  const result = await verifyImpl(fakeJws({ transactionId: TXN }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "iap_app_store_api_error");
  assert.equal(result.failClosed, true);
});

test("[iap-asc] without complete env stays fail-closed (no silent accept)", async () => {
  const verifier = createIapVerifier({
    isProduction: () => true,
    env: { NODE_ENV: "production" },
  });
  assert.equal(verifier.isVerifyImplWired(), false);
  const result = await verifier.verifyTransaction(
    fakeJws({ transactionId: TXN, productId: PRODUCT })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "iap_verify_not_configured");
});

test("[iap-asc] injected verifyImpl still preferred over auto-wire", async () => {
  let called = false;
  const verifier = createIapVerifier({
    env: COMPLETE_ENV,
    verifyImpl: async () => {
      called = true;
      return {
        ok: true,
        transactionId: "injected-1",
        productId: PRODUCT,
        bundleId: BUNDLE,
      };
    },
  });
  const result = await verifier.verifyTransaction("anything");
  assert.equal(called, true);
  assert.equal(result.ok, true);
  assert.equal(result.transactionId, "injected-1");
});
