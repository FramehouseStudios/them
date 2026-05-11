// T-screenplay-import-fountain — POST /screenplay/import/fountain
//
// Accepts a Fountain-formatted body either as:
//   - JSON `{ text: "<fountain body>" }`, or
//   - raw `text/plain` body (uploaded file).
//
// Returns the canonical screenplay shape T-fountain-export-endpoint
// consumes:
//   { schemaVersion: 1, screenplay: { title?, scenes: [...] } }

import { importFromFountain } from "./fountain_import.js";

function mountFountainImportRoute(app) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountFountainImportRoute requires an Express app");
  }

  // Two body parsers run in order so JSON callers + raw-text uploaders
  // both work. Each route picks whichever made it through.
  app.post(
    "/screenplay/import/fountain",
    (req, _res, next) => {
      // Reject ridiculous payloads early.
      const len = Number(req.headers["content-length"] || 0);
      if (Number.isFinite(len) && len > 4_000_000) {
        return next(new Error("payload_too_large"));
      }
      return next();
    },
    async (req, res, next) => {
      // Parse based on content-type.
      const ct = String(req.get("content-type") || "").toLowerCase();
      let text = null;
      if (ct.includes("application/json")) {
        await new Promise((resolve) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
              text = typeof body?.text === "string" ? body.text : null;
            } catch (_e) { text = null; }
            resolve();
          });
        });
      } else {
        // text/plain or unspecified — read raw body.
        await new Promise((resolve) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            text = Buffer.concat(chunks).toString("utf8");
            resolve();
          });
        });
      }
      res.setHeader("Cache-Control", "no-store");
      if (!text || !String(text).trim()) {
        return res.status(400).json({
          error: "craft_invalid_screenplay",
          message: "text is required (JSON {text} or raw text/plain body)",
        });
      }
      try {
        const screenplay = importFromFountain(text);
        return res.status(200).json({ schemaVersion: 1, screenplay });
      } catch (e) {
        if (e?.message === "payload_too_large") {
          return res.status(413).json({ error: "payload_too_large" });
        }
        return res.status(400).json({
          error: "craft_invalid_screenplay",
          message: e?.message || "fountain_import_failed",
        });
      }
    },
  );
}

export { mountFountainImportRoute };
