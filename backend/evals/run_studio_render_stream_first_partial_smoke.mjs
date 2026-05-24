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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function headerString(response, name) {
  return String(response.headers.get(name) || "").trim();
}

async function requestJson(pathname, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
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
      throw new Error(`Invalid JSON from ${pathname}: ${error.message}\n${text}`);
    }
  }
  return { response, json, text };
}

function buildHeaders(extra = {}) {
  const headers = {
    Accept: "application/json",
    "X-Forwarded-For": forwardedIp,
    "X-Persona-Key": personaKey,
    ...extra,
  };
  if (appToken) {
    headers["X-APP-TOKEN"] = appToken;
  }
  return headers;
}

async function signupUser(email, password = "studio-render-password-123") {
  const signup = await requestJson("/auth/signup", {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  });
  assert(signup.response.status === 201 || signup.response.ok, `/auth/signup failed with ${signup.response.status}`);
  const token = String(signup.json?.access_token || signup.json?.token || "").trim();
  const userId = String(signup.json?.user?.user_id || signup.json?.user_id || "").trim();
  assert(token, "Signup did not return an access token");
  assert(userId, "Signup did not return a user_id");
  return { token, userId };
}

const BASE_URL = process.env.THEM_BASE_URL?.trim() || "http://127.0.0.1:3000";
const personaKey = process.env.THEM_PERSONA_KEY?.trim() || "clementine";
const appToken = loadAppToken();
const forwardedIp = `198.51.100.${Math.max(20, Math.min(240, Math.floor(Math.random() * 200) + 20))}`;
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const transcript = `Write the next beat where she leaves before he can answer. Keep it screenplay-only. ${stamp}`;
const systemPrompt = [
  "You are HER in screenplay studio mode.",
  "Output only screenplay text.",
  "Respond immediately with a small but real screenplay continuation.",
].join("\n");

const auth = await signupUser(`studio-render-${stamp}@example.com`);
const sessionBootstrap = await requestJson("/session", {
  method: "POST",
  headers: buildHeaders({ Authorization: `Bearer ${auth.token}` }),
});
assert(sessionBootstrap.response.status === 201, `/session bootstrap failed with ${sessionBootstrap.response.status}`);
const clientToken = String(sessionBootstrap.json?.client_token || "").trim();
assert(clientToken, "Session bootstrap did not return client_token");

const requestStartedAt = Date.now();
const response = await fetch(`${BASE_URL}/realtime/studio_render_stream`, {
  method: "POST",
  headers: buildHeaders({
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    "X-Client-Token": clientToken,
    Authorization: `Bearer ${auth.token}`,
  }),
  body: JSON.stringify({
    transcript,
    system_prompt: systemPrompt,
  }),
});

assert(response.ok, `/realtime/studio_render_stream failed with ${response.status}`);
assert(
  headerString(response, "content-type").toLowerCase().includes("text/event-stream"),
  "Render stream did not return text/event-stream"
);
assert(response.body && typeof response.body.getReader === "function", "Render stream body was unavailable");

const headerRequestId = headerString(response, "x-request-id");
const headerStudioRequestId = headerString(response, "x-studio-render-request-id");

const decoder = new TextDecoder();
const reader = response.body.getReader();
let pending = "";
let eventName = "message";
let dataLines = [];
let accumulated = "";
let deltaCount = 0;
let metaEvent = null;
let firstDeltaTrace = null;
let doneEvent = null;
let errorEvent = null;
let clientFirstDeltaMs = null;
const seenEvents = [];
let rawPrefix = "";

function maybeParsePayload(payloadText) {
  try {
    return JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`Invalid SSE JSON for event ${eventName}: ${error.message}\n${payloadText}`);
  }
}

function handleEvent(name, payload) {
  if (seenEvents.length < 16) {
    seenEvents.push({
      name,
      kind: String(payload?.kind || "").trim(),
      requestId: String(payload?.request_id || "").trim(),
      hasDelta: Boolean(payload?.delta),
      hasReply: Boolean(payload?.reply),
      firstDeltaMs: payload?.first_delta_ms ?? null,
      totalMs: payload?.total_ms ?? null,
    });
  }
  switch (name) {
    case "meta":
      metaEvent = payload;
      break;
    case "trace":
      if (String(payload?.kind || "").trim().toLowerCase() === "first_delta" && !firstDeltaTrace) {
        firstDeltaTrace = payload;
      }
      break;
    case "delta": {
      const delta = String(payload?.delta || "");
      if (!delta) return;
      accumulated += delta;
      deltaCount += 1;
      if (clientFirstDeltaMs === null) {
        clientFirstDeltaMs = Math.max(0, Date.now() - requestStartedAt);
      }
      break;
    }
    case "done":
      doneEvent = payload;
      break;
    case "error":
      errorEvent = payload;
      break;
    default:
      break;
  }
}

function flushEvent() {
  if (!dataLines.length) return;
  const payloadText = dataLines.join("\n");
  const payload = maybeParsePayload(payloadText);
  handleEvent(eventName, payload);
  dataLines = [];
  eventName = "message";
}

try {
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunkText = decoder.decode(value, { stream: true });
    if (rawPrefix.length < 2000) {
      rawPrefix += chunkText;
      if (rawPrefix.length > 2000) {
        rawPrefix = rawPrefix.slice(0, 2000);
      }
    }
    pending += chunkText;
    while (true) {
      const newlineIndex = pending.indexOf("\n");
      if (newlineIndex < 0) break;
      const rawLine = pending.slice(0, newlineIndex);
      pending = pending.slice(newlineIndex + 1);
      const line = rawLine.replace(/\r/g, "");
      if (!line) {
        flushEvent();
        continue;
      }
      if (line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
  }
  if (pending.trim()) {
    const trailing = pending.replace(/\r/g, "");
    if (trailing.startsWith("data:")) {
      dataLines.push(trailing.slice("data:".length).trim());
    }
  }
  flushEvent();
} finally {
  reader.releaseLock();
}

assert(!errorEvent, `Render stream returned error event: ${JSON.stringify(errorEvent)}`);
assert(metaEvent?.request_id, "Render stream meta event did not include request_id");
assert(
  firstDeltaTrace?.first_delta_ms != null,
  `Render stream trace did not include first_delta_ms. seen=${JSON.stringify(seenEvents)} raw=${JSON.stringify(rawPrefix)}`
);
assert(clientFirstDeltaMs != null, "Client never observed a first delta");
assert(deltaCount > 0, "Render stream did not emit any delta events");

const finalReply = String(doneEvent?.reply || accumulated).trim();
assert(finalReply, "Render stream did not produce a final reply");

if (headerStudioRequestId) {
  assert(
    headerStudioRequestId === String(metaEvent.request_id).trim(),
    `X-Studio-Render-Request-Id mismatch: header=${headerStudioRequestId} meta=${metaEvent.request_id}`
  );
}
if (headerRequestId) {
  assert(
    headerRequestId === String(metaEvent.request_id).trim(),
    `X-Request-Id mismatch: header=${headerRequestId} meta=${metaEvent.request_id}`
  );
}

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  forwardedIp,
  userId: auth.userId,
  clientToken,
  headerRequestId,
  headerStudioRequestId,
  metaRequestId: String(metaEvent.request_id || "").trim(),
  serverFirstDeltaMs: Number(firstDeltaTrace.first_delta_ms),
  clientFirstDeltaMs,
  totalMs: Number(doneEvent?.total_ms || 0),
  deltaChunks: Number(doneEvent?.delta_chunks || deltaCount),
  replyChars: finalReply.length,
  firstReplyPreview: finalReply.slice(0, 180),
}, null, 2));
console.log("studio-render-stream-first-partial-smoke: ok");
