// M3a — genre/tone/mood omniscient 3-act knowledge for any user request.
// Fallback when genre open vocab: closest genre or horror+sci-fi heuristics.
// No backend/index.js growth.

const GENRE_BEATS = {
  horror: {
    setup: ["dread + inciting transgression", "introduce ensemble, flaw seeded"],
    confrontation: ["escalating dread / want vs survival", "midpoint false safety, then cost sharpens"],
    resolution: ["payoff pays cost, image echo, dread lingers"],
    motif: "listening shadow / memory of room",
    ending: ["final girl cost", "everyone remembered by room"],
  },
  "sci-fi": {
    setup: ["world rule + wonder, inciting anomaly", "ensemble distinct expertise"],
    confrontation: ["system vs humanity, fake-set reveal", "midpoint wonder becomes threat"],
    resolution: ["new physics or human cost, restored rule with scar"],
    motif: "fake set glitch / orbital window",
    ending: ["transcendence", "grounded cost"],
  },
  thriller: {
    setup: ["promise of threat, clock started", "protagonist flaw vs stakes"],
    confrontation: ["clock + betrayal, want vs obstacle tightens", "midpoint twist"],
    resolution: ["choice under pressure, twist earns cost"],
    motif: "ticking clock / unreliable signal",
    ending: ["truth wins, trust lost"],
  },
  comedy: {
    setup: ["status quo flaw, lie seeded", "ensemble comic roles"],
    confrontation: ["escalation of lie, set pieces", "midpoint false win"],
    resolution: ["truth + tag, relationship restored"],
    motif: "running gag becomes truth",
    ending: ["earnest win"],
  },
  drama: {
    setup: ["intimate world, want vs need", "relationship seeded"],
    confrontation: ["pressure tests need, midpoint reversal", "bad choices close in"],
    resolution: ["need chosen at cost, quiet image"],
    motif: "unspoken truth",
    ending: ["bittersweet grace"],
  },
  romance: {
    setup: ["meet cute + flaw, world keeps apart", "chemistry spark"],
    confrontation: ["intimacy deepens, obstacle sharpens", "midpoint kiss / break"],
    resolution: ["grand gesture, love costs old self"],
    motif: "kept object / letter",
    ending: ["together changed"],
  },
  mystery: {
    setup: ["crime / question + detective flaw", "suspects introduced"],
    confrontation: [" clues + red herrings, midpoint reveal", "detective's blind spot"],
    resolution: ["truth assembled, justice or its price"],
    motif: "missing piece",
    ending: ["order restored, loss remains"],
  },
  fantasy: {
    setup: ["ordinary + hidden world rule", "call + refusal"],
    confrontation: ["trials, mentor, midpoint power", "allies/enemies test"],
    resolution: ["sacrifice, world rebalanced"],
    motif: "relic / map",
    ending: ["return changed"],
  },
  action: {
    setup: ["status quo + inciting attack", "team assembled"],
    confrontation: ["set pieces escalate, midpoint setback", "plan vs chaos"],
    resolution: ["final set piece, cost paid in body"],
    motif: "weapon / vehicle as character",
    ending: ["victory, scar kept"],
  },
};

const TONE_HINTS = {
  dark: { rhythm: "short, clipped", palette: "low light, shadow", subtext: "what's unsaid is threat" },
  tense: { rhythm: "staccato", palette: "tight frames", subtext: "clock audible" },
  melancholic: { rhythm: "long holds", palette: "dust, window light", subtext: "loss under line" },
  uplifting: { rhythm: "open, breathing", palette: "warm practicals", subtext: "hope despite cost" },
  whimsical: { rhythm: "playful beats", palette: "color pop", subtext: "wit hides fear" },
  cynical: { rhythm: "dry, deadpan", palette: "flat fluorescents", subtext: "joke is armor" },
  grounded: { rhythm: "naturalistic pause", palette: "practicals, handheld", subtext: "truth in silence" },
  operatic: { rhythm: "lingering, score-led", palette: "wide + push", subtext: "feeling over plot" },
};

const MOOD_HINTS = {
  dread: { light: "cold top", sound: "room tone + whisper", tempo: "slow, holds" },
  awe: { light: "orbital window bloom", sound: "air system hum", tempo: "wonder pause" },
  longing: { light: "window falloff", sound: "distant song", tempo: "lingering two-shot" },
  grief: { light: "overexposed memory", sound: "muted outside", tempo: "held silence" },
  euphoria: { light: "bright practicals", sound: "music lifts", tempo: "quickening" },
  paranoia: { light: "flicker", sound: "unreliable signal", tempo: "jagged cuts" },
};

function normalizeKey(s) { return String(s || "").trim().toLowerCase(); }

function closestGenre(raw) {
  const g = normalizeKey(raw);
  if (GENRE_BEATS[g]) return g;
  if (g.includes("sci")) return "sci-fi";
  if (g.includes("folk") || g.includes("slasher") || g.includes("gothic")) return "horror";
  if (g.includes("rom")) return "romance";
  if (g.includes("myst")) return "mystery";
  if (g.includes("fant")) return "fantasy";
  if (g.includes("comed")) return "comedy";
  if (g.includes("thrill")) return "thriller";
  if (g.includes("action") || g.includes("adventure")) return "action";
  if (g.includes("drama")) return "drama";
  return "drama"; // safe fallback is human drama
}

function getThreeActBeats({ genre, tone, mood, influences } = {}) {
  const gKey = closestGenre(genre);
  const beats = GENRE_BEATS[gKey] || GENRE_BEATS.drama;
  const toneKey = normalizeKey(tone || influences?.tones?.[0] || "");
  const moodKey = normalizeKey(mood || "");
  const toneHint = TONE_HINTS[toneKey] || null;
  const moodHint = MOOD_HINTS[moodKey] || null;

  const directors = Array.isArray(influences?.directors) ? influences.directors : [];
  const directorHint = directors.length ? `Directors: ${directors.join(", ")}` : "";

  return {
    genre: gKey,
    rawGenre: normalizeKey(genre),
    acts: [
      { id: "act1", title: "Setup", pages: 5, beats: beats.setup },
      { id: "act2", title: "Confrontation", pages: 5, beats: beats.confrontation },
      { id: "act3", title: "Resolution", pages: 5, beats: beats.resolution },
    ],
    motif: beats.motif,
    ending: beats.ending,
    voiceHints: toneHint ? `${toneKey}: ${toneHint.rhythm} / ${toneHint.palette} / ${toneHint.subtext}` : (toneKey ? `${toneKey}` : ""),
    imageEcho: moodHint ? `${moodKey}: ${moodHint.light} / ${moodHint.sound} / ${moodHint.tempo}` : (moodKey ? `${moodKey}` : ""),
    directorHint,
    toneHint,
    moodHint,
  };
}

export { GENRE_BEATS, TONE_HINTS, MOOD_HINTS, closestGenre, getThreeActBeats };
