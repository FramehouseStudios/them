import { createHash } from "node:crypto";
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

function makeSilentWav({ sampleRate = 16000, durationMs = 160 } = {}) {
  const samples = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  const pcmBytes = Buffer.alloc(samples * 2);
  const dataSize = pcmBytes.length;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);
  pcmBytes.copy(wav, 44);
  return wav;
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

async function requestBinary(pathname, { method = "GET", headers = {}, body } = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    response,
    buffer,
    elapsedMs: Date.now() - startedAt,
  };
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

function makeTalkForm({
  transcript,
  systemPrompt,
  speculativeMode = "",
  speculativeKey = "",
  speculativeReuseKey = "",
  speculativePromptHash = "",
}) {
  const form = new FormData();
  form.set("file", new File([wavBytes], "speculative-smoke.wav", { type: "audio/wav" }));
  form.set("client_transcript", transcript);
  form.set("partial_transcript_hint", transcript);
  form.set("system_prompt", systemPrompt);
  if (speculativeMode) {
    form.set("speculative_mode", speculativeMode);
  }
  if (speculativeKey) {
    form.set("speculative_key", speculativeKey);
  }
  if (speculativeReuseKey) {
    form.set("speculative_reuse_key", speculativeReuseKey);
  }
  if (speculativePromptHash) {
    form.set("speculative_prompt_hash", speculativePromptHash);
  }
  return form;
}

function headerString(response, name) {
  return String(response.headers.get(name) || "").trim();
}

const BASE_URL = process.env.THEM_BASE_URL?.trim() || "http://127.0.0.1:3000";
const forwardedIp = `203.0.113.${Math.max(10, Math.min(250, Math.floor(Math.random() * 240) + 10))}`;
const personaKey = process.env.THEM_PERSONA_KEY?.trim() || "clementine";
const appToken = loadAppToken();
const wavBytes = makeSilentWav();
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const transcript = `Give me a quick grounded check in about my morning ${stamp}`;
const systemPrompt = [
  "You are HER.",
  "Reply briefly and naturally for this speculative reuse smoke.",
  "Keep the answer grounded and under 80 words.",
].join("\n");
const speculativeKey = `spec-reuse-${stamp}`;
const speculativePromptHash = createHash("sha256")
  .update(systemPrompt, "utf8")
  .digest("hex")
  .slice(0, 16);

const signup = await requestJson("/auth/signup", {
  method: "POST",
  headers: buildHeaders({ "Content-Type": "application/json" }),
  body: JSON.stringify({
    email: `speculative-reuse-${stamp}@example.com`,
    password: `speculative-reuse-${stamp}`,
  }),
});
assert(signup.response.status === 201, `/auth/signup failed with ${signup.response.status}`);
const accessToken = String(signup.json?.access_token || signup.json?.token || "").trim();
assert(accessToken, "Auth signup did not return an access token");
const bearerHeader = { Authorization: `Bearer ${accessToken}` };

const sessionBootstrap = await requestJson("/session", {
  method: "POST",
  headers: buildHeaders(bearerHeader),
});
assert(sessionBootstrap.response.status === 201, `/session bootstrap failed with ${sessionBootstrap.response.status}`);
const clientToken = String(sessionBootstrap.json?.client_token || "").trim();
assert(clientToken, "Session bootstrap did not return client_token");

const prepareForm = makeTalkForm({
  transcript,
  systemPrompt,
  speculativeMode: "prepare",
  speculativeKey,
  speculativePromptHash,
});
const prepareResponse = await requestJson("/talk", {
  method: "POST",
  headers: buildHeaders({
    Accept: "application/json",
    ...bearerHeader,
    "X-Client-Token": clientToken,
    "X-Speculative-Mode": "prepare",
    "X-Talk-Stream": "off",
  }),
  body: prepareForm,
});
assert(prepareResponse.response.status === 201, `Speculative prepare failed with ${prepareResponse.response.status}`);
assert(prepareResponse.json?.ok === true, "Speculative prepare did not return ok=true");
assert(prepareResponse.json?.action === "speculative_prepared", `Unexpected prepare action: ${prepareResponse.json?.action}`);
assert(headerString(prepareResponse.response, "x-speculative-reuse") === "0", "Prepare response unexpectedly reported reuse");
assert(headerString(prepareResponse.response, "x-speculative-key") === speculativeKey, "Prepare response returned the wrong speculative key");
assert(
  headerString(prepareResponse.response, "x-speculative-prompt-hash") === speculativePromptHash,
  "Prepare response returned the wrong prompt hash"
);

const finalForm = makeTalkForm({
  transcript,
  systemPrompt,
  speculativeReuseKey: speculativeKey,
  speculativePromptHash,
});
const finalResponse = await requestBinary("/talk", {
  method: "POST",
  headers: buildHeaders({
    Accept: "audio/mpeg",
    ...bearerHeader,
    "X-Client-Token": clientToken,
    "X-Talk-Stream": "off",
  }),
  body: finalForm,
});
assert(finalResponse.response.status === 200, `Final /talk failed with ${finalResponse.response.status}`);
assert(headerString(finalResponse.response, "content-type").toLowerCase().includes("audio/mpeg"), "Final /talk did not return audio/mpeg");
assert(finalResponse.buffer.length > 1024, `Final /talk returned suspiciously small audio (${finalResponse.buffer.length} bytes)`);
assert(headerString(finalResponse.response, "x-speculative-reuse") === "1", "Final /talk did not report a speculative reuse hit");
assert(headerString(finalResponse.response, "x-speculative-key") === speculativeKey, "Final /talk returned the wrong speculative reuse key");
assert(
  headerString(finalResponse.response, "x-speculative-prompt-hash") === speculativePromptHash,
  "Final /talk returned the wrong speculative reuse prompt hash"
);
assert(headerString(finalResponse.response, "x-turn-status") === "responded", `Unexpected final turn status: ${headerString(finalResponse.response, "x-turn-status")}`);

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  forwardedIp,
  authenticated: true,
  clientTokenPresent: Boolean(clientToken),
  speculativeKey,
  speculativePromptHash,
  prepare: {
    status: prepareResponse.response.status,
    action: prepareResponse.json?.action,
    reuseHeader: headerString(prepareResponse.response, "x-speculative-reuse"),
    keyHeader: headerString(prepareResponse.response, "x-speculative-key"),
    promptHashHeader: headerString(prepareResponse.response, "x-speculative-prompt-hash"),
  },
  final: {
    status: finalResponse.response.status,
    elapsedMs: finalResponse.elapsedMs,
    bytes: finalResponse.buffer.length,
    reuseHeader: headerString(finalResponse.response, "x-speculative-reuse"),
    keyHeader: headerString(finalResponse.response, "x-speculative-key"),
    promptHashHeader: headerString(finalResponse.response, "x-speculative-prompt-hash"),
    turnStatus: headerString(finalResponse.response, "x-turn-status"),
    turnId: headerString(finalResponse.response, "x-turn-id"),
    ttsProvider: headerString(finalResponse.response, "x-tts-provider"),
  },
}, null, 2));
console.log("speculative-reuse-smoke: ok");
