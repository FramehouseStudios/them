// Craft frameworks — pure data + lookup. No I/O, no side effects.
//
// Each framework matches the Swift `ScreenplayCraftFramework` Codable
// in them/ScreenplayCraftModels.swift. JSON shape is the contract;
// optional fields are omitted (not null) when serialized.
//
// Adding a framework: append to FRAMEWORKS_BY_ID. Required-major-turn
// IDs MUST appear as the `majorTurnId` of at least one beat.

const SAVE_THE_CAT = Object.freeze({
  id: "save-the-cat",
  title: "Save the Cat!",
  summary: "Blake Snyder's 15-beat structure for feature screenplays. Page numbers assume a ~110-page screenplay.",
  version: "1.0",
  requiredMajorTurnIds: ["catalyst", "midpoint", "all-is-lost", "finale"],
  beats: [
    { id: "opening-image",        label: "Opening Image",        summary: "A snapshot that captures tone, mood, type, and scope of the film, and establishes the protagonist's starting point.", expectedPageRange: { start: 1, end: 1 },     required: false },
    { id: "theme-stated",         label: "Theme Stated",          summary: "Someone (usually not the hero) poses a question or makes a statement that is the theme of the movie.",                expectedPageRange: { start: 5, end: 5 },     required: false },
    { id: "set-up",               label: "Set-Up",                summary: "The protagonist's world before the catalyst. Establishes the status quo and the protagonist's flaws.",                  expectedPageRange: { start: 1, end: 10 },    required: false },
    { id: "catalyst",             label: "Catalyst",              summary: "The inciting incident. Life-changing event that sets the story in motion.",                                              expectedPageRange: { start: 12, end: 12 },   required: true,  majorTurnId: "catalyst" },
    { id: "debate",               label: "Debate",                summary: "The protagonist debates whether to take action. Doubts, fears, second thoughts.",                                       expectedPageRange: { start: 12, end: 25 },   required: false },
    { id: "break-into-two",       label: "Break Into Two",        summary: "The protagonist makes a decisive choice and crosses into Act Two — the upside-down world.",                              expectedPageRange: { start: 25, end: 25 },   required: false },
    { id: "b-story",              label: "B Story",               summary: "A new character or storyline appears, often a love interest. The B story carries the theme.",                            expectedPageRange: { start: 30, end: 30 },   required: false },
    { id: "fun-and-games",        label: "Fun and Games",         summary: "The promise of the premise. The 'trailer moments' — what the audience came to see.",                                    expectedPageRange: { start: 30, end: 55 },   required: false },
    { id: "midpoint",             label: "Midpoint",              summary: "A false victory or false defeat. The stakes are raised and the protagonist's quest pivots.",                            expectedPageRange: { start: 55, end: 55 },   required: true,  majorTurnId: "midpoint" },
    { id: "bad-guys-close-in",    label: "Bad Guys Close In",     summary: "External and internal pressure mounts. The protagonist's plan starts to fall apart.",                                   expectedPageRange: { start: 55, end: 75 },   required: false },
    { id: "all-is-lost",          label: "All Is Lost",           summary: "The opposite of the midpoint. The lowest moment. Often a 'whiff of death' — a literal or symbolic loss.",                expectedPageRange: { start: 75, end: 75 },   required: true,  majorTurnId: "all-is-lost" },
    { id: "dark-night-of-soul",   label: "Dark Night of the Soul", summary: "The protagonist hits rock bottom and must dig deep to find a new approach.",                                            expectedPageRange: { start: 75, end: 85 },   required: false },
    { id: "break-into-three",     label: "Break Into Three",      summary: "The protagonist finds the answer — usually by synthesizing the A and B stories — and resolves to act.",                expectedPageRange: { start: 85, end: 85 },   required: false },
    { id: "finale",               label: "Finale",                summary: "Act Three. The protagonist executes the new plan, defeats the antagonist, and changes the world.",                       expectedPageRange: { start: 85, end: 110 },  required: true,  majorTurnId: "finale" },
    { id: "final-image",          label: "Final Image",           summary: "The mirror of the opening image. Shows how much the protagonist (and world) has changed.",                              expectedPageRange: { start: 110, end: 110 }, required: false },
  ],
});

const THREE_ACT = Object.freeze({
  id: "three-act",
  title: "Three-Act Structure",
  summary: "Classical three-act structure with three required major turns: inciting incident, midpoint twist, and climax.",
  version: "1.0",
  requiredMajorTurnIds: ["inciting-incident", "midpoint-twist", "climax"],
  beats: [
    { id: "act-one-setup",          label: "Act One — Setup",            summary: "Establishes protagonist, world, and status quo. Plants what will pay off later.", expectedPageRange: { start: 1, end: 25 },    required: false },
    { id: "inciting-incident",      label: "Inciting Incident",          summary: "The event that disrupts the protagonist's world and demands a response.",          expectedPageRange: { start: 12, end: 12 },   required: true,  majorTurnId: "inciting-incident" },
    { id: "first-plot-point",       label: "First Plot Point",           summary: "The protagonist commits to the journey. Act One closes; Act Two begins.",          expectedPageRange: { start: 25, end: 25 },   required: false },
    { id: "act-two-confrontation",  label: "Act Two — Confrontation",    summary: "Rising obstacles. The protagonist tries and fails, learning along the way.",       expectedPageRange: { start: 25, end: 75 },   required: false },
    { id: "midpoint-twist",         label: "Midpoint Twist",             summary: "A revelation or reversal that recasts the protagonist's quest.",                    expectedPageRange: { start: 55, end: 55 },   required: true,  majorTurnId: "midpoint-twist" },
    { id: "second-plot-point",      label: "Second Plot Point",          summary: "The protagonist receives the final piece needed to confront the antagonist.",      expectedPageRange: { start: 75, end: 75 },   required: false },
    { id: "act-three-resolution",   label: "Act Three — Resolution",     summary: "The protagonist executes a new plan and the conflict resolves.",                    expectedPageRange: { start: 75, end: 110 },  required: false },
    { id: "climax",                 label: "Climax",                     summary: "The decisive confrontation. Stakes peak. The protagonist wins or loses definitively.", expectedPageRange: { start: 95, end: 105 }, required: true,  majorTurnId: "climax" },
  ],
});

const FRAMEWORKS_BY_ID = Object.freeze({
  [SAVE_THE_CAT.id]: SAVE_THE_CAT,
  [THREE_ACT.id]:    THREE_ACT,
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

// Strip optional fields with undefined values so the JSON wire shape
// matches the Swift Codable contract (omittable, not null).
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
  THREE_ACT,
  FRAMEWORKS_BY_ID,
  listFrameworkReferences,
  getFrameworkById,
  isKnownFrameworkId,
  serializeFramework,
  serializeBeatDefinition,
};
