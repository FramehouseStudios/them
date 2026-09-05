// T-screenplay-export-formats-list-route — GET /screenplay/export/formats
//
// Discoverable list of supported export formats so iOS / API consumers
// don't have to hard-code the set or guess MIME types. Static config
// today (the formats are baked into the POST /screenplay/export route)
// but exposed as a queryable contract so a future "register dynamic
// exporter" refactor can ship without breaking the consumer side.

const SCREENPLAY_EXPORT_FORMATS_SCHEMA_VERSION = 1;

// Mirror of the format branches in backend/index.js's POST
// /screenplay/export. Keep this in lockstep with that route — the
// snapshot test for /screenplay/export/formats (T-screenplay-export-formats-list-route)
// pins the canonical set so any divergence fails loudly.
const SUPPORTED_FORMATS = Object.freeze([
  Object.freeze({
    format: "fountain",
    extension: "fountain",
    mediaType: "text/plain; charset=utf-8",
    description: "Fountain plain-text screenplay format",
    supported: true,
  }),
  Object.freeze({
    format: "txt",
    extension: "fountain",
    mediaType: "text/plain; charset=utf-8",
    description: "Alias of fountain (.fountain filename)",
    supported: true,
  }),
  Object.freeze({
    format: "fdx",
    extension: "fdx",
    mediaType: "application/vnd.final-draft",
    description: "Final Draft XML",
    supported: true,
  }),
  Object.freeze({
    format: "md",
    extension: "md",
    mediaType: "text/markdown; charset=utf-8",
    description: "Markdown projection (H2 slug, bold character, italic parenthetical, blockquote transition)",
    supported: true,
  }),
  Object.freeze({
    format: "markdown",
    extension: "md",
    mediaType: "text/markdown; charset=utf-8",
    description: "Alias of md",
    supported: true,
  }),
  Object.freeze({
    format: "pdf",
    extension: "pdf",
    mediaType: "application/pdf",
    description: "Courier 12 on Letter with MORE/CONT'D page breaks and an optional title page",
    supported: true,
  }),
]);

function mountScreenplayExportFormatsRoute(app) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountScreenplayExportFormatsRoute requires an Express app");
  }
  app.get("/screenplay/export/formats", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      schemaVersion: SCREENPLAY_EXPORT_FORMATS_SCHEMA_VERSION,
      formats: SUPPORTED_FORMATS,
      defaultFormat: "fountain",
    });
  });
}

export {
  mountScreenplayExportFormatsRoute,
  SUPPORTED_FORMATS,
  SCREENPLAY_EXPORT_FORMATS_SCHEMA_VERSION,
};
