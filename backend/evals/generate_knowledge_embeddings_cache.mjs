#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCREENWRITING_EMBEDDING_DIMENSIONS,
  SCREENWRITING_EMBEDDING_MODEL,
  buildKnowledgeCardEmbeddingText,
  hashSha256,
  loadKnowledgeCorpus,
} from "../lib/screenwriting_knowledge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const cardsFile = process.env.KNOWLEDGE_CARDS_FILE || path.join(backendDir, "knowledge_cards.json");
const cacheFile = process.env.KNOWLEDGE_RAG_EMBEDDING_CACHE_FILE || path.join(backendDir, "knowledge_embeddings_cache.json");
const envFile = path.join(backendDir, ".env");

function loadDotEnv() {
  if (!fs.existsSync(envFile)) return;
  const raw = fs.readFileSync(envFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function vectorNorm(vec) {
  return Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
}

async function fetchEmbeddingBatch(inputs) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.KNOWLEDGE_RAG_EMBEDDING_MODEL || SCREENWRITING_EMBEDDING_MODEL,
      dimensions: Number(process.env.KNOWLEDGE_RAG_EMBEDDING_DIMENSIONS || SCREENWRITING_EMBEDDING_DIMENSIONS),
      input: inputs,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(body || `embedding request failed: ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const json = await response.json();
  return (json.data || []).map((row) => row.embedding);
}

loadDotEnv();
if (!process.env.OPENAI_API_KEY) {
  console.error("[knowledge:embed] OPENAI_API_KEY is missing.");
  process.exit(2);
}

const model = process.env.KNOWLEDGE_RAG_EMBEDDING_MODEL || SCREENWRITING_EMBEDDING_MODEL;
const dimensions = Number(process.env.KNOWLEDGE_RAG_EMBEDDING_DIMENSIONS || SCREENWRITING_EMBEDDING_DIMENSIONS);
const corpus = loadKnowledgeCorpus({ cardsFile });
const cards = corpus.screenwritingCards;
if (cards.length < 200 || cards.length > 400) {
  console.error(`[knowledge:embed] expected 200-400 screenwriting cards, found ${cards.length}.`);
  process.exit(3);
}

let existing = { meta: {}, vectors: {} };
try {
  existing = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
} catch (_err) {
  existing = { meta: {}, vectors: {} };
}
const vectors = existing.vectors && typeof existing.vectors === "object" ? { ...existing.vectors } : {};
const pending = [];
for (const card of cards) {
  const text = buildKnowledgeCardEmbeddingText(card);
  const hash = hashSha256(text);
  const row = vectors[card.id];
  const upToDate = row &&
    row.hash === hash &&
    row.model === model &&
    Number(row.dimensions || 0) === dimensions &&
    Array.isArray(row.vector) &&
    row.vector.length === dimensions;
  if (!upToDate) pending.push({ card, text, hash });
}

const batchSize = Math.max(1, Math.min(64, Number(process.env.KNOWLEDGE_RAG_EMBEDDING_BATCH_SIZE || 64)));
console.log(`[knowledge:embed] cards=${cards.length} pending=${pending.length} model=${model} dims=${dimensions}`);
for (let i = 0; i < pending.length; i += batchSize) {
  const batch = pending.slice(i, i + batchSize);
  const embeddings = await fetchEmbeddingBatch(batch.map((item) => item.text));
  if (embeddings.length !== batch.length) {
    throw new Error(`embedding count mismatch: expected ${batch.length}, got ${embeddings.length}`);
  }
  for (let j = 0; j < batch.length; j += 1) {
    const vector = embeddings[j].map(Number);
    if (vector.length !== dimensions) {
      throw new Error(`dimension mismatch for ${batch[j].card.id}: ${vector.length}`);
    }
    vectors[batch[j].card.id] = {
      hash: batch[j].hash,
      model,
      dimensions,
      provider: "openai",
      vector,
      norm: vectorNorm(vector),
      updatedAt: Date.now(),
    };
  }
  console.log(`[knowledge:embed] embedded ${Math.min(i + batch.length, pending.length)}/${pending.length}`);
}

const payload = {
  meta: {
    model,
    dimensions,
    provider: "openai",
    corpus: corpus.meta?.corpus || "canonical_screenwriting_craft",
    cardCount: cards.length,
    updatedAt: Date.now(),
  },
  vectors,
};
fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2) + "\n");
console.log(`[knowledge:embed] wrote ${cacheFile}`);
