const FEATURE_STORY_GRAPH_VERSION = 3;
const FEATURE_STORY_GRAPH_SCENE_MAX = 8;
const FEATURE_STORY_GRAPH_FACT_MAX = 8;
const FEATURE_STORY_GRAPH_THREAD_MAX = 6;
const FEATURE_STORY_GRAPH_CONSEQUENCE_MAX = 24;
const FEATURE_STORY_GRAPH_OBLIGATION_MAX = 24;
const FEATURE_STORY_GRAPH_CORRECTION_MAX = 24;
const STORY_OBLIGATION_STATUSES = new Set([
  "advanced",
  "complicated",
  "transformed",
  "paid_off",
]);
const STORY_OBLIGATION_CORRECTION_ACTIONS = new Set(["keep_open", "retire"]);

const CONSEQUENCE_STOPWORDS = new Set([
  "about", "after", "again", "against", "and", "before", "being", "both", "could", "from",
  "have", "into", "just", "more", "must", "only", "other", "over", "scene", "should", "the",
  "that", "their", "them", "then", "there", "these", "they", "this", "through", "under",
  "until", "very", "what", "when", "where", "which", "while", "with", "would",
]);

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

function consequenceTokens(value = "", ignoredTokens = new Set()) {
  return [...new Set(
    clean(value, 1_200)
      .toLowerCase()
      .match(/[a-z0-9']+/g)
      ?.map((token) => token.replace(/'s$/, ""))
      .filter((token) => (
        token.length >= 3 &&
        !CONSEQUENCE_STOPWORDS.has(token) &&
        !ignoredTokens.has(token)
      )) || []
  )];
}

function acceptedSceneReferenceText(scene = {}) {
  return [
    scene.sceneHeading ?? scene.scene_heading ?? scene.sceneLabel ?? scene.scene_label,
    scene.summary ?? scene.scene_summary,
    scene.outcome ?? scene.scene_outcome,
    scene.nextScenePlan ?? scene.next_scene_plan,
    scene.causalHandoff ?? scene.causal_handoff,
    scene.excerpt ?? scene.page_excerpt,
    ...(Array.isArray(scene.decisions) ? scene.decisions : []),
    ...(Array.isArray(scene.revelations) ? scene.revelations : []),
    ...(Array.isArray(scene.relationshipChanges ?? scene.relationship_changes)
      ? (scene.relationshipChanges ?? scene.relationship_changes)
      : []),
    ...(Array.isArray(scene.irreversibleConsequences ?? scene.irreversible_consequences)
      ? (scene.irreversibleConsequences ?? scene.irreversible_consequences)
      : []),
  ].filter(Boolean).join(" ");
}

function laterSceneCarriesConsequence(fact = "", scene = {}, sourceScene = {}) {
  const characterTokens = new Set(consequenceTokens(
    cleanList(sourceScene.characterNames ?? sourceScene.character_names, 12, 80).join(" ")
  ));
  const factTokens = consequenceTokens(fact, characterTokens);
  if (!factTokens.length) return false;
  const laterTokens = new Set(consequenceTokens(acceptedSceneReferenceText(scene), characterTokens));
  const matches = factTokens.filter((token) => laterTokens.has(token)).length;
  const required = factTokens.length === 1 ? 1 : factTokens.length <= 5 ? 2 : 3;
  return matches >= Math.min(required, factTokens.length);
}

function sanitizeStoryObligationChanges(value = []) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obligation = clean(item.obligation ?? item.source, 220);
    const status = clean(item.status, 32).toLowerCase().replace(/[\s-]+/g, "_");
    const result = clean(item.result ?? item.fact, 240);
    const evidence = clean(item.evidence, 320);
    const kind = clean(item.kind, 48).toLowerCase().replace(/[\s-]+/g, "_");
    const key = obligation.toLowerCase();
    if (
      !obligation ||
      !result ||
      !evidence ||
      !STORY_OBLIGATION_STATUSES.has(status) ||
      seen.has(key)
    ) continue;
    seen.add(key);
    out.push({
      kind: ["setup", "promised_payoff", "accepted_consequence"].includes(kind)
        ? kind
        : "setup",
      obligation,
      status,
      result,
      evidence,
    });
    if (out.length >= 6) break;
  }
  return out;
}

function sanitizeStoryObligationCorrections(value = []) {
  const source = Array.isArray(value) ? value : [];
  const newestByObligation = new Map();
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obligation = clean(item.obligation, 220);
    const action = clean(item.action, 32).toLowerCase().replace(/[\s-]+/g, "_");
    const correctedAtValue = Number(item.correctedAt ?? item.corrected_at ?? item.updatedAt ?? item.updated_at ?? 0);
    const correctedAt = Number.isFinite(correctedAtValue) ? Math.max(0, correctedAtValue) : 0;
    if (!obligation || !STORY_OBLIGATION_CORRECTION_ACTIONS.has(action) || correctedAt <= 0) continue;
    const correction = Object.fromEntries(Object.entries({
      id: clean(item.id, 96) || `obligation_correction_${correctedAt}`,
      obligation,
      action,
      note: clean(item.note, 240),
      sourceChangeId: clean(item.sourceChangeId ?? item.source_change_id, 96),
      sourceStatus: clean(item.sourceStatus ?? item.source_status, 32),
      correctedAt,
    }).filter(([, field]) => typeof field === "number" ? true : Boolean(field)));
    const key = obligation.toLowerCase();
    const existing = newestByObligation.get(key);
    if (!existing || correction.correctedAt >= existing.correctedAt) {
      newestByObligation.set(key, correction);
    }
  }
  return [...newestByObligation.values()]
    .sort((left, right) => right.correctedAt - left.correctedAt)
    .slice(0, FEATURE_STORY_GRAPH_CORRECTION_MAX);
}

function buildStoryObligationLedger(acceptedScenes = [], corrections = []) {
  const scenes = Array.isArray(acceptedScenes) ? acceptedScenes : [];
  const correctionByObligation = new Map(
    sanitizeStoryObligationCorrections(corrections)
      .map((item) => [item.obligation.toLowerCase(), item])
  );
  const latestByObligation = new Map();
  scenes.forEach((scene, sceneIndex) => {
    const changes = sanitizeStoryObligationChanges(
      scene?.storyObligationChanges ?? scene?.story_obligation_changes
    );
    changes.forEach((change, changeIndex) => {
      const correction = correctionByObligation.get(change.obligation.toLowerCase());
      if (correction && correction.correctedAt >= acceptedAt(scene)) return;
      latestByObligation.set(change.obligation.toLowerCase(), Object.fromEntries(Object.entries({
        id: `obligation_${sceneIndex + 1}_${changeIndex + 1}`,
        ...change,
        sourceSceneId: `scene_${sceneIndex + 1}`,
        sourceSceneHeading: clean(
          scene.sceneHeading ?? scene.scene_heading ?? scene.sceneLabel ?? scene.scene_label,
          140
        ),
        sourceAct: clean(scene.act ?? scene.currentAct ?? scene.current_act, 80),
        sourcePosition: sceneIndex + 1,
        acceptedAt: acceptedAt(scene),
      }).filter(([, item]) => typeof item === "number" ? true : Boolean(item))));
    });
  });
  const items = [...latestByObligation.values()]
    .sort((left, right) => right.sourcePosition - left.sourcePosition)
    .slice(0, FEATURE_STORY_GRAPH_OBLIGATION_MAX);
  return {
    items,
    currentStoryObligationChange: items[0] || null,
  };
}

function buildConsequenceLedger(acceptedScenes = [], storyObligationLedger = []) {
  const scenes = Array.isArray(acceptedScenes) ? acceptedScenes : [];
  const explicitChanges = new Map(
    (Array.isArray(storyObligationLedger) ? storyObligationLedger : [])
      .filter((item) => item?.obligation)
      .map((item) => [item.obligation.toLowerCase(), item])
  );
  const candidates = [];
  const seenFacts = new Set();
  const lanes = [
    ["decision", "decisions"],
    ["revelation", "revelations"],
    ["relationship_change", "relationshipChanges", "relationship_changes"],
    ["irreversible_consequence", "irreversibleConsequences", "irreversible_consequences"],
  ];
  const kindWeight = {
    irreversible_consequence: 400,
    relationship_change: 300,
    revelation: 200,
    decision: 100,
  };

  scenes.forEach((scene, sceneIndex) => {
    for (const [kind, camelKey, snakeKey] of lanes) {
      const facts = cleanList(scene?.[camelKey] ?? scene?.[snakeKey], 8, 220);
      facts.forEach((fact, factIndex) => {
        const factKey = fact.toLowerCase();
        if (seenFacts.has(factKey)) return;
        seenFacts.add(factKey);
        const laterOffset = scenes.slice(sceneIndex + 1)
          .findIndex((laterScene) => laterSceneCarriesConsequence(fact, laterScene, scene));
        const carriedIndex = laterOffset >= 0 ? sceneIndex + laterOffset + 1 : -1;
        const carriedScene = carriedIndex >= 0 ? scenes[carriedIndex] : null;
        const explicitChange = explicitChanges.get(factKey) || null;
        const ageInScenes = Math.max(0, scenes.length - sceneIndex - 1);
        candidates.push(Object.fromEntries(Object.entries({
          id: `consequence_${sceneIndex + 1}_${kind}_${factIndex + 1}`,
          kind,
          fact,
          status: explicitChange?.status || (carriedScene ? "carried_forward" : "due"),
          sourceSceneId: `scene_${sceneIndex + 1}`,
          sourceSceneHeading: clean(
            scene.sceneHeading ?? scene.scene_heading ?? scene.sceneLabel ?? scene.scene_label,
            140
          ),
          sourceAct: clean(scene.act ?? scene.currentAct ?? scene.current_act, 80),
          sourcePosition: sceneIndex + 1,
          ageInScenes,
          referencedBySceneId: explicitChange?.sourceSceneId || (carriedScene ? `scene_${carriedIndex + 1}` : ""),
          referencedBySceneHeading: explicitChange?.sourceSceneHeading || (carriedScene
            ? clean(
              carriedScene.sceneHeading ?? carriedScene.scene_heading ?? carriedScene.sceneLabel ?? carriedScene.scene_label,
              140
            )
            : ""),
          result: explicitChange?.result || "",
          evidence: explicitChange?.evidence || "",
          priority: (kindWeight[kind] || 0) + Math.min(99, ageInScenes),
        }).filter(([, value]) => typeof value === "number" ? true : Boolean(value))));
      });
    }
  });

  const due = candidates
    .filter((item) => item.status === "due")
    .sort((left, right) => right.priority - left.priority || left.sourcePosition - right.sourcePosition);
  const carried = candidates
    .filter((item) => item.status === "carried_forward")
    .sort((left, right) => right.sourcePosition - left.sourcePosition);
  const explicitlyChanged = candidates
    .filter((item) => STORY_OBLIGATION_STATUSES.has(item.status))
    .sort((left, right) => right.sourcePosition - left.sourcePosition);
  return {
    items: [...due, ...explicitlyChanged, ...carried].slice(0, FEATURE_STORY_GRAPH_CONSEQUENCE_MAX),
    currentDueConsequence: due[0] || null,
    summary: {
      total: candidates.length,
      due: due.length,
      carriedForward: carried.length,
      explicitlyChanged: explicitlyChanged.length,
    },
  };
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
    storyObligationChanges: sanitizeStoryObligationChanges(
      scene.storyObligationChanges ?? scene.story_obligation_changes
    ),
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

function buildOpenThreads({
  project = {},
  nodes = [],
  dueStoryThread = null,
  storyObligationLedger = [],
  storyObligationCorrections = [],
} = {}) {
  const setups = cleanList(project.unresolvedSetups ?? project.unresolved_setups, FEATURE_STORY_GRAPH_THREAD_MAX, 220);
  const payoffs = cleanList(project.actThreePayoffPath ?? project.act_three_payoff_path, 5, 220);
  const dueSetup = clean(dueStoryThread?.setup, 220);
  const duePayoff = clean(dueStoryThread?.promisedPayoff ?? dueStoryThread?.promised_payoff, 220);
  const ordered = cleanList([dueSetup, ...setups].filter(Boolean), FEATURE_STORY_GRAPH_THREAD_MAX, 220);
  const explicitChanges = new Map(
    (Array.isArray(storyObligationLedger) ? storyObligationLedger : [])
      .filter((item) => item?.obligation)
      .map((item) => [item.obligation.toLowerCase(), item])
  );
  const correctionByObligation = new Map(
    sanitizeStoryObligationCorrections(storyObligationCorrections)
      .map((item) => [item.obligation.toLowerCase(), item])
  );
  return ordered.map((setup, index) => {
    const source = matchingSourceNode(nodes, setup);
    const isDue = Boolean(dueSetup && setup.toLowerCase() === dueSetup.toLowerCase());
    const promisedPayoff = isDue
      ? duePayoff
      : (payoffs[index] || (ordered.length === 1 && payoffs.length === 1 ? payoffs[0] : ""));
    const correction = correctionByObligation.get(setup.toLowerCase()) ||
      (promisedPayoff ? correctionByObligation.get(promisedPayoff.toLowerCase()) : null);
    if (correction?.action === "retire") return null;
    const change = explicitChanges.get(setup.toLowerCase()) ||
      (promisedPayoff ? explicitChanges.get(promisedPayoff.toLowerCase()) : null);
    if (change?.status === "paid_off") return null;
    return Object.fromEntries(Object.entries({
      id: `thread_${index + 1}`,
      setup,
      sourceSceneId: source?.id || "",
      sourceSceneHeading: source?.heading || clean(dueStoryThread?.sourceSceneHeading ?? dueStoryThread?.source_scene_heading, 140),
      promisedPayoff,
      due: isDue && !change,
      ageInScenes: isDue ? Math.max(0, Math.round(Number(dueStoryThread?.ageInScenes ?? dueStoryThread?.age_in_scenes ?? 0))) : 0,
      status: change?.status || (isDue ? "due" : "open"),
      latestResult: change?.result || "",
      evidence: change?.evidence || "",
    }).filter(([, item]) => typeof item === "boolean" || typeof item === "number" || Boolean(item)));
  }).filter(Boolean);
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
  const nodeOffset = Math.max(0, acceptedSceneRecords.length - chronologicalScenes.length);
  const nodes = chronologicalScenes.map((scene, index) => sceneGraphNode(scene, nodeOffset + index));
  const facts = (Array.isArray(acceptedCausalFacts) ? acceptedCausalFacts : [])
    .map(normalizedFact)
    .filter(Boolean)
    .slice(0, FEATURE_STORY_GRAPH_FACT_MAX);
  const storyObligationCorrections = sanitizeStoryObligationCorrections(
    project.storyObligationCorrections ?? project.story_obligation_corrections
  );
  const obligationState = buildStoryObligationLedger(
    acceptedSceneRecords,
    storyObligationCorrections
  );
  const openThreads = buildOpenThreads({
    project,
    nodes,
    dueStoryThread,
    storyObligationLedger: obligationState.items,
    storyObligationCorrections,
  });
  const consequenceState = buildConsequenceLedger(acceptedSceneRecords, obligationState.items);
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
  if (
    !nodes.length &&
    !facts.length &&
    !openThreads.length &&
    !obligationState.items.length &&
    !consequenceState.items.length &&
    !Object.keys(currentState).length
  ) return null;

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
    storyObligationLedger: obligationState.items,
    currentStoryObligationChange: obligationState.currentStoryObligationChange,
    storyObligationCorrections,
    consequenceLedger: consequenceState.items,
    consequenceSummary: consequenceState.summary,
    currentDueConsequence: consequenceState.currentDueConsequence,
    currentState,
  };
}

export {
  FEATURE_STORY_GRAPH_VERSION,
  buildFeatureStoryGraph,
  sanitizeStoryObligationCorrections,
};
