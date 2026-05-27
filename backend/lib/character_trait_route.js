// T-trait-library — POST /memory/character-trait + GET /memory/character-traits
//
// Records and surfaces the per-character voice/trait inventory built
// by `trait_library.js`. The persisted shape lives on each
// `creative_memory.characters[]` record under `.traits` so the
// existing prompt-assembly path picks it up automatically.
//
// Endpoints
//
//   POST /memory/character-trait
//     Request:
//       character_name | characterName   string (required)
//       lines          string[]?         dialogue lines used for extraction
//       hint           { keywords?, goals?, relationships? }?
//       traits         Traits?           pre-extracted traits to merge directly
//     Response:
//       { ok, action: "recorded"|"updated"|"skipped", characterName, traits }
//
//   GET /memory/character-traits?characterName=<name>
//     Returns one character's record `{ name, traits }`, or the full
//     library array when `characterName` is omitted.
//
// Auth mirrors the other /memory user-data routes: trusted auth identity
// is required, and caller-supplied X-User-Id is never trusted.

import express from "express";

import { defaultResolveMemoryUserId, memoryAuthRequired } from "./memory_route_auth.js";
import { extractTraits, mergeTraits } from "./trait_library.js";

const MAX_NAME_LENGTH = 64;
// T-route-local-parsers / Codex #90: every backend route that reads
// req.body mounts its own express.json() so the production-style
// test path doesn't depend on an upstream app-level parser. The
// limit matches what was implicit before (default 100kb).
const CHARACTER_TRAIT_BODY_LIMIT = "256kb";

function sanitizeName(raw) {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/[^A-Za-z0-9 .'-]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

function pickFirstString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length) return c;
  }
  return "";
}

function mountCharacterTraitRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveMemoryUserId,
} = {}) {
  if (!app || typeof app.post !== "function" || typeof app.get !== "function") {
    throw new Error("mountCharacterTraitRoute requires an Express app");
  }
  if (!creativeMemoryStore
    || typeof creativeMemoryStore.recordCharacterMention !== "function"
    || typeof creativeMemoryStore.getCharacterTraits !== "function"
  ) {
    throw new Error("mountCharacterTraitRoute requires a creativeMemoryStore with trait support");
  }

  app.post("/memory/character-trait", express.json({ limit: CHARACTER_TRAIT_BODY_LIMIT }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const body = req.body || {};
    const characterName = sanitizeName(
      pickFirstString(body.character_name, body.characterName),
    );
    if (!characterName) {
      return res.status(400).json({
        ok: false,
        action: "rejected",
        characterName: "",
        traits: null,
        error: "invalid_character_name",
      });
    }
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({
        ok: false,
        action: "rejected",
        characterName,
        traits: null,
        error: "user_auth_required",
      });
    }
    try {
      // Two routes into a trait delta:
      //   1. Pre-extracted `traits` shape in the body (Codex iOS may
      //      compute traits client-side from rendered dialogue).
      //   2. `lines` (+ optional `hint`) → run extractTraits server-side.
      // If both are present, the explicit `traits` wins and lines are
      // merged on top so caller-asserted facts don't get overwritten by
      // extractor inference.
      const supplied = body.traits && typeof body.traits === "object" && !Array.isArray(body.traits)
        ? body.traits
        : null;
      const extracted = Array.isArray(body.lines)
        ? extractTraits({ characterName, lines: body.lines, hint: body.hint || null })
        : null;
      const merged = supplied && extracted
        ? mergeTraits(extracted, supplied)
        : (supplied || extracted || null);
      if (!merged) {
        return res.status(400).json({
          ok: false,
          action: "rejected",
          characterName,
          traits: null,
          error: "no_trait_payload",
        });
      }
      const result = await creativeMemoryStore.recordCharacterMention({
        userId,
        characterName,
        traits: merged,
      });
      const persisted = await creativeMemoryStore.getCharacterTraits({
        userId,
        characterName,
      });
      return res.status(200).json({
        ok: Boolean(result && result.ok),
        action: String(result?.action || "recorded"),
        characterName,
        traits: persisted ? persisted.traits : merged,
      });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        action: "error",
        characterName,
        traits: null,
        error: e?.message || "character_trait_failed",
      });
    }
  });

  app.get("/memory/character-traits", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json(memoryAuthRequired("memory_character_traits"));
    }
    const characterName = typeof req.query?.characterName === "string"
      ? req.query.characterName
      : typeof req.query?.character_name === "string"
        ? req.query.character_name
        : "";
    try {
      const data = await creativeMemoryStore.getCharacterTraits({
        userId,
        characterName: characterName || null,
      });
      if (!data) {
        return res.status(200).json({
          schemaVersion: 1,
          userId,
          characters: [],
        });
      }
      if (Array.isArray(data)) {
        return res.status(200).json({
          schemaVersion: 1,
          userId,
          characters: data,
        });
      }
      return res.status(200).json({
        schemaVersion: 1,
        userId,
        characters: [data],
      });
    } catch (e) {
      return res.status(500).json({
        schemaVersion: 1,
        userId,
        characters: [],
        error: e?.message || "character_traits_failed",
      });
    }
  });
}

export { mountCharacterTraitRoute };
