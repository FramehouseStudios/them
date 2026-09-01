// Page-lane reservation + cancel-on-barge-in (D008).
//
// In-memory Map is enough for v0 unit tests / single-process. Production
// will move reservations behind the wallet store without changing this API.
//
// Billing gate: call proceed(reservationId) before charging / calling Muse.
// Cancelled or missing reservations short-circuit (ok:false) — no bill path.

import { randomUUID } from "node:crypto";

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
    };
    reservations.set(id, entry);
    return { ...entry };
  }

  function get(reservationId) {
    const entry = reservations.get(String(reservationId || ""));
    return entry ? { ...entry } : null;
  }

  function listForSession(sessionId) {
    const sid = String(sessionId || "").trim();
    return [...reservations.values()]
      .filter((r) => r.sessionId === sid)
      .map((r) => ({ ...r }));
  }

  /**
   * Cancel one reservation by id. Idempotent: already-cancelled returns
   * the entry with cancelled:false (no-op). Missing → null.
   */
  function cancel(reservationId, { reason = "cancel" } = {}) {
    const id = String(reservationId || "");
    const entry = reservations.get(id);
    if (!entry) return null;
    if (entry.status === "cancelled") {
      return { ...entry, cancelled: false };
    }
    entry.status = "cancelled";
    entry.cancelledAt = now();
    entry.cancelReason = String(reason || "cancel");
    reservations.set(id, entry);
    return { ...entry, cancelled: true };
  }

  /**
   * Cancel in-flight Page work for a session (and optional owner).
   * Drops every non-cancelled matching reservation.
   * Returns the dropped reservation ids.
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
    for (const [id, entry] of reservations) {
      if (entry.sessionId !== sid) continue;
      if (entry.status === "cancelled") continue;
      if (uid && entry.userId && entry.userId !== uid) continue;
      entry.status = "cancelled";
      entry.cancelledAt = ts;
      entry.cancelReason = String(reason || "barge_in");
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
        reservation: { ...entry },
      };
    }
    return { ok: true, code: "ok", reservation: { ...entry } };
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
