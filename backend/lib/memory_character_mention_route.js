// T30 — POST /memory/record-character-mention
//
// Unblocks Codex PR #50 (T29 iOS reply-side character mentions). The
// iOS hook posts rendered screenplay character cues from authoritative
// page writes; this route persists each one through the canonical
// `creativeMemoryStore.recordCharacterMention(...)` path so reply-side
// mentions land in the same record as user-input mentions but tagged
// with their source.
//
// Contract (matches `BackendMemoryAPI.characterMentionPayload` in PR #50):
//
//   Request JSON (snake_case and camelCase both accepted for the name):
//     character_name   string       (required, alternative to characterName)
//     characterName    string       (required, alternative to character_name)
//     voice            string?      passed through to the character record
//     tags             string[]?    merged into the character record
//     source           string?      defaults to "ios_screenplay_render"
//     write_id         string?      persisted under metadata.screenplay_write_id
//     line             number?      persisted under metadata.line
//     metadata         object?      shallow-merged into the character record;
//                                   accepts screenplay_write_id / _project_id /
//                                   _version_id
//
//   Response JSON (matches the iOS `BackendCharacterMentionReceipt` decoder
//   which is camelCase by default):
//     { ok: boolean, action: "recorded" | "updated" | "skipped",
//       characterName: string, source: string }
//
// Auth: the route resolves `userId` via the supplied `resolveUserId`
// callback. In production this reads the auth middleware's `req.user.id`
// (same pattern as `recordCreativeMemoryTriggersForRequest` in
// `backend/index.js`). Tests can inject any callback. When no user
// resolves, the response still returns `ok: false, action: "skipped"`
// rather than 401 — matches the existing creative-memory write triggers
// which silently no-op for unauthenticated turns.

const MAX_NAME_LENGTH = 64;
const MAX_SOURCE_LENGTH = 64;
const MAX_TAGS = 16;
const MAX_TAG_LENGTH = 64;
const MAX_METADATA_VALUE_LENGTH = 128;

function pickFirstString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length) return c;
  }
  return "";
}

function sanitizeName(raw) {
  if (typeof raw !== "string") return "";
  // Keep letters, digits, spaces, periods, apostrophes, and hyphens so
  // screenplay cues like "JUNE", "GUARD 2", "MARY-ANNE", "O'BRIEN", and
  // "MR. WHITE" round-trip. Anything outside that set (control chars,
  // brackets, quotes, etc.) is collapsed to a single space.
  const cleaned = raw.replace(/[^A-Za-z0-9 .'-]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

function sanitizeSource(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Constrain to identifier-friendly characters so we never see a
  // freeform user string here. iOS sends `ios_screenplay_render`.
  const cleaned = trimmed.replace(/[^A-Za-z0-9_.:-]/g, "_");
  return cleaned.slice(0, MAX_SOURCE_LENGTH);
}

function sanitizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const trimmed = t.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, MAX_TAG_LENGTH));
    if (out.length >= MAX_TAGS) break;
  }
  return [...new Set(out)];
}

function sanitizeMetadata({ rawMetadata, writeId, line, source }) {
  const meta = {};
  if (rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)) {
    if (typeof rawMetadata.screenplay_write_id === "string" && rawMetadata.screenplay_write_id.trim()) {
      meta.screenplay_write_id = rawMetadata.screenplay_write_id.trim().slice(0, MAX_METADATA_VALUE_LENGTH);
    }
    if (typeof rawMetadata.screenplay_project_id === "string" && rawMetadata.screenplay_project_id.trim()) {
      meta.screenplay_project_id = rawMetadata.screenplay_project_id.trim().slice(0, MAX_METADATA_VALUE_LENGTH);
    }
    if (typeof rawMetadata.screenplay_version_id === "string" && rawMetadata.screenplay_version_id.trim()) {
      meta.screenplay_version_id = rawMetadata.screenplay_version_id.trim().slice(0, MAX_METADATA_VALUE_LENGTH);
    }
    if (Number.isFinite(rawMetadata.line)) {
      meta.line = Math.max(0, Math.floor(Number(rawMetadata.line)));
    }
  }
  // Top-level write_id / line override metadata fields when supplied, so
  // the iOS payload's mirrored fields and metadata fields stay consistent
  // without duplicating sanitization at the caller.
  if (typeof writeId === "string" && writeId.trim() && !meta.screenplay_write_id) {
    meta.screenplay_write_id = writeId.trim().slice(0, MAX_METADATA_VALUE_LENGTH);
  }
  if (Number.isFinite(line) && meta.line === undefined) {
    meta.line = Math.max(0, Math.floor(Number(line)));
  }
  if (source) meta.source = source;
  return Object.keys(meta).length ? meta : null;
}

function defaultResolveUserId(req) {
  return (
    (req && req.user && req.user.id) ||
    (req && req.authUser && req.authUser.id) ||
    (req && req.userId) ||
    (req && typeof req.get === "function" ? req.get("X-User-Id") : null) ||
    null
  );
}

function mountMemoryCharacterMentionRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveUserId,
} = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountMemoryCharacterMentionRoute requires an Express app");
  }
  if (!creativeMemoryStore || typeof creativeMemoryStore.recordCharacterMention !== "function") {
    throw new Error("mountMemoryCharacterMentionRoute requires a creativeMemoryStore");
  }

  app.post("/memory/record-character-mention", async (req, res) => {
    const body = req.body || {};
    const characterName = sanitizeName(
      pickFirstString(body.character_name, body.characterName),
    );
    if (!characterName) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({
        ok: false,
        action: "rejected",
        characterName: "",
        source: "",
        error: "invalid_character_name",
      });
    }

    const source = sanitizeSource(body.source) || "ios_screenplay_render";
    const tags = sanitizeTags(body.tags);
    const voice = typeof body.voice === "string" ? body.voice.trim().slice(0, 64) : "";
    const writeId = typeof body.write_id === "string"
      ? body.write_id
      : typeof body.writeId === "string"
        ? body.writeId
        : "";
    const lineRaw = Number.isFinite(body.line) ? body.line : Number(body.line);
    const line = Number.isFinite(lineRaw) ? lineRaw : null;
    const metadata = sanitizeMetadata({
      rawMetadata: body.metadata,
      writeId,
      line,
      source,
    });

    const userId = resolveUserId(req);
    res.setHeader("Cache-Control", "no-store");

    if (!userId) {
      // Match the existing creative-memory write triggers: never 401 a
      // best-effort memory write. Return a typed receipt so iOS can log
      // and move on.
      return res.status(200).json({
        ok: false,
        action: "skipped",
        characterName,
        source,
      });
    }

    try {
      const result = await creativeMemoryStore.recordCharacterMention({
        userId,
        characterName,
        voice,
        tags,
        source,
        metadata,
      });
      return res.status(200).json({
        ok: Boolean(result && result.ok),
        action: String(result?.action || "recorded"),
        characterName,
        source,
      });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        action: "error",
        characterName,
        source,
        error: e?.message || "record_character_mention_failed",
      });
    }
  });
}

export {
  mountMemoryCharacterMentionRoute,
  sanitizeName as _sanitizeName,
  sanitizeSource as _sanitizeSource,
  sanitizeTags as _sanitizeTags,
  sanitizeMetadata as _sanitizeMetadata,
};
