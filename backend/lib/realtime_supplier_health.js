// T-realtime-supplier-health — readiness check for the configured
// realtime supplier. Two probe modes:
//
//   probeSupplierShape(supplier)
//     synchronous, cheap. Verifies the supplier exposes the required
//     surface (kind, mintClientSecret, buildSessionConfig). Returns
//     { healthy, kind, error? }.
//
//   probeSupplierLive(supplier, { timeoutMs })
//     asynchronous, real network. Calls mintClientSecret with a short
//     timeout and reports whether a usable response came back. Returns
//     the same shape plus latencyMs.
//
// The route layer caches the LIVE result for `CACHE_TTL_MS` so a
// /realtime/health poll every few seconds doesn't actually fire a
// fresh mint each time. The SHAPE probe is always fresh — it's
// effectively free.

const CACHE_TTL_MS = 30_000;
const DEFAULT_LIVE_TIMEOUT_MS = 5_000;

function probeSupplierShape(supplier) {
  if (!supplier || typeof supplier !== "object") {
    return { healthy: false, kind: null, error: "supplier_missing" };
  }
  const kind = typeof supplier.kind === "string" && supplier.kind.trim()
    ? supplier.kind.trim()
    : null;
  if (!kind) {
    return { healthy: false, kind: null, error: "supplier_kind_missing" };
  }
  if (typeof supplier.mintClientSecret !== "function") {
    return { healthy: false, kind, error: "supplier_mintClientSecret_missing" };
  }
  if (typeof supplier.buildSessionConfig !== "function") {
    return { healthy: false, kind, error: "supplier_buildSessionConfig_missing" };
  }
  // buildSessionConfig must be safe to call without network — exercise it.
  try {
    supplier.buildSessionConfig({ instructions: "", voice: "", model: "" });
  } catch (e) {
    return { healthy: false, kind, error: `buildSessionConfig_threw:${e?.message || "unknown"}` };
  }
  return { healthy: true, kind, error: null };
}

async function probeSupplierLive(supplier, { timeoutMs = DEFAULT_LIVE_TIMEOUT_MS } = {}) {
  const shape = probeSupplierShape(supplier);
  if (!shape.healthy) {
    return { ...shape, latencyMs: null };
  }
  const started = Date.now();
  // Race against a timeout so a hung supplier doesn't hang the probe.
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`probe timed out after ${timeoutMs}ms`);
      e.code = "supplier_probe_timeout";
      reject(e);
    }, Math.max(100, timeoutMs));
  });
  try {
    const result = await Promise.race([
      supplier.mintClientSecret({ instructions: "health-probe", voice: "", model: "", ttlSeconds: 60 }),
      timeout,
    ]);
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    if (!result || typeof result !== "object" || !result.value) {
      return { healthy: false, kind: shape.kind, error: "supplier_mint_invalid_response", latencyMs };
    }
    return { healthy: true, kind: shape.kind, error: null, latencyMs };
  } catch (e) {
    if (timer) clearTimeout(timer);
    return {
      healthy: false,
      kind: shape.kind,
      error: e?.code || e?.message || "supplier_mint_failed",
      latencyMs: Date.now() - started,
    };
  }
}

// Tiny TTL cache so a /realtime/health poll loop doesn't fire a
// network probe every call. Keyed by supplier.kind so a runtime
// supplier swap invalidates automatically.
function createSupplierHealthCache({ ttlMs = CACHE_TTL_MS } = {}) {
  let entry = null; // { kind, result, recordedAtMs }
  return {
    get(supplier) {
      if (!entry || !supplier) return null;
      if (entry.kind !== supplier.kind) return null;
      if (Date.now() - entry.recordedAtMs > ttlMs) return null;
      return entry.result;
    },
    set(supplier, result) {
      if (!supplier || !supplier.kind) return;
      entry = { kind: supplier.kind, result, recordedAtMs: Date.now() };
    },
    clear() {
      entry = null;
    },
    inspect() {
      return entry;
    },
  };
}

export {
  probeSupplierShape,
  probeSupplierLive,
  createSupplierHealthCache,
  CACHE_TTL_MS,
  DEFAULT_LIVE_TIMEOUT_MS,
};
