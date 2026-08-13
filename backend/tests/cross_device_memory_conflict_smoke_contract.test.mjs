import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../evals/run_cross_device_memory_conflict_smoke.mjs", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../../them/BackendMemoryAPI.swift", import.meta.url),
  "utf8",
);

test("[cross-device-memory-conflict] races authenticated iPhone and macOS writes", () => {
  assert.match(source, /devices: \["iPhone", "macOS"\]/);
  assert.match(source, /const storyRace = await Promise\.all/);
  assert.match(source, /const preferenceRace = await Promise\.all/);
  assert.match(source, /const characterRace = await Promise\.all/);
  assert.match(source, /item\.status === 200/);
  assert.match(source, /item\.status === 409/);
  assert.match(source, /stale_creative_memory_revision/);
});

test("[cross-device-memory-conflict] refreshes before retry and verifies durable canon", () => {
  assert.match(source, /const storyRetry = await updateStorySpine/);
  assert.match(source, /const afterPreference = await getMemories/);
  assert.match(source, /const preferenceRetry = await updatePreference/);
  assert.match(source, /const finalCharacter = await updateCharacter/);
  assert.match(source, /const staleResolution = await resolveCorrection/);
  assert.match(source, /const staleUndo = await undoCorrection/);
  assert.match(source, /const correctedUndo = await undoCorrection/);
  assert.match(source, /Free Eli without becoming her father/);
  assert.match(source, /finalRevision === correctedUndo\.payload\.creative_memory_revision/);
});

test("[cross-device-memory-conflict] Apple client automatically sends the observed revision", () => {
  assert.match(clientSource, /expected_creative_memory_revision/);
  assert.match(clientSource, /X-Creative-Memory-Revision/);
  assert.match(clientSource, /expected_state_version/);
  assert.match(clientSource, /X-State-Version/);
  assert.match(clientSource, /"\/memories\/corrections\/undo"/);
  assert.match(clientSource, /"\/memories\/corrections\/resolve"/);
  assert.match(clientSource, /"\/memories\/update"/);
  assert.match(clientSource, /latestCreativeMemoryRevision\.isEmpty/);
  assert.match(clientSource, /fetchMemories\(limit: 1, force: true\)/);
});
