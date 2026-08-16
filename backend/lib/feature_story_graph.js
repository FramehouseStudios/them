const FEATURE_STORY_GRAPH_VERSION = 1;
const FEATURE_STORY_GRAPH_SCENE_MAX = 8;
const FEATURE_STORY_GRAPH_FACT_MAX = 8;
const FEATURE_STORY_GRAPH_THREAD_MAX = 6;

function clean(value, maxChars = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars).trim();
}

function cleanList(value, maxItems = 6, maxChars = 180) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const normalized = clean(item, maxChars);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function acceptedAt(scene = {}) {
  const value = Number(scene.acceptedAt ?? scene.accepted_at ?? scene.updatedAt ?? scene.updated_at ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sceneGraphNode(scene = {}, index = 0) {
  const heading = clean(scene.sceneHeading ?? scene.scene_heading ?? scene.sceneLabel ?? scene.scene_label, 140);
  const summary = clean(scene.summary ?? scene.scene_summary ?? scene.excerpt ?? scene.page_excerpt, 240);
  const outcome = clean(scene.outcome ?? scene.scene_outcome, 220);
  const nextScenePlan = clean(scene.nextScenePlan ?? scene.next_scene_plan, 240);
  const causalHandoff = clean(scene.causalHandoff ?? scene.causal_handoff, 240);
  const decisions = cleanList(scene.decisions, 4, 220);
  const revelations = cleanList(scene.revelations, 4, 220);
  const relationshipChanges = cleanList(scene.relationshipChanges ?? scene.relationship_changes, 4, 220);
  const irreversibleConsequences = cleanList(
    scene.irreversibleConsequences ?? scene.irreversible_consequences,
    4,
    220
  );
  const node = {
    id: `scene_${index + 1}`,
    position: index + 1,
    act: clean(scene.act ?? scene.currentAct ?? scene.current_act, 80),
    sequence: clean(scene.featureSequence ?? scene.feature_sequence, 180),
    heading,
    summary,
    outcome,
    nextScenePlan,
    causalHandoff,
    characterNames: cleanList(scene.characterNames ?? scene.character_names, 8, 72),
    decisions,
    revelations,
    relationshipChanges,
    irreversibleConsequences,
    characterArcTurns: cleanList(scene.characterArcTurns ?? scene.character_arc_turns, 5, 180),
    unresolvedSetups: cleanList(scene.unresolvedSetups ?? scene.unresolved_setups, 6, 200),
    actThreePayoffPath: cleanList(scene.actThreePayoffPath ?? scene.act_three_payoff_path, 4, 200),
    acceptedAt: acceptedAt(scene),
  };
  return Object.fromEntries(Object.entries(node).filter(([, value]) => (
    Array.isArray(value) ? value.length > 0 : Boolean(value) || value === 0
  )));
}

function normalizedFact(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fact = clean(value.fact, 220);
  if (!fact) return null;
  const authority = clean(value.authority ?? value.source, 48).toLowerCase();
  return Object.fromEntries(Object.entries({
    kind: clean(value.kind, 48) || "accepted_change",
    fact,
    authority,
    sourceAct: clean(value.sourceAct ?? value.source_act, 80),
    sourceSceneHeading: clean(value.sourceSceneHeading ?? value.source_scene_heading, 140),
    replacesFacts: cleanList(value.replacesFacts ?? value.replaces_facts, 6, 220),
  }).filter(([, item]) => Array.isArray(item) ? item.length > 0 : Boolean(item)));
}

function matchingSourceNode(nodes, setup) {
  const target = clean(setup, 220).toLowerCase();
  if (!target) return null;
  return [...nodes].reverse().find((node) => (
    (node.unresolvedSetups || []).some((item) => item.toLowerCase() === target)
  )) || null;
}

function buildOpenThreads({ project = {}, nodes = [], dueStoryThread = null } = {}) {
  const setups = cleanList(project.unresolvedSetups ?? project.unresolved_setups, FEATURE_STORY_GRAPH_THREAD_MAX, 220);
  const payoffs = cleanList(project.actThreePayoffPath ?? project.act_three_payoff_path, 5, 220);
  const dueSetup = clean(dueStoryThread?.setup, 220);
  const duePayoff = clean(dueStoryThread?.promisedPayoff ?? dueStoryThread?.promised_payoff, 220);
  const ordered = cleanList([dueSetup, ...setups].filter(Boolean), FEATURE_STORY_GRAPH_THREAD_MAX, 220);
  return ordered.map((setup, index) => {
    const source = matchingSourceNode(nodes, setup);
    const isDue = Boolean(dueSetup && setup.toLowerCase() === dueSetup.toLowerCase());
    return Object.fromEntries(Object.entries({
      id: `thread_${index + 1}`,
      setup,
      sourceSceneId: source?.id || "",
      sourceSceneHeading: source?.heading || clean(dueStoryThread?.sourceSceneHeading ?? dueStoryThread?.source_scene_heading, 140),
      promisedPayoff: isDue ? duePayoff : (ordered.length === 1 && payoffs.length === 1 ? payoffs[0] : ""),
      due: isDue,
      ageInScenes: isDue ? Math.max(0, Math.round(Number(dueStoryThread?.ageInScenes ?? dueStoryThread?.age_in_scenes ?? 0))) : 0,
      status: isDue ? "due" : "open",
    }).filter(([, item]) => typeof item === "boolean" || typeof item === "number" || Boolean(item)));
  });
}

function buildFeatureStoryGraph({
  projectContinuity = null,
  acceptedScenes = [],
  acceptedCausalFacts = [],
  dueStoryThread = null,
} = {}) {
  const project = projectContinuity && typeof projectContinuity === "object"
    ? projectContinuity
    : {};
  const acceptedSceneRecords = (Array.isArray(acceptedScenes) ? acceptedScenes : [])
    .filter((scene) => scene && typeof scene === "object" && !Array.isArray(scene))
    .sort((left, right) => acceptedAt(left) - acceptedAt(right));
  const chronologicalScenes = acceptedSceneRecords
    .slice(-FEATURE_STORY_GRAPH_SCENE_MAX);
  const nodes = chronologicalScenes.map(sceneGraphNode);
  const facts = (Array.isArray(acceptedCausalFacts) ? acceptedCausalFacts : [])
    .map(normalizedFact)
    .filter(Boolean)
    .slice(0, FEATURE_STORY_GRAPH_FACT_MAX);
  const openThreads = buildOpenThreads({ project, nodes, dueStoryThread });
  const latest = nodes[nodes.length - 1] || null;
  const currentState = Object.fromEntries(Object.entries({
    act: clean(project.act, 80) || latest?.act || "",
    sequence: clean(project.featureSequence ?? project.feature_sequence, 180) || latest?.sequence || "",
    currentBeat: clean(project.currentBeat ?? project.current_beat, 200),
    lastAcceptedScene: latest?.heading || "",
    lastAcceptedOutcome: latest?.outcome || clean(project.lastSceneOutcome ?? project.last_scene_outcome, 220),
    nextScenePlan: latest?.nextScenePlan || clean(project.nextScenePlan ?? project.next_scene_plan, 240),
    causalHandoff: latest?.causalHandoff || "",
    protagonistWant: clean(project.protagonistWant ?? project.protagonist_want, 180),
    protagonistNeed: clean(project.protagonistNeed ?? project.protagonist_need, 180),
    characterArcState: clean(project.characterArcState ?? project.character_arc_state, 240),
    endingImage: clean(project.endingImage ?? project.ending_image, 200),
  }).filter(([, value]) => Boolean(value)));
  if (!nodes.length && !facts.length && !openThreads.length && !Object.keys(currentState).length) return null;

  const edges = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const source = nodes[index];
    const target = nodes[index + 1];
    const pressure = source.nextScenePlan || source.causalHandoff || "";
    edges.push({
      from: source.id,
      to: target.id,
      kind: pressure ? "accepted_handoff" : "accepted_order",
      ...(pressure ? { pressure } : {}),
    });
  }
  for (const thread of openThreads) {
    if (!thread.sourceSceneId) continue;
    edges.push({ from: thread.sourceSceneId, to: thread.id, kind: "opens_thread" });
  }

  return {
    version: FEATURE_STORY_GRAPH_VERSION,
    authority: "derived_from_accepted_pages_and_writer_corrections",
    projectId: clean(project.projectId ?? project.project_id, 96),
    projectTitle: clean(project.projectTitle ?? project.project_title, 160),
    acceptedSceneCount: Math.max(acceptedSceneRecords.length, Number(dueStoryThread?.acceptedSceneCount ?? dueStoryThread?.accepted_scene_count ?? 0) || 0),
    nodes,
    edges,
    bindingFacts: facts,
    openThreads,
    currentState,
  };
}

export {
  FEATURE_STORY_GRAPH_VERSION,
  buildFeatureStoryGraph,
};
