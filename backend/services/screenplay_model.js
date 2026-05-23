import { normalizeCharacterVoiceCardCollection } from "./character_voice_runtime.js";

export function createScreenplayModelServices(deps = {}) {
  const {
    normalizeEmailAddress = (value) => String(value || "").trim().toLowerCase(),
    normalizeSnippet = (value, maxChars = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, Math.max(0, Number(maxChars || 0))),
    normalizeScreenplayOwnerValue = (value, prefix = "owner") => {
      const normalized = String(value || "").trim();
      return normalized ? `${prefix}:${normalized}` : "";
    },
    randomUUID = () => String(Date.now()),
    recalculateScreenplayProject = (project) => project,
  } = deps;

function createScreenplayId(prefix = "sp") {
  return `${String(prefix || "sp").trim() || "sp"}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function normalizeScreenplayStringList(items, maxItems = 16, maxChars = 48) {
  const source = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of source) {
    const clean = normalizeSnippet(item, maxChars);
    if (!clean) continue;
    if (!out.includes(clean)) out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function splitScreenplayLines(draft) {
  const normalized = String(draft || "").replace(/\r\n/g, "\n");
  if (!normalized) return [];
  return normalized.split("\n");
}

function buildDraftExcerpt(draft, maxChars = 220) {
  return String(draft || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(32, maxChars));
}

function scoreScreenplayDraft(draft) {
  const text = String(draft || "").trim();
  if (!text) {
    return {
      formatScore: 0.32,
      storyScore: 0.28,
      confidenceClass: "low",
      warnings: ["draft_empty"],
    };
  }
  const lines = splitScreenplayLines(text);
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const sluglines = nonEmptyLines.filter((line) => /^(INT|EXT|EST|INT\/EXT|I\/E)\./i.test(line.trim())).length;
  const uppercaseCues = nonEmptyLines.filter((line) => {
    const trimmed = line.trim();
    return trimmed.length >= 2 &&
      trimmed.length <= 32 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      !/^(INT|EXT|EST|INT\/EXT|I\/E)\./i.test(trimmed);
  }).length;
  const dialogueBlocks = nonEmptyLines.filter((line) => line.startsWith("    ") || line.startsWith("\t")).length;
  const visualDensity = Math.min(1, nonEmptyLines.length / 42);
  const formatScore = Math.max(
    0.20,
    Math.min(0.99, 0.34 + (Math.min(3, sluglines) * 0.12) + (Math.min(5, uppercaseCues) * 0.05) + (Math.min(6, dialogueBlocks) * 0.03))
  );
  const storyScore = Math.max(
    0.20,
    Math.min(0.99, 0.28 + (Math.min(1, text.length / 1800) * 0.36) + (visualDensity * 0.20))
  );
  const composite = (formatScore * 0.55) + (storyScore * 0.45);
  const confidenceClass = composite >= 0.82 ? "high" : (composite >= 0.58 ? "medium" : "low");
  const warnings = [];
  if (sluglines === 0) warnings.push("missing_slugline");
  if (uppercaseCues === 0 && text.length > 160) warnings.push("no_character_cues_detected");
  return {
    formatScore: Number(formatScore.toFixed(3)),
    storyScore: Number(storyScore.toFixed(3)),
    confidenceClass,
    warnings,
  };
}

function analyzeFeatureLengthVoiceReadiness(input = {}) {
  const project = input.project && typeof input.project === "object" ? input.project : {};
  const version = input.version && typeof input.version === "object" ? input.version : null;
  const draft = String(input.draft ?? version?.draft ?? "");
  const outline = input.outline && typeof input.outline === "object"
    ? input.outline
    : (project.outline && typeof project.outline === "object" ? project.outline : createEmptyScreenplayOutline());
  const companionState = normalizeStoredScreenplayCompanionState(
    input.companionState ?? input.companion_state ?? project.companionState ?? null
  );
  const expectedPages = Math.max(75, Math.min(140, Number(input.expectedPages ?? input.expected_pages ?? 100) || 100));
  const expectedScenes = Math.max(35, Math.min(80, Number(input.expectedScenes ?? input.expected_scenes ?? 45) || 45));
  const rawStudioMeta = input.studioMeta ?? input.studio_meta ?? null;
  const studioVoiceSessionMode = rawStudioMeta && typeof rawStudioMeta === "object"
    ? normalizeSnippet(rawStudioMeta.voiceSessionMode ?? rawStudioMeta.voice_session_mode, 48)
    : "";
  const voiceSessionMode = normalizeSnippet(
    input.voiceSessionMode ?? input.voice_session_mode ?? studioVoiceSessionMode ?? "",
    48
  ).toLowerCase().replace(/[\s-]+/g, "_");
  const hasLongFormVoiceSession = ["feature", "feature_voice", "long_form", "longform", "continuous"].includes(voiceSessionMode);
  const storyContinuity = input.storyContinuity && typeof input.storyContinuity === "object"
    ? input.storyContinuity
    : (input.story_continuity && typeof input.story_continuity === "object" ? input.story_continuity : {});
  const currentSceneId = normalizeSnippet(
    input.currentSceneId ?? input.current_scene_id ?? storyContinuity.currentSceneId ?? storyContinuity.current_scene_id ?? "",
    96
  );
  const currentActId = normalizeSnippet(
    input.currentActId ?? input.current_act_id ?? storyContinuity.currentActId ?? storyContinuity.current_act_id ?? "",
    96
  );
  const selectedOutlineBeatIds = normalizeScreenplayStringList(
    input.selectedOutlineBeatIds ?? input.selected_outline_beat_ids ?? storyContinuity.selectedOutlineBeatIds ?? storyContinuity.selected_outline_beat_ids,
    12,
    96
  );
  const structuredCharacterBible = Array.isArray(input.characterBible ?? input.character_bible ?? storyContinuity.characterBible ?? storyContinuity.character_bible)
    ? (input.characterBible ?? input.character_bible ?? storyContinuity.characterBible ?? storyContinuity.character_bible)
    : [];

  const lines = splitScreenplayLines(draft);
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  const pageEstimate = Math.max(0, Math.ceil(lines.length / 55));
  const sluglineCount = nonEmptyLines.filter((line) => /^(INT|EXT|EST|INT\/EXT|I\/E)\./i.test(line)).length;
  const characterCueCount = nonEmptyLines.filter((line) => (
    line.length >= 2 &&
    line.length <= 32 &&
    line === line.toUpperCase() &&
    /[A-Z]/.test(line) &&
    !/^(INT|EXT|EST|INT\/EXT|I\/E)\./i.test(line)
  )).length;
  const acts = Array.isArray(outline.acts) ? outline.acts : [];
  const scenes = Array.isArray(outline.scenes) ? outline.scenes : [];
  const beats = Array.isArray(outline.beats) ? outline.beats : [];
  const versions = Array.isArray(project.versions) ? project.versions : [];
  const latestWriteAnchors = normalizeStoredScreenplayWriteAnchors(
    version?.studioWriteAnchors ?? version?.studio_write_anchors ?? []
  );
  const characters = normalizeScreenplayStringList(project.characters, 48, 80);
  const characterBibleNames = normalizeScreenplayStringList(
    structuredCharacterBible.map((entry) => entry?.name ?? entry?.character ?? entry?.cue),
    48,
    80
  );
  const durableCharacterCount = Math.max(characters.length, characterBibleNames.length);
  const sceneObjectiveCount = scenes.filter((scene) => normalizeSnippet(scene.objective, 220)).length;
  const sceneUnresolvedSetupCount = scenes.filter((scene) => {
    const raw = scene.unresolvedSetups ?? scene.unresolved_setups ?? scene.setups ?? [];
    return Array.isArray(raw) ? raw.length > 0 : Boolean(normalizeSnippet(raw, 240));
  }).length;
  const characterBibleDetailCount = structuredCharacterBible.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const want = normalizeSnippet(entry.want ?? entry.objective ?? "", 160);
    const contradiction = normalizeSnippet(entry.contradiction ?? entry.flaw ?? "", 160);
    const voice = normalizeSnippet(entry.voice ?? entry.dialogueVoice ?? entry.dialogue_voice ?? "", 160);
    return Boolean(want && contradiction && voice);
  }).length;

  const risks = [];
  function addRisk(id, severity, title, detail, nextStep) {
    risks.push({
      id,
      severity,
      title,
      detail,
      next_step: nextStep,
    });
  }

  if (!hasLongFormVoiceSession) {
    addRisk(
      "voice_session_turn_based",
      "high",
      "Voice session is not marked long-form",
      "Feature dictation needs pause/resume, scratch-that, commit, and command-vs-dictation safety before every spoken pause becomes a write turn.",
      "Add or enable a feature/long_form voice session mode before using hands-free feature drafting."
    );
  }
  if (draft.length > 2200 && scenes.length === 0) {
    addRisk(
      "draft_context_tail_only",
      "high",
      "Draft context has no scene graph",
      "A long draft without outline scene bindings is likely to be represented by a tail excerpt instead of whole-script continuity.",
      "Bind the draft to outline scenes and maintain current-act/current-scene context for every voice write."
    );
  }
  if (pageEstimate > 0 && pageEstimate < Math.round(expectedPages * 0.75)) {
    addRisk(
      "page_count_below_feature",
      "medium",
      "Draft is below feature length",
      "Estimated " + pageEstimate + " pages against a " + expectedPages + "-page target.",
      "Keep the project in build-out mode and avoid treating export/readiness scores as feature-complete."
    );
  }
  if (acts.length < 3) {
    addRisk(
      "three_act_map_missing",
      "high",
      "Three-act map is incomplete",
      "Found " + acts.length + " act records.",
      "Create at least Act I, Act II, and Act III records with scene membership."
    );
  }
  if (scenes.length < Math.min(expectedScenes, 35)) {
    addRisk(
      "scene_inventory_sparse",
      "high",
      "Scene inventory is sparse",
      "Found " + scenes.length + " outline scenes against a " + expectedScenes + "-scene feature target.",
      "Add a scene list with objective/slugline/status before long verbal generation."
    );
  }
  if (beats.length < Math.max(40, scenes.length)) {
    addRisk(
      "beat_inventory_sparse",
      "medium",
      "Beat coverage is thin",
      "Found " + beats.length + " beats for " + Math.max(scenes.length, sluglineCount) + " detected/outlined scenes.",
      "Add beat records so voice writes can target precise story moves instead of broad scene guesses."
    );
  }
  if (!currentSceneId) {
    addRisk(
      "current_scene_context_missing",
      "medium",
      "Current scene context is missing",
      "Feature voice writes need an explicit current scene so spoken edits do not drift to the wrong part of the script.",
      "Pass current_scene_id/currentSceneId with feature_voice page-write and readiness requests."
    );
  }
  if (!currentActId) {
    addRisk(
      "current_act_context_missing",
      "medium",
      "Current act context is missing",
      "Feature voice writes need act context to preserve escalation and page-count intent.",
      "Pass current_act_id/currentActId with feature_voice page-write and readiness requests."
    );
  }
  if (selectedOutlineBeatIds.length < 1) {
    addRisk(
      "selected_beat_context_missing",
      "medium",
      "Selected beat context is missing",
      "Without selected outline beats, the writer's spoken prompt is anchored only to nearby text.",
      "Pass selected_outline_beat_ids for the current beat or beat range."
    );
  }
  if (characters.length < 4) {
    addRisk(
      "character_bible_sparse",
      "medium",
      "Character bible is sparse",
      "Found " + characters.length + " named project characters.",
      "Add the principal cast with want/contradiction/voice notes before feature-length verbal drafting."
    );
  }
  if (structuredCharacterBible.length > 0 && characterBibleDetailCount < Math.min(4, structuredCharacterBible.length)) {
    addRisk(
      "character_bible_details_missing",
      "medium",
      "Character bible lacks want/contradiction/voice detail",
      "Found " + characterBibleDetailCount + " detailed character bible entries out of " + structuredCharacterBible.length + ".",
      "Add want, contradiction, and voice fields for the principal cast."
    );
  }
  if (scenes.length > 0 && sceneObjectiveCount < Math.ceil(scenes.length * 0.75)) {
    addRisk(
      "scene_objectives_sparse",
      "medium",
      "Scene objectives are sparse",
      "Found objectives on " + sceneObjectiveCount + " of " + scenes.length + " scenes.",
      "Add objective text to most outline scenes before long verbal generation."
    );
  }
  if (scenes.length > 0 && sceneUnresolvedSetupCount < Math.ceil(scenes.length * 0.25)) {
    addRisk(
      "unresolved_setups_sparse",
      "low",
      "Unresolved setup tracking is sparse",
      "Found unresolved setup markers on " + sceneUnresolvedSetupCount + " of " + scenes.length + " scenes.",
      "Track setups/payoffs on outline scenes so continuity QA can catch dangling threads."
    );
  }
  if (characterCueCount > 0 && characters.length > 0 && characterCueCount > characters.length * 20) {
    addRisk(
      "character_continuity_unverified",
      "medium",
      "Dialogue volume exceeds character-bible detail",
      "Detected " + characterCueCount + " character-cue lines but only " + characters.length + " project characters.",
      "Run a character continuity pass to catch aliases, accidental renames, and voice drift."
    );
  }
  if (latestWriteAnchors.length >= 40) {
    addRisk(
      "write_anchor_budget_near_cap",
      "medium",
      "Write anchor history is near cap",
      "Latest version has " + latestWriteAnchors.length + " write anchors; stored anchors cap at 48.",
      "Archive or roll up old write anchors into scene history before a long voice session."
    );
  }
  if (versions.length > 0 && versions.length < 3 && pageEstimate >= 20) {
    addRisk(
      "version_history_thin",
      "medium",
      "Version history is thin for a long draft",
      "Project has " + versions.length + " saved versions.",
      "Save milestone versions before major verbal rewrite passes."
    );
  }
  if ((companionState.recentTurns || []).length <= 6) {
    addRisk(
      "companion_memory_short",
      "medium",
      "Co-writer memory is short-term",
      "Companion state keeps a short recent-turn window, which is not enough to carry feature-scale story intent by itself.",
      "Promote durable decisions into outline, character bible, and scene notes instead of relying on recent turns."
    );
  }
  addRisk(
    "local_pdf_export_gap",
    "medium",
    "Local PDF export is not feature-proof",
    "The local screenplay export path supports Fountain/FDX but not local PDF generation, so final proofing needs external export evidence.",
    "Add a verified PDF export lane or require Final Draft/PDF artifact evidence before release signoff."
  );

  const severityWeight = { high: 16, medium: 8, low: 4 };
  const scorePenalty = risks.reduce((sum, risk) => sum + (severityWeight[risk.severity] || 4), 0);
  const readinessScore = Math.max(0, Math.min(100, 100 - scorePenalty));
  const readinessClass = readinessScore >= 82 ? "ready" : (readinessScore >= 62 ? "needs_attention" : "blocked");

  return {
    readiness_score: readinessScore,
    readiness_class: readinessClass,
    target_pages: expectedPages,
    target_scenes: expectedScenes,
    metrics: {
      draft_chars: draft.length,
      line_count: lines.length,
      non_empty_line_count: nonEmptyLines.length,
      estimated_pages: pageEstimate,
      detected_sluglines: sluglineCount,
      detected_character_cues: characterCueCount,
      act_count: acts.length,
      outline_scene_count: scenes.length,
      outline_beat_count: beats.length,
      character_count: characters.length,
      character_bible_count: structuredCharacterBible.length,
      detailed_character_bible_count: characterBibleDetailCount,
      scene_objective_count: sceneObjectiveCount,
      scene_unresolved_setup_count: sceneUnresolvedSetupCount,
      current_scene_context: Boolean(currentSceneId),
      current_act_context: Boolean(currentActId),
      selected_outline_beat_count: selectedOutlineBeatIds.length,
      version_count: versions.length,
      latest_write_anchor_count: latestWriteAnchors.length,
      companion_recent_turn_count: (companionState.recentTurns || []).length,
      long_form_voice_session: hasLongFormVoiceSession,
    },
    risks,
    next_steps: risks.slice(0, 10).map((risk) => risk.next_step),
  };
}


function analyzeScreenplayContinuityQa(input = {}) {
  const project = input.project && typeof input.project === "object" ? input.project : {};
  const version = input.version && typeof input.version === "object" ? input.version : null;
  const draft = String(input.draft ?? version?.draft ?? "");
  const outline = input.outline && typeof input.outline === "object"
    ? input.outline
    : (project.outline && typeof project.outline === "object" ? project.outline : createEmptyScreenplayOutline());
  const lines = splitScreenplayLines(draft).map((line) => line.trim()).filter(Boolean);
  const cues = lines.filter((line) => (
    line.length >= 2 &&
    line.length <= 32 &&
    line === line.toUpperCase() &&
    /[A-Z]/.test(line) &&
    !/^(INT|EXT|EST|INT\/EXT|I\/E)\./i.test(line)
  ));
  const scenes = Array.isArray(outline.scenes) ? outline.scenes : [];
  const acts = Array.isArray(outline.acts) ? outline.acts : [];
  const beats = Array.isArray(outline.beats) ? outline.beats : [];
  const characterBible = Array.isArray(input.characterBible ?? input.character_bible)
    ? (input.characterBible ?? input.character_bible)
    : [];
  const bibleNames = new Set(normalizeScreenplayStringList(
    [
      ...(project.characters || []),
      ...characterBible.map((entry) => entry?.name ?? entry?.character ?? entry?.cue),
    ],
    96,
    80
  ).map((name) => name.toUpperCase()));
  const issues = [];
  function addIssue(id, severity, title, detail, scene, beat) {
    const issue = { id, severity, title, detail };
    if (scene?.id) issue.scene_id = String(scene.id);
    if (scene?.title || scene?.slugline) issue.scene_title = normalizeSnippet(scene.title || scene.slugline, 160);
    if (beat?.id) issue.beat_id = String(beat.id);
    if (beat?.label || beat?.title) issue.beat_label = normalizeSnippet(beat.label || beat.title, 160);
    issues.push(issue);
  }
  function sceneForActId(actId) {
    const cleanActId = String(actId || "");
    return scenes.find((scene) => String(scene.actId || "") === cleanActId) || null;
  }
  const unknownCues = [...new Set(cues.filter((cue) => bibleNames.size > 0 && !bibleNames.has(cue)))].slice(0, 12);
  if (unknownCues.length) {
    addIssue("unknown_character_cues", "medium", "Draft contains character cues outside the character bible", unknownCues.join(", "));
  }
  const scenesMissingObjective = scenes.filter((scene) => !normalizeSnippet(scene.objective, 220)).slice(0, 12);
  if (scenesMissingObjective.length) {
    addIssue(
      "scenes_missing_objectives",
      "medium",
      "Outline scenes are missing objectives",
      scenesMissingObjective.map((scene) => scene.title || scene.slugline || scene.id).join(", "),
      scenesMissingObjective[0]
    );
  }
  const sceneIds = new Set(scenes.map((scene) => String(scene.id || "")));
  const orphanBeats = beats.filter((beat) => beat.sceneId && !sceneIds.has(String(beat.sceneId))).slice(0, 12);
  if (orphanBeats.length) {
    addIssue("orphan_beats", "high", "Outline beats point to missing scenes", orphanBeats.map((beat) => beat.label || beat.id).join(", "), scenes[0], orphanBeats[0]);
  }
  if (acts.length >= 3 && scenes.length >= 9) {
    const counts = acts.map((act) => scenes.filter((scene) => String(scene.actId || "") === String(act.id || "")).length);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max >= Math.max(6, min * 4)) {
      const imbalancedAct = acts[counts.indexOf(max)] || acts[0];
      addIssue("act_scene_imbalance", "medium", "Act scene counts are heavily imbalanced", counts.join(" / "), sceneForActId(imbalancedAct?.id) || scenes[0]);
    }
  }
  const unresolvedSetupScenes = scenes.filter((scene) => {
    const raw = scene.unresolvedSetups ?? scene.unresolved_setups ?? scene.setups ?? [];
    return Array.isArray(raw) ? raw.length > 0 : Boolean(normalizeSnippet(raw, 240));
  }).length;
  if (scenes.length >= 8 && unresolvedSetupScenes === 0) {
    addIssue("no_setup_tracking", "low", "No setup/payoff tracking found", "Add unresolved_setups to scenes that plant story promises.");
  }
  const severityWeight = { high: 16, medium: 8, low: 4 };
  const penalty = issues.reduce((sum, issue) => sum + (severityWeight[issue.severity] || 4), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return {
    continuity_score: score,
    continuity_class: score >= 85 ? "clean" : (score >= 65 ? "needs_attention" : "blocked"),
    metrics: {
      cue_count: cues.length,
      unique_cue_count: new Set(cues).size,
      character_bible_count: bibleNames.size,
      scene_count: scenes.length,
      act_count: acts.length,
      beat_count: beats.length,
      unresolved_setup_scene_count: unresolvedSetupScenes,
    },
    issues,
  };
}

function createEmptyScreenplayOutline() {
  return {
    updatedAt: 0,
    acts: [],
    scenes: [],
    beats: [],
  };
}

function createEmptyScreenplayCompanionAnalytics() {
  return {
    updatedAt: 0,
    totalTurns: 0,
    homeTurns: 0,
    studioTurns: 0,
    voiceTurns: 0,
    typedTurns: 0,
    modeSwitches: 0,
    memoryClears: 0,
    threadClears: 0,
    lastSurfaceRaw: "",
    lastSourceRaw: "",
    firstPageWrittenAt: 0,
    firstPageWrittenSourceRaw: "",
    firstPageWrittenProjectId: "",
    firstPageWrittenVersionId: "",
  };
}

function createEmptyCreativeIntentSnapshot() {
  return {
    kind: "reflective_support",
    label: "",
    summary: "",
    nextMove: "",
    confidence: 0,
    sourceText: "",
    updatedAt: 0,
  };
}

function createEmptyCreativePresenceSnapshot() {
  return {
    title: "",
    detail: "",
    updatedAt: 0,
  };
}

function createEmptyCreativeCompanionSignals() {
  return {
    intent: createEmptyCreativeIntentSnapshot(),
    presence: createEmptyCreativePresenceSnapshot(),
    proactiveSuggestion: null,
  };
}

function createEmptyScreenplayCompanionState() {
  return {
    modeRaw: "coach",
    recentTurns: [],
    analytics: createEmptyScreenplayCompanionAnalytics(),
    signals: createEmptyCreativeCompanionSignals(),
  };
}

function normalizeScreenplayCharacterBible(entries, maxItems = 48) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const name = normalizeSnippet(entry.name ?? entry.character ?? entry.cue, 80);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      aliases: normalizeScreenplayStringList(entry.aliases, 12, 48),
      want: normalizeSnippet(entry.want, 180),
      contradiction: normalizeSnippet(entry.contradiction, 180),
      wound: normalizeSnippet(entry.wound, 180),
      voice: normalizeSnippet(entry.voice, 220),
      status: normalizeSnippet(entry.status, 32) || "active",
    });
    if (out.length >= maxItems) break;
  }
  return out;
}

function createEmptyScreenplayOwner(ownerKey) {
  return {
    ownerKey,
    activeProjectId: "",
    updatedAt: 0,
    companionState: createEmptyScreenplayCompanionState(),
    projects: [],
  };
}

function normalizeStoredScreenplayVersion(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64);
  if (!id) return null;
  return {
    id,
    projectId: normalizeSnippet(entry.projectId, 64),
    phase: normalizeSnippet(entry.phase, 48) || "scene_draft",
    source: normalizeSnippet(entry.source, 48),
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
    prompt: normalizeSnippet(entry.prompt, 320),
    notes: normalizeSnippet(entry.notes, 240),
    formatScore: Number(entry.formatScore || 0),
    storyScore: Number(entry.storyScore || 0),
    confidenceClass: normalizeSnippet(entry.confidenceClass, 24) || "medium",
    warnings: normalizeScreenplayStringList(entry.warnings, 8, 64),
    draft: String(entry.draft || ""),
    draftExcerpt: buildDraftExcerpt(entry.draftExcerpt || entry.draft || ""),
    studioWriteAnchors: normalizeStoredScreenplayWriteAnchors(entry.studioWriteAnchors || entry.studio_write_anchors),
    screenplayBindings: normalizeStoredScreenplayBindings(entry.screenplayBindings || entry.screenplay_bindings),
  };
}

function normalizeStoredScreenplayWriteAnchor(entry) {
  if (!entry || typeof entry !== "object") return null;
  const writeId = normalizeSnippet(entry.writeId ?? entry.write_id, 72);
  if (!writeId) return null;
  const anchorLine = Math.max(0, Number((entry.anchorLine ?? entry.anchor_line) || 0));
  const anchorEndLine = Math.max(0, Number((entry.anchorEndLine ?? entry.anchor_end_line) || 0));
  return {
    writeId,
    anchorLine: anchorLine > 0 ? anchorLine : 0,
    anchorEndLine: anchorEndLine > 0 ? anchorEndLine : 0,
    anchorSceneLabel: normalizeSnippet(entry.anchorSceneLabel ?? entry.anchor_scene_label, 140),
    anchorExcerpt: normalizeSnippet(entry.anchorExcerpt ?? entry.anchor_excerpt, 320),
    insertedText: normalizeSnippet(entry.insertedText ?? entry.inserted_text, 6000),
    updatedAt: Math.max(0, Number((entry.updatedAt ?? entry.updated_at) || 0)),
  };
}

function normalizeStoredScreenplayWriteAnchors(list) {
  if (!Array.isArray(list)) return [];
  const deduped = new Map();
  for (const item of list) {
    const normalized = normalizeStoredScreenplayWriteAnchor(item);
    if (!normalized) continue;
    deduped.set(normalized.writeId, normalized);
  }
  return [...deduped.values()].slice(0, 48);
}

function normalizeStoredScreenplayBinding(entry) {
  if (!entry || typeof entry !== "object") return null;
  const draftSceneId = normalizeSnippet(entry.draftSceneId ?? entry.draft_scene_id, 96);
  if (!draftSceneId) return null;
  return {
    draftSceneId,
    draftLine: Math.max(0, Number((entry.draftLine ?? entry.draft_line) || 0)),
    draftEndLine: Math.max(0, Number((entry.draftEndLine ?? entry.draft_end_line) || 0)),
    draftSlugline: normalizeSnippet(entry.draftSlugline ?? entry.draft_slugline, 180),
    draftShortLabel: normalizeSnippet(entry.draftShortLabel ?? entry.draft_short_label, 140),
    outlineSceneId: normalizeSnippet(entry.outlineSceneId ?? entry.outline_scene_id, 96),
    outlineSceneTitle: normalizeSnippet(entry.outlineSceneTitle ?? entry.outline_scene_title, 180),
    outlineSceneSlugline: normalizeSnippet(entry.outlineSceneSlugline ?? entry.outline_scene_slugline, 180),
    outlineBeatIds: normalizeScreenplayStringList(entry.outlineBeatIds ?? entry.outline_beat_ids, 64, 96),
    outlineBeatLabels: normalizeScreenplayStringList(entry.outlineBeatLabels ?? entry.outline_beat_labels, 64, 180),
    actTitle: normalizeSnippet(entry.actTitle ?? entry.act_title, 140),
    matchedBy: normalizeSnippet(entry.matchedBy ?? entry.matched_by, 48),
    updatedAt: Math.max(0, Number((entry.updatedAt ?? entry.updated_at) || 0)),
  };
}

function normalizeScreenplayCompanionTimestamp(value) {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeStoredScreenplayCompanionTurn(entry) {
  if (!entry || typeof entry !== "object") return null;
  const user = normalizeSnippet(entry.user, 320);
  const assistant = normalizeSnippet(entry.assistant, 320);
  if (!user || !assistant) return null;
  const rawMemoryDomain = normalizeSnippet(entry.memoryDomain ?? entry.memory_domain, 24).toLowerCase();
  const memoryDomain = ["project", "companion", "mixed"].includes(rawMemoryDomain)
    ? rawMemoryDomain
    : "companion";
  return {
    id: normalizeSnippet(entry.id, 80) || createScreenplayId("compturn"),
    user,
    assistant,
    memoryDomain,
    recordedAt: normalizeScreenplayCompanionTimestamp(entry.recordedAt ?? entry.recorded_at) ?? Date.now(),
  };
}

function normalizeStoredScreenplayCompanionAnalytics(entry) {
  const fallback = createEmptyScreenplayCompanionAnalytics();
  if (!entry || typeof entry !== "object") return fallback;
  return {
    updatedAt: normalizeScreenplayCompanionTimestamp(entry.updatedAt ?? entry.updated_at),
    totalTurns: Math.max(0, Number(entry.totalTurns ?? entry.total_turns ?? 0)),
    homeTurns: Math.max(0, Number(entry.homeTurns ?? entry.home_turns ?? 0)),
    studioTurns: Math.max(0, Number(entry.studioTurns ?? entry.studio_turns ?? 0)),
    voiceTurns: Math.max(0, Number(entry.voiceTurns ?? entry.voice_turns ?? 0)),
    typedTurns: Math.max(0, Number(entry.typedTurns ?? entry.typed_turns ?? 0)),
    modeSwitches: Math.max(0, Number(entry.modeSwitches ?? entry.mode_switches ?? 0)),
    memoryClears: Math.max(0, Number(entry.memoryClears ?? entry.memory_clears ?? 0)),
    threadClears: Math.max(0, Number(entry.threadClears ?? entry.thread_clears ?? 0)),
    lastSurfaceRaw: normalizeSnippet(entry.lastSurfaceRaw ?? entry.last_surface_raw, 32),
    lastSourceRaw: normalizeSnippet(entry.lastSourceRaw ?? entry.last_source_raw, 32),
    firstPageWrittenAt: normalizeScreenplayCompanionTimestamp(entry.firstPageWrittenAt ?? entry.first_page_written_at),
    firstPageWrittenSourceRaw: normalizeSnippet(
      entry.firstPageWrittenSourceRaw ?? entry.first_page_written_source_raw,
      32
    ),
    firstPageWrittenProjectId: normalizeSnippet(
      entry.firstPageWrittenProjectId ?? entry.firstPageWrittenProjectID ?? entry.first_page_written_project_id,
      96
    ),
    firstPageWrittenVersionId: normalizeSnippet(
      entry.firstPageWrittenVersionId ?? entry.firstPageWrittenVersionID ?? entry.first_page_written_version_id,
      96
    ),
  };
}

function normalizeStoredCreativeIntentSnapshot(entry) {
  const fallback = createEmptyCreativeIntentSnapshot();
  if (!entry || typeof entry !== "object") return fallback;
  const rawKind = normalizeSnippet(entry.kind, 48).toLowerCase();
  const kind = [
    "screenplay_page_write",
    "story_development",
    "mixed_support",
    "companion_support",
    "practical_support",
    "reflective_support",
  ].includes(rawKind) ? rawKind : fallback.kind;
  return {
    kind,
    label: normalizeSnippet(entry.label, 64),
    summary: normalizeSnippet(entry.summary, 320),
    nextMove: normalizeSnippet(entry.nextMove ?? entry.next_move, 320),
    confidence: Math.max(0, Math.min(1, Number(entry.confidence || 0))),
    sourceText: normalizeSnippet(entry.sourceText ?? entry.source_text, 240),
    updatedAt: normalizeScreenplayCompanionTimestamp(entry.updatedAt ?? entry.updated_at),
  };
}

function normalizeStoredCreativePresenceSnapshot(entry) {
  const fallback = createEmptyCreativePresenceSnapshot();
  if (!entry || typeof entry !== "object") return fallback;
  return {
    title: normalizeSnippet(entry.title, 64),
    detail: normalizeSnippet(entry.detail, 320),
    updatedAt: normalizeScreenplayCompanionTimestamp(entry.updatedAt ?? entry.updated_at),
  };
}

function normalizeStoredCreativeProactiveSuggestion(entry) {
  if (!entry || typeof entry !== "object") return null;
  const prompt = normalizeSnippet(entry.prompt, 220);
  if (!prompt) return null;
  return {
    category: normalizeSnippet(entry.category, 32) || "Story",
    prompt,
    reason: normalizeSnippet(entry.reason, 240),
    updatedAt: normalizeScreenplayCompanionTimestamp(entry.updatedAt ?? entry.updated_at),
  };
}

function normalizeStoredCreativeCompanionSignals(entry) {
  const fallback = createEmptyCreativeCompanionSignals();
  if (!entry || typeof entry !== "object") return fallback;
  return {
    intent: normalizeStoredCreativeIntentSnapshot(entry.intent),
    presence: normalizeStoredCreativePresenceSnapshot(entry.presence),
    proactiveSuggestion: normalizeStoredCreativeProactiveSuggestion(
      entry.proactiveSuggestion ?? entry.proactive_suggestion
    ),
  };
}

function normalizeStoredScreenplayCompanionState(entry) {
  const fallback = createEmptyScreenplayCompanionState();
  if (!entry || typeof entry !== "object") return fallback;
  const modeRaw = normalizeSnippet(entry.modeRaw ?? entry.mode_raw, 32).toLowerCase();
  return {
    modeRaw: ["coach", "coWriter", "comfort", "cowriter"].includes(modeRaw)
      ? (modeRaw === "cowriter" ? "coWriter" : modeRaw)
      : fallback.modeRaw,
    recentTurns: Array.isArray(entry.recentTurns ?? entry.recent_turns)
      ? (entry.recentTurns ?? entry.recent_turns).map(normalizeStoredScreenplayCompanionTurn).filter(Boolean).slice(-6)
      : [],
    analytics: normalizeStoredScreenplayCompanionAnalytics(entry.analytics),
    signals: normalizeStoredCreativeCompanionSignals(entry.signals),
  };
}

function toScreenplayCompanionStatePayload(state) {
  const safeState = normalizeStoredScreenplayCompanionState(state);
  return {
    mode_raw: safeState.modeRaw,
    recent_turns: safeState.recentTurns.map((turn) => ({
      id: turn.id,
      user: turn.user,
      assistant: turn.assistant,
      memory_domain: turn.memoryDomain,
      recorded_at: new Date(Math.max(0, Number(turn.recordedAt || 0)) || Date.now()).toISOString(),
    })),
    analytics: {
      updated_at: new Date(
        safeState.analytics.updatedAt > 0
          ? safeState.analytics.updatedAt
          : Date.now()
      ).toISOString(),
      total_turns: safeState.analytics.totalTurns,
      home_turns: safeState.analytics.homeTurns,
      studio_turns: safeState.analytics.studioTurns,
      voice_turns: safeState.analytics.voiceTurns,
      typed_turns: safeState.analytics.typedTurns,
      mode_switches: safeState.analytics.modeSwitches,
      memory_clears: safeState.analytics.memoryClears,
      thread_clears: safeState.analytics.threadClears,
      last_surface_raw: safeState.analytics.lastSurfaceRaw,
      last_source_raw: safeState.analytics.lastSourceRaw,
      first_page_written_at: safeState.analytics.firstPageWrittenAt > 0
        ? new Date(safeState.analytics.firstPageWrittenAt).toISOString()
        : null,
      first_page_written_source_raw: safeState.analytics.firstPageWrittenSourceRaw,
      first_page_written_project_id: safeState.analytics.firstPageWrittenProjectId,
      first_page_written_version_id: safeState.analytics.firstPageWrittenVersionId,
    },
    signals: {
      intent: {
        kind: safeState.signals.intent.kind,
        label: safeState.signals.intent.label,
        summary: safeState.signals.intent.summary,
        next_move: safeState.signals.intent.nextMove,
        confidence: safeState.signals.intent.confidence,
        source_text: safeState.signals.intent.sourceText,
        updated_at: new Date(
          safeState.signals.intent.updatedAt > 0
            ? safeState.signals.intent.updatedAt
            : Date.now()
        ).toISOString(),
      },
      presence: {
        title: safeState.signals.presence.title,
        detail: safeState.signals.presence.detail,
        updated_at: new Date(
          safeState.signals.presence.updatedAt > 0
            ? safeState.signals.presence.updatedAt
            : Date.now()
        ).toISOString(),
      },
      proactive_suggestion: safeState.signals.proactiveSuggestion
        ? {
            category: safeState.signals.proactiveSuggestion.category,
            prompt: safeState.signals.proactiveSuggestion.prompt,
            reason: safeState.signals.proactiveSuggestion.reason,
            updated_at: new Date(
              safeState.signals.proactiveSuggestion.updatedAt > 0
                ? safeState.signals.proactiveSuggestion.updatedAt
                : Date.now()
            ).toISOString(),
          }
        : null,
    },
  };
}

function normalizeStoredScreenplayBindings(list) {
  if (!Array.isArray(list)) return [];
  const deduped = new Map();
  for (const item of list) {
    const normalized = normalizeStoredScreenplayBinding(item);
    if (!normalized) continue;
    deduped.set(normalized.draftSceneId, normalized);
  }
  return [...deduped.values()].slice(0, 128);
}

function normalizeStoredScreenplayThreadViewState(entry) {
  if (!entry || typeof entry !== "object") return null;
  const searchText = normalizeSnippet(entry.searchText ?? entry.search_text, 220);
  const selectedFilterRaw = normalizeSnippet(entry.selectedFilterRaw ?? entry.selected_filter_raw, 48);
  const selectedSceneKey = normalizeSnippet(entry.selectedSceneKey ?? entry.selected_scene_key, 180);
  const scrollTargetKey = normalizeSnippet(entry.scrollTargetKey ?? entry.scroll_target_key, 180);
  const focusedDiffKey = normalizeSnippet(entry.focusedDiffKey ?? entry.focused_diff_key, 180);
  const latestReopenedWriteID = normalizeSnippet(entry.latestReopenedWriteID ?? entry.latest_reopened_write_id, 180);
  const reopenedLineageKeys = Array.isArray(entry.reopenedLineageKeys ?? entry.reopened_lineage_keys)
    ? [...new Set((entry.reopenedLineageKeys ?? entry.reopened_lineage_keys)
        .map((item) => normalizeSnippet(item, 180))
        .filter(Boolean)
        .map((item) => item.toLowerCase()))]
        .slice(0, 48)
    : [];
  const collapsedSectionKeys = Array.isArray(entry.collapsedSectionKeys ?? entry.collapsed_section_keys)
    ? [...new Set((entry.collapsedSectionKeys ?? entry.collapsed_section_keys)
        .map((item) => normalizeSnippet(item, 180))
        .filter(Boolean))]
        .slice(0, 48)
    : [];
  if (!searchText && !selectedFilterRaw && !selectedSceneKey && !scrollTargetKey && !focusedDiffKey && !latestReopenedWriteID && collapsedSectionKeys.length === 0 && reopenedLineageKeys.length === 0) {
    return null;
  }
  return {
    searchText: searchText || "",
    selectedFilterRaw: selectedFilterRaw || "",
    selectedSceneKey: selectedSceneKey || "",
    scrollTargetKey: scrollTargetKey || "",
    collapsedSectionKeys,
    focusedDiffKey: focusedDiffKey || "",
    reopenedLineageKeys,
    latestReopenedWriteID: latestReopenedWriteID || "",
  };
}

function normalizeStoredScreenplayDiffAcknowledgedKey(value) {
  const normalized = normalizeSnippet(value, 180)?.toLowerCase() || "";
  if (!normalized) return "";
  if (normalized.startsWith("write:")) {
    const writeId = normalizeSnippet(normalized.slice("write:".length), 72)?.toLowerCase() || "";
    return writeId ? `lineage:${writeId}` : "";
  }
  return normalized;
}

function normalizeStoredScreenplayDiffAcknowledgedKeys(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list
      .map((item) => normalizeStoredScreenplayDiffAcknowledgedKey(item))
      .filter(Boolean)
  )].slice(0, 48);
}

function normalizeStoredScreenplayDiffAcknowledgedEntries(list) {
  if (!Array.isArray(list)) return [];
  const entries = [];
  const seen = new Set();
  for (const item of list) {
    const raw = item && typeof item === "object" ? item : {};
    const key = normalizeStoredScreenplayDiffAcknowledgedKey(raw.key ?? raw.persistentKey ?? item);
    if (!key || seen.has(key)) continue;
    const fingerprint = normalizeSnippet(raw.fingerprint ?? raw.currentFingerprint ?? raw.current_fingerprint, 320);
    const writeId = normalizeSnippet(raw.writeId ?? raw.write_id ?? raw.acknowledgedWriteId ?? raw.acknowledged_write_id, 72);
    entries.push({
      key,
      fingerprint: fingerprint || "",
      writeId: writeId || "",
    });
    seen.add(key);
  }
  return entries.slice(0, 48);
}

function normalizeStoredScreenplayDiffAcknowledgementState(entry) {
  const raw = entry && typeof entry === "object" ? entry : {};
  const normalizedEntries = normalizeStoredScreenplayDiffAcknowledgedEntries(
    raw.entries
    || raw.Entries
    || raw.studioDiffAcknowledgedEntries
    || raw.studio_diff_acknowledged_entries
  );
  const normalizedKeys = normalizeStoredScreenplayDiffAcknowledgedKeys(
    raw.keys
    || raw.Keys
    || raw.studioDiffAcknowledgedKeys
    || raw.studio_diff_acknowledged_keys
  );
  const mergedEntries = [...normalizedEntries];
  const seen = new Set(mergedEntries.map((item) => item.key));
  for (const key of normalizedKeys) {
    if (seen.has(key)) continue;
    mergedEntries.push({ key, fingerprint: "", writeId: "" });
    seen.add(key);
  }
  const keys = mergedEntries.map((item) => item.key).slice(0, 48);
  return {
    keys,
    entries: mergedEntries.slice(0, 48),
  };
}

function normalizeStoredScreenplayAct(entry, orderFallback = 0) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64) || createScreenplayId("act");
  const title = normalizeSnippet(entry.title, 120) || "Act";
  return {
    id,
    title,
    summary: normalizeSnippet(entry.summary, 220),
    order: Math.max(0, Number(entry.order ?? orderFallback)),
    sceneIds: normalizeScreenplayStringList(entry.sceneIds, 128, 64),
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
  };
}

function normalizeStoredScreenplayScene(entry, orderFallback = 0) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64) || createScreenplayId("scene");
  return {
    id,
    slugline: normalizeSnippet(entry.slugline, 140),
    title: normalizeSnippet(entry.title, 140) || "Scene",
    objective: normalizeSnippet(entry.objective, 220),
    summary: normalizeSnippet(entry.summary, 320),
    actId: normalizeSnippet(entry.actId, 64),
    order: Math.max(0, Number(entry.order ?? orderFallback)),
    status: normalizeSnippet(entry.status, 24) || "open",
    beatIds: normalizeScreenplayStringList(entry.beatIds, 256, 64),
    unresolvedSetups: normalizeScreenplayStringList(entry.unresolvedSetups ?? entry.unresolved_setups, 64, 120),
    resolvedPayoffs: normalizeScreenplayStringList(entry.resolvedPayoffs ?? entry.resolved_payoffs ?? entry.payoffs, 64, 120),
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
  };
}

function normalizeStoredScreenplayBeat(entry, orderFallback = 0) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64) || createScreenplayId("beat");
  return {
    id,
    label: normalizeSnippet(entry.label, 140) || "Beat",
    summary: normalizeSnippet(entry.summary, 280),
    sceneId: normalizeSnippet(entry.sceneId, 64),
    actId: normalizeSnippet(entry.actId, 64),
    order: Math.max(0, Number(entry.order ?? orderFallback)),
    status: normalizeSnippet(entry.status, 24) || "open",
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
  };
}

function normalizeStoredScreenplayCollaborator(entry) {
  if (!entry || typeof entry !== "object") return null;
  const email = normalizeEmailAddress(entry.email);
  if (!email) return null;
  return {
    id: normalizeSnippet(entry.id, 64) || createScreenplayId("collab"),
    email,
    status: normalizeSnippet(entry.status, 24) || "approved",
    approvedAt: Math.max(0, Number(entry.approvedAt || entry.updatedAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.approvedAt || 0)),
    invitedBy: normalizeSnippet(entry.invitedBy, 96),
    note: normalizeSnippet(entry.note, 220),
  };
}

function normalizeStoredScreenplayComment(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64) || createScreenplayId("comment");
  return {
    id,
    projectId: normalizeSnippet(entry.projectId, 64),
    versionId: normalizeSnippet(entry.versionId, 64),
    type: normalizeSnippet(entry.type, 24) || "text",
    text: normalizeSnippet(entry.text, 1200),
    authorEmail: normalizeEmailAddress(entry.authorEmail),
    authorName: normalizeSnippet(entry.authorName, 96),
    anchorLine: Number.isFinite(Number(entry.anchorLine)) && Number(entry.anchorLine) > 0
      ? Math.floor(Number(entry.anchorLine))
      : null,
    parentCommentId: normalizeSnippet(entry.parentCommentId, 64),
    threadRootId: normalizeSnippet(entry.threadRootId, 64),
    isDeleted: Boolean(entry.isDeleted),
    deletedAt: Math.max(0, Number(entry.deletedAt || 0)),
    resolved: Boolean(entry.resolved),
    resolvedAt: Math.max(0, Number(entry.resolvedAt || 0)),
    resolvedBy: normalizeEmailAddress(entry.resolvedBy) || normalizeSnippet(entry.resolvedBy, 96),
    voiceUrl: normalizeSnippet(entry.voiceUrl, 400),
    voiceTranscript: normalizeSnippet(entry.voiceTranscript, 1200),
    voiceDurationMs: Math.max(0, Number(entry.voiceDurationMs || 0)),
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
  };
}

function normalizeStoredScreenplayOutline(entry) {
  const raw = entry && typeof entry === "object" ? entry : {};
  const acts = Array.isArray(raw.acts)
    ? raw.acts.map((item, index) => normalizeStoredScreenplayAct(item, index)).filter(Boolean)
    : [];
  const scenes = Array.isArray(raw.scenes)
    ? raw.scenes.map((item, index) => normalizeStoredScreenplayScene(item, index)).filter(Boolean)
    : [];
  const beats = Array.isArray(raw.beats)
    ? raw.beats.map((item, index) => normalizeStoredScreenplayBeat(item, index)).filter(Boolean)
    : [];
  return {
    updatedAt: Math.max(0, Number(raw.updatedAt || 0)),
    acts,
    scenes,
    beats,
  };
}

function normalizeStoredScreenplayProject(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64);
  const title = normalizeSnippet(entry.title, 160);
  if (!id || !title) return null;
  const diffAcknowledged = normalizeStoredScreenplayDiffAcknowledgementState(
    entry.studioDiffAcknowledged
    || entry.studio_diff_acknowledged
    || {
      keys: entry.studioDiffAcknowledgedKeys
        || entry.studio_diff_acknowledged_keys,
      entries: entry.studioDiffAcknowledgedEntries
        || entry.studio_diff_acknowledged_entries,
    }
  );
  const outline = normalizeStoredScreenplayOutline(entry.outline);
  const versions = Array.isArray(entry.versions)
    ? entry.versions.map(normalizeStoredScreenplayVersion).filter(Boolean)
    : [];
  const collaborators = Array.isArray(entry.collaborators)
    ? entry.collaborators.map(normalizeStoredScreenplayCollaborator).filter(Boolean)
    : [];
  const comments = Array.isArray(entry.comments)
    ? entry.comments.map(normalizeStoredScreenplayComment).filter(Boolean)
    : [];
  return {
    id,
    title,
    archived: Boolean(entry.archived),
    tags: normalizeScreenplayStringList(entry.tags, 24, 48),
    characters: normalizeScreenplayStringList(entry.characters, 24, 48),
    characterBible: normalizeScreenplayCharacterBible(entry.characterBible ?? entry.character_bible),
    setting: normalizeSnippet(entry.setting, 120),
    tone: normalizeSnippet(entry.tone, 120),
    promptSeed: normalizeSnippet(entry.promptSeed, 240),
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
    lastPhase: normalizeSnippet(entry.lastPhase, 48) || "scene_draft",
    activeVersionId: normalizeSnippet(entry.activeVersionId, 64),
    lastVersionId: normalizeSnippet(entry.lastVersionId, 64),
    lastVersionAt: Math.max(0, Number(entry.lastVersionAt || 0)),
    studioThreadViewState: normalizeStoredScreenplayThreadViewState(entry.studioThreadViewState || entry.studio_thread_view_state),
    studioDiffAcknowledgedKeys: diffAcknowledged.keys,
    studioDiffAcknowledgedEntries: diffAcknowledged.entries,
    outline,
    versions,
    collaborators,
    comments,
    characterVoiceCards: normalizeCharacterVoiceCardCollection(
      entry.characterVoiceCards ?? entry.character_voice_cards
    ),
  };
}

function normalizeStoredScreenplayOwner(entry) {
  if (!entry || typeof entry !== "object") return null;
  const ownerKey = normalizeScreenplayOwnerValue(
    String(entry.ownerKey || "").replace(/^[a-z]+:/, ""),
    String(entry.ownerKey || "").split(":")[0] || "owner"
  ) || normalizeSnippet(entry.ownerKey, 120);
  if (!ownerKey) return null;
  const projects = Array.isArray(entry.projects)
    ? entry.projects.map(normalizeStoredScreenplayProject).filter(Boolean)
    : [];
  const activeProjectId = normalizeSnippet(entry.activeProjectId, 64);
  return {
    ownerKey,
    activeProjectId: projects.some((project) => project.id === activeProjectId) ? activeProjectId : (projects[0]?.id || ""),
    updatedAt: Math.max(0, Number(entry.updatedAt || 0)),
    companionState: normalizeStoredScreenplayCompanionState(entry.companionState || entry.companion_state),
    projects,
  };
}

function toScreenplayVersionPayload(version, { includeDraft = true } = {}) {
  if (!version) return null;
  return {
    id: version.id,
    project_id: version.projectId || "",
    phase: version.phase || "scene_draft",
    source: version.source || "",
    created_at: Math.max(0, Number(version.createdAt || 0)),
    updated_at: Math.max(0, Number(version.updatedAt || version.createdAt || 0)),
    prompt: version.prompt || "",
    notes: version.notes || "",
    format_score: Number(version.formatScore || 0),
    story_score: Number(version.storyScore || 0),
    confidence_class: version.confidenceClass || "medium",
    warnings: Array.isArray(version.warnings) ? version.warnings : [],
    draft: includeDraft ? String(version.draft || "") : null,
    draft_excerpt: buildDraftExcerpt(version.draftExcerpt || version.draft || "", 220),
    studio_write_anchors: normalizeStoredScreenplayWriteAnchors(version.studioWriteAnchors).map((anchor) => ({
      write_id: anchor.writeId,
      anchor_line: anchor.anchorLine > 0 ? anchor.anchorLine : null,
      anchor_end_line: anchor.anchorEndLine > 0 ? anchor.anchorEndLine : null,
      anchor_scene_label: anchor.anchorSceneLabel || "",
      anchor_excerpt: anchor.anchorExcerpt || "",
      inserted_text: anchor.insertedText || "",
      updated_at: Math.max(0, Number(anchor.updatedAt || 0)),
    })),
    screenplay_bindings: normalizeStoredScreenplayBindings(version.screenplayBindings).map((binding) => ({
      draft_scene_id: binding.draftSceneId,
      draft_line: binding.draftLine > 0 ? binding.draftLine : null,
      draft_end_line: binding.draftEndLine > 0 ? binding.draftEndLine : null,
      draft_slugline: binding.draftSlugline || "",
      draft_short_label: binding.draftShortLabel || "",
      outline_scene_id: binding.outlineSceneId || "",
      outline_scene_title: binding.outlineSceneTitle || "",
      outline_scene_slugline: binding.outlineSceneSlugline || "",
      outline_beat_ids: Array.isArray(binding.outlineBeatIds) ? binding.outlineBeatIds : [],
      outline_beat_labels: Array.isArray(binding.outlineBeatLabels) ? binding.outlineBeatLabels : [],
      act_title: binding.actTitle || "",
      matched_by: binding.matchedBy || "",
      updated_at: Math.max(0, Number(binding.updatedAt || 0)),
    })),
  };
}

function toScreenplayActPayload(act) {
  return {
    id: act.id,
    title: act.title,
    summary: act.summary || "",
    order: Math.max(0, Number(act.order || 0)),
    scene_ids: Array.isArray(act.sceneIds) ? act.sceneIds : [],
    created_at: Math.max(0, Number(act.createdAt || 0)),
    updated_at: Math.max(0, Number(act.updatedAt || act.createdAt || 0)),
  };
}

function toScreenplayScenePayload(scene) {
  return {
    id: scene.id,
    slugline: scene.slugline || "",
    title: scene.title,
    objective: scene.objective || "",
    summary: scene.summary || "",
    act_id: scene.actId || "",
    order: Math.max(0, Number(scene.order || 0)),
    status: scene.status || "open",
    beat_ids: Array.isArray(scene.beatIds) ? scene.beatIds : [],
    unresolved_setups: normalizeScreenplayStringList(scene.unresolvedSetups ?? scene.unresolved_setups, 64, 120),
    resolved_payoffs: normalizeScreenplayStringList(scene.resolvedPayoffs ?? scene.resolved_payoffs, 64, 120),
    created_at: Math.max(0, Number(scene.createdAt || 0)),
    updated_at: Math.max(0, Number(scene.updatedAt || scene.createdAt || 0)),
  };
}

function toScreenplayBeatPayload(beat) {
  return {
    id: beat.id,
    label: beat.label,
    summary: beat.summary || "",
    scene_id: beat.sceneId || "",
    act_id: beat.actId || "",
    order: Math.max(0, Number(beat.order || 0)),
    status: beat.status || "open",
    created_at: Math.max(0, Number(beat.createdAt || 0)),
    updated_at: Math.max(0, Number(beat.updatedAt || beat.createdAt || 0)),
  };
}

function toScreenplayOutlinePayload(outline) {
  const safeOutline = normalizeStoredScreenplayOutline(outline);
  return {
    updated_at: Math.max(0, Number(safeOutline.updatedAt || 0)),
    act_count: safeOutline.acts.length,
    scene_count: safeOutline.scenes.length,
    beat_count: safeOutline.beats.length,
    acts: safeOutline.acts.map(toScreenplayActPayload),
    scenes: safeOutline.scenes.map(toScreenplayScenePayload),
    beats: safeOutline.beats.map(toScreenplayBeatPayload),
  };
}

function toScreenplayCollaboratorPayload(collaborator) {
  return {
    id: collaborator.id || "",
    email: collaborator.email,
    status: collaborator.status || "approved",
    approved_at: Math.max(0, Number(collaborator.approvedAt || 0)),
    updated_at: Math.max(0, Number(collaborator.updatedAt || collaborator.approvedAt || 0)),
    invited_by: collaborator.invitedBy || "",
    note: collaborator.note || "",
  };
}

function toScreenplayCommentPayload(comment, actorEmail = "") {
  const normalizedActor = normalizeEmailAddress(actorEmail);
  const canEdit = normalizedActor
    ? normalizedActor === normalizeEmailAddress(comment.authorEmail)
    : true;
  return {
    id: comment.id,
    project_id: comment.projectId || "",
    version_id: comment.versionId || "",
    type: comment.type || "text",
    text: comment.text || "",
    author_email: comment.authorEmail || "",
    author_name: comment.authorName || "",
    anchor_line: comment.anchorLine || null,
    parent_comment_id: comment.parentCommentId || "",
    thread_root_id: comment.threadRootId || comment.id,
    is_deleted: Boolean(comment.isDeleted),
    deleted_at: Math.max(0, Number(comment.deletedAt || 0)),
    resolved: Boolean(comment.resolved),
    resolved_at: Math.max(0, Number(comment.resolvedAt || 0)),
    resolved_by: comment.resolvedBy || "",
    voice_url: comment.voiceUrl || "",
    voice_transcript: comment.voiceTranscript || "",
    voice_duration_ms: Math.max(0, Number(comment.voiceDurationMs || 0)),
    created_at: Math.max(0, Number(comment.createdAt || 0)),
    updated_at: Math.max(0, Number(comment.updatedAt || comment.createdAt || 0)),
    can_edit: canEdit,
  };
}

function toScreenplayThreadViewStatePayload(state) {
  const safeState = normalizeStoredScreenplayThreadViewState(state);
  if (!safeState) return null;
  return {
    search_text: safeState.searchText || "",
    selected_filter_raw: safeState.selectedFilterRaw || "",
    selected_scene_key: safeState.selectedSceneKey || "",
    scroll_target_key: safeState.scrollTargetKey || "",
    collapsed_section_keys: Array.isArray(safeState.collapsedSectionKeys) ? safeState.collapsedSectionKeys : [],
    focused_diff_key: safeState.focusedDiffKey || "",
    reopened_lineage_keys: Array.isArray(safeState.reopenedLineageKeys) ? safeState.reopenedLineageKeys : [],
    latest_reopened_write_id: safeState.latestReopenedWriteID || "",
  };
}

function toScreenplayDiffAcknowledgedPayload(entries, keys) {
  const safeState = normalizeStoredScreenplayDiffAcknowledgementState({
    entries,
    keys,
  });
  return {
    keys: safeState.keys,
    entries: safeState.entries.map((item) => ({
      key: item.key,
      fingerprint: item.fingerprint || "",
      write_id: item.writeId || "",
    })),
  };
}

function normalizeScreenplayStudioExportSettings(project) {
  const source = project?.studioExportSettings && typeof project.studioExportSettings === "object"
    ? project.studioExportSettings
    : project?.studio_export_settings && typeof project.studio_export_settings === "object"
      ? project.studio_export_settings
      : {};
  const rawTolerance = source.pdfPageCountTolerance ?? source.pdf_page_count_tolerance ?? 0;
  return {
    pdfPageCountTolerance: Math.max(0, Number.parseInt(rawTolerance, 10) || 0),
  };
}

function backfillScreenplayStudioExportSettings(project) {
  if (!project || typeof project !== "object") return { pdfPageCountTolerance: 0 };
  const settings = normalizeScreenplayStudioExportSettings(project);
  if (!project.studioExportSettings || typeof project.studioExportSettings !== "object") {
    project.studioExportSettings = settings;
  } else {
    project.studioExportSettings.pdfPageCountTolerance = settings.pdfPageCountTolerance;
  }
  return settings;
}

function toScreenplayProjectPayload(project, options = {}) {
  const includeVersions = Boolean(options.includeVersions);
  const includeDrafts = Boolean(options.includeDrafts);
  const versionLimit = Math.max(1, Number(options.versionLimit || 24));
  const safeProject = recalculateScreenplayProject(project);
  const studioExportSettings = backfillScreenplayStudioExportSettings(safeProject);
  const sortedVersions = [...(safeProject.versions || [])]
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
  const versionsForPayload = sortedVersions.slice(0, versionLimit);
  if (includeVersions && safeProject.activeVersionId) {
    const activeVersion = sortedVersions.find((item) => item.id === safeProject.activeVersionId);
    if (activeVersion && !versionsForPayload.some((item) => item.id === activeVersion.id)) {
      versionsForPayload.push(activeVersion);
    }
  }
  const versions = includeVersions
    ? versionsForPayload.map((item) => toScreenplayVersionPayload(item, { includeDraft: includeDrafts }))
    : undefined;
  return {
    id: safeProject.id,
    title: safeProject.title,
    archived: Boolean(safeProject.archived),
    tags: safeProject.tags || [],
    characters: safeProject.characters || [],
    character_bible: normalizeScreenplayCharacterBible(safeProject.characterBible ?? safeProject.character_bible),
    setting: safeProject.setting || "",
    tone: safeProject.tone || "",
    prompt_seed: safeProject.promptSeed || "",
    studio_export_settings: {
      pdf_page_count_tolerance: studioExportSettings.pdfPageCountTolerance,
    },
    created_at: Math.max(0, Number(safeProject.createdAt || 0)),
    updated_at: Math.max(0, Number(safeProject.updatedAt || 0)),
    version_count: Math.max(0, Number(safeProject.versionCount || 0)),
    last_phase: safeProject.lastPhase || "scene_draft",
    active_version_id: safeProject.activeVersionId || "",
    last_version_id: safeProject.lastVersionId || "",
    last_version_at: Math.max(0, Number(safeProject.lastVersionAt || 0)),
    format_score: Number(safeProject.formatScore || 0),
    story_score: Number(safeProject.storyScore || 0),
    confidence_class: safeProject.confidenceClass || "medium",
    latest_excerpt: safeProject.latestExcerpt || "",
    act_count: Math.max(0, Number(safeProject.actCount || 0)),
    scene_count: Math.max(0, Number(safeProject.sceneCount || 0)),
    beat_count: Math.max(0, Number(safeProject.beatCount || 0)),
    outline_updated_at: Math.max(0, Number(safeProject.outlineUpdatedAt || 0)),
    collaborator_count: Math.max(0, Number(safeProject.collaboratorCount || 0)),
    approved_emails: safeProject.approvedEmails || [],
    comment_count: Math.max(0, Number(safeProject.commentCount || 0)),
    last_comment_at: Math.max(0, Number(safeProject.lastCommentAt || 0)),
    studio_thread_view_state: toScreenplayThreadViewStatePayload(safeProject.studioThreadViewState),
    studio_diff_acknowledged: toScreenplayDiffAcknowledgedPayload(
      safeProject.studioDiffAcknowledgedEntries,
      safeProject.studioDiffAcknowledgedKeys
    ),
    collaborators: Array.isArray(safeProject.collaborators)
      ? safeProject.collaborators.map(toScreenplayCollaboratorPayload)
      : [],
    comments: Array.isArray(safeProject.comments)
      ? safeProject.comments.map((item) => toScreenplayCommentPayload(item))
      : [],
    versions,
    outline: toScreenplayOutlinePayload(safeProject.outline),
  };
}

  return {
    buildDraftExcerpt,
    createEmptyScreenplayOutline,
    createEmptyScreenplayOwner,
    createScreenplayId,
    normalizeScreenplayStringList,
    normalizeScreenplayCharacterBible,
    normalizeStoredScreenplayAct,
    normalizeStoredScreenplayBeat,
    normalizeStoredScreenplayBindings,
    normalizeStoredScreenplayCompanionState,
    normalizeStoredScreenplayDiffAcknowledgementState,
    normalizeStoredScreenplayOwner,
    normalizeStoredScreenplayProject,
    normalizeStoredScreenplayScene,
    normalizeStoredScreenplayThreadViewState,
    normalizeStoredScreenplayVersion,
    normalizeStoredScreenplayWriteAnchors,
    analyzeFeatureLengthVoiceReadiness,
    analyzeScreenplayContinuityQa,
    scoreScreenplayDraft,
    splitScreenplayLines,
    toScreenplayBeatPayload,
    toScreenplayCollaboratorPayload,
    toScreenplayCommentPayload,
    toScreenplayCompanionStatePayload,
    toScreenplayOutlinePayload,
    toScreenplayProjectPayload,
    toScreenplayScenePayload,
    toScreenplayVersionPayload,
  };
}
