// T13: realtime supplier interface (foundation).
//
// Defines the contract every realtime supplier (OpenAI Realtime,
// another realtime provider must
// satisfy. The factory `createRealtimeSupplier()` selects an
// implementation by env var with a safe default.
//
// Selection:
//   REALTIME_PROVIDER=openai (default)  -> createOpenAIRealtimeSupplier
//   REALTIME_PROVIDER=stub               -> createStubRealtimeSupplier
//   REALTIME_PROVIDER=<other>            -> error (until a third
//                                            implementation is added)
//
// All implementations expose:
//
//   supplier.kind           // string identifier ("openai" / "stub" / ...)
//
//   supplier.mintClientSecret({
//     instructions,    // system prompt for the realtime session
//     voice,           // requested voice id (provider-specific)
//     model,           // requested model id (provider-specific)
//     ttlSeconds,      // requested TTL for the secret
//   })
//   -> { value, expiresAt, sessionConfig, raw? }
//      (value: string secret; expiresAt: epoch seconds; sessionConfig:
//      the provider-specific session config that minted this secret;
//      raw: optional provider response for debugging.)
//
//   supplier.buildSessionConfig({ model, voice, instructions })
//   -> object  (the provider-specific session-config payload — used
//      by the foundation's tests and any caller that wants to inspect
//      what the supplier WOULD send without minting.)
//
// Errors thrown from `mintClientSecret` are typed:
//   err.code = "realtime_supplier_unauthorized" (missing api key)
//          | "realtime_supplier_request_failed"
//          | "realtime_supplier_response_invalid"
//   err.status = HTTP-shaped status hint for the route handler

const KNOWN_PROVIDERS = Object.freeze(["openai", "stub"]);

function isKnownProvider(name) {
  return KNOWN_PROVIDERS.includes(String(name || "").toLowerCase());
}

async function loadOpenAISupplier(opts) {
  const mod = await import("./realtime_supplier_openai.js");
  return mod.createOpenAIRealtimeSupplier(opts);
}

async function loadStubSupplier(opts) {
  const mod = await import("./realtime_supplier_stub.js");
  return mod.createStubRealtimeSupplier(opts);
}

async function createRealtimeSupplier({
  provider = process.env.REALTIME_PROVIDER || "openai",
  ...opts
} = {}) {
  const name = String(provider || "openai").toLowerCase();
  if (name === "openai") return loadOpenAISupplier(opts);
  if (name === "stub")   return loadStubSupplier(opts);
  const err = new Error(`unknown realtime provider: ${provider}`);
  err.code = "realtime_supplier_unknown_provider";
  throw err;
}

export {
  KNOWN_PROVIDERS,
  isKnownProvider,
  createRealtimeSupplier,
};
