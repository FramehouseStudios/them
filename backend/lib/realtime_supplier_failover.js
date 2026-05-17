// T-realtime-supplier-failover — small pure helper used by
// /realtime/client_secret to transparently fall back to the stub
// supplier when the primary fails. Kept out of index.js so it can be
// unit-tested without spinning up the full backend.
//
//   mintWithFailover({
//     primarySupplier,        // any supplier exposing mintClientSecret
//     mintParams,             // params forwarded to mintClientSecret
//     allowFallback,          // boolean — caller decides policy
//     loadStubSupplier,       // async () => stub supplier instance
//   })
//   → {
//     minted,                 // the mintClientSecret result
//     supplierUsed,           // the supplier whose mint produced `minted`
//     fallbackReason,         // null on primary success; string on fallback
//     primaryKind,            // the primary supplier.kind (for logging)
//   }
//
// On primary failure with allowFallback=false: rethrows the original
// error. On primary failure with allowFallback=true: tries the stub.
// If the stub also fails, throws an error whose `.cause` is the
// original (primary) failure and `.code` is "supplier_fallback_failed".

const NON_FALLBACK_CODES = new Set([
  // 400-class — the caller asked for something we can't even attempt.
  "realtime_supplier_unknown_provider",
]);

function shouldAttemptFallback(allowFallback, err) {
  if (!allowFallback) return false;
  const code = err?.code || "";
  if (NON_FALLBACK_CODES.has(code)) return false;
  return true;
}

async function mintWithFailover({
  primarySupplier,
  mintParams,
  allowFallback = false,
  loadStubSupplier,
} = {}) {
  if (!primarySupplier || typeof primarySupplier.mintClientSecret !== "function") {
    const e = new Error("primarySupplier missing mintClientSecret");
    e.code = "realtime_supplier_invalid";
    throw e;
  }
  const primaryKind = String(primarySupplier.kind || "unknown");
  try {
    const minted = await primarySupplier.mintClientSecret(mintParams);
    return { minted, supplierUsed: primarySupplier, fallbackReason: null, primaryKind };
  } catch (err) {
    if (!shouldAttemptFallback(allowFallback, err)) throw err;
    if (typeof loadStubSupplier !== "function") {
      const e = new Error("loadStubSupplier callback required when allowFallback=true");
      e.code = "realtime_supplier_invalid";
      throw e;
    }
    let stubSupplier;
    try {
      stubSupplier = await loadStubSupplier();
    } catch (loadErr) {
      const e = new Error(`stub supplier load failed: ${loadErr?.message || loadErr}`);
      e.code = "supplier_fallback_failed";
      e.cause = err;
      throw e;
    }
    let stubMinted;
    try {
      stubMinted = await stubSupplier.mintClientSecret(mintParams);
    } catch (stubErr) {
      const e = new Error(`stub supplier mint failed: ${stubErr?.message || stubErr}`);
      e.code = "supplier_fallback_failed";
      e.cause = err;
      throw e;
    }
    return {
      minted: stubMinted,
      supplierUsed: stubSupplier,
      fallbackReason: err?.code || "realtime_supplier_request_failed",
      primaryKind,
    };
  }
}

export { mintWithFailover, shouldAttemptFallback, NON_FALLBACK_CODES };
