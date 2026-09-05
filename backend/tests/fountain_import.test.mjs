// T-screenplay-import-fountain — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  importFromFountain,
  parseTitlePage,
  isSceneHeading,
  isCentered,
  isTransition,
  isCharacterCue,
  isParenthetical,
} from "../lib/fountain_import.js";
import { mountFountainImportRoute } from "../lib/fountain_import_route.js";

const SAMPLE = `Title: io.them
Author: Half Mutant Films

INT. KITCHEN - NIGHT

She walks in.

JUNE
(whispering)
I can't do this.
Not now.

MARCUS
Hi.

CUT TO:

EXT. ROOFTOP - DAWN

The sun rises.`;

// ---------- predicates ----------

test("[import] isSceneHeading recognizes INT./EXT./forced", () => {
  assert.equal(isSceneHeading("INT. KITCHEN - NIGHT"), true);
  assert.equal(isSceneHeading("EXT. ROOFTOP - DAWN"), true);
  assert.equal(isSceneHeading("INT/EXT CAR - DAY"), true);
  assert.equal(isSceneHeading(".forced scene"), true);
  assert.equal(isSceneHeading("She walks."), false);
});

test("[import] centered text is distinct from a forced transition", () => {
  assert.equal(isCentered("> THE END <"), true);
  assert.equal(isCentered(">THE END<"), true);
  assert.equal(isCentered("> BURN TO WHITE"), false);
});

test("[import] isTransition recognizes CUT TO: and forced > forms", () => {
  assert.equal(isTransition("CUT TO:"), true);
  assert.equal(isTransition("FADE TO:"), true);
  assert.equal(isTransition("> BURN TO WHITE"), true);
  assert.equal(isTransition("> THE END <"), false);
  assert.equal(isTransition("@CUT TO:"), false);
  assert.equal(isTransition("just some action."), false);
});

test("[import] isCharacterCue requires ALL CAPS + non-empty next line", () => {
  assert.equal(isCharacterCue("JUNE", "Hello."), true);
  assert.equal(isCharacterCue("JUNE (V.O.)", "Hello."), true);
  assert.equal(isCharacterCue("@McCLANE", "Welcome."), true);
  assert.equal(isCharacterCue("BEN ^", "Now."), true);
  assert.equal(isCharacterCue("June", "Hello."), false);          // not caps
  assert.equal(isCharacterCue("JUNE", ""), false);                // empty next
  assert.equal(isCharacterCue("INT. KITCHEN", "She walks."), false); // scene heading
});

test("[import] isParenthetical matches (whispering)", () => {
  assert.equal(isParenthetical("(whispering)"), true);
  assert.equal(isParenthetical("not paren"), false);
});

// ---------- title page ----------

test("[import] parseTitlePage extracts the canonical fields", () => {
  const { title, consumedLineCount } = parseTitlePage([
    "Title: io.them",
    "Author: Half Mutant Films",
    "",
    "INT. KITCHEN - NIGHT",
  ]);
  assert.equal(title.title, "io.them");
  assert.equal(title.author, "Half Mutant Films");
  assert.ok(consumedLineCount >= 2);
});

test("[import] parseTitlePage returns null when no title fields are present", () => {
  const { title } = parseTitlePage(["INT. KITCHEN - NIGHT", "Action."]);
  assert.equal(title, null);
});

// ---------- importFromFountain ----------

test("[import] full sample parses into title + 2 scenes", () => {
  const out = importFromFountain(SAMPLE);
  assert.equal(out.title.title, "io.them");
  assert.equal(out.title.author, "Half Mutant Films");
  assert.equal(out.scenes.length, 2);
  assert.equal(out.scenes[0].heading, "INT. KITCHEN - NIGHT");
  assert.equal(out.scenes[1].heading, "EXT. ROOFTOP - DAWN");
});

test("[import] character cues capture name + parenthetical + dialogue lines", () => {
  const out = importFromFountain(SAMPLE);
  const cues = out.scenes[0].lines.filter((l) => l.kind === "character");
  assert.equal(cues.length, 2);
  assert.equal(cues[0].name, "JUNE");
  assert.equal(cues[0].parenthetical, "whispering");
  assert.deepEqual(cues[0].dialogue, ["I can't do this.", "Not now."]);
  assert.equal(cues[1].name, "MARCUS");
  assert.deepEqual(cues[1].dialogue, ["Hi."]);
});

test("[import] transitions are captured as their own line kind", () => {
  const out = importFromFountain(SAMPLE);
  const transitions = out.scenes[0].lines.filter((l) => l.kind === "transition");
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].text, "CUT TO:");
});

test("[import] action lines are captured (text only)", () => {
  const out = importFromFountain(SAMPLE);
  const actions = out.scenes[0].lines.filter((l) => l.kind === "action");
  assert.ok(actions.some((a) => a.text === "She walks in."));
});

test("[import] forced action with ! prefix strips the prefix", () => {
  const out = importFromFountain(`INT. X - DAY\n\n!ALL CAPS ACTION.\n`);
  const action = out.scenes[0].lines.find((l) => l.kind === "action");
  assert.equal(action.text, "ALL CAPS ACTION.");
});

test("[import] preserves centered text, forced transitions, lyrics, and forced cues", () => {
  const out = importFromFountain([
    "INT. STAGE - NIGHT",
    "",
    "> THE END <",
    "",
    "> BURN TO WHITE",
    "",
    "@McCLANE",
    "Welcome.",
    "",
    "SINGER",
    "~Somewhere beyond the lights",
  ].join("\n"));
  const lines = out.scenes[0].lines;
  assert.deepEqual(lines.find((line) => line.kind === "centered"), {
    kind: "centered",
    text: "THE END",
  });
  assert.deepEqual(lines.find((line) => line.kind === "transition"), {
    kind: "transition",
    text: "BURN TO WHITE",
    forced: true,
  });
  assert.deepEqual(lines.find((line) => line.kind === "lyrics"), {
    kind: "lyrics",
    text: "Somewhere beyond the lights",
  });
  const forcedCue = lines.find((line) => line.kind === "character" && line.name === "McCLANE");
  assert.equal(forcedCue?.forced, true);
  assert.deepEqual(forcedCue?.dialogue, ["Welcome."]);
});

test("[import] normalizes clipboard separators, BOM, and dual-dialogue cues", () => {
  const out = importFromFountain(
    "\uFEFFINT. ROOM - DAY\u2028\u2028ANNA\u2028Go.\u2029\u2029BEN ^\u0085Now.",
  );
  const cues = out.scenes[0].lines.filter((line) => line.kind === "character");
  assert.equal(cues.length, 2);
  assert.equal(cues[0].name, "ANNA");
  assert.equal(cues[1].name, "BEN");
  assert.equal(cues[1].dualDialogue, true);
  assert.deepEqual(cues[1].dialogue, ["Now."]);
});

test("[import] # sections + = synopses are captured", () => {
  const out = importFromFountain(`# Act One\n\n= She decides.\n\nINT. X - DAY\n\nAction.\n`);
  const lines = out.scenes[0].lines;
  assert.ok(lines.some((l) => l.kind === "section" && l.text === "Act One"));
  assert.ok(lines.some((l) => l.kind === "synopsis" && l.text === "She decides."));
});

test("[import] non-string input returns the empty-scenes shape", () => {
  const out = importFromFountain(null);
  assert.deepEqual(out, { scenes: [] });
});

test("[import] determinism: same input → same output", () => {
  assert.deepEqual(importFromFountain(SAMPLE), importFromFountain(SAMPLE));
});

// ---------- round-trip (deferred — depends on fountain_export module
// from PR #83; will land in a follow-up after #83 merges) ----------

// ---------- endpoint integration ----------

async function withTestServer(fn) {
  const app = express();
  mountFountainImportRoute(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("[import] POST accepts JSON { text } and returns parsed screenplay", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await fetch(`${baseURL}/screenplay/import/fountain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: SAMPLE }),
    });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.screenplay.title.title, "io.them");
    assert.equal(body.screenplay.scenes.length, 2);
  });
});

test("[import] POST accepts raw text/plain body", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await fetch(`${baseURL}/screenplay/import/fountain`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: SAMPLE,
    });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.screenplay.title.title, "io.them");
  });
});

test("[import] POST rejects empty body with 400 craft_invalid_screenplay", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await fetch(`${baseURL}/screenplay/import/fountain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = await r.json();
    assert.equal(r.status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});

// T-screenplay-import-fountain — Codex's review specifically asked
// for a production-style 413 integration test. These tests hit the
// real route through a live Express server (no stubbing) and verify
// the response is a structured JSON 413, not a default Express
// HTML error page.

test("[import] POST > 4MB body is rejected route-locally with structured 413", async () => {
  await withTestServer(async ({ baseURL }) => {
    // Build a real > 4MB body. The middleware's Content-Length check
    // should short-circuit before the body is fully read.
    const bigChunk = "x".repeat(1_000_000); // 1MB of placeholder
    const body = bigChunk.repeat(5); // 5MB total
    const r = await fetch(`${baseURL}/screenplay/import/fountain`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
    });
    assert.equal(r.status, 413);
    const json = await r.json();
    assert.equal(json.error, "payload_too_large");
    assert.equal(json.max_bytes, 4_000_000);
    // Response must be application/json, not the default HTML Express
    // serves when an error escapes route handling.
    assert.match(r.headers.get("content-type") || "", /application\/json/);
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
});

test("[import] POST < 4MB body still works (regression check)", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await fetch(`${baseURL}/screenplay/import/fountain`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: SAMPLE,
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.screenplay.title.title, "io.them");
  });
});
