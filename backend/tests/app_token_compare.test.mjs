import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { appTokenMatches } from "../middleware/auth.js";

// Day 1–3 sprint rescue: the X-APP-TOKEN gate compares the shared secret in
// constant time. A plain `!==` short-circuits on the first differing byte and
// leaks prefix-match length through response timing.

test("[app-token] matching token is accepted, any difference is rejected", () => {
  assert.equal(appTokenMatches("secret-token-123", "secret-token-123"), true);
  assert.equal(appTokenMatches("secret-token-124", "secret-token-123"), false);
  assert.equal(appTokenMatches("Secret-token-123", "secret-token-123"), false);
  assert.equal(appTokenMatches("secret-token-12", "secret-token-123"), false);
  assert.equal(appTokenMatches("secret-token-1234", "secret-token-123"), false);
});

test("[app-token] empty or missing presented token never matches, even an empty expected token", () => {
  assert.equal(appTokenMatches("", ""), false);
  assert.equal(appTokenMatches(undefined, "secret"), false);
  assert.equal(appTokenMatches(null, "secret"), false);
  assert.equal(appTokenMatches("", "secret"), false);
  assert.equal(appTokenMatches("secret", ""), false);
  assert.equal(appTokenMatches(undefined, undefined), false);
});

test("[app-token] multi-byte tokens compare on bytes, not code units", () => {
  assert.equal(appTokenMatches("tökén", "tökén"), true);
  assert.equal(appTokenMatches("tökén", "token"), false);
});

test("[app-token] middleware uses the constant-time helper (source scan)", () => {
  const source = fs.readFileSync(new URL("../middleware/auth.js", import.meta.url), "utf8");
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /appTokenMatches\(req\.header\("X-APP-TOKEN"\), APP_TOKEN\)/);
  assert.doesNotMatch(source, /token !== APP_TOKEN/);
});
