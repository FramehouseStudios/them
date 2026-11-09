import test from "node:test";
import assert from "node:assert/strict";
import { accumulateChunks, detectFirstSentence, shouldAbort, createStreamAccumulator } from "../lib/clementine/stream_helpers.js";

test("accumulateChunks joins", () => { assert.equal(accumulateChunks(["a","b"]), "ab"); });
test("detectFirstSentence finds", () => { assert.equal(detectFirstSentence("Hello world. More"), "Hello world."); });
test("shouldAbort", () => { assert.equal(shouldAbort({aborted:true}), true); assert.equal(shouldAbort(null), false); });
test("createStreamAccumulator calls onFirstSentence once", () => {
  let called = "";
  const acc = createStreamAccumulator({ onFirstSentence: (s)=> called=s });
  acc.push("Hello world. ");
  assert.ok(called.includes("Hello world"));
  const prev = called;
  acc.push("More");
  assert.equal(called, prev);
});
