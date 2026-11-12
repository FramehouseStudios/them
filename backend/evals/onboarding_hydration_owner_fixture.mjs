// Explicit loopback preload for one native regression. Never imported by the app.
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

if (process.env.NODE_ENV !== "test" || process.env.HOST !== "127.0.0.1") {
  throw new Error("Onboarding proof requires a disposable loopback test backend");
}
const expectedName = "Server Account A";
const hydrationWitness = "T1426 hydration consumed";
const stats = {
  armed: false, heldLoginResponses: 0, releasedLoginResponses: 0,
  closedHeldLogins: 0, namedAppSessionResponses: 0, hydrationContinuationRequests: 0,
  unexpectedMutations: 0, blockedOutboundCalls: 0,
};
let held = null;
let acceptedBearer = "";
const denyOutbound = () => {
  stats.blockedOutboundCalls += 1;
  throw new Error("Outbound network disabled in onboarding proof");
};
globalThis.fetch = async () => denyOutbound();
http.request = denyOutbound; http.get = denyOutbound;
https.request = denyOutbound; https.get = denyOutbound;
syncBuiltinESMExports();

const { app } = await import("../app.js");
const prefix = "/__test/onboarding-hydration";
app.get(prefix + "/stats", (_req, res) => res.json(stats));
app.post(prefix + "/arm", (_req, res) => {
  if (stats.armed) return res.status(409).json({ error: "already_armed" });
  stats.armed = true;
  res.json({ armed: true });
});
app.post(prefix + "/release", (_req, res) => {
  if (!held) return res.status(409).json({ error: "no_held_login" });
  const release = held;
  held = null;
  stats.releasedLoginResponses += 1;
  release();
  res.json({ released: true });
});
app.use((req, res, next) => {
  if (!stats.armed || req.get("X-THEM-ONBOARDING-SETUP") === "1") return next();
  // In this UI journey the login health preflight is already complete and
  // periodic monitoring is disabled. Root requests health after synchronous
  // seedFromBackend; wait for this continuation before inspecting the form.
  if (stats.namedAppSessionResponses > 0 && req.method === "GET"
      && ["/bridge", "/health"].includes(req.path)) stats.hydrationContinuationRequests += 1;
  const login = req.method === "POST" && req.path === "/auth/login";
  const session = req.method === "POST" && req.path === "/session";
  // The real auth/session handlers run unchanged. Every other write is refused
  // before it can create a project, generate text/audio, or touch a wallet.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !login && !session) {
    stats.unexpectedMutations += 1;
    return res.status(503).json({ error: "unexpected_onboarding_proof_mutation" });
  }
  if (login) {
    const originalJSON = res.json;
    res.json = function (body) {
      if (res.statusCode === 200 && stats.heldLoginResponses === 0) {
        const token = body?.access_token || body?.accessToken || body?.token;
        if (typeof token !== "string" || !token) {
          return originalJSON.call(this, body);
        }
        acceptedBearer = "Bearer " + token;
        stats.heldLoginResponses += 1;
        held = () => originalJSON.call(this, body);
        res.once("close", () => {
          if (held) { stats.closedHeldLogins += 1; held = null; }
        });
        return this;
      }
      return originalJSON.call(this, body);
    };
  }
  if (session) {
    let named = false;
    const originalJSON = res.json;
    res.json = function (body) {
      named = res.statusCode === 200 && acceptedBearer
        && req.get("Authorization") === acceptedBearer
        && body?.evolution_sync?.preferred_name === expectedName
        && body?.evolution_sync?.last_theme_cue === hydrationWitness;
      return originalJSON.call(this, body);
    };
    res.once("finish", () => {
      if (named && stats.releasedLoginResponses === 1) stats.namedAppSessionResponses += 1;
    });
  }
  next();
});
