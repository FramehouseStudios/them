#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReleaseReadinessArtifact } from "../lib/screenwriting_knowledge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const artifact = buildReleaseReadinessArtifact({
  cardsFile: process.env.KNOWLEDGE_CARDS_FILE || path.join(backendDir, "knowledge_cards.json"),
  cacheFile: process.env.KNOWLEDGE_RAG_EMBEDDING_CACHE_FILE || path.join(backendDir, "knowledge_embeddings_cache.json"),
});
const outFile = process.env.SCREENWRITING_READINESS_ARTIFACT || path.join(__dirname, "screenwriting_release_readiness.latest.json");
fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2) + "\n");
console.log(JSON.stringify(artifact, null, 2));
if (process.env.KNOWLEDGE_REQUIRE_SCREENWRITING_EMBED_CACHE === "1" && !artifact.ready) {
  process.exit(1);
}
