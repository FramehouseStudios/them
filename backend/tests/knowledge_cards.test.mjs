import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kc-"));
const persistDir = path.join(tmpRoot, "persistence");
const userStorePath = path.join(tmpRoot, "user_store.json");
const cardsFile = path.join(tmpRoot, "cards.json");

process.env.RUN_SERVER = "0";
process.env.OUTBOX_SNAPSHOT_ENABLED = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";
process.env.PERSISTENCE_JSON_ROOT = persistDir;
process.env.USER_STORE_PATH = userStorePath;
process.env.KNOWLEDGE_CARDS_FILE = cardsFile;

const { loadKnowledgeCards, resetKnowledgeCardsCacheForTests } = await import("../index.js");

function captureStdout(fn) {
  let out = "";
  const orig = process.stdout.write;
  process.stdout.write = (chunk, enc, cb) => {
    out += String(chunk);
    if (typeof cb === "function") cb();
    return true;
  };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

test("[knowledge_cards] file absent uses 30-card fallback and logs fallback", () => {
  try { fs.unlinkSync(cardsFile); } catch {}
  resetKnowledgeCardsCacheForTests();
  let cards;
  const logged = captureStdout(() => { cards = loadKnowledgeCards(); });
  assert.equal(cards.length, 30);
  assert.match(logged, /knowledge_cards loaded/);
  assert.match(logged, /\b30\b/);
  assert.match(logged, /fallback/);
  assert.ok(!logged.includes("Citizen Kane (1941)"));
  assert.ok(!logged.includes("Tokyo Story"));
});

test("[knowledge_cards] file with 2 cards returns 2 from file and logs file path", () => {
  const payload = {
    cards: [
      { topic: "movies", title: "Card One", body: "body one", tags: ["a"] },
      { topic: "movies", title: "Card Two", body: "body two", tags: ["b"] },
    ],
  };
  fs.writeFileSync(cardsFile, JSON.stringify(payload), "utf8");
  resetKnowledgeCardsCacheForTests();
  let cards;
  const logged = captureStdout(() => { cards = loadKnowledgeCards(); });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, "Card One");
  assert.equal(cards[1].title, "Card Two");
  assert.match(logged, /knowledge_cards loaded/);
  assert.match(logged, /\b2\b/);
  assert.ok(logged.includes(cardsFile) || logged.includes("cards.json"));
  assert.ok(!logged.includes("body one"));
  assert.ok(!logged.includes("body two"));
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  resetKnowledgeCardsCacheForTests();
});
