// T-creative-memory-export — GET /memory/export (V1: core-only)
//
// Returns the requesting user's own creative-memory record as a single
// machine-readable JSON document. Foundation for privacy /
// data-portability: a user can ask for what io.them remembers about
// them and get a canonical answer.
//
// V1 SCOPE — CORE ONLY. This route returns ONLY data that is strictly
// scoped to the resolved user id:
//   - the raw creative_memory record
//   - derived character/trait records
//   - habits
//
// The earlier draft also accepted a `?projectIds=` query and returned
// per-project logline history + accepted twists. That expansion was
// REMOVED for V1: logline/twist stores are keyed by projectId with no
// owner scoping at the storage layer (ownership lives in
// screenplay_store via resolveScreenplayOwnerKey), so returning them by
// caller-supplied projectId is an IDOR in a privacy/data-control route.
// Re-introducing project-linked export requires an explicit
// screenplay-store ownership scoping design — tracked post-V1 in
// tasks/_proposals/T-creative-memory-export-projectids-ownership.md.
// Do not re-add projectIds here without that ownership model.
//
// Read-only. Unauthenticated requests return 200 with an empty record
// (matching the rest of /memory/*) — never another user's data.
//
// Response shape (V1, stable):
//
//   {
//     schemaVersion: 2,                 // bumped: projectIds fields removed
//     exportedAt: ISO timestamp,
//     userId: string | null,
//     creativeMemory: { ...raw creative_memory record } | null,
//     characters: [{ name, traits }],
//     habits: { ... } | null
//   }

function defaultResolveUserId(req) {
  return (
    (req && req.user && req.user.id) ||
    (req && req.authUser && req.authUser.id) ||
    (req && req.userId) ||
    (req && typeof req.get === "function" ? req.get("X-User-Id") : null) ||
    null
  );
}

function mountCreativeMemoryExportRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveUserId,
} = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountCreativeMemoryExportRoute requires an Express app");
  }
  if (!creativeMemoryStore
    || typeof creativeMemoryStore.getCreativeMemoryForPrompt !== "function"
    || typeof creativeMemoryStore.getCharacterTraits !== "function"
  ) {
    throw new Error("mountCreativeMemoryExportRoute requires a creativeMemoryStore");
  }

  function emptyExport(exportedAt) {
    return {
      schemaVersion: 2,
      exportedAt,
      userId: null,
      creativeMemory: null,
      characters: [],
      habits: null,
    };
  }

  app.get("/memory/export", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const exportedAt = new Date().toISOString();
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(200).json(emptyExport(exportedAt));
    }
    try {
      const memory = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
      const traitRecords = await creativeMemoryStore.getCharacterTraits({ userId });
      const characters = Array.isArray(traitRecords)
        ? traitRecords
        : (traitRecords ? [traitRecords] : []);
      return res.status(200).json({
        schemaVersion: 2,
        exportedAt,
        userId,
        creativeMemory: memory || null,
        characters,
        habits: memory?.habits || null,
      });
    } catch (e) {
      return res.status(500).json({
        schemaVersion: 2,
        exportedAt,
        userId,
        creativeMemory: null,
        characters: [],
        habits: null,
        error: e?.message || "creative_memory_export_failed",
      });
    }
  });
}

export { mountCreativeMemoryExportRoute };
