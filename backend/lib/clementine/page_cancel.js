// Page-lane reservation + cancel-on-barge-in (D008 skeleton).
//
// In-memory Map is enough for v0 unit tests / single-process. Production
// will move reservations behind the wallet store without changing this API.

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
   * Cancel in-flight Page work for a session (barge-in / manual typing).
   * Drops every non-cancelled reservation for that session.
   * Returns the dropped reservation ids.
   */
  function cancelOnBargeIn(sessionId, { reason = "barge_in" } = {}) {
    const sid = String(sessionId || "").trim();
    if (!sid) return [];
    const dropped = [];
    const ts = now();
    for (const [id, entry] of reservations) {
      if (entry.sessionId !== sid) continue;
      if (entry.status === "cancelled") continue;
      entry.status = "cancelled";
      entry.cancelledAt = ts;
      entry.cancelReason = String(reason || "barge_in");
      reservations.set(id, entry);
      dropped.push(id);
    }
    return dropped;
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
    cancelOnBargeIn,
    drop,
    clear,
    size,
  };
}

export {
  createPageReservationStore,
};
