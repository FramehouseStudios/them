import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { TalkTurnResultCache } from "../lib/talk_turn_result_cache.js";

test("whole turn results retain exact UTF-8 text, digest and a snapshot independent of the caller", () => {
  const cache = new TalkTurnResultCache();
  const text = " \r\n" + "INT. CAPSULE - NIGHT\r\nMARA\r\ncafé 🎬 e\u0301\r\n".repeat(2_000) + "THE END\r\n ";
  const source = { screenplayOutput: { text } };
  cache.set("original", source);
  source.screenplayOutput.text = "later mutation";
  assert.equal(cache.get("original").screenplayOutput.text, text);
  assert.equal(cache.get("original").screenplayOutputSHA256, createHash("sha256").update(text, "utf8").digest("hex"));
});

test("byte pressure evicts whole oldest entries; replacement, delete and clear release their budgets", () => {
  const cache = new TalkTurnResultCache({ maxBytes: 180 });
  const entry = { screenplayOutput: { text: "🎬" } };
  cache.set("a", entry).set("b", entry);
  assert.deepEqual([...cache.keys()], ["b"]);
  cache.set("b", entry);
  assert.deepEqual([...cache.keys()], ["b"]);
  cache.delete("b");
  cache.set("c", entry);
  assert.deepEqual([...cache.keys()], ["c"]);
  cache.clear();
  cache.set("d", entry);
  assert.deepEqual([...cache.keys()], ["d"]);
});

test("uncacheable output never clips, leaves stale same-key content or evicts unrelated results", () => {
  const cache = new TalkTurnResultCache({ maxBytes: 500 });
  cache.set("other", { reply: "keep this" }).set("same", { reply: "old result" });
  cache.set("same", { screenplayOutput: { text: "🎬".repeat(1_000) } });
  assert.equal(cache.has("same"), false);
  assert.equal(cache.get("other").reply, "keep this");
});
