import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScreenplayTargetPages } from "../lib/screenplay_target_pages.js";

test("target length is kept only inside the app's 5...180 range", () => {
  assert.equal(normalizeScreenplayTargetPages(75), 75);
  assert.equal(normalizeScreenplayTargetPages("90"), 90);
  assert.equal(normalizeScreenplayTargetPages(74.6), 75);
  assert.equal(normalizeScreenplayTargetPages(4), 0);
  assert.equal(normalizeScreenplayTargetPages(181), 0);
  assert.equal(normalizeScreenplayTargetPages(undefined), 0);
  assert.equal(normalizeScreenplayTargetPages("long"), 0);
});
