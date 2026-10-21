import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

// Exercise the installed dependency used by our actual schema validator,
// including a future nested install rather than an unrelated hoisted copy.
const require = createRequire(import.meta.url);
const uri = createRequire(require.resolve("ajv"))("fast-uri");

test("URI parsing rejects percent-encoded schemes instead of activating them", () => {
  for (const value of ["%68ttp://example.test/", "%u0068ttp://example.test/"]) {
    assert.ok(uri.parse(value).error, "An encoded scheme must be reported as malformed");
    assert.equal(uri.normalize(value), value);
    assert.equal(uri.equal(value, "http://example.test/"), false);
  }
  assert.equal(uri.parse("https://example.test/").error, undefined);
});

test("URI host normalization rejects ambiguous delimiters and stripped controls", () => {
  for (const value of [
    "http://a@b@elsewhere.test/",
    "http://exa\tmple.test/",
    "http://exa\rmple.test/",
    "http://exa\nmple.test/",
  ]) {
    assert.ok(uri.parse(value).error, "An ambiguous host must not be silently rewritten");
    assert.equal(uri.equal(value, "http://example.test/"), false);
  }
  assert.equal(uri.parse("https://EXAMPLE.TEST/").host, "example.test");
});

test("normalizing a relative URI preserves its subsequent resolved resource", () => {
  const base = "https://example.test/scripts/act-one/scene.fountain";
  for (const reference of ["a/../b", "../x", "../../x"]) {
    assert.equal(uri.resolve(base, uri.normalize(reference)), uri.resolve(base, reference));
  }
  assert.equal(uri.equal("../x", "x"), false);
  assert.equal(uri.normalize("https://example.test/a/../b"), "https://example.test/b");
});

test("suffix serialization cannot turn a relative path into a new URI scheme", () => {
  for (const path of ["writer:scene", "note:beat"]) {
    // Suffix output omits the supplied scheme. That must not expose the
    // path's own colon as a new scheme when the output is parsed again.
    const output = uri.serialize({ scheme: "screenplay", path }, { reference: "suffix" });
    assert.equal(uri.parse(output).scheme, undefined);
    assert.match(output, /%3a/i);
  }
});
