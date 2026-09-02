// D011 — App Store IAP transaction verification seam.
//
// Production must verify via App Store Server API / signed transaction JWS
// before wallet.credit. This module exposes the interface + a fail-closed
// default. Tests inject `verifyImpl`. Do not optimistic-credit on the client.

/**
 * @typedef {object} IapVerifySuccess
 * @property {true} ok
 * @property {string} transactionId
 * @property {string} productId
 * @property {string} [bundleId]
 * @property {string} [environment] sandbox | production
 * @property {object} [raw]
 *
 * @typedef {object} IapVerifyFailure
 * @property {false} ok
 * @property {string} code
 * @property {string} [message]
 * @property {boolean} [failClosed]
 */

function hasAppStoreVerifySecrets(env = process.env) {
  const issuer = String(env.APP_STORE_ISSUER_ID || "").trim();
  const keyId = String(env.APP_STORE_KEY_ID || "").trim();
  const privateKey = String(env.APP_STORE_PRIVATE_KEY || "").trim();
  return Boolean(issuer && keyId && privateKey);
}

function defaultIsProduction(env = process.env) {
  return String(env.NODE_ENV || "").trim() === "production";
}

/**
 * Create a verifier.
 *
 * @param {object} [opts]
 * @param {() => boolean} [opts.isProduction]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {(jwsOrReceipt: string) => Promise<IapVerifySuccess|IapVerifyFailure>|IapVerifySuccess|IapVerifyFailure} [opts.verifyImpl]
 *   Injected implementation (tests / future App Store Server API client).
 * @param {string} [opts.expectedBundleId]
 */
function createIapVerifier({
  isProduction = null,
  env = process.env,
  verifyImpl = null,
  expectedBundleId = "",
} = {}) {
  const prodCheck =
    typeof isProduction === "function"
      ? isProduction
      : () => defaultIsProduction(env);
  const bundleId = String(
    expectedBundleId || env.APP_STORE_BUNDLE_ID || ""
  ).trim();

  /**
   * @param {string} jwsOrReceipt
   * @returns {Promise<IapVerifySuccess|IapVerifyFailure>}
   */
  async function verifyTransaction(jwsOrReceipt) {
    const raw = String(jwsOrReceipt || "").trim();
    if (!raw) {
      return {
        ok: false,
        code: "iap_missing_transaction",
        message: "signedTransaction is required",
        failClosed: true,
      };
    }

    if (typeof verifyImpl === "function") {
      const result = await verifyImpl(raw);
      if (!result || result.ok !== true) {
        return {
          ok: false,
          code: result?.code || "iap_verify_failed",
          message: result?.message || "transaction verification failed",
          failClosed: true,
        };
      }
      const transactionId = String(result.transactionId || "").trim();
      const productId = String(result.productId || "").trim();
      if (!transactionId || !productId) {
        return {
          ok: false,
          code: "iap_verify_incomplete",
          message: "verified transaction missing transactionId or productId",
          failClosed: true,
        };
      }
      if (bundleId) {
        const got = String(result.bundleId || "").trim();
        if (got && got !== bundleId) {
          return {
            ok: false,
            code: "iap_bundle_mismatch",
            message: "bundleId does not match APP_STORE_BUNDLE_ID",
            failClosed: true,
          };
        }
      }
      return {
        ok: true,
        transactionId,
        productId,
        bundleId: String(result.bundleId || bundleId || "").trim() || undefined,
        environment: result.environment,
        raw: result.raw,
      };
    }

    // No injected verifier: never pretend ASC verification succeeded.
    if (prodCheck() || !hasAppStoreVerifySecrets(env)) {
      // Production always fail-closed without a real verifyImpl wired.
      // Without secrets, fail closed in every environment (no optimistic credit).
      const code = prodCheck()
        ? hasAppStoreVerifySecrets(env)
          ? "iap_verify_not_wired"
          : "iap_verify_not_configured"
        : "iap_verify_not_configured";
      return {
        ok: false,
        code,
        message:
          "App Store transaction verification is not configured; refusing to credit",
        failClosed: true,
      };
    }

    // Secrets present but verifyImpl not wired yet — still fail closed.
    // Real App Store Server API client lands in a follow-up; do not half-verify.
    return {
      ok: false,
      code: "iap_verify_not_wired",
      message:
        "APP_STORE_* secrets present but verifyTransaction implementation not wired",
      failClosed: true,
    };
  }

  return {
    verifyTransaction,
    hasAppStoreVerifySecrets: () => hasAppStoreVerifySecrets(env),
    isProduction: prodCheck,
    expectedBundleId: bundleId,
  };
}

/**
 * Test helper: build a mock verifier that accepts a JSON payload
 * (optionally base64-encoded) shaped like:
 *   { "transactionId": "...", "productId": "...", "bundleId": "..." }
 */
function createMockIapVerifier(overrides = {}) {
  return createIapVerifier({
    isProduction: () => false,
    ...overrides,
    verifyImpl:
      overrides.verifyImpl ||
      (async (raw) => {
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          try {
            parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
          } catch {
            try {
              parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
            } catch {
              return { ok: false, code: "iap_mock_parse_failed" };
            }
          }
        }
        if (!parsed || typeof parsed !== "object") {
          return { ok: false, code: "iap_mock_parse_failed" };
        }
        if (parsed.ok === false) {
          return {
            ok: false,
            code: parsed.code || "iap_mock_rejected",
            message: parsed.message,
          };
        }
        return {
          ok: true,
          transactionId: String(parsed.transactionId || "").trim(),
          productId: String(parsed.productId || "").trim(),
          bundleId: String(parsed.bundleId || "").trim() || undefined,
          environment: parsed.environment || "sandbox",
          raw: parsed,
        };
      }),
  });
}

export {
  hasAppStoreVerifySecrets,
  createIapVerifier,
  createMockIapVerifier,
};
