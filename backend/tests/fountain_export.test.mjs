// T-fountain-export-endpoint — unit tests for the pure serializer
// and integration tests for POST /screenplay/export/fountain.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  exportToFountain,
  serializeTitlePage,
  serializeHeading,
  serializeAction,
  serializeCharacter,
  serializeTransition,
  serializeCentered,
  serializeLyrics,
  serializeSection,
  serializeSynopsis,
} from "../lib/fountain_export.js";
import { mountFountainExportRoute, sanitizeFilenameBase } from "../lib/fountain_export_route.js";

// ---------- pure module ----------

test("[fountain] empty screenplay returns a single newline (still valid Fountain)", () => {
  assert.equal(exportToFountain({}), "\n");
});

test("[fountain] title page renders every supported field", () => {
  const out = serializeTitlePage({
    title: "io.them",
    credit: "Written by",
    author: "Half Mutant Films",
    source: "Original",
  });
  assert.match(out, /Title: io\.them/);
  assert.match(out, /Credit: Written by/);
  assert.match(out, /Author: Half Mutant Films/);
  assert.match(out, /Source: Original/);
});

test("[fountain] title page indents multi-line values", () => {
  const out = serializeTitlePage({
    title: "io.them",
    notes: "Line one\nLine two\nLine three",
  });
  assert.match(out, /Notes: Line one/);
  assert.match(out, /    Line two/);
  assert.match(out, /    Line three/);
});

test("[fountain] scene heading is upper-cased", () => {
  assert.equal(serializeHeading("int. kitchen - night"), "INT. KITCHEN - NIGHT");
  assert.equal(serializeHeading("EXT. ROOFTOP - DAWN"), "EXT. ROOFTOP - DAWN");
});

test("[fountain] action paragraph round-trips; all-caps action is forced with `!`", () => {
  assert.equal(serializeAction({ kind: "action", text: "She walks." }), "She walks.");
  assert.equal(serializeAction({ kind: "action", text: "SLAM." }), "!SLAM.");
});

test("[fountain] character cue includes parenthetical + dialogue lines", () => {
  const out = serializeCharacter({
    kind: "character",
    name: "june",
    parenthetical: "whispering",
    dialogue: ["I can't do this.", "Not now."],
  });
  const lines = out.split("\n");
  assert.equal(lines[0], "JUNE");
  assert.equal(lines[1], "(whispering)");
  assert.equal(lines[2], "I can't do this.");
  assert.equal(lines[3], "Not now.");
});

test("[fountain] ambiguous and dual-dialogue character cues keep their element meaning", () => {
  assert.equal(
    serializeCharacter({ kind: "character", name: "CUT TO:", dialogue: "Not a transition." }),
    "@CUT TO:\nNot a transition.",
  );
  assert.equal(
    serializeCharacter({ kind: "character", name: "McClane", dialogue: "Welcome.", forced: true }),
    "@MCCLANE\nWelcome.",
  );
  assert.equal(
    serializeCharacter({ kind: "character", name: "Ben", dialogue: "Now.", dualDialogue: true }),
    "BEN ^\nNow.",
  );
});

test("[fountain] character cue with empty dialogue is dropped", () => {
  assert.equal(serializeCharacter({ kind: "character", name: "JUNE", dialogue: "" }), "");
  assert.equal(serializeCharacter({ kind: "character", name: "JUNE", dialogue: [] }), "");
});

test("[fountain] transitions are upper-cased and end with TO:", () => {
  assert.equal(serializeTransition({ kind: "transition", text: "cut" }), "CUT TO:");
  assert.equal(serializeTransition({ kind: "transition", text: "CUT TO:" }), "CUT TO:");
  assert.equal(serializeTransition({ kind: "transition", text: "fade to:" }), "FADE TO:");
});

test("[fountain] forced transitions preserve their exact meaning without inventing TO:", () => {
  assert.equal(
    serializeTransition({ kind: "transition", text: "Burn to white", forced: true }),
    "> BURN TO WHITE",
  );
});

test("[fountain] centered text and lyrics use their Fountain sigils", () => {
  assert.equal(serializeCentered({ kind: "centered", text: "THE END" }), "> THE END <");
  assert.equal(serializeLyrics({ kind: "lyrics", text: "Somewhere" }), "~Somewhere");
});

test("[fountain] sections + synopses use Fountain's prefix tokens", () => {
  assert.equal(serializeSection({ kind: "section", text: "Act One" }), "# Act One");
  assert.equal(serializeSection({ kind: "section", level: 2, text: "Sequence A" }), "## Sequence A");
  assert.equal(serializeSection({ kind: "section", level: 9, text: "X" }), "### X"); // clamped
  assert.equal(serializeSynopsis({ kind: "synopsis", text: "She decides." }), "= She decides.");
});

test("[fountain] exportToFountain produces a recognizable screenplay", () => {
  const out = exportToFountain({
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
  assert.match(out, /Title: Test/);
  assert.match(out, /Author: Q/);
  assert.match(out, /INT\. KITCHEN - NIGHT/);
  assert.match(out, /She walks in\./);
  assert.match(out, /JUNE\nHello\./);
  assert.match(out, /MARCUS\n\(softly\)\nHi\./);
  assert.match(out, /CUT TO:/);
});

test("[fountain] collapses runs of >=3 blank lines to a single blank line", () => {
  const out = exportToFountain({
    scenes: [
      { heading: "INT. A - DAY", lines: [{ kind: "action", text: "X." }] },
      { heading: "INT. B - DAY", lines: [{ kind: "action", text: "Y." }] },
    ],
  });
  assert.ok(!/\n{3,}/.test(out));
});

test("[fountain] determinism: same input → same output", () => {
  const input = {
    title: { title: "T" },
    scenes: [{ heading: "INT. X - DAY", lines: [{ kind: "action", text: "x" }] }],
  };
  assert.equal(exportToFountain(input), exportToFountain(input));
});

test("[fountain] import/export preserves OpenDraft interoperability edge cases", async () => {
  const { importFromFountain } = await import("../lib/fountain_import.js");
  const source = [
    "INT. STAGE - NIGHT",
    "",
    "> THE END <",
    "",
    "> BURN TO WHITE",
    "",
    "@CUT TO:",
    "Not a transition.",
    "",
    "ANNA",
    "Go.",
    "",
    "BEN ^",
    "Now.",
    "",
    "SINGER",
    "~Somewhere beyond the lights",
  ].join("\n");
  const reparsed = importFromFountain(exportToFountain(importFromFountain(source)));
  const lines = reparsed.scenes[0].lines;
  assert.ok(lines.some((line) => line.kind === "centered" && line.text === "THE END"));
  assert.ok(lines.some((line) => line.kind === "transition" && line.text === "BURN TO WHITE"));
  assert.ok(lines.some((line) => line.kind === "character" && line.name === "CUT TO:"));
  assert.ok(lines.some((line) => line.kind === "character" && line.name === "BEN" && line.dualDialogue));
  assert.ok(lines.some((line) => line.kind === "lyrics" && line.text === "Somewhere beyond the lights"));
});

// ---------- route ----------

test("[fountain] sanitizeFilenameBase strips unsafe characters", () => {
  assert.equal(sanitizeFilenameBase("io.them: a screenplay"), "io.them_ a screenplay");
  assert.equal(sanitizeFilenameBase(""), "screenplay");
  assert.equal(sanitizeFilenameBase(null), "screenplay");
});

async function withTestServer(fn) {
  const app = express();
  app.use(express.json());
  mountFountainExportRoute(app);
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
    text: r.headers.get("content-type")?.includes("text/plain")
      ? await r.text()
      : null,
  };
}

test("[fountain] POST returns JSON envelope by default", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export/fountain", {
      title: { title: "T" },
      scenes: [{ heading: "INT. X - DAY", lines: [{ kind: "action", text: "x" }] }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.schemaVersion, 1);
    assert.match(r.json.fountain, /Title: T/);
  });
});

test("[fountain] POST returns raw text when Accept: text/plain", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export/fountain", {
      title: { title: "Hello World" },
      scenes: [],
    }, { accept: "text/plain" });
    assert.equal(r.status, 200);
    assert.match(r.contentType, /text\/plain/);
    assert.match(r.contentDisposition, /attachment; filename="Hello World\.fountain"/);
    assert.match(r.text, /Title: Hello World/);
  });
});

test("[fountain] POST rejects non-array scenes with 400", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export/fountain", { scenes: "nope" });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, "craft_invalid_screenplay");
  });
});

test("[fountain] POST treats missing scenes as title-only (still valid)", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export/fountain", { title: { title: "Solo" } });
    assert.equal(r.status, 200);
    assert.match(r.json.fountain, /Title: Solo/);
  });
});
