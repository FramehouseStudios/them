// T-screenplay-import-fountain — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  importFromFountain,
  parseTitlePage,
  isSceneHeading,
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

test("[import] isTransition recognizes CUT TO: and >...< forms", () => {
  assert.equal(isTransition("CUT TO:"), true);
  assert.equal(isTransition("FADE TO:"), true);
  assert.equal(isTransition("> SMASH CUT TO <"), true);
  assert.equal(isTransition("just some action."), false);
});

test("[import] isCharacterCue requires ALL CAPS + non-empty next line", () => {
  assert.equal(isCharacterCue("JUNE", "Hello."), true);
  assert.equal(isCharacterCue("JUNE (V.O.)", "Hello."), true);
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
