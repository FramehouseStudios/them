// T-utils-smoke-test — smoke coverage for backend/lib/utils.js.
//
// `utils.js` is the shared pure-function toolbox imported by almost
// every other lib (~15 functions, ~150 lines). It had no direct test
// until this PR; the gap surfaced during the round-19 test-coverage
// audit. These tests pin the most-used surface: parsing helpers,
// normalizers, and slug/regex helpers. Atomic-write and resolve-path
// are exercised against a temp dir.

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
  normalizePersonaPreset,
  normalizeSnippet,
  parseBool,
  parseNonNegativeInt,
  parseNumberInRange,
  parseOneOf,
  parsePositiveInt,
  resolveStorePath,
  slugifyForFilename,
  trimToMax,
  writeJsonFileAtomic,
} from "../lib/utils.js";

// ---------- parsers ----------

test("[utils] parsePositiveInt accepts positive integers + falls back otherwise", () => {
  assert.equal(parsePositiveInt("42", 0), 42);
  assert.equal(parsePositiveInt("0", 5), 5);
  assert.equal(parsePositiveInt("-3", 5), 5);
  assert.equal(parsePositiveInt("abc", 7), 7);
  assert.equal(parsePositiveInt(null, 9), 9);
  assert.equal(parsePositiveInt(undefined, 11), 11);
});

test("[utils] parseNonNegativeInt accepts 0 and positives", () => {
  assert.equal(parseNonNegativeInt("0", 99), 0);
  assert.equal(parseNonNegativeInt("42", 99), 42);
  assert.equal(parseNonNegativeInt("-1", 99), 99);
  assert.equal(parseNonNegativeInt("xyz", 99), 99);
});

test("[utils] parseNumberInRange clamps to [min, max] and falls back on non-finite", () => {
  assert.equal(parseNumberInRange("5", 0, 10, 99), 5);
  assert.equal(parseNumberInRange("-1", 0, 10, 99), 0);
  assert.equal(parseNumberInRange("99", 0, 10, 99), 10);
  assert.equal(parseNumberInRange("nope", 0, 10, 7), 7);
  // Decimals are honored.
  assert.equal(parseNumberInRange("3.14", 0, 10, 99), 3.14);
});

test("[utils] parseBool accepts only 1/true/yes (case-insensitive)", () => {
  assert.equal(parseBool("true"), true);
  assert.equal(parseBool("TRUE"), true);
  assert.equal(parseBool("1"), true);
  assert.equal(parseBool("yes"), true);
  assert.equal(parseBool("YES"), true);
  assert.equal(parseBool("false"), false);
  assert.equal(parseBool("0"), false);
  assert.equal(parseBool(""), false);
  assert.equal(parseBool(null), false);
  assert.equal(parseBool(undefined), false);
});

test("[utils] parseOneOf returns allowed value or fallback", () => {
  const allowed = new Set(["a", "b", "c"]);
  assert.equal(parseOneOf("a", allowed, "fallback"), "a");
  assert.equal(parseOneOf("A", allowed, "fallback"), "a"); // case-insensitive
  assert.equal(parseOneOf("z", allowed, "fallback"), "fallback");
  assert.equal(parseOneOf(null, allowed, "fallback"), "fallback");
  assert.equal(parseOneOf("  b  ", allowed, "fallback"), "b"); // trimmed
});

// ---------- normalizers ----------

test("[utils] normalizeSnippet collapses whitespace + truncates with ellipsis", () => {
  assert.equal(normalizeSnippet("  hello\n\nworld  ", 100), "hello world");
  assert.equal(normalizeSnippet(""), "");
  assert.equal(normalizeSnippet(null), "");
  assert.equal(normalizeSnippet(undefined), "");
  // Truncation
  const long = "a".repeat(200);
  const result = normalizeSnippet(long, 10);
  assert.equal(result.length, 10);
  assert.ok(result.endsWith("…"));
});

test("[utils] trimToMax preserves short input and ellipsizes long", () => {
  assert.equal(trimToMax("short", 100), "short");
  assert.equal(trimToMax("", 100), "");
  assert.equal(trimToMax(null, 100), "");
  // Long input
  const long = "a".repeat(50);
  const result = trimToMax(long, 10);
  assert.equal(result.length, 10);
  assert.ok(result.endsWith("…"));
});

test("[utils] normalizeElevenLabsVoiceId accepts valid IDs", () => {
  // 12-128 char alphanumeric + _ / -
  assert.equal(normalizeElevenLabsVoiceId("abc123XYZ_-456"), "abc123XYZ_-456");
  // Short rejected (< 12)
  assert.equal(normalizeElevenLabsVoiceId("short", "fallback"), "fallback");
  // Empty -> fallback
  assert.equal(normalizeElevenLabsVoiceId("", "fallback"), "fallback");
  assert.equal(normalizeElevenLabsVoiceId(null, "fallback"), "fallback");
});

test("[utils] normalizeElevenLabsVoiceId extracts ID from URL path", () => {
  const url = "https://elevenlabs.io/voice/abcd1234efgh5678/preview";
  assert.equal(normalizeElevenLabsVoiceId(url, "fallback"), "abcd1234efgh5678");
});

test("[utils] normalizePersonaPreset preserves clementine fallback", () => {
  assert.equal(normalizePersonaPreset(""), "clementine");
  assert.equal(normalizePersonaPreset(null), "clementine");
  assert.equal(normalizePersonaPreset("CLEMENTINE"), "clementine");
});

// ---------- slug + escape + clamp + ids ----------

test("[utils] slugifyForFilename produces filesystem-safe slugs", () => {
  assert.equal(slugifyForFilename("Hello World!"), "hello-world");
  assert.equal(slugifyForFilename("a/b/c"), "a-b-c");
  assert.equal(slugifyForFilename("  --whitespace--  "), "whitespace");
  assert.equal(slugifyForFilename(""), "note");
  assert.equal(slugifyForFilename("!!!"), "note");
  // Truncates at 64
  assert.ok(slugifyForFilename("a".repeat(100)).length <= 64);
});

test("[utils] escapeRegex escapes regex metacharacters", () => {
  assert.equal(escapeRegex("a.b*c"), "a\\.b\\*c");
  assert.equal(escapeRegex("[abc]"), "\\[abc\\]");
  assert.equal(escapeRegex(""), "");
});

test("[utils] clampUnit clamps to [0,1]", () => {
  assert.equal(clampUnit(0.5), 0.5);
  assert.equal(clampUnit(-1), 0);
  assert.equal(clampUnit(2), 1);
  assert.equal(clampUnit("nope", 0.5), 0.5);
  assert.equal(clampUnit("nope"), 0);
});

test("[utils] createRequestId returns a 16-char hex string", () => {
  const id = createRequestId();
  assert.equal(typeof id, "string");
  assert.equal(id.length, 16);
  assert.match(id, /^[0-9a-f]{16}$/);
  // Distinct across calls
  const id2 = createRequestId();
  assert.notEqual(id, id2);
});

// ---------- filesystem helpers ----------

test("[utils] resolveStorePath honors absolute paths + falls back to default filename", () => {
  // Absolute path passes through.
  assert.equal(resolveStorePath("default.json", "/tmp/explicit.json"), "/tmp/explicit.json");
  // Empty env value uses default filename, resolved relative to backend root.
  const resolved = resolveStorePath("default.json", "");
  assert.ok(path.isAbsolute(resolved));
  assert.ok(resolved.endsWith("default.json"));
});

test("[utils] writeJsonFileAtomic writes payload and returns true", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-utils-test-"));
  const filePath = path.join(tmpDir, "test.json");
  const payload = { hello: "world", n: 42 };
  const result = writeJsonFileAtomic(filePath, payload);
  assert.equal(result, true);
  const read = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(read, payload);
});

test("[utils] writeJsonFileAtomic handles deep nested directories", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-utils-test-"));
  const filePath = path.join(tmpDir, "deep", "nested", "test.json");
  const result = writeJsonFileAtomic(filePath, { ok: true });
  assert.equal(result, true);
  assert.ok(fs.existsSync(filePath));
});
