// T-fdx-export-endpoint — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  exportToFDX,
  serializeTitlePage,
  serializeHeading,
  serializeAction,
  serializeCharacter,
  serializeTransition,
  escapeXml,
} from "../lib/fdx_export.js";
import { mountFDXExportRoute, sanitizeFilenameBase } from "../lib/fdx_export_route.js";

// ---------- escapeXml ----------

test("[fdx] escapeXml encodes XML metacharacters", () => {
  assert.equal(escapeXml(`A & <B> "C" 'D'`), "A &amp; &lt;B&gt; &quot;C&quot; &apos;D&apos;");
  assert.equal(escapeXml(""), "");
  assert.equal(escapeXml(null), "");
});

// ---------- pure module ----------

test("[fdx] empty screenplay returns a well-formed FinalDraft document", () => {
  const out = exportToFDX({});
  assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8"'));
  assert.match(out, /<FinalDraft DocumentType="Script"/);
  assert.match(out, /<Content\/>/);
  assert.match(out, /<\/FinalDraft>/);
});

test("[fdx] scene heading is upper-cased and wrapped in a Scene Heading paragraph", () => {
  const xml = serializeHeading("int. kitchen - night");
  assert.match(xml, /Type="Scene Heading"/);
  assert.match(xml, /INT\. KITCHEN - NIGHT/);
});

test("[fdx] action serializes as Action paragraph + escapes content", () => {
  const xml = serializeAction({ kind: "action", text: "She says <hi>." });
  assert.match(xml, /Type="Action"/);
  assert.match(xml, /She says &lt;hi&gt;\./);
});

test("[fdx] character cue emits Character + optional Parenthetical + Dialogue paragraphs", () => {
  const xml = serializeCharacter({
    kind: "character",
    name: "june",
    parenthetical: "whispering",
    dialogue: ["I can't do this.", "Not now."],
  });
  assert.match(xml, /Type="Character"[^>]*><Text>JUNE</);
  assert.match(xml, /Type="Parenthetical"[^>]*><Text>\(whispering\)/);
  assert.match(xml, /Type="Dialogue"[^>]*><Text>I can&apos;t do this\./);
  assert.match(xml, /Type="Dialogue"[^>]*><Text>Not now\./);
});

test("[fdx] character cue with empty dialogue is dropped", () => {
  assert.equal(serializeCharacter({ kind: "character", name: "JUNE", dialogue: "" }), "");
  assert.equal(serializeCharacter({ kind: "character", name: "JUNE", dialogue: [] }), "");
});

test("[fdx] transitions are upper-cased and end with TO:", () => {
  assert.match(serializeTransition({ kind: "transition", text: "cut" }), /CUT TO:/);
  assert.match(serializeTransition({ kind: "transition", text: "FADE TO:" }), /FADE TO:/);
  assert.match(serializeTransition({ kind: "transition", text: "fade to:" }), /FADE TO:/);
});

test("[fdx] title page renders supported fields as centered General paragraphs", () => {
  const xml = serializeTitlePage({
    title: "io.them",
    credit: "Written by",
    author: "Half Mutant Films",
  });
  assert.match(xml, /<TitlePage>/);
  assert.match(xml, /Alignment="Center"/);
  assert.match(xml, /Title: io\.them/);
  assert.match(xml, /Credit: Written by/);
  assert.match(xml, /Author: Half Mutant Films/);
});

test("[fdx] full export produces a recognizable FDX document", () => {
  const out = exportToFDX({
    title: { title: "Test", author: "Q" },
    scenes: [
      {
        heading: "INT. KITCHEN - NIGHT",
        lines: [
          { kind: "action", text: "She walks in." },
          { kind: "character", name: "JUNE", dialogue: "Hello." },
          { kind: "character", name: "MARCUS", parenthetical: "softly", dialogue: ["Hi."] },
          { kind: "transition", text: "CUT TO:" },
        ],
      },
    ],
  });
  assert.match(out, /<FinalDraft/);
  assert.match(out, /<Content>/);
  assert.match(out, /INT\. KITCHEN - NIGHT/);
  assert.match(out, /JUNE/);
  assert.match(out, /MARCUS/);
  assert.match(out, /\(softly\)/);
  assert.match(out, /CUT TO:/);
  assert.match(out, /<TitlePage>/);
  assert.match(out, /Title: Test/);
});

test("[fdx] determinism: same input → same output", () => {
  const input = {
    title: { title: "T" },
    scenes: [{ heading: "INT. X - DAY", lines: [{ kind: "action", text: "x" }] }],
  };
  assert.equal(exportToFDX(input), exportToFDX(input));
});

test("[fdx] non-object input returns the empty document, not throws", () => {
  const out = exportToFDX(null);
  assert.match(out, /<Content\/>/);
});

// ---------- route ----------

test("[fdx] sanitizeFilenameBase replaces unsafe characters", () => {
  assert.equal(sanitizeFilenameBase("io.them: a screenplay"), "io.them_ a screenplay");
  assert.equal(sanitizeFilenameBase(""), "screenplay");
  assert.equal(sanitizeFilenameBase(null), "screenplay");
});

async function withTestServer(fn) {
  const app = express();
  app.use(express.json());
  mountFDXExportRoute(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(baseURL, p, body, headers = {}) {
  const r = await fetch(`${baseURL}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: r.status,
    contentType: r.headers.get("content-type") || "",
    contentDisposition: r.headers.get("content-disposition") || "",
    json: r.headers.get("content-type")?.includes("application/json")
      ? await r.json().catch(() => null)
      : null,
    text: r.headers.get("content-type")?.includes("application/xml")
      ? await r.text()
      : null,
  };
}

test("[fdx] POST returns JSON envelope by default", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export/fdx", {
      title: { title: "T" },
      scenes: [{ heading: "INT. X - DAY", lines: [{ kind: "action", text: "x" }] }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.schemaVersion, 1);
    assert.match(r.json.fdx, /<FinalDraft/);
  });
});

test("[fdx] POST returns raw XML when Accept: application/xml", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export/fdx", {
      title: { title: "Hello World" },
      scenes: [],
    }, { accept: "application/xml" });
    assert.equal(r.status, 200);
    assert.match(r.contentType, /application\/xml/);
    assert.match(r.contentDisposition, /attachment; filename="Hello World\.fdx"/);
    assert.match(r.text, /<FinalDraft/);
  });
});

test("[fdx] POST rejects non-array scenes with 400", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export/fdx", { scenes: "nope" });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, "craft_invalid_screenplay");
  });
});
