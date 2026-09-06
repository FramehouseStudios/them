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
  summary: "Classical three-act structure for a ~110-page feature: commitment by ~25, midpoint reversal near 55, low point near 75, climax by ~100. Three required major turns: inciting incident, midpoint twist, and climax.",
  version: "1.0",
  requiredMajorTurnIds: ["inciting-incident", "midpoint-twist", "climax"],
  beats: [
    { id: "act-one-setup",          label: "Act One — Setup",            summary: "Establishes protagonist, world, and status quo. Plants what will pay off later.", expectedPageRange: { start: 1, end: 25 },    required: false },
    { id: "inciting-incident",      label: "Inciting Incident",          summary: "The event that disrupts the protagonist's world and demands a response.",          expectedPageRange: { start: 8, end: 15 },   required: true,  majorTurnId: "inciting-incident" },
    { id: "first-plot-point",       label: "First Plot Point",           summary: "The protagonist commits to the journey. Act One closes; Act Two begins.",          expectedPageRange: { start: 20, end: 30 },   required: false },
    { id: "act-two-confrontation",  label: "Act Two — Confrontation",    summary: "Rising obstacles. The protagonist tries and fails, learning along the way.",       expectedPageRange: { start: 25, end: 75 },   required: false },
    { id: "midpoint-twist",         label: "Midpoint Twist",             summary: "A revelation or reversal that recasts the protagonist's quest.",                    expectedPageRange: { start: 50, end: 60 },   required: true,  majorTurnId: "midpoint-twist" },
    { id: "second-plot-point",      label: "Second Plot Point",          summary: "The protagonist receives the final piece needed to confront the antagonist.",      expectedPageRange: { start: 70, end: 82 },   required: false },
    { id: "act-three-resolution",   label: "Act Three — Resolution",     summary: "The protagonist executes a new plan and the conflict resolves.",                    expectedPageRange: { start: 75, end: 110 },  required: false },
    { id: "climax",                 label: "Climax",                     summary: "The decisive confrontation. Stakes peak. The protagonist wins or loses definitively.", expectedPageRange: { start: 95, end: 105 }, required: true,  majorTurnId: "climax" },
  ],
});

const STORY_CIRCLE = Object.freeze({
  id: "story-circle",
  title: "Story Circle",
  summary: "Dan Harmon's eight-step circular structure for tracking desire, threshold-crossing, adaptation, cost, return, and change.",
  version: "1.0",
  requiredMajorTurnIds: ["need", "go", "find", "return-changed"],
  beats: [
    { id: "you",            label: "You",            summary: "The protagonist in a zone of comfort. Establishes identity, routine, and the pre-change self.",                 expectedPageRange: { start: 1, end: 10 },    required: false },
    { id: "need",           label: "Need",           summary: "The protagonist wants something, lacks something, or feels a pressure that starts the story engine.",             expectedPageRange: { start: 8, end: 15 },    required: true,  majorTurnId: "need" },
    { id: "go",             label: "Go",             summary: "The protagonist crosses a threshold into an unfamiliar situation and can no longer solve things the old way.",    expectedPageRange: { start: 20, end: 30 },   required: true,  majorTurnId: "go" },
    { id: "search",         label: "Search",         summary: "The protagonist adapts, tests tactics, meets resistance, and learns the rules of the new world.",                expectedPageRange: { start: 30, end: 55 },   required: false },
    { id: "find",           label: "Find",           summary: "The protagonist gets what they were chasing or sees the real nature of the prize; the story pivots.",            expectedPageRange: { start: 52, end: 58 },   required: true,  majorTurnId: "find" },
    { id: "take",           label: "Take",           summary: "The prize has a cost. The protagonist loses, sacrifices, or discovers that winning changes the terms.",          expectedPageRange: { start: 58, end: 78 },   required: false },
    { id: "return",         label: "Return",         summary: "The protagonist turns back toward home or the original problem carrying what they found.",                      expectedPageRange: { start: 78, end: 95 },   required: false },
    { id: "return-changed", label: "Return Changed", summary: "The protagonist integrates the lesson in a final test, proving visible change before the story closes.",          expectedPageRange: { start: 95, end: 110 },  required: true,  majorTurnId: "return-changed" },
  ],
});

const HERO_JOURNEY = Object.freeze({
  id: "hero-journey",
  title: "Hero's Journey",
  summary: "A twelve-stage mythic journey framework for departures, initiations, ordeals, transformation, and return.",
  version: "1.0",
  requiredMajorTurnIds: ["call-to-adventure", "crossing-first-threshold", "ordeal", "resurrection"],
  beats: [
    { id: "ordinary-world",             label: "Ordinary World",              summary: "The hero's starting world, wound, lack, and social order before the adventure disrupts it.",          expectedPageRange: { start: 1, end: 10 },     required: false },
    { id: "call-to-adventure",          label: "Call to Adventure",           summary: "The invitation, threat, or disruption that asks the hero to leave the known world.",                expectedPageRange: { start: 10, end: 15 },    required: true,  majorTurnId: "call-to-adventure" },
    { id: "refusal-of-call",            label: "Refusal of the Call",         summary: "Fear, duty, denial, or comfort makes the hero resist the journey before committing.",               expectedPageRange: { start: 12, end: 20 },    required: false },
    { id: "meeting-the-mentor",         label: "Meeting the Mentor",          summary: "A guide, tool, warning, or worldview prepares the hero for the threshold.",                        expectedPageRange: { start: 15, end: 25 },    required: false },
    { id: "crossing-first-threshold",   label: "Crossing the First Threshold", summary: "The hero commits and enters the special world, where old assumptions stop working.",                expectedPageRange: { start: 25, end: 30 },    required: true,  majorTurnId: "crossing-first-threshold" },
    { id: "tests-allies-enemies",       label: "Tests, Allies, Enemies",      summary: "The hero learns the new world's rules through trials, alliances, temptations, and opposition.",     expectedPageRange: { start: 30, end: 50 },    required: false },
    { id: "approach-inmost-cave",       label: "Approach to the Inmost Cave", summary: "The hero approaches the central danger, secret, or confrontation and prepares for the ordeal.",       expectedPageRange: { start: 50, end: 60 },    required: false },
    { id: "ordeal",                     label: "Ordeal",                     summary: "A central crisis, death-and-rebirth test, or abyss moment that transforms the hero's stakes.",       expectedPageRange: { start: 55, end: 65 },    required: true,  majorTurnId: "ordeal" },
    { id: "reward",                     label: "Reward",                     summary: "The hero survives the ordeal and takes possession of the insight, object, or relationship won.",     expectedPageRange: { start: 65, end: 75 },    required: false },
    { id: "road-back",                  label: "The Road Back",              summary: "Consequences pursue the hero and force a return toward the unresolved outer world.",                 expectedPageRange: { start: 75, end: 88 },    required: false },
    { id: "resurrection",               label: "Resurrection",               summary: "The final transformation test. The hero must prove the change under maximum pressure.",             expectedPageRange: { start: 90, end: 105 },   required: true,  majorTurnId: "resurrection" },
    { id: "return-with-elixir",         label: "Return with the Elixir",      summary: "The hero returns with a gift, lesson, repair, or changed order that resolves the journey.",          expectedPageRange: { start: 105, end: 110 },  required: false },
  ],
});

const FRAMEWORKS_BY_ID = Object.freeze({
  [SAVE_THE_CAT.id]: SAVE_THE_CAT,
  [THREE_ACT.id]:    THREE_ACT,
  [STORY_CIRCLE.id]: STORY_CIRCLE,
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

/** The framework Clementine assumes when nothing else is chosen (Hollywood three-act). */
const DEFAULT_FRAMEWORK_ID = "three-act";

export {
  DEFAULT_FRAMEWORK_ID,
  SAVE_THE_CAT,
  THREE_ACT,
  STORY_CIRCLE,
  HERO_JOURNEY,
  FRAMEWORKS_BY_ID,
  listFrameworkReferences,
  getFrameworkById,
  isKnownFrameworkId,
  serializeFramework,
  serializeBeatDefinition,
};
