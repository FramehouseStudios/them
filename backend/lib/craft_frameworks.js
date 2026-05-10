// Craft frameworks - pure data + lookup. No I/O, no side effects.
//
// Each framework matches the Swift ScreenplayCraftFramework Codable
// contract. Page windows assume a feature-length script unless the
// framework summary says otherwise.

const SAVE_THE_CAT = Object.freeze({
  id: "save-the-cat",
  title: "Save the Cat!",
  summary: "Blake Snyder's 15-beat structure for feature screenplays. Page numbers assume a ~110-page screenplay.",
  version: "1.1",
  requiredMajorTurnIds: ["catalyst", "midpoint", "all-is-lost", "finale"],
  beats: [
    { id: "opening-image",      label: "Opening Image",      summary: "A snapshot that captures tone, mood, type, scope, and the protagonist's starting point.", expectedPageRange: { start: 1, end: 1 }, required: false },
    { id: "theme-stated",       label: "Theme Stated",       summary: "Someone poses the thematic question or wound the story will test.", expectedPageRange: { start: 5, end: 5 }, required: false },
    { id: "set-up",             label: "Set-Up",             summary: "The protagonist's world before the catalyst, including status quo, flaws, allies, and pressure.", expectedPageRange: { start: 1, end: 10 }, required: false },
    { id: "catalyst",           label: "Catalyst",           summary: "The inciting incident. A life-changing event sets the story in motion.", expectedPageRange: { start: 12, end: 12 }, required: true, majorTurnId: "catalyst" },
    { id: "debate",             label: "Debate",             summary: "The protagonist resists, questions, or fears the new path.", expectedPageRange: { start: 12, end: 25 }, required: false },
    { id: "break-into-two",     label: "Break Into Two",     summary: "The protagonist chooses and crosses into the upside-down world of Act Two.", expectedPageRange: { start: 25, end: 25 }, required: false },
    { id: "b-story",            label: "B Story",            summary: "A thematic relationship or subplot appears and pressures the inner change.", expectedPageRange: { start: 30, end: 30 }, required: false },
    { id: "fun-and-games",      label: "Fun and Games",      summary: "The promise of the premise: the audience-facing engine of the movie.", expectedPageRange: { start: 30, end: 55 }, required: false },
    { id: "midpoint",           label: "Midpoint",           summary: "A false victory or false defeat that raises stakes and pivots the quest.", expectedPageRange: { start: 55, end: 55 }, required: true, majorTurnId: "midpoint" },
    { id: "bad-guys-close-in",  label: "Bad Guys Close In",  summary: "External and internal pressure mount; the plan begins to fail.", expectedPageRange: { start: 55, end: 75 }, required: false },
    { id: "all-is-lost",        label: "All Is Lost",        summary: "The lowest moment and opposite of the midpoint, often with a symbolic death.", expectedPageRange: { start: 75, end: 75 }, required: true, majorTurnId: "all-is-lost" },
    { id: "dark-night-of-soul", label: "Dark Night of Soul", summary: "The protagonist sits in defeat and finds the new approach.", expectedPageRange: { start: 75, end: 85 }, required: false },
    { id: "break-into-three",   label: "Break Into Three",   summary: "The solution emerges, usually by synthesizing the A and B stories.", expectedPageRange: { start: 85, end: 85 }, required: false },
    { id: "finale",             label: "Finale",             summary: "Act Three execution: the protagonist acts from change and resolves the central conflict.", expectedPageRange: { start: 85, end: 110 }, required: true, majorTurnId: "finale" },
    { id: "final-image",        label: "Final Image",        summary: "A mirror of the opening image that shows transformation.", expectedPageRange: { start: 110, end: 110 }, required: false },
  ],
});

const STORY_CIRCLE = Object.freeze({
  id: "story-circle",
  title: "Story Circle",
  summary: "Dan Harmon-style eight-step desire loop: a character leaves comfort, adapts, pays a price, returns changed.",
  version: "1.0",
  requiredMajorTurnIds: ["inciting-incident", "midpoint", "all-is-lost", "climax"],
  beats: [
    { id: "you", label: "You", summary: "The protagonist in a zone of comfort.", expectedPageRange: { start: 1, end: 10 }, required: false },
    { id: "need", label: "Need", summary: "A need or disruption pulls the protagonist out of balance.", expectedPageRange: { start: 8, end: 15 }, required: true, majorTurnId: "inciting-incident" },
    { id: "go", label: "Go", summary: "They cross into an unfamiliar situation.", expectedPageRange: { start: 22, end: 28 }, required: false },
    { id: "search", label: "Search", summary: "They adapt, search, experiment, and meet resistance.", expectedPageRange: { start: 28, end: 50 }, required: false },
    { id: "find", label: "Find", summary: "They find what they wanted or a false version of it.", expectedPageRange: { start: 50, end: 60 }, required: true, majorTurnId: "midpoint" },
    { id: "take", label: "Take", summary: "They pay the price; the desire costs more than expected.", expectedPageRange: { start: 68, end: 82 }, required: true, majorTurnId: "all-is-lost" },
    { id: "return", label: "Return", summary: "They bring the consequence home and face the decisive test.", expectedPageRange: { start: 88, end: 104 }, required: true, majorTurnId: "climax" },
    { id: "change", label: "Change", summary: "The final state shows what the loop permanently changed.", expectedPageRange: { start: 104, end: 110 }, required: false },
  ],
});

const THREE_ACT = Object.freeze({
  id: "three-act",
  title: "Three-Act Structure",
  summary: "Classical three-act structure with required inciting incident, midpoint twist, and climax.",
  version: "1.1",
  requiredMajorTurnIds: ["inciting-incident", "midpoint-twist", "climax"],
  beats: [
    { id: "act-one-setup", label: "Act One - Setup", summary: "Establishes protagonist, world, status quo, and the question of the movie.", expectedPageRange: { start: 1, end: 25 }, required: false },
    { id: "inciting-incident", label: "Inciting Incident", summary: "The event that disrupts the protagonist's world and demands a response.", expectedPageRange: { start: 10, end: 15 }, required: true, majorTurnId: "inciting-incident" },
    { id: "first-plot-point", label: "First Plot Point", summary: "The protagonist commits to the journey; Act One closes.", expectedPageRange: { start: 23, end: 30 }, required: false },
    { id: "act-two-confrontation", label: "Act Two - Confrontation", summary: "Rising obstacles and attempts to solve the problem.", expectedPageRange: { start: 25, end: 75 }, required: false },
    { id: "midpoint-twist", label: "Midpoint Twist", summary: "A revelation or reversal that recasts the quest.", expectedPageRange: { start: 50, end: 60 }, required: true, majorTurnId: "midpoint-twist" },
    { id: "second-plot-point", label: "Second Plot Point", summary: "The final piece, loss, or pressure that launches Act Three.", expectedPageRange: { start: 72, end: 80 }, required: false },
    { id: "act-three-resolution", label: "Act Three - Resolution", summary: "The protagonist executes a new plan and resolves the conflict.", expectedPageRange: { start: 75, end: 110 }, required: false },
    { id: "climax", label: "Climax", summary: "The decisive confrontation where stakes peak.", expectedPageRange: { start: 95, end: 105 }, required: true, majorTurnId: "climax" },
  ],
});

const SEQUENCE_METHOD = Object.freeze({
  id: "sequence-method",
  title: "Sequence Method",
  summary: "Eight feature sequences, each with its own tension question and mini-turn, building toward the act breaks and climax.",
  version: "1.0",
  requiredMajorTurnIds: ["inciting-incident", "midpoint", "all-is-lost", "climax"],
  beats: [
    { id: "sequence-1", label: "Sequence 1 - Status Quo Disrupted", summary: "Set up the world and deliver the inciting disruption.", expectedPageRange: { start: 1, end: 12 }, required: true, majorTurnId: "inciting-incident" },
    { id: "sequence-2", label: "Sequence 2 - First Commitment", summary: "Debate and first act choice into the main arena.", expectedPageRange: { start: 13, end: 25 }, required: false },
    { id: "sequence-3", label: "Sequence 3 - First Strategy", summary: "The first Act Two plan meets real resistance.", expectedPageRange: { start: 26, end: 38 }, required: false },
    { id: "sequence-4", label: "Sequence 4 - Midpoint Turn", summary: "The midpoint changes the meaning of the goal.", expectedPageRange: { start: 39, end: 55 }, required: true, majorTurnId: "midpoint" },
    { id: "sequence-5", label: "Sequence 5 - Complications", summary: "The new stakes trigger stronger opposition.", expectedPageRange: { start: 56, end: 68 }, required: false },
    { id: "sequence-6", label: "Sequence 6 - Collapse", summary: "The plan fails into an all-is-lost or second-act low point.", expectedPageRange: { start: 69, end: 80 }, required: true, majorTurnId: "all-is-lost" },
    { id: "sequence-7", label: "Sequence 7 - Final Plan", summary: "Act Three builds the final plan and direct confrontation.", expectedPageRange: { start: 81, end: 96 }, required: false },
    { id: "sequence-8", label: "Sequence 8 - Climax and Aftermath", summary: "The decisive action resolves the dramatic question.", expectedPageRange: { start: 97, end: 110 }, required: true, majorTurnId: "climax" },
  ],
});

const HERO_JOURNEY = Object.freeze({
  id: "hero-journey",
  title: "Hero's Journey",
  summary: "Mythic transformation structure adapted for screen stories; tracks call, threshold, ordeal, return, and changed self.",
  version: "1.0",
  requiredMajorTurnIds: ["inciting-incident", "midpoint", "all-is-lost", "climax"],
  beats: [
    { id: "ordinary-world", label: "Ordinary World", summary: "The hero's original life and lack.", expectedPageRange: { start: 1, end: 8 }, required: false },
    { id: "call-to-adventure", label: "Call to Adventure", summary: "The invitation or disruption that starts the journey.", expectedPageRange: { start: 8, end: 15 }, required: true, majorTurnId: "inciting-incident" },
    { id: "refusal", label: "Refusal of the Call", summary: "Fear, obligation, or denial resists the journey.", expectedPageRange: { start: 12, end: 22 }, required: false },
    { id: "mentor", label: "Meeting the Mentor", summary: "A guide, tool, wound, or lesson equips the hero.", expectedPageRange: { start: 15, end: 28 }, required: false },
    { id: "threshold", label: "Crossing the Threshold", summary: "The hero enters the special world.", expectedPageRange: { start: 24, end: 32 }, required: false },
    { id: "tests-allies-enemies", label: "Tests, Allies, Enemies", summary: "The special world tests tactics and loyalties.", expectedPageRange: { start: 32, end: 50 }, required: false },
    { id: "ordeal", label: "Ordeal", summary: "A central death/rebirth pressure that transforms the quest.", expectedPageRange: { start: 50, end: 62 }, required: true, majorTurnId: "midpoint" },
    { id: "reward", label: "Reward", summary: "The hero gains the sword, secret, or false victory.", expectedPageRange: { start: 58, end: 68 }, required: false },
    { id: "road-back", label: "The Road Back", summary: "Consequences chase the hero toward the final test.", expectedPageRange: { start: 68, end: 78 }, required: false },
    { id: "all-is-lost", label: "Death and Rebirth", summary: "The old self fails; the hero must choose from transformation.", expectedPageRange: { start: 74, end: 84 }, required: true, majorTurnId: "all-is-lost" },
    { id: "resurrection", label: "Resurrection", summary: "The final ordeal proves the change under maximum stakes.", expectedPageRange: { start: 94, end: 104 }, required: true, majorTurnId: "climax" },
    { id: "return-elixir", label: "Return with the Elixir", summary: "The changed hero returns with a restored or altered world.", expectedPageRange: { start: 104, end: 110 }, required: false },
  ],
});

const FRAMEWORKS_BY_ID = Object.freeze({
  [SAVE_THE_CAT.id]: SAVE_THE_CAT,
  [STORY_CIRCLE.id]: STORY_CIRCLE,
  [THREE_ACT.id]: THREE_ACT,
  [SEQUENCE_METHOD.id]: SEQUENCE_METHOD,
  [HERO_JOURNEY.id]: HERO_JOURNEY,
});

function listFrameworkReferences() {
  return Object.values(FRAMEWORKS_BY_ID).map((f) => ({
    id: f.id,
    title: f.title,
    version: f.version,
  }));
}

function getFrameworkById(id) {
  return FRAMEWORKS_BY_ID[id] || null;
}

function isKnownFrameworkId(id) {
  return Object.prototype.hasOwnProperty.call(FRAMEWORKS_BY_ID, id);
}

function serializeFramework(framework) {
  if (!framework) return null;
  const out = {
    id: framework.id,
    title: framework.title,
    requiredMajorTurnIds: [...framework.requiredMajorTurnIds],
    beats: framework.beats.map(serializeBeatDefinition),
  };
  if (framework.summary) out.summary = framework.summary;
  if (framework.version) out.version = framework.version;
  return out;
}

function serializeBeatDefinition(beat) {
  const out = {
    id: beat.id,
    label: beat.label,
    required: beat.required === true,
  };
  if (beat.summary) out.summary = beat.summary;
  if (beat.expectedPageRange) out.expectedPageRange = { ...beat.expectedPageRange };
  if (beat.majorTurnId) out.majorTurnId = beat.majorTurnId;
  return out;
}

export {
  SAVE_THE_CAT,
  STORY_CIRCLE,
  THREE_ACT,
  SEQUENCE_METHOD,
  HERO_JOURNEY,
  FRAMEWORKS_BY_ID,
  listFrameworkReferences,
  getFrameworkById,
  isKnownFrameworkId,
  serializeFramework,
  serializeBeatDefinition,
};
