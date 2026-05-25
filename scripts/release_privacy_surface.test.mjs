import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootView = readFileSync(new URL("../them/RootExperienceView.swift", import.meta.url), "utf8");
const privacyManifest = readFileSync(new URL("../them/PrivacyInfo.xcprivacy", import.meta.url), "utf8");
const privacyMapping = readFileSync(new URL("../them/APP_STORE_PRIVACY_MAPPING.md", import.meta.url), "utf8");
const privacyPolicy = readFileSync(new URL("../them/PRIVACY_POLICY.md", import.meta.url), "utf8");
const appReviewChecklist = readFileSync(new URL("../them/APP_STORE_SUBMISSION_CHECKLIST.md", import.meta.url), "utf8");

test("[release-privacy-surface] support diagnostics are gated out of iOS release", () => {
  assert.match(rootView, /private var supportDiagnosticsEnabled: Bool/);
  assert.match(rootView, /#if DEBUG \|\| os\(macOS\)\s+return true\s+#else\s+return false/s);
  assert.match(rootView, /if supportDiagnosticsEnabled \{\s+NumberedChoiceActionButton\(\s+number: "2",\s+title: "Talk Diagnostics"/s);
  assert.match(rootView, /NumberedChoiceActionButton\(\s+number: "3",\s+title: "Send Debug Bundle"/s);
  assert.match(rootView, /guard supportDiagnosticsEnabled else \{ return \}\s+guard !IOThemRuntime\.isRunningTests else \{ return \}/);
  assert.match(rootView, /if supportDiagnosticsEnabled \{\s+await refreshTalkDiagnostics\(force: false\)\s+\}/);
});

test("[release-privacy-surface] privacy manifest includes Quick Email recipient address data", () => {
  assert.match(privacyManifest, /NSPrivacyCollectedDataTypeEmailAddress/);
  assert.match(privacyManifest, /NSPrivacyCollectedDataTypePurposeAppFunctionality/);
});

test("[release-privacy-surface] policy docs name contact flow and AI providers", () => {
  for (const document of [privacyMapping, privacyPolicy, appReviewChecklist]) {
    assert.match(document, /OpenAI/);
    assert.match(document, /ElevenLabs/);
    assert.match(document, /Quick Email/);
  }
  assert.match(privacyMapping, /Email Address/);
  assert.match(privacyPolicy, /Contacts access/);
  assert.match(appReviewChecklist, /Audio Data, User Content, and Email Address/);
});
