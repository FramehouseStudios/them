// D008 mid-flight Page abort helpers.
// Thin seam so talk_handler can gate + pass AbortSignal without a rewrite.

const PAGE_CANCELLED_CODE = "page_generation_cancelled";

function createPageCancelledError({
  reason = "cancelled",
  reservationId = null,
  status = 409,
} = {}) {
  const err = new Error("Page generation cancelled");
  err.name = "AbortError";
  err.code = PAGE_CANCELLED_CODE;
  err.status = Number(status) || 409;
  err.cancelled = true;
  err.cancelReason = String(reason || "cancelled");
  err.reservationId = reservationId ? String(reservationId) : null;
  err.stage = "chat";
  err.errorClass = PAGE_CANCELLED_CODE;
  return err;
}

function isPageCancelledError(err) {
  if (!err || typeof err !== "object") return false;
  return (
    err.cancelled === true ||
    err.code === PAGE_CANCELLED_CODE ||
    err.errorClass === PAGE_CANCELLED_CODE
  );
}

/**
 * Before billed generation: require proceed() + non-aborted signal.
 * Returns { ok, signal, reservationId } or throws createPageCancelledError.
 */
function gatePageGeneration(clementine) {
  if (!clementine || !clementine.reservationId) {
    return { ok: true, signal: null, reservationId: null };
  }
  const reservationId = String(clementine.reservationId);
  const gate =
    typeof clementine.proceed === "function"
      ? clementine.proceed()
      : { ok: true, reservation: null };
  if (!gate || gate.ok === false) {
    throw createPageCancelledError({
      reason: gate?.reservation?.cancelReason || "cancelled",
      reservationId,
    });
  }
  const signal = clementine.abortSignal || null;
  if (signal?.aborted) {
    const reason =
      (typeof signal.reason === "string" && signal.reason) ||
      gate?.reservation?.cancelReason ||
      "cancelled";
    throw createPageCancelledError({ reason, reservationId });
  }
  return { ok: true, signal, reservationId };
}

/**
 * Map a fetch AbortError to page-cancelled when the page signal fired.
 * Timeout aborts (no page signal / not aborted) stay as caller timeouts.
 */
function mapAbortToPageCancel(err, signal, { reservationId = null } = {}) {
  if (!err) return err;
  const isAbort =
    err.name === "AbortError" ||
    err.code === "ABORT_ERR" ||
    isPageCancelledError(err);
  if (!isAbort) return err;
  if (isPageCancelledError(err)) return err;
  if (signal?.aborted) {
    const reason =
      (typeof signal.reason === "string" && signal.reason) || "cancelled";
    return createPageCancelledError({ reason, reservationId });
  }
  return err;
}

export {
  PAGE_CANCELLED_CODE,
  createPageCancelledError,
  isPageCancelledError,
  gatePageGeneration,
  mapAbortToPageCancel,
};
