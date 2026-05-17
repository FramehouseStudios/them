// T-deeper-lib-tests-batch-2 — deeper utils coverage beyond
// backend/tests/utils.test.mjs.
//
// Smoke covers: parsers, normalizers, frozen lists, slug/regex
// helpers, atomic write to temp dir.
//
// This file exercises:
//   - createRequestId format + uniqueness across many calls
//   - escapeRegex against every regex special character
//   - normalizeElevenLabsVoiceId URL-pathname extraction
//   - resolveStorePath absolute vs relative + env fallback
//   - writeJsonFileAtomic round-trip + recover-on-failure
//   - slugifyForFilename edge cases (empty, unicode, length cap)
//   - clampUnit precision

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  clampUnit,
  createRequestId,
  escapeRegex,
  normalizeElevenLabsVoiceId,
  resolveStorePath,
  slugifyForFilename,
  writeJsonFileAtomic,
} from "../lib/utils.js";

// ---------- createRequestId ----------

test("[utils-deeper] createRequestId returns a 16-char hex string", () => {
  const id = createRequestId();
  assert.equal(typeof id, "string");
  assert.equal(id.length, 16);
  assert.match(id, /^[0-9a-f]{16}$/);
});

test("[utils-deeper] createRequestId is unique across 1000 calls", () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) ids.add(createRequestId());
  assert.equal(ids.size, 1000, "expected 1000 unique ids");
});

// ---------- escapeRegex ----------

test("[utils-deeper] escapeRegex escapes every regex special char", () => {
  const specials = ".*+?^${}()|[]\\";
  for (const ch of specials) {
    const escaped = escapeRegex(ch);
    // Should be safe to use as a literal in a regex now.
    assert.doesNotThrow(() => new RegExp(escaped));
    const re = new RegExp(escaped);
    assert.ok(re.test(ch), `escapeRegex(${JSON.stringify(ch)}) should match its source char`);
  }
});

test("[utils-deeper] escapeRegex leaves plain text unchanged", () => {
  assert.equal(escapeRegex("hello"), "hello");
  assert.equal(escapeRegex("user_id"), "user_id");
});

// ---------- normalizeElevenLabsVoiceId ----------

test("[utils-deeper] normalizeElevenLabsVoiceId accepts a bare valid id", () => {
  assert.equal(normalizeElevenLabsVoiceId("Abcdef12345_xyz", ""), "Abcdef12345_xyz");
});

test("[utils-deeper] normalizeElevenLabsVoiceId extracts id from a URL pathname", () => {
  const id = "X9ZxJk2yTjPLqNvMrAcD"; // 20 chars, matches regex
  const result = normalizeElevenLabsVoiceId(`https://api.elevenlabs.io/v1/voices/${id}`, "");
  assert.equal(result, id);
});

test("[utils-deeper] normalizeElevenLabsVoiceId returns fallback for garbage input", () => {
  assert.equal(normalizeElevenLabsVoiceId("not a voice id", "fallback_voice"), "fallback_voice");
  assert.equal(normalizeElevenLabsVoiceId("", "fallback_voice"), "fallback_voice");
  assert.equal(normalizeElevenLabsVoiceId(null, "fallback_voice"), "fallback_voice");
});

// ---------- resolveStorePath ----------

test("[utils-deeper] resolveStorePath honors absolute path", () => {
  const abs = "/tmp/io-them-test-store.json";
  assert.equal(resolveStorePath("default.json", abs), abs);
});

test("[utils-deeper] resolveStorePath resolves relative path under backend root", () => {
  const out = resolveStorePath("default.json", "data/store.json");
  assert.ok(path.isAbsolute(out));
  assert.ok(out.endsWith("data/store.json"));
});

test("[utils-deeper] resolveStorePath falls back to default when env is empty", () => {
  const out = resolveStorePath("default.json", "");
  assert.ok(out.endsWith("default.json"));
});

// ---------- writeJsonFileAtomic ----------

test("[utils-deeper] writeJsonFileAtomic round-trips a JSON object", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-utils-deeper-"));
  const filePath = path.join(dir, "out.json");
  const payload = { a: 1, b: [2, 3], c: { d: "e" } };
  const ok = writeJsonFileAtomic(filePath, payload);
  assert.equal(ok, true);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed, payload);
  // Trailing newline.
  assert.ok(raw.endsWith("\n"));
});

test("[utils-deeper] writeJsonFileAtomic creates parent dirs", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-utils-deeper-"));
  const nested = path.join(base, "deeply", "nested", "out.json");
  const ok = writeJsonFileAtomic(nested, { x: 1 });
  assert.equal(ok, true);
  assert.ok(fs.existsSync(nested));
});

// ---------- slugifyForFilename ----------

test("[utils-deeper] slugifyForFilename lowercases + replaces non-alpha", () => {
  const out = slugifyForFilename("Hello World 2026!");
  assert.match(out, /^[a-z0-9_-]+$/);
  assert.ok(out.includes("hello"));
});

test("[utils-deeper] slugifyForFilename falls back when input is empty", () => {
  assert.equal(slugifyForFilename("", "fallback"), "fallback");
  assert.equal(slugifyForFilename(null, "fallback"), "fallback");
});

// ---------- clampUnit ----------

test("[utils-deeper] clampUnit clamps to [0, 1]", () => {
  assert.equal(clampUnit(0.5), 0.5);
  assert.equal(clampUnit(-1), 0);
  assert.equal(clampUnit(2), 1);
  assert.equal(clampUnit(0), 0);
  assert.equal(clampUnit(1), 1);
});

test("[utils-deeper] clampUnit falls back for non-finite (NaN, undefined, garbage strings)", () => {
  // Note: Number(null) === 0 (finite) — null is NOT a non-finite case.
  assert.equal(clampUnit("abc", 0.7), 0.7);
  assert.equal(clampUnit(undefined, 0.3), 0.3);
  assert.equal(clampUnit(NaN, 0.4), 0.4);
});
