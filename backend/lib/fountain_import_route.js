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

// Hard cap on accepted payload size. Mirrors the value advertised in
// the route's documentation. Above this we reject route-locally so
// the response is a clean 413 JSON, not Express's default HTML error
// page or a generic 500 from a downstream handler.
const MAX_BODY_BYTES = 4_000_000;

function respondPayloadTooLarge(res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(413).json({
    error: "payload_too_large",
    max_bytes: MAX_BODY_BYTES,
  });
}

function mountFountainImportRoute(app) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountFountainImportRoute requires an Express app");
  }

  // Two body parsers run in order so JSON callers + raw-text uploaders
  // both work. Each route picks whichever made it through.
  app.post(
    "/screenplay/import/fountain",
    (req, res, next) => {
      // Reject oversized payloads route-locally so the response stays
      // a structured 413 JSON instead of falling through to Express's
      // default error handler. We check both the advertised
      // Content-Length AND enforce again at body-read time below (a
      // client can send no Content-Length and stream a huge body).
      const advertised = Number(req.headers["content-length"] || 0);
      if (Number.isFinite(advertised) && advertised > MAX_BODY_BYTES) {
        return respondPayloadTooLarge(res);
      }
      return next();
    },
    async (req, res) => {
      // Parse based on content-type. Stream-side cap so a client
      // can't bypass the Content-Length check by streaming.
      const ct = String(req.get("content-type") || "").toLowerCase();
      let text = null;
      let oversized = false;
      let received = 0;
      const readBody = () => new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => {
          received += c.length;
          if (received > MAX_BODY_BYTES) {
            oversized = true;
            // Stop accumulating; drain the rest silently.
            return;
          }
          chunks.push(c);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", () => resolve(Buffer.alloc(0)));
      });
      const buf = await readBody();
      if (oversized) {
        return respondPayloadTooLarge(res);
      }
      if (ct.includes("application/json")) {
        try {
          const body = JSON.parse(buf.toString("utf8") || "{}");
          text = typeof body?.text === "string" ? body.text : null;
        } catch (_e) { text = null; }
      } else {
        text = buf.toString("utf8");
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
        return res.status(400).json({
          error: "craft_invalid_screenplay",
          message: e?.message || "fountain_import_failed",
        });
      }
    },
  );
}

export { mountFountainImportRoute, MAX_BODY_BYTES };
