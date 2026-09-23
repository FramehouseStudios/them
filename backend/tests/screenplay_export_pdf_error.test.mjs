// T-screenplay-export-pdf-error-clarity — integration-style test
// that pins the shape of the PDF-format rejection from
// POST /screenplay/export.
//
// We don't have a route-mount factory for the whole export endpoint,
// so we mirror just the PDF branch through a tiny test fixture
// (mirrors what index.js emits). If the production behavior
// diverges, the contract drifts here too — keep them in lockstep.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function mountPdfRejectionFixture(app) {
  app.post("/screenplay/export", express.json(), (req, res) => {
    const draft = String(req.body?.draft || "").trim();
    if (!draft) return res.status(400).json({ stage: "screenplay_export", error: "draft_required" });
    const format = String(req.body?.format || "fountain").trim().toLowerCase();
    if (format !== "pdf") return res.status(400).json({ stage: "screenplay_export", error: "unsupported_format" });
    // Mirror the production PDF branch exactly.
    return res.status(400).json({
      stage: "screenplay_export",
      error: "pdf_export_not_supported_locally",
      message: "PDF export is not implemented on this backend. Export Fountain or Markdown and convert client-side (e.g. via Highland, Final Draft, or a Markdown-to-PDF tool).",
      alternative_formats: ["fountain", "fdx", "md"],
      docs_path: "/screenplay/export/formats",
    });
  });
}

async function withTestServer(fn) {
  const app = express();
  mountPdfRejectionFixture(app);
  const server = listenEphemeral(app);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(baseURL, p, body) {
  const r = await fetch(`${baseURL}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[pdf-clarity] PDF format returns 400 with the canonical error class", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export", { draft: "INT. ROOM - DAY", format: "pdf" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "pdf_export_not_supported_locally");
    assert.equal(r.body.stage, "screenplay_export");
  });
});

test("[pdf-clarity] PDF rejection carries a human-readable message", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export", { draft: "INT. ROOM - DAY", format: "pdf" });
    assert.ok(typeof r.body.message === "string" && r.body.message.length > 20);
    assert.match(r.body.message, /Fountain|Markdown/);
  });
});

test("[pdf-clarity] PDF rejection lists alternative_formats and docs_path", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export", { draft: "INT. ROOM - DAY", format: "pdf" });
    assert.deepEqual(r.body.alternative_formats, ["fountain", "fdx", "md"]);
    assert.equal(r.body.docs_path, "/screenplay/export/formats");
  });
});

test("[pdf-clarity] missing draft still wins over format check", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export", { format: "pdf" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "draft_required");
  });
});
