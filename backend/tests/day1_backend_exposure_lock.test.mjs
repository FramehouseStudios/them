// Day 1 Backend Exposure Lock — deterministic regression guard for the
// audit-found header-trusted-identity exposure (IDOR / impersonation)
// and the cost-attached realtime/visual paths.
//
// Root cause the audit found: a client-supplied `X-User-Id` request
// header was trusted as identity in ~16 production sites, and
// `attachUserAuth` *rewrote* that header from the verified token —
// which meant any future header reader silently re-opened an
// impersonation vector, and an unauthenticated request could smuggle
// `X-User-Id: <victim>` straight through to user-scoped reads/writes.
//
// This guard pins the fixed behavior with no network and no
// persistence/crypto dep set (the deeper auth-flow tests are
// deferred — see user_auth.test.mjs). Three independent proofs:
//
//   A. attachUserAuth strips any inbound x-user-id on EVERY path
//      (no token / invalid token) and never re-sets it.
//   B. protectUserRoutes 401s the cost-attached provider paths
//      (realtime call/secret/turn_commit/studio_render*, visual
//      context) when an authenticated user is required and absent,
//      passes them once an authoritative req.authUser exists, and
//      keeps the public probes (/realtime/health, /realtime/bridge)
//      open. Regression-direction: with auth not required it stays a
//      pure pass-through (the lock must not change default posture).
//   C. Source-level permanent check: NO production backend file
//      reads the client `X-User-Id` / `x-user-id` header for
//      identity. This turns the audit finding into an automated
//      check so the vector cannot silently regress. The only
//      tolerated residuals are the strip itself, the outbound
//      response echo (res.setHeader — a write, not a trust read),
//      and explanatory comments.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createUserAuthSubsystem } from "../lib/user_auth.js";

const __filename = fileURLToPath(import.meta.url);
const BACKEND_ROOT = path.resolve(path.dirname(__filename), "..");

// --- minimal Express-shaped req/res doubles (no network) -------------

function makeReq({ path: reqPath = "/", headers = {}, authUser = null } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[String(k).toLowerCase()] = v;
  return {
    path: reqPath,
    headers: lower,
    authUser,
    authUserError: "",
    get(name) {
      const v = lower[String(name).toLowerCase()];
      return v == null ? "" : v;
    },
  };
}

function makeRes() {
  const res = { statusCode: 200, body: null, ended: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; res.ended = true; return res; };
  res.setHeader = () => res;
  return res;
}

function runMiddleware(mw, req) {
  const res = makeRes();
  let nextCalls = 0;
  mw(req, res, () => { nextCalls += 1; });
  return { res, nextCalls };
}

async function runMiddlewareAsync(mw, req) {
  const res = makeRes();
  let nextCalls = 0;
  await Promise.resolve(mw(req, res, () => { nextCalls += 1; }));
  return { res, nextCalls };
}

// --- A. attachUserAuth strips inbound x-user-id on every path --------

const SPOOFED = { "x-user-id": "victim-user-id", "X-User-Id": "victim-user-id" };

test("[day1-lock] no token + spoofed X-User-Id: header stripped, no identity leaked", () => {
  const { attachUserAuth } = createUserAuthSubsystem({ jwtSecret: "test-secret" });
  const req = makeReq({ path: "/talk", headers: { ...SPOOFED } });
  const { nextCalls } = runMiddleware(attachUserAuth, req);
  assert.equal(nextCalls, 1, "attachUserAuth must call next() exactly once");
  assert.equal(req.headers["x-user-id"], undefined, "inbound x-user-id must be stripped");
  assert.equal(req.authUser, null, "no token => no authUser");
  assert.equal(req.userId, undefined, "no token => no req.userId (cannot inherit the spoof)");
});

test("[day1-lock] invalid bearer + spoofed X-User-Id: header stripped, no identity leaked", async () => {
  const { attachUserAuth } = createUserAuthSubsystem({ jwtSecret: "test-secret" });
  const req = makeReq({
    path: "/screenplay",
    headers: { ...SPOOFED, authorization: "Bearer not-a-real-token" },
  });
  const { nextCalls } = await runMiddlewareAsync(attachUserAuth, req);
  assert.equal(nextCalls, 1, "attachUserAuth must call next() exactly once");
  assert.equal(req.headers["x-user-id"], undefined, "invalid token must not preserve spoofed header");
  assert.equal(req.authUser, null, "invalid token => no authUser");
  assert.equal(req.userId, undefined, "invalid token => no req.userId from the spoofed header");
});

test("[day1-lock] strip happens regardless of auth configuration (defense in depth)", () => {
  // Even when the subsystem is not configured (no signing secret in
  // a non-prod env still configures; force prod+no-secret here), the
  // header strip must run before any token logic.
  const { attachUserAuth } = createUserAuthSubsystem({ nodeEnv: "production" });
  const req = makeReq({ path: "/state", headers: { ...SPOOFED } });
  runMiddleware(attachUserAuth, req);
  assert.equal(req.headers["x-user-id"], undefined, "strip must precede token/config checks");
});

// --- B. protectUserRoutes gates the cost-attached provider paths -----

const COST_PATHS = [
  "/realtime/call",
  "/realtime/client_secret",
  "/realtime/turn_commit",
  "/realtime/studio_render",
  "/realtime/studio_render_stream",
  "/visual/context",
];
const PREEXISTING_PROTECTED = ["/talk", "/state", "/screenplay", "/memories"];
const PUBLIC_PROBES = ["/realtime/health", "/realtime/bridge"];

test("[day1-lock] cost paths 401 without an authenticated user", () => {
  const { protectPaidProviderRoutes, protectUserRoutes } = createUserAuthSubsystem({
    requireUserAuth: true,
    jwtSecret: "test-secret",
  });
  for (const p of COST_PATHS) {
    const req = makeReq({ path: p });
    const { res, nextCalls } = runMiddleware(protectPaidProviderRoutes, req);
    assert.equal(nextCalls, 0, `${p} must NOT pass through unauthenticated`);
    assert.equal(res.statusCode, 401, `${p} must 401 unauthenticated`);
    assert.equal(res.body?.error, "user_auth_required", `${p} must report user_auth_required`);
  }
  for (const p of PREEXISTING_PROTECTED) {
    const req = makeReq({ path: p });
    const { res, nextCalls } = runMiddleware(protectUserRoutes, req);
    assert.equal(nextCalls, 0, `${p} must NOT pass through unauthenticated`);
    assert.equal(res.statusCode, 401, `${p} must 401 unauthenticated`);
    assert.equal(res.body?.error, "user_auth_required", `${p} must report user_auth_required`);
  }
});

test("[day1-lock] cost paths pass once an authoritative req.authUser exists", () => {
  const { protectPaidProviderRoutes } = createUserAuthSubsystem({
    requireUserAuth: true,
    jwtSecret: "test-secret",
  });
  for (const p of COST_PATHS) {
    const req = makeReq({ path: p, authUser: { id: "real-authoritative-user" } });
    const { res, nextCalls } = runMiddleware(protectPaidProviderRoutes, req);
    assert.equal(nextCalls, 1, `${p} must pass with a real authUser`);
    assert.equal(res.statusCode, 200, `${p} must not 401 with a real authUser`);
  }
});

test("[day1-lock] public realtime probes stay open (no auth wall on health/bridge)", () => {
  const { protectPaidProviderRoutes } = createUserAuthSubsystem({
    requireUserAuth: true,
    jwtSecret: "test-secret",
  });
  for (const p of PUBLIC_PROBES) {
    const req = makeReq({ path: p });
    const { res, nextCalls } = runMiddleware(protectPaidProviderRoutes, req);
    assert.equal(nextCalls, 1, `${p} must remain a public probe`);
    assert.equal(res.statusCode, 200, `${p} must not be auth-walled`);
  }
});

test("[day1-lock] paid-provider protection is independent of the general auth flag", () => {
  const { protectPaidProviderRoutes } = createUserAuthSubsystem({ jwtSecret: "test-secret" });
  for (const p of COST_PATHS) {
    const req = makeReq({ path: p });
    const { res, nextCalls } = runMiddleware(protectPaidProviderRoutes, req);
    assert.equal(nextCalls, 0, `${p} must stay protected when general auth is disabled`);
    assert.equal(res.statusCode, 401, `${p} must still 401 without authenticated identity`);
  }
});

// --- C. source-level permanent check: zero identity reads -----------

const SKIP_DIRS = new Set(["node_modules", "tests", "evals", "scripts", "tools", ".git", "data"]);
// Identity *reads* of the client-controlled header. A match on any of
// these (outside a comment / the strip / an outbound response write)
// re-opens the impersonation vector the audit found.
const IDENTITY_READ = [
  /\.get\(\s*["']x-user-id["']\s*\)/i,
  /headers\s*\[\s*["']x-user-id["']\s*\]/i,
  /headers\?\.\[\s*["']x-user-id["']\s*\]/i,
];

function collectProductionFiles(dir, acc) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      collectProductionFiles(full, acc);
    } else if (/\.(mjs|cjs|js)$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

test("[day1-lock] no production file reads the client X-User-Id header for identity", () => {
  const files = collectProductionFiles(BACKEND_ROOT, []);
  assert.ok(files.length > 50, `sanity: expected to scan many files, got ${files.length}`);
  const offenders = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!IDENTITY_READ.some((re) => re.test(line))) return;
      const trimmed = line.trim();
      // Tolerated, non-trust residuals:
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return; // comment
      if (trimmed.startsWith("delete ")) return; // the strip itself
      if (/res\.setHeader\(|res\.set\(/.test(line)) return; // outbound echo (a write, not a trust read)
      offenders.push(`${path.relative(BACKEND_ROOT, file)}:${i + 1}: ${trimmed}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Production code must never read the client X-User-Id header for identity.\n` +
      `Use req.authUser?.id / req.userId (authoritative, token-derived) instead.\n` +
      `Offending sites:\n  ${offenders.join("\n  ")}`,
  );
});
