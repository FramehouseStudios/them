// Turn numbers are session-local. Preserve every owner/session's result and
// never guess between two readable results when the original session is absent.
export function selectTalkTurnResult(entries, turnId, req, canRead, token = "") {
  const candidates = [...entries].filter((entry) => entry.turnId === turnId);
  if (!req) return candidates.length === 1 ? candidates[0] : null;
  const readable = candidates.filter((entry) => canRead(req, entry));
  const exact = token ? readable.find((entry) => entry.sessionId === token) : null;
  if (exact) return exact;
  if (readable.length === 1) return readable[0];
  // Keep the route's existing forbidden envelope when a result exists but
  // none is authorized. More than one authorized match is ambiguous, not safe.
  return readable.length === 0 ? candidates[0] ?? null : null;
}

export function canReadTalkTurnResult(req, meta, { ownerKey, ip, token, isProduction }) {
  if (!meta || typeof meta !== "object") return false;
  const owner = ownerKey(meta.userId);
  const caller = ownerKey(req.authUser?.id || req.user?.id || req.userId);
  // An owner-bound result cannot fall back to a shared/stale session token,
  // IP address, caller-supplied X-User-Id or the local debug convenience path.
  if (owner) return Boolean(caller && caller === owner);
  if (!isProduction && req.get("X-APP-TOKEN") === "them-dev"
      && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return true;
  const session = String(meta.sessionId || "").trim();
  if (!session) return false;
  if (token) return session === token || session === `ip:${ip}`;
  return session === `ip:${ip}`;
}
