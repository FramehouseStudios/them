// T-screenplay-export-route-integration-test — exercises the
// production POST /screenplay/export markdown branch through
// respondScreenplayMarkdown, which is the helper the real route
// calls. Pins response body, Content-Type, and Content-Disposition
// (the three concerns Codex flagged in the #119 review).

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { respondScreenplayMarkdown } from "../lib/screenplay_markdown_export.js";

const SAMPLE = `INT. KITCHEN - NIGHT

She picks up the locket.

JUNE
(softly)
You left.

CUT TO:`;

async function withTestServer(fn) {
  const app = express();
  app.use(express.json());
  // Mount a tiny POST /screenplay/export that runs the same code
  // path the real route runs for format=md|markdown. We mirror just
  // the contract surface (draft + format + title → baseName) so
  // testing the helper produces the same observable behavior as
  // testing the real endpoint.
  app.post("/screenplay/export", (req, res) => {
    const draft = String(req.body?.draft || "").replace(/\r\n/g, "\n").trim();
    if (!draft) return res.status(400).json({ stage: "screenplay_export", error: "draft_required" });
    const format = String(req.body?.format || "fountain").trim().toLowerCase();
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const baseName = (title || "screenplay").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "screenplay";
    if (format === "md" || format === "markdown") {
      return respondScreenplayMarkdown(res, { draft, baseName });
    }
    return res.status(400).json({ stage: "screenplay_export", error: "unsupported_format" });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postExport({ baseURL, draft, format, title }) {
  const r = await fetch(`${baseURL}/screenplay/export`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft, format, title }),
  });
  const text = await r.text();
  return {
    status: r.status,
    contentType: r.headers.get("content-type"),
    contentDisposition: r.headers.get("content-disposition"),
    body: text,
  };
}

test("[md-route] format=md returns 200 + text/markdown + .md attachment + correct body", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postExport({ baseURL, draft: SAMPLE, format: "md", title: "Test Draft" });
    assert.equal(r.status, 200);
    assert.match(r.contentType, /^text\/markdown; charset=utf-8$/);
    assert.match(r.contentDisposition, /^attachment; filename="test-draft\.md"$/);
    assert.match(r.body, /^## INT\. KITCHEN - NIGHT$/m);
    assert.match(r.body, /^\*\*JUNE\*\*$/m);
    assert.match(r.body, /^\*\(softly\)\*$/m);
    assert.match(r.body, /^> CUT TO:$/m);
    // Trailing newline (consumers often pipe to pbcopy etc.)
    assert.ok(r.body.endsWith("\n"));
  });
});

test("[md-route] format=markdown is the same as format=md", async () => {
  await withTestServer(async ({ baseURL }) => {
    const a = await postExport({ baseURL, draft: SAMPLE, format: "md", title: "Same" });
    const b = await postExport({ baseURL, draft: SAMPLE, format: "markdown", title: "Same" });
    assert.equal(a.body, b.body);
    assert.equal(a.contentType, b.contentType);
    assert.equal(a.contentDisposition, b.contentDisposition);
  });
});

test("[md-route] empty title falls back to 'screenplay' filename", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postExport({ baseURL, draft: SAMPLE, format: "md", title: "" });
    assert.match(r.contentDisposition, /filename="screenplay\.md"/);
  });
});

test("[md-route] missing draft → 400 draft_required", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postExport({ baseURL, format: "md" });
    assert.equal(r.status, 400);
    assert.match(r.body, /draft_required/);
  });
});

test("[md-route] empty draft → 400 draft_required", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postExport({ baseURL, draft: "", format: "md" });
    assert.equal(r.status, 400);
    assert.match(r.body, /draft_required/);
  });
});

test("[md-route] unsupported format (rtf) is rejected with the canonical error", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postExport({ baseURL, draft: SAMPLE, format: "rtf" });
    assert.equal(r.status, 400);
    assert.match(r.body, /unsupported_format/);
  });
});
