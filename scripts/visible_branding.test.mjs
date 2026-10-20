import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('all app property lists identify THEM and describe permission use', () => {
  for (const file of ['Info.plist', 'Info-Debug.plist', 'Info-Release.plist']) {
    const content = read(`them/${file}`);
    assert.match(content, /<key>CFBundleDisplayName<\/key>\s*<string>THEM<\/string>/);
    for (const key of ['NSContactsUsageDescription', 'NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription']) {
      assert.match(content, new RegExp(`<key>${key}</key>\\s*<string>THEM uses .+</string>`));
    }
  }
});

test('all app build configurations use THEM without changing bundle identity', () => {
  const project = read('them.xcodeproj/project.pbxproj');
  assert.equal([...project.matchAll(/INFOPLIST_KEY_CFBundleDisplayName = "THEM";/g)].length, 4);
  assert.equal([...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = io\.them\.them;/g)].length, 4);
  assert.doesNotMatch(project, /INFOPLIST_KEY_CFBundleDisplayName = "io\.them";/);
});

test('branding preserves voice-key custody and print preference identifiers', () => {
  assert.match(read('them/CompanionTtsProviderSettings.swift'), /service = "io\.them\.companion\.elevenlabs\.byok"/);
  const print = read('them/ScreenplayPrintService.swift');
  assert.match(print, /disabledKey = "io\.them\.printDisabled"/);
  assert.match(print, /enabledKey\s*= "io\.them\.printEnabled"/);
});

test('writing status reset uses the same Clementine copy as insertion', () => {
  const bridge = read('them/ScreenplayLiveDraftBridge.swift');
  assert.match(bridge, /autoInsertStatusText = "Clementine is writing\.\.\."/);
  assert.match(bridge, /autoInsertStatusText == "Clementine is writing\.\.\."/);
  assert.doesNotMatch(bridge, /autoInsertStatusText.*"io\.them/);
});

test('client persona identifies Clementine rather than the product as the speaker', () => {
  assert.match(read('them/HerVoiceSpec.swift'), /You are Clementine, the writing companion in THEM\./);
  assert.doesNotMatch(read('them/HerVoiceSpec.swift'), /You are io\.them\./);
});
