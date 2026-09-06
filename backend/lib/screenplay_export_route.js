// D009 — POST /screenplay/export, extracted from backend/index.js.
//
// One draft in, one file out. Formats:
//   fountain | txt  -> text/plain           <title>.fountain
//   fdx             -> Final Draft XML       <title>.fdx   (line-typed via the
//                      same paragraphTypeForLine the Markdown export uses)
//   md | markdown   -> text/markdown         <title>.md    (respondScreenplayMarkdown)
//   pdf             -> application/pdf       <title>.pdf   (respondScreenplayPDF)
//
// Errors keep the { stage: "screenplay_export", error } shape iOS maps:
//   400 draft_required, 400 unsupported_format, 500 pdf_export_failed.
//
// The route mounts its own JSON parser (2 MB, screenplay-sized) so it works
// whether or not the app installs a global express.json().

import express from "express";

import { normalizeSnippet, slugifyForFilename } from "./utils.js";
import { paragraphTypeForLine, respondScreenplayMarkdown } from "./screenplay_markdown_export.js";
import { respondScreenplayPDF } from "./screenplay_pdf_export.js";

const SCREENPLAY_EXPORT_BODY_LIMIT = "2mb";

function escapeXmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Pure: Fountain-style draft text -> minimal Final Draft XML (v1 shape). */
function screenplayDraftToFDX(draft) {
  let previousType = null;
  const paragraphs = [];
  for (const line of String(draft || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      previousType = null;
      continue;
    }
    const type = paragraphTypeForLine(trimmed, previousType);
    if (!type) continue;
    paragraphs.push(`    <Paragraph Type="${type}"><Text>${escapeXmlText(line)}</Text></Paragraph>`);
    previousType = type;
  }
  const body = paragraphs.join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">\n  <Content>\n${body}\n  </Content>\n</FinalDraft>\n`;
}

function handleScreenplayExport(req, res) {
  const draft = String(req.body?.draft || "").replace(/\r\n/g, "\n").trim();
  if (!draft) {
    return res.status(400).json({ stage: "screenplay_export", error: "draft_required" });
  }
  const format = String(req.body?.format || "fountain").trim().toLowerCase();
  const title = normalizeSnippet(req.body?.title, 160) || "screenplay";
  const baseName = slugifyForFilename(title, "screenplay");
  if (format === "fountain" || format === "txt") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.fountain"`);
    return res.status(200).send(`${draft}\n`);
  }
  if (format === "fdx") {
    res.setHeader("Content-Type", "application/vnd.final-draft");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.fdx"`);
    return res.status(200).send(screenplayDraftToFDX(draft));
  }
  if (format === "pdf") {
    // A title page is only rendered when the caller sent a title; the
    // filename fallback "screenplay" never becomes one.
    const explicitTitle = normalizeSnippet(req.body?.title, 160) || "";
    const draftDate = normalizeSnippet(req.body?.draft_date, 40) || "";
    try {
      return respondScreenplayPDF(res, { draft, title: explicitTitle, baseName, draftDate });
    } catch (e) {
      return res.status(500).json({
        stage: "screenplay_export",
        error: "pdf_export_failed",
        message: e?.message || "export failed",
      });
    }
  }
  if (format === "md" || format === "markdown") {
    return respondScreenplayMarkdown(res, { draft, baseName });
  }
  return res.status(400).json({ stage: "screenplay_export", error: "unsupported_format" });
}

function mountScreenplayExportRoute(app) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountScreenplayExportRoute requires an Express app");
  }
  app.post("/screenplay/export", express.json({ limit: SCREENPLAY_EXPORT_BODY_LIMIT }), handleScreenplayExport);
}

export {
  mountScreenplayExportRoute,
  handleScreenplayExport,
  screenplayDraftToFDX,
  escapeXmlText,
  SCREENPLAY_EXPORT_BODY_LIMIT,
};
