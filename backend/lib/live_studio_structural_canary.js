const LIVE_STUDIO_STRUCTURAL_CANARY_MIN_SCORE = 0.75;

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
  ],
  correctedTerms: [
    "The ferry ledger was burned at the Act I commitment and cannot be recovered intact.",
  ],
  correctionReplacements: [
    "Eli memorized the ledger's final page before it burned; his memory is the only surviving record.",
  ],
  endingImage: "Mara gives June the wheel and takes the passenger seat as dawn reaches the mainland.",
});

function studioMeta() {
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
  };
}

const LIVE_STUDIO_STRUCTURAL_CANARY_CASES = Object.freeze([
  Object.freeze({
    id: "scene_doctor_canon_pressure",
    taskIntent: "scene_doctor",
    modelReason: "screenplay_scene_doctor",
    systemPrompt: [
      "You are Clementine, an elite feature-film story editor performing Scene Doctor work.",
      "Treat every CANON fact as authoritative. Never resurrect a retired fact or claim a proposal is remembered canon.",
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
      "CURRENT SCENE:",
      "In the empty terminal, Mara keeps searching lockers for the destroyed ledger while demanding that Eli prove he remembers the names. Eli refuses to repeat them until she trusts him. The argument circles without changing either character's leverage.",
      "Give the highest-leverage Scene Doctor diagnosis and a short playable replacement beat. Explain exactly how the turn forces the next scene, advances Mara's arc, and sharpens the ferry-token payoff.",
    ].join("\n"),
    studioMeta: studioMeta(),
    maxTokens: 1_200,
  }),
  Object.freeze({
    id: "feature_architecture_causal_payoff",
    taskIntent: "outline_structure",
    modelReason: "screenplay_feature_architecture",
    systemPrompt: [
      "You are Clementine, an elite feature-film architect.",
      "Treat every CANON fact as authoritative. Build one causal movie, not a menu of frameworks.",
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
      "- FINAL IMAGE: Mara gives June the wheel and takes the passenger seat as dawn reaches the mainland.",
      "Architect the feature from Act I through Act II and Act III. Include catalyst, commitment, midpoint reversal, crisis/all-is-lost, climax, final image, causal act bridges, Mara's want/need/false-belief arc, the token's setup/payoff path, and the next three playable scenes from the current Act II pressure.",
    ].join("\n"),
    studioMeta: studioMeta(),
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

function scoreStudioStructuralCanaryReply({ reply = "", caseId = "" } = {}) {
  const text = String(reply || "").trim();
  const lower = text.toLowerCase();
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
    },
    failedDimensions,
  };
}

export {
  AUTHORITATIVE_CANON,
  LIVE_STUDIO_STRUCTURAL_CANARY_CASES,
  LIVE_STUDIO_STRUCTURAL_CANARY_MIN_SCORE,
  scoreStudioStructuralCanaryReply,
};
