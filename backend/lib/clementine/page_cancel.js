// Page-lane reservation + cancel-on-barge-in (D008).
//
// In-memory Map is enough for v0 unit tests / single-process. Production
// will move reservations behind the wallet store without changing this API.
//
// Billing gate: call proceed(reservationId) before charging / calling Muse.
// Cancelled or missing reservations short-circuit (ok:false) — no bill path.
//
// Mid-flight abort: each reservation owns an AbortController. cancel(id) /
// cancelByOwner abort the controller so in-progress generation can exit
// cleanly (talk_handler / muse_client pass getAbortSignal(id)).

import { randomUUID } from "node:crypto";

function createAbortController() {
  if (typeof AbortController !== "function") return null;
  try {
    return new AbortController();
  } catch (_e) {
    return null;
  }
}

function publicView(entry, extra = {}) {
  if (!entry) return null;
  const { abortController, ...rest } = entry;
  return {
    ...rest,
    aborted: Boolean(abortController?.signal?.aborted),
    ...extra,
  };
}

function abortEntry(entry, reason = "cancel") {
  const ac = entry?.abortController;
  if (!ac || ac.signal?.aborted) return false;
  try {
    ac.abort(String(reason || "cancel"));
  } catch (_e) {
    try {
      ac.abort();
    } catch (_e2) {
      /* ignore */
    }
  }
  return true;
}

function createPageReservationStore({ now = () => Date.now() } = {}) {
  /** @type {Map<string, object>} */
  const reservations = new Map();

  function reserve({
    sessionId,
    userId = "",
    maxOutputTokens = 0,
    reason = "page",
    meta = null,
  } = {}) {
    const sid = String(sessionId || "").trim();
    if (!sid) {
      const err = new Error("page reserve requires sessionId");
      err.code = "page_reserve_invalid";
      throw err;
    }
    const id = randomUUID();
    const entry = {
      id,
      sessionId: sid,
      userId: String(userId || "").trim(),
      maxOutputTokens: Math.max(0, Math.round(Number(maxOutputTokens) || 0)),
      reason: String(reason || "page"),
      status: "reserved",
      createdAt: now(),
      cancelledAt: null,
      cancelReason: null,
      meta: meta && typeof meta === "object" ? { ...meta } : null,
      abortController: createAbortController(),
    };
    reservations.set(id, entry);
    return publicView(entry);
  }

  function get(reservationId) {
    return publicView(reservations.get(String(reservationId || "")));
  }

  function getAbortSignal(reservationId) {
    const entry = reservations.get(String(reservationId || ""));
    return entry?.abortController?.signal || null;
  }

  function listForSession(sessionId) {
    const sid = String(sessionId || "").trim();
    return [...reservations.values()]
      .filter((r) => r.sessionId === sid)
      .map((r) => publicView(r));
  }

  /**
   * Cancel one reservation by id. Idempotent: already-cancelled returns
   * the entry with cancelled:false (no-op). Missing → null.
   * Aborts the reservation AbortController on first cancel.
   */
  function cancel(reservationId, { reason = "cancel" } = {}) {
    const id = String(reservationId || "");
    const entry = reservations.get(id);
    if (!entry) return null;
    if (entry.status === "cancelled") {
      return publicView(entry, { cancelled: false });
    }
    entry.status = "cancelled";
    entry.cancelledAt = now();
    entry.cancelReason = String(reason || "cancel");
    abortEntry(entry, entry.cancelReason);
    reservations.set(id, entry);
    return publicView(entry, { cancelled: true });
  }

  /**
   * Cancel in-flight Page work for a session (and optional owner).
   * Drops every non-cancelled matching reservation and aborts each
   * reservation AbortController. Returns the dropped reservation ids.
   */
  function cancelByOwner(
    { sessionId, userId = "" } = {},
    { reason = "barge_in" } = {}
  ) {
    const sid = String(sessionId || "").trim();
    if (!sid) return [];
    const uid = String(userId || "").trim();
    const dropped = [];
    const ts = now();
    const cancelReason = String(reason || "barge_in");
    for (const [id, entry] of reservations) {
      if (entry.sessionId !== sid) continue;
      if (entry.status === "cancelled") continue;
      if (uid && entry.userId && entry.userId !== uid) continue;
      entry.status = "cancelled";
      entry.cancelledAt = ts;
      entry.cancelReason = cancelReason;
      abortEntry(entry, cancelReason);
      reservations.set(id, entry);
      dropped.push(id);
    }
    return dropped;
  }

  /**
   * Cancel in-flight Page work for a session (barge-in / manual typing).
   * Alias of cancelByOwner({ sessionId }) for skeleton callers.
   */
  function cancelOnBargeIn(sessionId, { reason = "barge_in" } = {}) {
    return cancelByOwner({ sessionId }, { reason });
  }

  /**
   * Billing / expensive-work gate. Rejects cancelled or missing ids.
   * Callers must short-circuit when ok === false (no Muse call / no bill).
   */
  function proceed(reservationId) {
    const entry = reservations.get(String(reservationId || ""));
    if (!entry) {
      return { ok: false, code: "page_reservation_missing", reservation: null };
    }
    if (entry.status === "cancelled") {
      return {
        ok: false,
        code: "page_reservation_cancelled",
        reservation: publicView(entry),
      };
    }
    return { ok: true, code: "ok", reservation: publicView(entry) };
  }

  function drop(reservationId) {
    return reservations.delete(String(reservationId || ""));
  }

  function clear() {
    reservations.clear();
  }

  function size() {
    return reservations.size;
  }

  return {
    reserve,
    get,
    getAbortSignal,
    listForSession,
    cancel,
    cancelByOwner,
    cancelOnBargeIn,
    proceed,
    drop,
    clear,
    size,
  };
}

export {
  createPageReservationStore,
};
