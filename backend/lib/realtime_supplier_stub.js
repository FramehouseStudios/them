// T13: Stub realtime supplier.
//
// Deterministic implementation of the supplier interface. Useful for:
//   - Testing the interface contract without hitting any provider.
//   - Local development without a realtime API account.
//   - Placeholder for the eventual second real supplier — when that
//     supplier is ready, replace the body of this module (or add a
//     sibling) without changing the interface.
//
// All `mintClientSecret` calls return a synthetic but well-formed
// envelope. The secret value is a unique random string; the
// expiresAt is `now + ttl`. Provider-side errors can be simulated by
// passing `simulateError: { code, status, message }` at construction.

import { randomUUID } from "node:crypto";

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function clampTtlSeconds(requested, fallback = 60, min = 30, max = 300) {
  const n = Math.floor(Number(requested) || 0);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, n));
}

function createStubRealtimeSupplier({
  defaultModel = "stub-realtime-1",
  defaultVoice = "stub-voice",
  defaultTtlSeconds = 60,
  simulateError = null,
} = {}) {
  function buildSessionConfig({ model, voice, instructions } = {}) {
    const session = {
      type: "realtime",
      model: trimToString(model) || defaultModel,
      audio: { output: { voice: trimToString(voice) || defaultVoice } },
    };
    const trimmedInstructions = trimToString(instructions);
    if (trimmedInstructions) session.instructions = trimmedInstructions;
    return session;
  }

  async function mintClientSecret({
    instructions = "",
    voice = "",
    model = "",
    ttlSeconds = null,
  } = {}) {
    if (simulateError && typeof simulateError === "object") {
      const err = new Error(simulateError.message || "stub realtime supplier simulated error");
      err.code = simulateError.code || "realtime_supplier_request_failed";
      err.status = simulateError.status || 502;
      throw err;
    }
    const sessionConfig = buildSessionConfig({ model, voice, instructions });
    const ttl = clampTtlSeconds(ttlSeconds, defaultTtlSeconds);
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const value = `stub_secret_${randomUUID()}`;
    return {
      value,
      expiresAt,
      sessionConfig,
      raw: { provider: "stub", note: "deterministic supplier — not a real API" },
    };
  }

  return {
    kind: "stub",
    buildSessionConfig,
    mintClientSecret,
  };
}

export {
  createStubRealtimeSupplier,
};
