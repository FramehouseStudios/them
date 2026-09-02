// D011 — App Store IAP transaction verification seam.
//
// Production must verify via App Store Server API / signed transaction JWS
// before wallet.credit. When APP_STORE_* secrets are complete, this module
// auto-wires createAppStoreServerVerifyImpl. Otherwise fail closed.
// Tests inject `verifyImpl` (or a mock apiClient inside the App Store impl).

import {
  hasCompleteAppStoreVerifyConfig,
  createAppStoreServerVerifyImpl,
} from "./iap_app_store_verify.js";

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

/**
 * @deprecated Prefer hasCompleteAppStoreVerifyConfig — bundle id is required.
 * Kept for callers; now requires APP_STORE_BUNDLE_ID as well.
 */
function hasAppStoreVerifySecrets(env = process.env) {
  return hasCompleteAppStoreVerifyConfig(env);
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
 *   Injected implementation (tests). When omitted and ASC env is complete,
 *   wires App Store Server API verifyImpl automatically.
 * @param {string} [opts.expectedBundleId]
 * @param {object} [opts.appStoreVerifyOptions]
 *   Extra options forwarded to createAppStoreServerVerifyImpl (apiClient, decodeSignedTransaction, …).
 */
function createIapVerifier({
  isProduction = null,
  env = process.env,
  verifyImpl = null,
  expectedBundleId = "",
  appStoreVerifyOptions = null,
} = {}) {
  const prodCheck =
    typeof isProduction === "function"
      ? isProduction
      : () => defaultIsProduction(env);
  const bundleId = String(
    expectedBundleId || env.APP_STORE_BUNDLE_ID || ""
  ).trim();

  let resolvedImpl = typeof verifyImpl === "function" ? verifyImpl : null;
  let wireError = null;

  if (!resolvedImpl && hasCompleteAppStoreVerifyConfig(env)) {
    try {
      resolvedImpl = createAppStoreServerVerifyImpl({
        env,
        expectedBundleId: bundleId,
        ...(appStoreVerifyOptions && typeof appStoreVerifyOptions === "object"
          ? appStoreVerifyOptions
          : {}),
      });
    } catch (err) {
      wireError = err;
      resolvedImpl = null;
    }
  }

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

    if (typeof resolvedImpl === "function") {
      let result;
      try {
        result = await resolvedImpl(raw);
      } catch (err) {
        return {
          ok: false,
          code: err?.code || "iap_verify_failed",
          message: err?.message || "transaction verification failed",
          failClosed: true,
        };
      }
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

    // No verifier available — never pretend ASC verification succeeded.
    if (wireError) {
      return {
        ok: false,
        code: "iap_verify_not_wired",
        message:
          wireError?.message ||
          "APP_STORE_* secrets present but verifyTransaction implementation failed to initialize",
        failClosed: true,
      };
    }

    if (!hasCompleteAppStoreVerifyConfig(env)) {
      return {
        ok: false,
        code: "iap_verify_not_configured",
        message:
          "App Store transaction verification is not configured; refusing to credit",
        failClosed: true,
      };
    }

    // Complete env but impl somehow missing — still fail closed.
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
    hasAppStoreVerifySecrets: () => hasCompleteAppStoreVerifyConfig(env),
    isProduction: prodCheck,
    expectedBundleId: bundleId,
    /** True when the real App Store Server API impl (or an injected verifyImpl) is active. */
    isVerifyImplWired: () => typeof resolvedImpl === "function",
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
  hasCompleteAppStoreVerifyConfig,
  createIapVerifier,
  createMockIapVerifier,
};
