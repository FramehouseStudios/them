// T-twist-engine — Craft Intelligence Suite, Layer 2.
//
// Produces structured beat-aware reversal suggestions. Two modes:
//
//   - Deterministic stub (default): canonical twist patterns mapped to
//     the major-turn beats of each framework (Save the Cat, Story
//     Circle, Hero's Journey, Three-Act). Pure, fast, no LLM.
//
//   - LLM mode: when a T21-style classifier is supplied with kind
//     "openai", we route the request through `classifier.classifyScene`
//     with a twist-prompt and parse the structured response. Mirrors
//     the logline_distiller pattern.
//
// Public surface:
//
//   suggestTwists({ frameworkId, currentBeatId, sceneSummary?, count?,
//                   classifier?, forceMode? })
//     -> { twists: [{ id, label, hook, severity, rationale }] }
//
// Severity is the *narrative* weight of the proposed twist — `high`
// is a major reversal (villain was right), `medium` is a redirect
// (ally has a secret), `low` is a flavor twist (the setting itself
// shifts). iOS can use severity to gate the card prominence.

const TWIST_SCHEMA_VERSION = 1;
const MAX_COUNT = 6;
const DEFAULT_COUNT = 3;

// Canonical twist library keyed by framework + beat. Each entry is an
// ordered list of seed twists; suggestTwists slices according to
// `count`. The IDs are stable so iOS can dedupe / pin / dismiss.
const TWIST_LIBRARY = Object.freeze({
  "save-the-cat": {
    catalyst: [
      { id: "stc-catalyst-1", label: "Inverted Catalyst", hook: "The event the hero wants is actually the trap they walk into.", severity: "high", rationale: "Reframes the catalyst so the audience sees the cost before the hero does." },
      { id: "stc-catalyst-2", label: "Wrong Witness", hook: "Someone the hero trusts saw what really happened and lies about it.", severity: "medium", rationale: "Sows a deception that pays off at midpoint." },
      { id: "stc-catalyst-3", label: "False Permission", hook: "The hero is given a green light that was never the authority's to give.", severity: "medium", rationale: "Setup for an Act II reversal of consent." },
    ],
    midpoint: [
      { id: "stc-midpoint-1", label: "False Victory", hook: "The win at midpoint is real, but the cost was paid by the wrong person.", severity: "high", rationale: "Classic midpoint inversion — converts a triumph into a trap." },
      { id: "stc-midpoint-2", label: "Ally Reveal", hook: "The ally is loyal to a different cause and has been all along.", severity: "high", rationale: "Loads the All Is Lost with personal betrayal." },
      { id: "stc-midpoint-3", label: "Mirror Moment", hook: "The hero meets a future version of themselves and walks away changed.", severity: "medium", rationale: "Internal twist that re-aims the third act." },
    ],
    "all-is-lost": [
      { id: "stc-ail-1", label: "Villain Was Right", hook: "The hero realizes the antagonist's framing of the problem was correct.", severity: "high", rationale: "Forces a moral reckoning before the finale." },
      { id: "stc-ail-2", label: "Missing Piece Was Held", hook: "The thing they need has been in their hand the whole time, mislabeled.", severity: "medium", rationale: "Sets up an emotionally earned finale." },
      { id: "stc-ail-3", label: "Sacrifice Refuses", hook: "The character meant to sacrifice themselves walks away.", severity: "high", rationale: "Inverts the genre expectation; the cost lands on the hero instead." },
    ],
    finale: [
      { id: "stc-finale-1", label: "Pyrrhic Win", hook: "They achieve the explicit goal but lose the implicit one.", severity: "high", rationale: "Earns a bittersweet ending without retconning the climax." },
      { id: "stc-finale-2", label: "Witness Inversion", hook: "The person they did it for is no longer the person they thought.", severity: "medium", rationale: "Recasts the finale's emotional stakes." },
      { id: "stc-finale-3", label: "Premise Re-Lit", hook: "The opening image returns with one element altered — that change is the story.", severity: "low", rationale: "Visual/structural twist; gives the audience a coda image." },
    ],
  },
  "three-act": {
    "inciting-incident": [
      { id: "ta-incident-1", label: "Off-Stage Incident", hook: "What looks like the catalyst happened weeks ago; we see the second wave.", severity: "medium", rationale: "Shifts the audience's question from \"what?\" to \"why now?\"." },
      { id: "ta-incident-2", label: "Mistaken Hero", hook: "The protagonist was not the intended target; they're a stand-in.", severity: "high", rationale: "Drives identity and worthiness through Act II." },
      { id: "ta-incident-3", label: "Self-Inflicted", hook: "The hero caused the inciting incident without realizing it.", severity: "high", rationale: "Loads Act II with delayed self-knowledge." },
    ],
    "midpoint-twist": [
      { id: "ta-midpoint-1", label: "Quest Re-Aimed", hook: "The midpoint reveals the goal was wrong, but the journey is still right.", severity: "high", rationale: "Keeps momentum while re-stating the question." },
      { id: "ta-midpoint-2", label: "Antagonist Sympathy", hook: "We learn the antagonist's want is identical to the hero's.", severity: "medium", rationale: "Sets up an Act III moral collision." },
      { id: "ta-midpoint-3", label: "Stakes Personal", hook: "An impersonal goal becomes personal — a name, a face, a debt.", severity: "medium", rationale: "Standard but high-leverage; gives Act III a specific cost." },
    ],
    climax: [
      { id: "ta-climax-1", label: "Off-Stage Decision", hook: "The decisive choice was made earlier, off-screen; the climax is its echo.", severity: "high", rationale: "Inverts climax expectations; rewards careful readers." },
      { id: "ta-climax-2", label: "Antagonist Wins, Then Yields", hook: "The antagonist wins the explicit fight and chooses to lose.", severity: "high", rationale: "Earns a redemption climax without retconning intent." },
      { id: "ta-climax-3", label: "Climax Off-Screen", hook: "We see the consequence, not the act; the absence is the reveal.", severity: "medium", rationale: "Visual/structural twist for restrained genres." },
    ],
  },
  "story-circle": {
    need: [
      { id: "sc-need-1", label: "Hidden Need", hook: "The character thinks they want X; what they need is the opposite of X.", severity: "medium", rationale: "Standard Dan Harmon \"need\" inversion — drives the circle." },
      { id: "sc-need-2", label: "Comfortable Lie", hook: "The character is genuinely happy and the audience knows it's a cage.", severity: "high", rationale: "Inverts viewer sympathy; the journey is the cost." },
      { id: "sc-need-3", label: "Need Belongs to Another", hook: "The need we identify with belongs to a side character; the protagonist must be taught.", severity: "medium", rationale: "Shifts POV gravity without changing who carries the scenes." },
    ],
    go: [
      { id: "sc-go-1", label: "Forced Step", hook: "They didn't choose to go; they were taken (gently, deceptively, or kindly).", severity: "medium", rationale: "Keeps the threshold crossing but inverts agency." },
      { id: "sc-go-2", label: "Threshold Refused", hook: "They cross by refusing to cross; standing still becomes the radical act.", severity: "high", rationale: "Useful for slower stories where action is internal." },
      { id: "sc-go-3", label: "Wrong Door", hook: "They go through the door they thought was the wrong one and discover it was right.", severity: "low", rationale: "Quiet structural twist; emphasizes choice over certainty." },
    ],
    find: [
      { id: "sc-find-1", label: "Found Self, Not Goal", hook: "What they find is themselves; the goal vanishes when they look directly at it.", severity: "high", rationale: "Anchors the circle on identity, not plot." },
      { id: "sc-find-2", label: "Found Was Placed", hook: "What they find was deliberately placed for them to find.", severity: "high", rationale: "Sets up a benefactor or manipulator that complicates Act III." },
      { id: "sc-find-3", label: "Find Costs Knowing", hook: "Finding the thing destroys their ability to be the person who wanted it.", severity: "medium", rationale: "Tragic-circle option; earns the return-changed pivot." },
    ],
    "return-changed": [
      { id: "sc-return-1", label: "Return as Ghost", hook: "They return to a world that no longer fits them; the change is only legible to them.", severity: "high", rationale: "Earns ambiguity without confusion." },
      { id: "sc-return-2", label: "Return Witnessed", hook: "Only one person — usually the least likely — sees that they have changed.", severity: "medium", rationale: "Pays off a quiet character relationship." },
      { id: "sc-return-3", label: "Return Refused", hook: "They choose not to return; the old world becomes the new threshold.", severity: "high", rationale: "Inverts the circle's resolution; works as a series-setter." },
    ],
  },
  "hero-journey": {
    "call-to-adventure": [
      { id: "hj-call-1", label: "Quiet Call", hook: "The call is delivered without urgency — a letter, a memory, a stranger's offhand line.", severity: "low", rationale: "Tonal twist; works for character-driven genres." },
      { id: "hj-call-2", label: "Wrong Caller", hook: "The figure issuing the call has been the antagonist all along.", severity: "high", rationale: "Sets up an Act II identity collision." },
      { id: "hj-call-3", label: "Hero Issues Call", hook: "The protagonist calls themselves — there is no external summons.", severity: "medium", rationale: "Inverts the journey's external prompt into a willed act." },
    ],
    "crossing-first-threshold": [
      { id: "hj-threshold-1", label: "Soft Threshold", hook: "They cross without realizing it; the world has already changed around them.", severity: "medium", rationale: "Works for genres where the call is internal." },
      { id: "hj-threshold-2", label: "Threshold as Trap", hook: "Crossing is the antagonist's plan; the journey is the prison.", severity: "high", rationale: "Sets up an inverted return where the threshold itself is the boss." },
      { id: "hj-threshold-3", label: "Threshold Reversed", hook: "Crossing means going home — the strange world is where they started.", severity: "high", rationale: "Useful for fish-out-of-water inversions." },
    ],
    ordeal: [
      { id: "hj-ordeal-1", label: "Wrong Ordeal", hook: "The thing they thought was the ordeal was the warm-up; the real one is structural.", severity: "high", rationale: "Resets stakes without erasing prior cost." },
      { id: "hj-ordeal-2", label: "Ordeal Already Survived", hook: "They have already passed the test — and don't know it yet.", severity: "medium", rationale: "Ironic ordeal; pays off in resurrection." },
      { id: "hj-ordeal-3", label: "Ordeal Witnessed", hook: "An ally is the one being tested; the hero can only watch.", severity: "high", rationale: "Forces a passive hero into accepting helplessness." },
    ],
    resurrection: [
      { id: "hj-resurrection-1", label: "Risen as Other", hook: "Who returns is not who left; the body is the same and the soul is rotated.", severity: "high", rationale: "Earns the journey's transformation visibly." },
      { id: "hj-resurrection-2", label: "Resurrection Refused", hook: "Given the chance to return, they choose to stay dead to the old world.", severity: "high", rationale: "Tragic resurrection; works in genre cinema." },
      { id: "hj-resurrection-3", label: "Resurrection Quiet", hook: "There is no grand return; a small ordinary act signals the change.", severity: "low", rationale: "Restrained resurrection for prestige drama." },
    ],
  },
});

function getFrameworkTwists(frameworkId) {
  if (!frameworkId || typeof frameworkId !== "string") return null;
  return TWIST_LIBRARY[frameworkId] || null;
}

function clampCount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.max(1, Math.min(MAX_COUNT, Math.floor(n)));
}

function deterministicTwists({ frameworkId, currentBeatId, count = DEFAULT_COUNT }) {
  const fw = getFrameworkTwists(frameworkId);
  if (!fw) {
    const e = new Error(`unknown framework: ${frameworkId}`);
    e.code = "twist_unknown_framework";
    throw e;
  }
  const beat = fw[currentBeatId];
  if (!beat) {
    const e = new Error(`framework ${frameworkId} has no canonical twists for beat: ${currentBeatId}`);
    e.code = "twist_unknown_beat";
    throw e;
  }
  return beat.slice(0, clampCount(count));
}

async function llmTwists({ frameworkId, currentBeatId, sceneSummary, count, classifier }) {
  // Defensive fallback if the classifier doesn't expose classifyScene.
  if (!classifier || typeof classifier.classifyScene !== "function") {
    return deterministicTwists({ frameworkId, currentBeatId, count });
  }
  try {
    const result = await classifier.classifyScene({
      framework: frameworkId,
      scene: {
        title: "TWIST REQUEST",
        text:
          `Suggest ${clampCount(count)} structured reversal twists for the "${currentBeatId}" beat of the "${frameworkId}" framework. ` +
          "Each twist is a JSON object: { id, label, hook, severity (high|medium|low), rationale }. " +
          `Return JSON: { "beatId": "${currentBeatId}", "confidence": 1, "rationale": "<JSON.stringify of the twists array>" }.\n\n` +
          (sceneSummary ? `Scene summary so far:\n${String(sceneSummary).slice(0, 4000)}` : ""),
      },
    });
    const raw = result?.rationale;
    if (typeof raw !== "string" || !raw.trim()) {
      return deterministicTwists({ frameworkId, currentBeatId, count });
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return deterministicTwists({ frameworkId, currentBeatId, count });
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return deterministicTwists({ frameworkId, currentBeatId, count });
    }
    // Best-effort shape coercion. Anything missing/invalid gets dropped.
    const cleaned = [];
    for (const t of parsed) {
      if (!t || typeof t !== "object") continue;
      const id = typeof t.id === "string" && t.id.trim() ? t.id.trim() : null;
      const label = typeof t.label === "string" && t.label.trim() ? t.label.trim() : null;
      const hook = typeof t.hook === "string" && t.hook.trim() ? t.hook.trim() : null;
      let severity = typeof t.severity === "string" ? t.severity.toLowerCase() : "";
      if (!["high", "medium", "low"].includes(severity)) severity = "medium";
      const rationale = typeof t.rationale === "string" && t.rationale.trim()
        ? t.rationale.trim()
        : "";
      if (!id || !label || !hook) continue;
      cleaned.push({ id, label, hook, severity, rationale });
      if (cleaned.length >= clampCount(count)) break;
    }
    if (cleaned.length === 0) return deterministicTwists({ frameworkId, currentBeatId, count });
    return cleaned;
  } catch (_e) {
    return deterministicTwists({ frameworkId, currentBeatId, count });
  }
}

async function suggestTwists({
  frameworkId,
  currentBeatId,
  sceneSummary = "",
  count = DEFAULT_COUNT,
  classifier = null,
  forceMode = null,
} = {}) {
  if (!frameworkId || typeof frameworkId !== "string") {
    const e = new Error("frameworkId is required");
    e.code = "twist_invalid_input";
    throw e;
  }
  if (!currentBeatId || typeof currentBeatId !== "string") {
    const e = new Error("currentBeatId is required");
    e.code = "twist_invalid_input";
    throw e;
  }
  const useLLM = forceMode
    ? forceMode === "llm"
    : (classifier && classifier.kind === "openai");
  let twists;
  if (useLLM && classifier) {
    twists = await llmTwists({
      frameworkId, currentBeatId, sceneSummary, count, classifier,
    });
  } else {
    twists = deterministicTwists({ frameworkId, currentBeatId, count });
  }
  return {
    schemaVersion: TWIST_SCHEMA_VERSION,
    frameworkId,
    currentBeatId,
    source: useLLM ? "openai" : "stub",
    twists,
  };
}

export {
  suggestTwists,
  deterministicTwists,
  TWIST_LIBRARY,
  TWIST_SCHEMA_VERSION,
  MAX_COUNT,
  DEFAULT_COUNT,
};
