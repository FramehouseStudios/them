// D011 — POST /billing/iap/credit (+ /talk/wallet/credit alias).
// Auth required → verify StoreKit transaction → wallet.creditPack (idempotent).

import express from "express";
import { getPackByProductId, publicPackShape } from "./pack_catalog.js";
import { createIapVerifier } from "./iap_verify.js";

const BODY_LIMIT = "256kb";

function pickString(...values) {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function calmBalancePayload(balance, extra = {}) {
  return {
    ok: true,
    companionTurnsLeft: balance.companionTurnsLeft,
    pageTurnsLeft: balance.pageTurnsLeft,
    approxConversationsLeft: balance.approxConversationsLeft,
    lowBalance: balance.lowBalance === true,
    ...extra,
  };
}

function assertNoTpmFields(payload) {
  const serialized = JSON.stringify(payload);
  if (/tpm|tokensPerMinute|token_rate/i.test(serialized)) {
    const err = new Error("TPM fields must not appear in IAP credit responses");
    err.code = "iap_tpm_leak";
    throw err;
  }
}

/**
 * @param {import('express').Express} app
 * @param {object} deps
 * @param {object} deps.walletStore — createWalletStore() instance with creditPack
 * @param {(req, res, stage?: string) => object|null} deps.requireAuthenticatedUser
 * @param {{ verifyTransaction: Function }} [deps.iapVerifier]
 */
function mountIapCreditRoute(app, {
  walletStore,
  requireAuthenticatedUser,
  iapVerifier = null,
  logger = console,
} = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountIapCreditRoute requires an Express app");
  }
  if (!walletStore || typeof walletStore.creditPack !== "function") {
    throw new Error("mountIapCreditRoute requires walletStore.creditPack");
  }
  if (typeof requireAuthenticatedUser !== "function") {
    throw new Error("mountIapCreditRoute requires requireAuthenticatedUser");
  }

  const verifier = iapVerifier || createIapVerifier();

  async function handleCredit(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const user = requireAuthenticatedUser(req, res, "iap_credit");
    if (!user) return undefined;

    const ownerId = pickString(user.id, req.authUser?.id, req.userId);
    if (!ownerId) {
      return res.status(401).json({
        ok: false,
        stage: "iap_credit",
        error: "user_auth_required",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const signedTransaction = pickString(
      body.signedTransaction,
      body.signed_transaction,
      body.jws,
      body.jwsRepresentation,
      body.receipt
    );
    if (!signedTransaction) {
      return res.status(400).json({
        ok: false,
        error: "iap_missing_transaction",
        message: "signedTransaction is required",
      });
    }

    let verified;
    try {
      verified = await verifier.verifyTransaction(signedTransaction);
    } catch (err) {
      logger?.warn?.("[iap] verifyTransaction threw", err?.message || err);
      return res.status(503).json({
        ok: false,
        error: "iap_verify_failed",
        message: "transaction verification failed",
      });
    }

    if (!verified || verified.ok !== true) {
      const code = verified?.code || "iap_verify_failed";
      const status =
        code === "iap_verify_not_configured" || code === "iap_verify_not_wired"
          ? 503
          : 402;
      return res.status(status).json({
        ok: false,
        error: code,
        message: verified?.message || "verification failed",
        failClosed: true,
      });
    }

    const pack = getPackByProductId(verified.productId);
    if (!pack) {
      return res.status(400).json({
        ok: false,
        error: "iap_unknown_product",
        message: "productId is not in the Clementine pack catalog",
        productId: verified.productId,
      });
    }

    let credited;
    try {
      credited = await Promise.resolve(
        walletStore.creditPack({
          ownerId,
          companionTurns: pack.companionTurns,
          pageTurns: pack.pageTurns,
          transactionId: verified.transactionId,
          meta: {
            productId: pack.productId,
            packId: pack.id,
            source: "storekit_iap",
          },
        })
      );
    } catch (err) {
      logger?.error?.("[iap] creditPack failed", err?.message || err);
      return res.status(500).json({
        ok: false,
        error: err?.code || "iap_credit_failed",
        message: "wallet credit failed",
      });
    }

    const payload = calmBalancePayload(credited, {
      alreadyCredited: credited.alreadyCredited === true,
      transactionId: verified.transactionId,
      pack: publicPackShape(pack),
    });
    assertNoTpmFields(payload);
    return res.status(200).json(payload);
  }

  const json = express.json({ limit: BODY_LIMIT });

  app.post("/billing/iap/credit", json, (req, res) => {
    Promise.resolve(handleCredit(req, res)).catch((err) => {
      logger?.error?.("[iap] unhandled", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: "iap_credit_failed" });
      }
    });
  });

  // Talk-adjacent alias (same semantics).
  app.post("/talk/wallet/credit", json, (req, res) => {
    Promise.resolve(handleCredit(req, res)).catch((err) => {
      logger?.error?.("[iap] unhandled", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: "iap_credit_failed" });
      }
    });
  });
}

export { mountIapCreditRoute, calmBalancePayload };
