// Shared auth resolver for user-memory routes.
//
// Never read caller-supplied X-User-Id here. The auth middleware strips
// that header and writes trusted identity to req.authUser/req.userId.

function defaultResolveMemoryUserId(req) {
  const userId = String(
    req?.authUser?.id ||
    req?.user?.id ||
    req?.userId ||
    ""
  ).trim();
  return userId || null;
}

function memoryAuthRequired(stage = "memory") {
  return {
    stage,
    error: "user_auth_required",
  };
}

function requireMemoryUserId(req, res, {
  resolveUserId = defaultResolveMemoryUserId,
  stage = "memory",
} = {}) {
  const userId = String(resolveUserId(req) || "").trim();
  if (userId) return userId;
  if (res && typeof res.setHeader === "function") {
    res.setHeader("Cache-Control", "no-store");
  }
  if (res && typeof res.status === "function") {
    res.status(401).json(memoryAuthRequired(stage));
  }
  return "";
}

export {
  defaultResolveMemoryUserId,
  memoryAuthRequired,
  requireMemoryUserId,
};
