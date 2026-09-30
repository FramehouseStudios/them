import assert from "node:assert/strict";
import test from "node:test";

import { SCREENPLAY_MEMORY_SETUP_PATTERN } from "../lib/screenplay_memory_setup_pattern.js";

test("[screenplay-memory-setup] movement is not a planted setup", () => {
  for (const line of [
    "She keeps moving. Danny apologizes to the lobbyist on her behalf.",
    "DANNY PRUITT, 23, two weeks on the job, keeps up with a binder the size of a cinder block.",
    "Nobody does. Keep it that way.",
  ]) {
    assert.equal(SCREENPLAY_MEMORY_SETUP_PATTERN.test(line), false, line);
  }
  for (const line of [
    "Mae keeps the letter in her coat.",
    "He hides the key under the mat.",
    "The unopened envelope sits on the desk.",
  ]) {
    assert.equal(SCREENPLAY_MEMORY_SETUP_PATTERN.test(line), true, line);
  }
});
