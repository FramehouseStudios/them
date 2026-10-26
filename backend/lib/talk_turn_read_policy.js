// User ownership is authoritative. Session/IP compatibility applies only to
// genuinely ownerless legacy turns, never after an authenticated-user mismatch.
export function createTalkTurnReadPolicy({ clientIp, normalizeClientIp, normalizeClientToken }) {
  return function canReadTalkTurnMeta(req, meta) {
    if (!meta || typeof meta !== 'object') return false;
    const owner = String(meta.userId || '').trim();
    const reader = String(req.authUser?.id || req.userId || '').trim();
    if (owner) return Boolean(reader) && owner === reader;
    const session = String(meta.sessionId || '').trim();
    if (!session) return false;
    const token = normalizeClientToken(req.get('X-Client-Token'));
    if (token && session === token) return true;
    return session.startsWith('ip:') && session === `ip:${normalizeClientIp(clientIp(req))}`;
  };
}
