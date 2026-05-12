// T-fdx-export-endpoint — POST /screenplay/export/fdx
//
// Two response formats (mirrors the Fountain export route):
//   - default: JSON envelope `{ schemaVersion, fdx: "<xml>" }`
//   - `Accept: application/xml` / `Accept: text/xml` / `?format=xml`:
//     raw FDX body with `Content-Disposition: attachment` so it
//     downloads as `<title-or-screenplay>.fdx`.
//
// The route mounts its OWN JSON body parser (Codex review on #90)
// so it works the same way whether the parent app installs a global
// express.json() middleware or not. This is the production-style
// pattern — every route that needs JSON body parses it locally.

import express from "express";

import { exportToFDX } from "./fdx_export.js";

const FDX_BODY_LIMIT = "2mb";

function sanitizeFilenameBase(raw) {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s.replace(/[^A-Za-z0-9 ._-]/g, "_").trim().slice(0, 80);
  return cleaned || "screenplay";
}

function mountFDXExportRoute(app) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountFDXExportRoute requires an Express app");
  }

  app.post(
    "/screenplay/export/fdx",
    // Route-local JSON parser. Two reasons:
    //   1. The route can't assume a global express.json() is wired —
    //      production index.js does not install one universally.
    //   2. A 2MB cap is screenplay-sized; we don't want the global
    //      cap (whatever it is) accidentally widening here.
    express.json({ limit: FDX_BODY_LIMIT }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const body = req.body || {};
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "craft_invalid_screenplay", message: "body required" });
      }
      if (body.scenes !== undefined && !Array.isArray(body.scenes)) {
        return res.status(400).json({ error: "craft_invalid_screenplay", message: "scenes must be an array" });
      }
      let fdx;
      try {
        fdx = exportToFDX(body);
      } catch (e) {
        return res.status(500).json({
          error: "fdx_export_failed",
          message: e?.message || "export failed",
        });
      }
      const wantsXml = String(req.query?.format || "").toLowerCase() === "xml"
        || /(application|text)\/xml/i.test(String(req.get?.("accept") || ""));
      if (wantsXml) {
        const filenameBase = sanitizeFilenameBase(body?.title?.title || "screenplay");
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filenameBase}.fdx"`,
        );
        return res.status(200).send(fdx);
      }
      return res.status(200).json({ schemaVersion: 1, fdx });
    },
  );
}

export { mountFDXExportRoute, sanitizeFilenameBase, FDX_BODY_LIMIT };
