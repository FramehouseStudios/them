import {
  evaluateStoryObligationCorrectionAdherence,
  normalizeStoryObligationCorrections,
  supportsObligation,
} from "./story_obligation_correction_guard.js";

const LIVE_STUDIO_STRUCTURAL_CANARY_MIN_SCORE = 0.75;

const STORY_OBLIGATION_CORRECTIONS = Object.freeze([
  Object.freeze({
    obligation: "The red emergency flare in Mara's coat remains unspent until the harbor blackout.",
    action: "keep_open",
    correctedAt: 200,
  }),
  Object.freeze({
    obligation: "The bronze locker key opens the customs evidence vault.",
    action: "retire",
    correctedAt: 190,
  }),
]);

const AUTHORITATIVE_CANON = Object.freeze({
  projectTitle: "Split Ferries",
  protagonist: "Mara",
  act: "Act II",
  protagonistWant: "Mara wants to get Eli and June off the island before the last ferry leaves.",
  protagonistNeed: "Mara must learn that trusting someone does not mean surrendering control.",
  characterArcState: "Mara still controls every move and treats dependence as danger.",
  lastSceneOutcome: "Mara cornered Eli in the empty terminal, but he refused to repeat the memorized names until she trusted him.",
  unresolvedSetups: [
    "The cracked ferry token Mara gave June in Act I must return with changed meaning in the climax.",
    "The red emergency flare in Mara's coat remains unspent until the harbor blackout.",
  ],
  correctedTerms: [
    "The ferry ledger was burned at the Act I commitment and cannot be recovered intact.",
  ],
  correctionReplacements: [
    "Eli memorized the ledger's final page before it burned; his memory is the only surviving record.",
  ],
  endingImage: "Mara gives June the wheel and takes the passenger seat as dawn reaches the mainland.",
  storyObligationCorrections: STORY_OBLIGATION_CORRECTIONS,
});

function studioMeta() {
  const featureStoryGraph = {
    currentState: {
      act: AUTHORITATIVE_CANON.act,
      lastAcceptedOutcome: AUTHORITATIVE_CANON.lastSceneOutcome,
      characterArcState: AUTHORITATIVE_CANON.characterArcState,
      endingImage: AUTHORITATIVE_CANON.endingImage,
    },
    bindingFacts: [{
      kind: "irreversible_consequence",
      fact: AUTHORITATIVE_CANON.correctedTerms[0],
    }],
    openThreads: [
      {
        due: true,
        setup: AUTHORITATIVE_CANON.unresolvedSetups[1],
        promisedPayoff: "Mara must save the flare for the harbor blackout, when trusting June becomes the only way through.",
      },
      {
        due: false,
        setup: AUTHORITATIVE_CANON.unresolvedSetups[0],
        promisedPayoff: "June returns the cracked ferry token in the climax with changed meaning.",
      },
    ],
    storyObligationCorrections: STORY_OBLIGATION_CORRECTIONS,
  };
  return {
    screenplayProjectTitle: AUTHORITATIVE_CANON.projectTitle,
    screenplayAct: AUTHORITATIVE_CANON.act,
    screenplayLastSceneOutcome: AUTHORITATIVE_CANON.lastSceneOutcome,
    screenplayProtagonistWant: AUTHORITATIVE_CANON.protagonistWant,
    screenplayProtagonistNeed: AUTHORITATIVE_CANON.protagonistNeed,
    screenplayCharacterArcState: AUTHORITATIVE_CANON.characterArcState,
    screenplayEndingImage: AUTHORITATIVE_CANON.endingImage,
    screenplayUnresolvedSetups: AUTHORITATIVE_CANON.unresolvedSetups,
    screenplayCorrectedTerms: AUTHORITATIVE_CANON.correctedTerms,
    screenplayCorrectionReplacements: AUTHORITATIVE_CANON.correctionReplacements,
    screenplayFeatureStoryGraph: featureStoryGraph,
    screenplayStoryObligationCorrections: STORY_OBLIGATION_CORRECTIONS,
  };
}

const LIVE_STUDIO_STRUCTURAL_CANARY_CASES = Object.freeze([
  Object.freeze({
    id: "scene_doctor_canon_pressure",
    taskIntent: "scene_doctor",
    modelReason: "screenplay_scene_doctor",
    safeToLogSyntheticOutput: true,
    systemPrompt: [
      "You are Clementine, an elite feature-film story editor performing Scene Doctor work.",
      "Treat every CANON fact as authoritative. Never resurrect a retired fact or claim a proposal is remembered canon.",
      "Obey writer obligation corrections exactly: keep corrected-open setups unresolved and omit retired obligations entirely.",
      "Lead with one highest-leverage diagnosis, cite concrete scene evidence, prescribe one playable revision, and trace its causal effect into the character arc and Act III payoff.",
      "Return the final note only. Be decisive, emotionally perceptive, and screenplay-specific.",
    ].join("\n"),
    transcript: [
      "PROJECT: Split Ferries",
      "CANON:",
      "- Mara burned the ferry ledger at the Act I commitment. It cannot be recovered intact.",
      "- Eli memorized the ledger's final page. His memory is the only surviving record.",
      "- Mara's false belief is that trusting someone means surrendering control.",
      "- The cracked ferry token Mara gave June in Act I must pay off in the climax.",
      "WRITER OBLIGATION CORRECTIONS:",
      "- KEEP_OPEN: The red emergency flare in Mara's coat remains unspent until the harbor blackout.",
      "- RETIRE: The bronze locker key opening the customs evidence vault is out of canon and cannot return.",
      "CURRENT SCENE:",
      "In the empty terminal, Mara keeps searching lockers for the destroyed ledger while demanding that Eli prove he remembers the names. Eli refuses to repeat them until she trusts him. The argument circles without changing either character's leverage.",
      "Give the highest-leverage Scene Doctor diagnosis and a short playable replacement beat. Use the red flare as active pressure but keep it unspent for the harbor blackout. Explain exactly how the turn forces the next scene, advances Mara's arc, and sharpens the ferry-token payoff.",
    ].join("\n"),
    studioMeta: studioMeta(),
    maxTokens: 1_200,
  }),
  Object.freeze({
    id: "feature_architecture_causal_payoff",
    taskIntent: "outline_structure",
    modelReason: "screenplay_feature_architecture",
    safeToLogSyntheticOutput: true,
    systemPrompt: [
      "You are Clementine, an elite feature-film architect.",
      "Treat every CANON fact as authoritative. Build one causal movie, not a menu of frameworks.",
      "Obey writer obligation corrections exactly: keep corrected-open setups unresolved and omit retired obligations entirely.",
      "Make Act I force Act II, make the midpoint and crisis force Act III, and make the climax prove character change through behavior.",
      "Track the named setup into a specific earned payoff and end with the next three playable scenes.",
    ].join("\n"),
    transcript: [
      "PROJECT: Split Ferries",
      "CANON:",
      "- Mara wants to get Eli and June off the island before the last ferry leaves.",
      "- Mara believes trusting someone means surrendering control.",
      "- Mara burned the ferry ledger at the Act I commitment. It cannot be recovered intact.",
      "- Eli memorized the ledger's final page. His memory is the only surviving record.",
      "- The cracked ferry token Mara gave June in Act I must pay off in the climax.",
      "- KEEP_OPEN: The red emergency flare in Mara's coat must remain unspent until the harbor blackout.",
      "- RETIRE: The bronze locker key opening the customs evidence vault is out of canon and cannot return.",
      "- FINAL IMAGE: Mara gives June the wheel and takes the passenger seat as dawn reaches the mainland.",
      "Architect the feature from Act I through Act II and Act III. Include catalyst, commitment, midpoint reversal, crisis/all-is-lost, climax, final image, causal act bridges, Mara's want/need/false-belief arc, the token's setup/payoff path, and the next three playable scenes from the current Act II pressure. Keep the red flare visibly active but unresolved until the harbor blackout.",
    ].join("\n"),
    studioMeta: studioMeta(),
    maxTokens: 1_600,
  }),
  Object.freeze({
    id: "continuation_writer_obligation_corrections",
    outputKind: "page",
    taskIntent: "continue_scene",
    modelReason: "screenplay_page_write",
    safeToLogSyntheticOutput: true,
    systemPrompt: [
      "You are Clementine, an elite feature-film screenwriter continuing an accepted scene.",
      "Return only clean playable Fountain screenplay text. Preserve accepted state and writer authority.",
      "Keep corrected-open setups unresolved and omit retired obligations entirely.",
      "Change leverage through behavior and end on a consequence that forces the next scene.",
    ].join("\n"),
    transcript: [
      "PROJECT: Split Ferries",
      "ACCEPTED HANDOFF: Mara cornered Eli in the empty terminal, but he refused to repeat the memorized names until she trusted him.",
      "WRITER OBLIGATION CORRECTIONS:",
      "- KEEP_OPEN: The red emergency flare in Mara's coat remains unspent until the harbor blackout. Let it pressure this scene without igniting or resolving it.",
      "- RETIRE: The bronze locker key opening the customs evidence vault is out of canon. Do not include it.",
      "Continue for one screenplay page. Mara must choose a small act of trust that gives Eli leverage and forces them toward the harbor blackout.",
    ].join("\n"),
    studioMeta: {
      ...studioMeta(),
      screenplayTarget: "page",
      screenplayRequestedPages: 1,
      screenplayDraftExcerpt: "INT. EMPTY FERRY TERMINAL - NIGHT\nMara corners Eli beside the dark departures board. He refuses to repeat the names until she trusts him.",
      screenplayNextSceneExecutionBrief: {
        assignment: "Mara gives Eli one concrete piece of control, and he answers with one memorized name.",
        obstacle: "The terminal lights fail as the harbor blackout begins moving toward them.",
        arc: "Mara must practice trust without completing her transformation.",
        payoff: "Pressure the red emergency flare but leave it unspent.",
        exit: "The first memorized name points them toward the harbor.",
      },
    },
    maxTokens: 1_600,
  }),
]);

function average(checks) {
  const values = Object.values(checks);
  return values.filter(Boolean).length / Math.max(1, values.length);
}

function causalConnectorCount(text) {
  return (text.match(/\b(?:because|therefore|which forces|forcing|as a result|leads to|drives|creates|so that|makes [^.\n]{0,80} inevitable)\b/gi) || []).length;
}

function classifyLiveStudioCanaryProviderError(error = null) {
  const statusValue = Number(error?.status || 0);
  const status = Number.isFinite(statusValue) ? Math.max(0, Math.round(statusValue)) : 0;
  const fingerprint = [error?.message, error?.code, error?.type]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  let category = "provider_request_failed";
  let retryable = status >= 500;
  if (status === 429 && /(?:quota|credit|billing|balance)/i.test(fingerprint)) {
    category = "provider_quota_exhausted";
    retryable = false;
  } else if (status === 429) {
    category = "provider_rate_limited";
    retryable = true;
  } else if (status === 401 || status === 403) {
    category = "provider_auth_failed";
    retryable = false;
  } else if (/\b(?:timeout|timed out|abort(?:ed)?)\b/i.test(fingerprint)) {
    category = "provider_timeout";
    retryable = true;
  }
  return {
    category,
    status,
    stage: String(error?.stage || "studio_render").replace(/[^a-z0-9_-]/gi, "").slice(0, 48) || "studio_render",
    retryable,
  };
}

function scoreWriterCorrectionAdherence(reply = "", corrections = []) {
  const normalized = normalizeStoryObligationCorrections(corrections);
  if (!normalized.length) {
    return { applicable: false, passed: true, score: 1, checks: {} };
  }
  const guard = evaluateStoryObligationCorrectionAdherence({ text: reply, corrections: normalized });
  const keepOpen = normalized.filter((item) => item.action === "keep_open");
  const retired = normalized.filter((item) => item.action === "retire");
  const checks = {
    deterministicGuard: guard.ok,
    namesCorrectedOpenSetup: keepOpen.every((item) => supportsObligation(reply, item.obligation)),
    preservesOpenState: keepOpen.every((item) => (
      supportsObligation(reply, item.obligation) &&
      /\b(?:remain|remains|still|keep|keeps|leave|leaves|hold|holds|save|saves|reserve|reserves|carry|carries)\b.{0,90}\b(?:open|unresolved|unspent|unused|active|alive|later|blackout)\b|\b(?:unspent|unresolved)\b/i.test(reply)
    )),
    omitsRetiredObligation: retired.every((item) => !supportsObligation(reply, item.obligation)),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    applicable: true,
    passed,
    score: passed ? 1 : 0,
    checks,
    violations: guard.violations,
  };
}

function scoreStudioStructuralCanaryReply({ reply = "", caseId = "", corrections = [] } = {}) {
  const text = String(reply || "").trim();
  const featureCase = String(caseId).includes("feature_architecture");
  const canonChecks = {
    namesProtagonist: /\bmara\b/i.test(text),
    honorsDestroyedLedger: /\b(?:burned|destroyed|gone|unrecoverable|cannot be recovered)\b[^.\n]{0,100}\bledger\b|\bledger\b[^.\n]{0,100}\b(?:burned|destroyed|gone|unrecoverable|cannot be recovered)\b/i.test(text),
    preservesEliMemory: /\beli\b[^.\n]{0,140}\b(?:memor(?:y|ized|ises|izes)|names|final page|surviving record)\b/i.test(text),
    avoidsLedgerResurrection: !/\b(?:recover|retrieve|find|restore)s?\b[^.\n]{0,50}\b(?:intact )?ledger\b|\bledger\b[^.\n]{0,50}\b(?:is|was|remains) intact\b/i.test(text),
  };
  const actChecks = featureCase
    ? {
        actOne: /\bact\s*(?:i|1|one)\b/i.test(text),
        actTwo: /\bact\s*(?:ii|2|two)\b/i.test(text),
        actThree: /\bact\s*(?:iii|3|three)\b/i.test(text),
        causalBridges: causalConnectorCount(text) >= 3,
      }
    : {
        causalTurn: causalConnectorCount(text) >= 1,
        nextScene: /\bnext scene\b/i.test(text),
        featureConsequence: /\b(?:act\s*(?:ii|iii|2|3)|climax|feature|ending)\b/i.test(text),
        pressureChange: /\b(?:forces?|cost|consequence|leverage|turn|reversal)\b/i.test(text),
      };
  const arcChecks = {
    namesFalseBelief: /\b(?:false belief|misbelief|believes?)\b/i.test(text),
    trustVersusControl: /\btrust\b/i.test(text) && /\bcontrol\b/i.test(text),
    identifiesNeedOrChange: /\b(?:need|learn|change|arc|transformation)\b/i.test(text),
    provesChangeInBehavior: /\b(?:choice|chooses|lets|allows|hands|gives|relinquishes|surrenders|depends|accepts)\b/i.test(text),
  };
  const payoffChecks = {
    namesToken: /\b(?:cracked )?ferry token\b/i.test(text),
    tracksSetup: /\b(?:setup|plant|promise|introduced|act\s*i)\b/i.test(text),
    namesPayoff: /\b(?:payoff|pays? off|returns?|echo|transforms?)\b/i.test(text),
    earnsClimaxMeaning: /\b(?:climax|act\s*iii|final choice|changed meaning|proof of change)\b/i.test(text),
  };
  const scores = {
    canonContinuity: average(canonChecks),
    actCausality: average(actChecks),
    characterArc: average(arcChecks),
    payoffQuality: average(payoffChecks),
  };
  const correctionAdherence = scoreWriterCorrectionAdherence(text, corrections);
  if (correctionAdherence.applicable) {
    scores.writerCorrectionAdherence = correctionAdherence.score;
  }
  const failedDimensions = Object.entries(scores)
    .filter(([, score]) => score < LIVE_STUDIO_STRUCTURAL_CANARY_MIN_SCORE)
    .map(([name]) => name);
  return {
    passed: Boolean(text) && failedDimensions.length === 0,
    minScore: LIVE_STUDIO_STRUCTURAL_CANARY_MIN_SCORE,
    scores,
    checks: {
      canonContinuity: canonChecks,
      actCausality: actChecks,
      characterArc: arcChecks,
      payoffQuality: payoffChecks,
      ...(correctionAdherence.applicable
        ? { writerCorrectionAdherence: correctionAdherence.checks }
        : {}),
    },
    correctionAdherence,
    failedDimensions,
  };
}

function scoreStudioContinuationCanaryReply({ reply = "", corrections = [] } = {}) {
  const text = String(reply || "").trim();
  const screenplayChecks = {
    screenplayShape: /(?:^|\n)(?:INT\.|EXT\.|INT\.\/EXT\.)/m.test(text),
    playableAction: /\b(?:Mara|Eli)\b[^\n]{6,}/i.test(text),
    characterCue: /(?:^|\n)(?:MARA|ELI)\s*(?:\n|$)/m.test(text),
    consequentialExit: /\b(?:name|harbor|blackout|trust|leverage|forces?|points?|leads?)\b/i.test(text),
  };
  const correctionAdherence = scoreWriterCorrectionAdherence(text, corrections);
  const scores = {
    screenplayContinuation: average(screenplayChecks),
    writerCorrectionAdherence: correctionAdherence.score,
  };
  const failedDimensions = Object.entries(scores)
    .filter(([, score]) => score < LIVE_STUDIO_STRUCTURAL_CANARY_MIN_SCORE)
    .map(([name]) => name);
  return {
    passed: Boolean(text) && failedDimensions.length === 0,
    minScore: LIVE_STUDIO_STRUCTURAL_CANARY_MIN_SCORE,
    scores,
    checks: {
      screenplayContinuation: screenplayChecks,
      writerCorrectionAdherence: correctionAdherence.checks,
    },
    correctionAdherence,
    failedDimensions,
  };
}

export {
  AUTHORITATIVE_CANON,
  LIVE_STUDIO_STRUCTURAL_CANARY_CASES,
  LIVE_STUDIO_STRUCTURAL_CANARY_MIN_SCORE,
  STORY_OBLIGATION_CORRECTIONS,
  classifyLiveStudioCanaryProviderError,
  scoreStudioContinuationCanaryReply,
  scoreStudioStructuralCanaryReply,
  scoreWriterCorrectionAdherence,
};
