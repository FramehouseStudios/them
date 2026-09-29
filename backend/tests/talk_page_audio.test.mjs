import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PAGE_AUDIO_LINE_MAX_CHARS, resolveTalkPageAudioLine } from "../lib/talk_page_audio.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("the app's offer line is what a page turn speaks", () => {
  const line = "It's on the page. Want me to read back what I just wrote, the whole page, or the full script?";
  assert.equal(resolveTalkPageAudioLine({ page_audio_line: line }), line);
  assert.equal(resolveTalkPageAudioLine({ pageAudioLine: `  ${line}\n` }), line);
});

test("an older app (no line) keeps the page read-back", () => {
  assert.equal(resolveTalkPageAudioLine({}), "");
  assert.equal(resolveTalkPageAudioLine(undefined), "");
  assert.equal(resolveTalkPageAudioLine({ page_audio_line: "   " }), "");
  assert.equal(resolveTalkPageAudioLine({ page_audio_line: ["x"] }), "");
});

test("a line is a line, never a page smuggled into speech", () => {
  assert.equal(resolveTalkPageAudioLine({ page_audio_line: "x".repeat(PAGE_AUDIO_LINE_MAX_CHARS + 1) }), "");
  assert.equal(resolveTalkPageAudioLine({ page_audio_line: "Done.\u0007 Want\r\nto hear it?" }), "Done. Want to hear it?");
});

test("every offer line the app can send fits", () => {
  const swift = fs.readFileSync(path.join(HERE, "..", "..", "them", "PageWriteReadBackOffer.swift"), "utf8");
  const block = swift.match(/static let lines = \[([\s\S]*?)\]/);
  assert.ok(block, "PageWriteReadBackOffer.lines not found");
  const lines = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(lines.length >= 3);
  for (const line of lines) assert.equal(resolveTalkPageAudioLine({ page_audio_line: line }), line);
});
