// T-fountain-export-endpoint — POST /screenplay/export/fountain
//
// Two response formats:
//   - default (no `Accept` header magic): JSON envelope
//     `{ schemaVersion: 1, fountain: "<text>" }`
//   - `Accept: text/plain` or `?format=text`: raw Fountain body with
//     a `Content-Disposition: attachment` header so it downloads as
//     `<title-or-screenplay>.fountain`.
//
// Validates that `screenplay.scenes` is an array; rejects with 400
// `craft_invalid_screenplay` otherwise. Empty scenes is fine — title-
// only screenplays are a valid Fountain document.

import { exportToFountain } from "./fountain_export.js";

function sanitizeFilenameBase(raw) {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s.replace(/[^A-Za-z0-9 ._-]/g, "_").trim().slice(0, 80);
  return cleaned || "screenplay";
}

function mountFountainExportRoute(app) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountFountainExportRoute requires an Express app");
  }

  app.post("/screenplay/export/fountain", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const body = req.body || {};
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "craft_invalid_screenplay", message: "body required" });
    }
    if (body.scenes !== undefined && !Array.isArray(body.scenes)) {
      return res.status(400).json({ error: "craft_invalid_screenplay", message: "scenes must be an array" });
    }
    let fountain;
    try {
      fountain = exportToFountain(body);
    } catch (e) {
      return res.status(500).json({
        error: "fountain_export_failed",
        message: e?.message || "export failed",
      });
    }
    const wantsText = String(req.query?.format || "").toLowerCase() === "text"
      || /text\/plain/i.test(String(req.get?.("accept") || ""));
    if (wantsText) {
      const filenameBase = sanitizeFilenameBase(body?.title?.title || "screenplay");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filenameBase}.fountain"`,
      );
      return res.status(200).send(fountain);
    }
    return res.status(200).json({ schemaVersion: 1, fountain });
  });
}

export { mountFountainExportRoute, sanitizeFilenameBase };
