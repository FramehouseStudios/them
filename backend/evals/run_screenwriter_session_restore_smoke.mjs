import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadAppToken() {
  const direct = process.env.APP_TOKEN?.trim();
  if (direct) return direct;
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!existsSync(envPath)) return "";
  const envText = readFileSync(envPath, "utf8");
  const match = envText.match(/^\s*APP_TOKEN\s*=\s*(.+?)\s*$/m);
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

const BASE_URL = process.env.THEM_BASE_URL?.trim() || "http://127.0.0.1:3000";
const forwardedIp = `203.0.113.${Math.max(10, Math.min(250, Math.floor(Math.random() * 240) + 10))}`;
const personaKey = process.env.THEM_PERSONA_KEY?.trim() || "clementine";
const appToken = loadAppToken();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body,
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON from ${path}: ${error.message}\n${text}`);
    }
  }
  return { response, json, text };
}

function buildHeaders(extra = {}) {
  const headers = {
    "Accept": "application/json",
    "X-Forwarded-For": forwardedIp,
    "X-Persona-Key": personaKey,
    ...extra,
  };
  if (appToken) {
    headers["X-APP-TOKEN"] = appToken;
  }
  return headers;
}

const initial = await requestJson("/session", {
  method: "POST",
  headers: buildHeaders(),
});
assert(initial.response.status === 201, `/session bootstrap failed with ${initial.response.status}`);
const initialToken = String(initial.json?.client_token || "").trim();
assert(initialToken, "Initial /session response did not include client_token");
assert(initial.json?.evolution_sync?.is_screenwriter === false, "Fresh /session unexpectedly started with is_screenwriter=true");

const syncPayload = {
  is_screenwriter: true,
  stage: 2,
  depth_score: 1.4,
  romance_tension: 0.4,
  session_count: 1,
  last_theme_cue: "screenwriting",
};
const synced = await requestJson("/session/evolution", {
  method: "PATCH",
  headers: buildHeaders({
    "Content-Type": "application/json",
    "X-Client-Token": initialToken,
  }),
  body: JSON.stringify(syncPayload),
});
assert(synced.response.status === 204, `/session/evolution failed with ${synced.response.status}`);

const restored = await requestJson("/session", {
  method: "POST",
  headers: buildHeaders(),
});
assert(restored.response.status === 201, `Fresh /session restore failed with ${restored.response.status}`);
const restoredToken = String(restored.json?.client_token || "").trim();
assert(restoredToken, "Restored /session response did not include client_token");
assert(restoredToken !== initialToken, "Fresh client bootstrap reused the previous client token");
assert(restored.json?.evolution_sync?.is_screenwriter === true, "Restored /session did not preserve is_screenwriter=true");
assert(restored.json?.evolution_sync?.last_theme_cue === "screenwriting", "Restored /session lost the screenplay theme cue");

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  forwardedIp,
  initialToken,
  restoredToken,
  initialScreenwriter: initial.json?.evolution_sync?.is_screenwriter,
  restoredScreenwriter: restored.json?.evolution_sync?.is_screenwriter,
  restoredTheme: restored.json?.evolution_sync?.last_theme_cue,
}, null, 2));
console.log("screenwriter-session-restore-smoke: ok");
