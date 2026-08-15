import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyClementineVoiceDirection,
  normalizeClementineEmotionLane,
  resolveClementineVoiceDirection,
} from "../lib/clementine_voice_director.js";

test("[voice-director] maps Clementine emotion lanes to distinct supported voices", () => {
  const expectations = new Map([
    ["warm_attuned", "marin"],
    ["calm_grounded_safe", "cedar"],
    ["bright_playful", "coral"],
    ["clear_confident", "ballad"],
  ]);

  for (const [lane, voice] of expectations) {
    const direction = resolveClementineVoiceDirection(lane);
    assert.equal(direction.emotionLane, lane);
    assert.equal(direction.voice, voice);
    assert.match(direction.instructions, /same grounded identity; modulate delivery only/i);
  }
});

test("[voice-director] normalizes unknown input to the warm neutral lane", () => {
  assert.equal(normalizeClementineEmotionLane(" WARM-ATTUNED "), "warm_attuned");
  assert.equal(normalizeClementineEmotionLane("unknown"), "curious_steady");
  assert.equal(resolveClementineVoiceDirection(null).voice, "marin");
});

test("[voice-director] preserves provider identity while adding delivery controls", () => {
  const profile = applyClementineVoiceDirection({
    provider: "elevenlabs",
    elevenlabsVoiceId: "clementine-id",
    elevenlabsSettings: { similarityBoost: 0.91 },
  }, "bright_playful");

  assert.equal(profile.provider, "elevenlabs");
  assert.equal(profile.elevenlabsVoiceId, "clementine-id");
  assert.equal(profile.openaiVoice, "coral");
  assert.equal(profile.emotionLane, "bright_playful");
  assert.equal(profile.elevenlabsSettings.similarityBoost, 0.91);
  assert.equal(profile.elevenlabsSettings.style, 0.44);
});
