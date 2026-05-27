// Shared auth resolver for screenplay project persistence routes.
//
// Caller-supplied X-User-Id is never trusted here. The auth middleware
// strips that header and attaches trusted identity to req.authUser/req.userId.

function defaultResolveScreenplayUserId(req) {
  const userId = String(
    req?.authUser?.id ||
    req?.user?.id ||
    req?.userId ||
    ""
  ).trim();
  return userId || null;
}

function screenplayAuthRequired(stage = "screenplay") {
  return {
    stage,
    error: "user_auth_required",
  };
}

function requireScreenplayUserId(req, res, {
  resolveUserId = defaultResolveScreenplayUserId,
  stage = "screenplay",
} = {}) {
  const userId = String(resolveUserId(req) || "").trim();
  if (userId) return userId;
  if (res && typeof res.setHeader === "function") {
    res.setHeader("Cache-Control", "no-store");
  }
  if (res && typeof res.status === "function") {
    res.status(401).json(screenplayAuthRequired(stage));
  }
  return "";
}

export {
  defaultResolveScreenplayUserId,
  screenplayAuthRequired,
  requireScreenplayUserId,
};
