// D009 — POST /screenplay/export mounted from lib/screenplay_export_route.js.
// Exercises the real module (the older fixture tests mirror it; this one runs it).

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountScreenplayExportRoute,
  screenplayDraftToFDX,
  escapeXmlText,
} from "../lib/screenplay_export_route.js";

const DRAFT = `INT. KITCHEN - NIGHT

Maya crosses to the table.

MAYA
(quietly)
We need to talk.

CUT TO:`;

async function withTestServer(fn) {
  const app = express();
  mountScreenplayExportRoute(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(baseURL, body) {
  const r = await fetch(`${baseURL}/screenplay/export`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: Object.fromEntries(r.headers), buf, text: buf.toString("utf8") };
}

test("[export-route] mount requires an Express app", () => {
  assert.throws(() => mountScreenplayExportRoute(null));
});

test("[export-route] fountain/txt stream the draft as a .fountain attachment", async () => {
  await withTestServer(async ({ baseURL }) => {
    for (const format of ["fountain", "txt", undefined]) {
      const r = await post(baseURL, { draft: DRAFT, title: "Kitchen Scene", format });
      assert.equal(r.status, 200, `format=${format}`);
      assert.match(r.headers["content-type"], /^text\/plain/);
      assert.equal(r.headers["content-disposition"], 'attachment; filename="kitchen-scene.fountain"');
      assert.equal(r.text, `${DRAFT}\n`);
    }
  });
});

test("[export-route] fdx types every line like the Markdown export and escapes text", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, { draft: `${DRAFT}\n\nJune says "go" & leaves.`, title: "Kitchen Scene", format: "fdx" });
    assert.equal(r.status, 200);
    // Express appends the charset when sending a string; the inline route did the same.
    assert.match(r.headers["content-type"], /^application\/vnd\.final-draft/);
    assert.equal(r.headers["content-disposition"], 'attachment; filename="kitchen-scene.fdx"');
    for (const type of ["Scene Heading", "Action", "Character", "Parenthetical", "Dialogue", "Transition"]) {
      assert.ok(r.text.includes(`<Paragraph Type="${type}">`), type);
    }
    assert.ok(r.text.includes("June says &quot;go&quot; &amp; leaves."));
    assert.equal(r.text, screenplayDraftToFDX(`${DRAFT}\n\nJune says "go" & leaves.`), "route output is the pure helper's output");
  });
});

test("[export-route] md/markdown and pdf delegate to their exporters", async () => {
  await withTestServer(async ({ baseURL }) => {
    const md = await post(baseURL, { draft: DRAFT, title: "Kitchen Scene", format: "markdown" });
    assert.equal(md.status, 200);
    assert.match(md.headers["content-type"], /^text\/markdown/);
    assert.ok(md.text.includes("## INT. KITCHEN - NIGHT"));
    const pdf = await post(baseURL, { draft: DRAFT, title: "Kitchen Scene", format: "pdf" });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers["content-type"], "application/pdf");
    assert.equal(pdf.headers["content-disposition"], 'attachment; filename="kitchen-scene.pdf"');
    assert.equal(pdf.buf.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});

test("[export-route] error envelopes keep the stage/error shape iOS maps", async () => {
  await withTestServer(async ({ baseURL }) => {
    const missing = await post(baseURL, { format: "pdf" });
    assert.equal(missing.status, 400);
    assert.deepEqual(JSON.parse(missing.text), { stage: "screenplay_export", error: "draft_required" });
    const unsupported = await post(baseURL, { draft: DRAFT, format: "docx" });
    assert.equal(unsupported.status, 400);
    assert.deepEqual(JSON.parse(unsupported.text), { stage: "screenplay_export", error: "unsupported_format" });
  });
});

test("[export-route] escapeXmlText covers the five XML specials", () => {
  assert.equal(escapeXmlText(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
  assert.equal(escapeXmlText(null), "");
});
