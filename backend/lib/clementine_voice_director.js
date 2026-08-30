const DEFAULT_EMOTION_LANE = "curious_steady";

const VOICE_DIRECTIONS = Object.freeze({
  curious_steady: Object.freeze({
    voice: "marin",
    instructions: "Speak as Clementine with warm curiosity, close attention, and an unhurried natural rhythm. Keep the same grounded identity; modulate delivery only.",
    elevenlabs: Object.freeze({ stability: 0.52, style: 0.2 }),
  }),
  warm_attuned: Object.freeze({
    voice: "marin",
    instructions: "Speak as Clementine with intimate warmth, emotional attunement, and gentle confidence. Keep the same grounded identity; modulate delivery only.",
    elevenlabs: Object.freeze({ stability: 0.5, style: 0.24 }),
  }),
  warm_precise_containment: Object.freeze({
    voice: "cedar",
    instructions: "Speak as Clementine with steady warmth, quiet precision, and reassuring restraint. Keep the same grounded identity; modulate delivery only.",
    elevenlabs: Object.freeze({ stability: 0.68, style: 0.1 }),
  }),
  calm_grounded_safe: Object.freeze({
    voice: "cedar",
    instructions: "Speak as Clementine slowly and calmly, with grounded safety and no theatrical intensity. Keep the same grounded identity; modulate delivery only.",
    elevenlabs: Object.freeze({ stability: 0.74, style: 0.06 }),
  }),
  bright_playful: Object.freeze({
    voice: "coral",
    instructions: "Speak as Clementine with bright playfulness, light wit, and responsive energy without becoming exaggerated. Keep the same grounded identity; modulate delivery only.",
    elevenlabs: Object.freeze({ stability: 0.38, style: 0.44 }),
  }),
  energizing_grounded: Object.freeze({
    voice: "coral",
    instructions: "Speak as Clementine with forward momentum, creative energy, and grounded encouragement. Keep the same grounded identity; modulate delivery only.",
    elevenlabs: Object.freeze({ stability: 0.42, style: 0.36 }),
  }),
  clear_confident: Object.freeze({
    voice: "ballad",
    instructions: "Speak as Clementine with lucid confidence, clean emphasis, and decisive pacing without sounding formal. Keep the same grounded identity; modulate delivery only.",
    elevenlabs: Object.freeze({ stability: 0.58, style: 0.16 }),
  }),
  clear_curious: Object.freeze({
    voice: "ballad",
    instructions: "Speak as Clementine with clear curiosity, thoughtful lift, and concise confidence. Keep the same grounded identity; modulate delivery only.",
    elevenlabs: Object.freeze({ stability: 0.54, style: 0.2 }),
  }),
});

function normalizeClementineEmotionLane(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return Object.hasOwn(VOICE_DIRECTIONS, normalized)
    ? normalized
    : DEFAULT_EMOTION_LANE;
}

function resolveClementineVoiceDirection(emotionLane) {
  const lane = normalizeClementineEmotionLane(emotionLane);
  const direction = VOICE_DIRECTIONS[lane];
  return Object.freeze({
    emotionLane: lane,
    voice: direction.voice,
    instructions: direction.instructions,
    elevenlabs: direction.elevenlabs,
  });
}

function applyClementineVoiceDirection(voiceProfile = {}, emotionLane = "") {
  const direction = resolveClementineVoiceDirection(emotionLane);
  return {
    ...voiceProfile,
    emotionLane: direction.emotionLane,
    openaiVoice: direction.voice,
    openaiInstructions: direction.instructions,
    elevenlabsSettings: {
      ...(voiceProfile?.elevenlabsSettings || {}),
      ...direction.elevenlabs,
    },
  };
}

export {
  DEFAULT_EMOTION_LANE,
  VOICE_DIRECTIONS,
  applyClementineVoiceDirection,
  normalizeClementineEmotionLane,
  resolveClementineVoiceDirection,
};
