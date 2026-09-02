// D011 — App Store Server API verifyImpl (wired when ASC env secrets are complete).
// Uses @apple/app-store-server-library: Get Transaction Info + decoded payload checks.
// Tests inject apiClient / decodeSignedTransaction — no live Apple calls in CI.

import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";
import { getPackByProductId as defaultGetPackByProductId } from "./pack_catalog.js";

/**
 * True when all required ASC verify secrets are present (incl. bundle id).
 * @param {NodeJS.ProcessEnv} [env]
 */
function hasCompleteAppStoreVerifyConfig(env = process.env) {
  const issuer = String(env.APP_STORE_ISSUER_ID || "").trim();
  const keyId = String(env.APP_STORE_KEY_ID || "").trim();
  const privateKey = String(env.APP_STORE_PRIVATE_KEY || "").trim();
  const bundleId = String(env.APP_STORE_BUNDLE_ID || "").trim();
  return Boolean(issuer && keyId && privateKey && bundleId);
}

/** PEM may arrive with literal \n from Render/dashboard env vars. */
function normalizePrivateKeyPem(raw) {
  return String(raw || "")
    .replace(/\\n/g, "\n")
    .trim();
}

/**
 * Resolve Sandbox vs Production.
 * Explicit APP_STORE_ENVIRONMENT wins; else Production on prod host, Sandbox otherwise
 * (local / TestFlight-oriented defaults without forcing Production against sandbox txns).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {import('@apple/app-store-server-library').Environment}
 */
function resolveAppStoreEnvironment(env = process.env) {
  const explicit = String(env.APP_STORE_ENVIRONMENT || "").trim();
  if (/^sandbox$/i.test(explicit)) return Environment.SANDBOX;
  if (/^production$/i.test(explicit)) return Environment.PRODUCTION;
  if (String(env.NODE_ENV || "").trim() === "production") {
    return Environment.PRODUCTION;
  }
  return Environment.SANDBOX;
}

/**
 * Decode a compact JWS payload segment without verifying the signature.
 * Used only to read transactionId from the client JWS before calling Apple,
 * and to read fields from Apple-returned signedTransactionInfo when a
 * decode hook is not injected (API response is already authenticated).
 *
 * @param {string} jws
 * @returns {Record<string, unknown>}
 */
function decodeJwsPayloadUnverified(jws) {
  const raw = String(jws || "").trim();
  const parts = raw.split(".");
  if (parts.length < 2 || !parts[1]) {
    const err = new Error("not a compact JWS");
    err.code = "iap_jws_malformed";
    throw err;
  }
  let json;
  try {
    json = Buffer.from(parts[1], "base64url").toString("utf8");
  } catch {
    const err = new Error("JWS payload is not valid base64url");
    err.code = "iap_jws_malformed";
    throw err;
  }
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const err = new Error("JWS payload is not an object");
      err.code = "iap_jws_malformed";
      throw err;
    }
    return parsed;
  } catch (e) {
    if (e && e.code === "iap_jws_malformed") throw e;
    const err = new Error("JWS payload is not JSON");
    err.code = "iap_jws_malformed";
    throw err;
  }
}

function extractTransactionIdFromClientInput(jwsOrReceipt) {
  const raw = String(jwsOrReceipt || "").trim();
  if (!raw) return "";

  // Compact JWS from StoreKit 2 Transaction.jwsRepresentation
  if (raw.includes(".")) {
    try {
      const payload = decodeJwsPayloadUnverified(raw);
      return String(
        payload.transactionId || payload.originalTransactionId || ""
      ).trim();
    } catch {
      return "";
    }
  }

  // Bare transaction id (rare; allowed for DI / tooling)
  if (/^[0-9A-Za-z._-]{6,128}$/.test(raw)) {
    return raw;
  }
  return "";
}

function environmentLabel(envEnum) {
  if (envEnum === Environment.SANDBOX) return "Sandbox";
  if (envEnum === Environment.PRODUCTION) return "Production";
  return String(envEnum || "");
}

/**
 * Build the production App Store Server API verifyImpl.
 *
 * @param {object} [opts]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {string} [opts.expectedBundleId]
 * @param {(productId: string) => object|null} [opts.getPackByProductId]
 * @param {{ getTransactionInfo: (transactionId: string) => Promise<{ signedTransactionInfo?: string }> }} [opts.apiClient]
 *   Injected client (tests). When omitted, constructs AppStoreServerAPIClient from env.
 * @param {(signedTransactionInfo: string) => Promise<Record<string, unknown>>|Record<string, unknown>} [opts.decodeSignedTransaction]
 *   Injected decoder for Apple's signedTransactionInfo (tests). Default: unverified JWS payload decode
 *   of the Apple API response (TLS + ASC JWT already authenticated the fetch).
 * @param {typeof AppStoreServerAPIClient} [opts.ClientClass]
 */
function createAppStoreServerVerifyImpl({
  env = process.env,
  expectedBundleId = "",
  getPackByProductId = defaultGetPackByProductId,
  apiClient = null,
  decodeSignedTransaction = null,
  ClientClass = AppStoreServerAPIClient,
} = {}) {
  const issuerId = String(env.APP_STORE_ISSUER_ID || "").trim();
  const keyId = String(env.APP_STORE_KEY_ID || "").trim();
  const privateKey = normalizePrivateKeyPem(env.APP_STORE_PRIVATE_KEY);
  const bundleId = String(
    expectedBundleId || env.APP_STORE_BUNDLE_ID || ""
  ).trim();
  const appStoreEnv = resolveAppStoreEnvironment(env);

  if (!issuerId || !keyId || !privateKey || !bundleId) {
    const err = new Error(
      "APP_STORE_ISSUER_ID, APP_STORE_KEY_ID, APP_STORE_PRIVATE_KEY, and APP_STORE_BUNDLE_ID are required"
    );
    err.code = "iap_verify_not_configured";
    throw err;
  }

  let client = apiClient;
  if (!client) {
    client = new ClientClass(
      privateKey,
      keyId,
      issuerId,
      bundleId,
      appStoreEnv
    );
  }

  const decodeAppleTx =
    typeof decodeSignedTransaction === "function"
      ? decodeSignedTransaction
      : (signed) => decodeJwsPayloadUnverified(signed);

  /**
   * @param {string} jwsOrReceipt
   * @returns {Promise<import('./iap_verify.js').IapVerifySuccess|import('./iap_verify.js').IapVerifyFailure>}
   */
  async function verifyImpl(jwsOrReceipt) {
    const transactionId = extractTransactionIdFromClientInput(jwsOrReceipt);
    if (!transactionId) {
      return {
        ok: false,
        code: "iap_jws_malformed",
        message: "could not extract transactionId from signedTransaction",
        failClosed: true,
      };
    }

    let infoResponse;
    try {
      infoResponse = await client.getTransactionInfo(transactionId);
    } catch (err) {
      const apiMessage =
        err?.errorMessage || err?.message || "App Store Server API error";
      const httpStatus = err?.httpStatusCode;
      return {
        ok: false,
        code: "iap_app_store_api_error",
        message:
          httpStatus != null
            ? `Get Transaction Info failed (${httpStatus}): ${apiMessage}`
            : `Get Transaction Info failed: ${apiMessage}`,
        failClosed: true,
      };
    }

    const signedTransactionInfo = String(
      infoResponse?.signedTransactionInfo || ""
    ).trim();
    if (!signedTransactionInfo) {
      return {
        ok: false,
        code: "iap_app_store_empty_transaction",
        message: "Get Transaction Info returned no signedTransactionInfo",
        failClosed: true,
      };
    }

    let payload;
    try {
      payload = await decodeAppleTx(signedTransactionInfo);
    } catch (err) {
      return {
        ok: false,
        code: err?.code || "iap_jws_malformed",
        message: err?.message || "failed to decode Apple signedTransactionInfo",
        failClosed: true,
      };
    }

    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        code: "iap_jws_malformed",
        message: "decoded transaction payload missing",
        failClosed: true,
      };
    }

    const verifiedTransactionId = String(
      payload.transactionId || ""
    ).trim();
    const productId = String(payload.productId || "").trim();
    const gotBundleId = String(payload.bundleId || "").trim();

    if (!verifiedTransactionId || !productId) {
      return {
        ok: false,
        code: "iap_verify_incomplete",
        message: "Apple transaction missing transactionId or productId",
        failClosed: true,
      };
    }

    // Transaction must belong to the purchase we asked about (or its original).
    const originalId = String(payload.originalTransactionId || "").trim();
    if (
      verifiedTransactionId !== transactionId &&
      originalId !== transactionId
    ) {
      return {
        ok: false,
        code: "iap_transaction_mismatch",
        message: "Apple transactionId does not match the submitted purchase",
        failClosed: true,
      };
    }

    if (gotBundleId && gotBundleId !== bundleId) {
      return {
        ok: false,
        code: "iap_bundle_mismatch",
        message: "bundleId does not match APP_STORE_BUNDLE_ID",
        failClosed: true,
      };
    }
    if (!gotBundleId) {
      return {
        ok: false,
        code: "iap_bundle_mismatch",
        message: "Apple transaction missing bundleId",
        failClosed: true,
      };
    }

    const pack = getPackByProductId(productId);
    if (!pack) {
      return {
        ok: false,
        code: "iap_unknown_product",
        message: "productId is not in the Clementine pack catalog",
        failClosed: true,
      };
    }

    // Refunds / revocations: Apple sets revocationDate (ms) when refunded.
    if (payload.revocationDate != null && payload.revocationDate !== "") {
      return {
        ok: false,
        code: "iap_transaction_revoked",
        message: "transaction was revoked or refunded",
        failClosed: true,
      };
    }

    const envFromPayload = String(payload.environment || "").trim();
    const environment =
      envFromPayload || environmentLabel(appStoreEnv) || undefined;

    return {
      ok: true,
      transactionId: verifiedTransactionId,
      productId,
      bundleId: gotBundleId,
      environment,
      raw: payload,
    };
  }

  return verifyImpl;
}

export {
  hasCompleteAppStoreVerifyConfig,
  normalizePrivateKeyPem,
  resolveAppStoreEnvironment,
  decodeJwsPayloadUnverified,
  extractTransactionIdFromClientInput,
  createAppStoreServerVerifyImpl,
};
