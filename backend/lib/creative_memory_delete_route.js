// T-creative-memory-delete-endpoint — DELETE /memory/forget
//
// Companion to GET /memory/export (PR #94). Completes the data-control
// loop: a user can ask io.them to forget everything it remembers about
// them. Wipes the creative_memory record for the requesting user.
//
// Idempotent: missing record → 200 with deleted: false.
// Unauthenticated → 200 with deleted: false (matches the rest of
// /memory/* read endpoints; never 401 on a forget request).
//
// Response shape:
//   { schemaVersion: 1, ok: boolean, deleted: boolean, userId: string|null, deletedAt: ISO }
//
// Out of scope (intentional V1 limits):
//   - per-project artifacts (loglines, accepted twists) — those live
//     in separate domains keyed by projectId. Adding a project sweep
//     is a small follow-up that takes a `?includeProjectIds=` param,
//     mirroring the export endpoint's `?projectIds=` shape.

function defaultResolveUserId(req) {
  return (
    (req && req.user && req.user.id) ||
    (req && req.authUser && req.authUser.id) ||
    (req && req.userId) ||
    (req && typeof req.get === "function" ? req.get("X-User-Id") : null) ||
    null
  );
}

function mountCreativeMemoryDeleteRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveUserId,
} = {}) {
  if (!app || typeof app.delete !== "function") {
    throw new Error("mountCreativeMemoryDeleteRoute requires an Express app");
  }
  if (!creativeMemoryStore || typeof creativeMemoryStore.deleteMemoryForUser !== "function") {
    throw new Error("mountCreativeMemoryDeleteRoute requires a creativeMemoryStore with deleteMemoryForUser");
  }

  app.delete("/memory/forget", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const deletedAt = new Date().toISOString();
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(200).json({
        schemaVersion: 1,
        ok: false,
        deleted: false,
        userId: null,
        reason: "missing_userId",
        deletedAt,
      });
    }
    try {
      const result = await creativeMemoryStore.deleteMemoryForUser(userId);
      return res.status(200).json({
        schemaVersion: 1,
        ok: Boolean(result?.ok),
        deleted: Boolean(result?.deleted),
        reason: result?.reason || null,
        userId,
        deletedAt,
      });
    } catch (e) {
      return res.status(500).json({
        schemaVersion: 1,
        ok: false,
        deleted: false,
        userId,
        error: e?.message || "creative_memory_delete_failed",
        deletedAt,
      });
    }
  });
}

export { mountCreativeMemoryDeleteRoute };
