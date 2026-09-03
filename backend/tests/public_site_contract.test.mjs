import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landingPage = readFileSync(new URL("../../site/index.html", import.meta.url), "utf8");
const privacyPage = readFileSync(new URL("../../site/privacy/index.html", import.meta.url), "utf8");
const releasePlist = readFileSync(new URL("../../them/Info-Release.plist", import.meta.url), "utf8");

test("[public-site] landing page exposes the canonical privacy and support routes", () => {
  assert.match(landingPage, /href="\/privacy\/"/);
  assert.match(landingPage, /mailto:support@them\.io/);
});

test("[public-site] privacy page covers stored writing, AI processing, and user choices", () => {
  assert.match(privacyPage, /Screenplay drafts, prompts, notes, and project content/);
  assert.match(privacyPage, /OpenAI and ElevenLabs/);
  assert.match(privacyPage, /We do not sell personal data/);
  assert.match(privacyPage, /request deletion of stored conversation and memory data/);
  assert.match(privacyPage, /mailto:privacy@them\.io/);
});

test("[public-site] release build points at the published privacy route", () => {
  assert.match(releasePlist, /<string>https:\/\/them\.io\/privacy<\/string>/);
});
