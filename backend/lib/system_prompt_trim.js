const DEFAULT_PROTECTED_TAGS = Object.freeze([
  "clementine_core",
  "clementine_safety_contract",
  "creative_memory",
  "session",
  "feature_film_map",
  "accepted_twists",
  "writer_block_memory",
  "screenplay_task",
  "block_signal",
]);

function normalizePromptText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTaggedBlocks(text, tagNames = DEFAULT_PROTECTED_TAGS) {
  const source = String(text || "");
  const blocks = [];
  const seen = new Set();
  for (const tagName of tagNames) {
    const tag = String(tagName || "").trim();
    if (!tag) continue;
    const pattern = new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>[\\s\\S]*?<\\/${escapeRegExp(tag)}>`, "gi");
    for (const match of source.matchAll(pattern)) {
      const block = String(match[0] || "").trim();
      const key = block.toLowerCase();
      if (!block || seen.has(key)) continue;
      seen.add(key);
      blocks.push({ index: match.index ?? 0, tag, block });
    }
  }
  return blocks.sort((a, b) => a.index - b.index);
}

function removeTaggedBlocks(text, blocks) {
  let out = String(text || "");
  for (const entry of blocks || []) {
    if (!entry?.block) continue;
    out = out.replace(entry.block, "");
  }
  return normalizePromptText(out);
}

function compactPromptField(value, maxChars) {
  const clean = normalizePromptText(value);
  const limit = Math.max(8, Math.floor(Number(maxChars || 0)));
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(1, limit - 3)).trimEnd()}...`;
}

function bodyLines(body) {
  return String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function firstLineStartingWith(lines, prefixes) {
  const normalizedPrefixes = (Array.isArray(prefixes) ? prefixes : [prefixes])
    .map((prefix) => String(prefix || "").toLowerCase())
    .filter(Boolean);
  return (lines || []).find((line) => {
    const lower = String(line || "").toLowerCase();
    return normalizedPrefixes.some((prefix) => lower.startsWith(prefix));
  }) || "";
}

function linesContaining(lines, patterns, maxItems = 1) {
  const needles = (Array.isArray(patterns) ? patterns : [patterns])
    .map((pattern) => String(pattern || "").toLowerCase())
    .filter(Boolean);
  const found = [];
  for (const line of lines || []) {
    const lower = String(line || "").toLowerCase();
    if (!needles.some((needle) => lower.includes(needle))) continue;
    found.push(line);
    if (found.length >= maxItems) break;
  }
  return found;
}

function summarizeBulletSection(lines, headerPrefix, maxItems = 2) {
  const index = (lines || []).findIndex((line) =>
    String(line || "").toLowerCase().startsWith(String(headerPrefix || "").toLowerCase())
  );
  if (index < 0) return "";
  const header = String(lines[index] || "").replace(/:\s*$/, "");
  const items = [];
  for (let cursor = index + 1; cursor < lines.length && items.length < maxItems; cursor += 1) {
    const line = String(lines[cursor] || "").trim();
    if (!line.startsWith("-")) break;
    items.push(line.replace(/^-\s*/, ""));
  }
  return items.length ? `${header}: ${items.join(" | ")}` : String(lines[index] || "");
}

function compactSemanticLines(candidates, bodyLimit) {
  const limit = Math.max(24, Math.floor(Number(bodyLimit || 0)));
  const selected = [];
  const seen = new Set();
  for (const candidate of candidates || []) {
    const value = typeof candidate === "string" ? candidate : candidate?.value;
    const clean = normalizePromptText(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    const used = selected.join("\n").length;
    const remaining = limit - used - (selected.length ? 1 : 0);
    const minChars = Math.max(8, Number(candidate?.minChars || 18));
    if (remaining < minChars) continue;
    const maxChars = Math.max(minChars, Number(candidate?.maxChars || 180));
    const rendered = compactPromptField(clean, Math.min(remaining, maxChars));
    if (!rendered) continue;
    selected.push(rendered);
    seen.add(key);
  }
  return selected.join("\n").slice(0, limit).trim();
}

function compactClementineCoreBody(body, bodyLimit) {
  const lines = bodyLines(body);
  return compactSemanticLines([
    { value: firstLineStartingWith(lines, "identity:"), maxChars: 220 },
    {
      value: "core_contract: truthful and memory-grounded; write playable Fountain first; protect act, sequence, character, setup/payoff, and emotional continuity; make one decisive next move.",
      maxChars: 180,
    },
    { value: linesContaining(lines, "truth and safety", 1)[0], maxChars: 180 },
    { value: linesContaining(lines, "screenwriting usefulness", 1)[0], maxChars: 180 },
    { value: linesContaining(lines, "feature-film continuity", 1)[0], maxChars: 190 },
    { value: linesContaining(lines, "page requests start", 1)[0], maxChars: 170 },
    { value: linesContaining(lines, "no preamble", 1)[0], maxChars: 150 },
    { value: linesContaining(lines, "every scene needs", 1)[0], maxChars: 150 },
    { value: linesContaining(lines, "dialogue carries", 1)[0], maxChars: 150 },
    { value: linesContaining(lines, "for whole-feature work", 1)[0], maxChars: 180 },
    { value: linesContaining(lines, "use only supplied session", 1)[0], maxChars: 170 },
    { value: linesContaining(lines, "if the user is blocked", 1)[0], maxChars: 160 },
  ], bodyLimit);
}

function compactSafetyContractBody(body, bodyLimit) {
  const lines = bodyLines(body);
  return compactSemanticLines([
    {
      value: "truthfulness: never fabricate memory, facts, sources, certainty, research, or real-world ability.",
      maxChars: 105,
    },
    {
      value: "memory_authority: use only supplied context; mark creative invention as fictional invention.",
      maxChars: 96,
    },
    {
      value: "real_world_safety: no deception help; no actionable targeting, coercion, evasion, weaponization, or encouragement to harm a real person or oneself.",
      maxChars: 150,
    },
    {
      value: "fiction_boundary: fictional conflict, crime, danger, and violence are allowed as cinematic, non-instructional craft.",
      maxChars: 120,
    },
    {
      value: "safety_redirection: refuse real-life harm or deception briefly; offer safe story, emotional, or practical alternatives.",
      maxChars: 120,
    },
    { value: firstLineStartingWith(lines, "truthfulness:"), maxChars: 150 },
    { value: firstLineStartingWith(lines, "no fabrication:"), maxChars: 150 },
  ], bodyLimit);
}

function sessionDraftCandidates(lines) {
  const draftIndex = (lines || []).findIndex((line) => /^draft_excerpt:/i.test(line));
  if (draftIndex < 0) return [];
  const draftLines = lines.slice(draftIndex + 1).filter(Boolean);
  const first = draftLines.slice(0, 2);
  const tail = draftLines.slice(Math.max(first.length, draftLines.length - 4));
  return ["draft_excerpt:", ...first, ...tail].map((value) => ({ value, maxChars: 180 }));
}

function compactSessionBody(body, bodyLimit) {
  const lines = bodyLines(body);
  const correctionLines = linesContaining(lines, [
    "correction:",
    "authoritative_corrections:",
    "authoritative_replacements:",
    "retired_terms:",
    "priority: authoritative correction",
  ], 5).map((value) => ({ value, maxChars: 170 }));
  return compactSemanticLines([
    { value: firstLineStartingWith(lines, "project:"), maxChars: 120 },
    ...correctionLines,
    { value: firstLineStartingWith(lines, ["current_sequence:", "feature_sequence:"]), maxChars: 200 },
    { value: firstLineStartingWith(lines, ["current_position:", "page_progress:", "estimated_page_count:"]), maxChars: 120 },
    { value: firstLineStartingWith(lines, ["current_act:", "act:"]), maxChars: 120 },
    { value: firstLineStartingWith(lines, "structural_obligation_due_now:"), maxChars: 190 },
    { value: firstLineStartingWith(lines, "current_scene_objective:"), maxChars: 180 },
    { value: firstLineStartingWith(lines, "current_beat:"), maxChars: 170 },
    { value: firstLineStartingWith(lines, "emotional_handoff:"), maxChars: 170 },
    { value: firstLineStartingWith(lines, "first_turn_to_spend:"), maxChars: 180 },
    { value: firstLineStartingWith(lines, "next_scene_plan:"), maxChars: 180 },
    ...sessionDraftCandidates(lines),
    { value: firstLineStartingWith(lines, "scene:"), maxChars: 140 },
    { value: firstLineStartingWith(lines, "version:"), maxChars: 100 },
    { value: firstLineStartingWith(lines, "phase:"), maxChars: 100 },
    { value: firstLineStartingWith(lines, "pack:"), maxChars: 120 },
    {
      value: "session_authority: writer corrections and accepted pages override older memory; draft_excerpt is the live previous page.",
      maxChars: 125,
    },
  ], bodyLimit);
}

function compactCreativeMemoryBody(body, bodyLimit) {
  const lines = bodyLines(body);
  const dueStoryThread = firstLineStartingWith(lines, "oldest_due_story_thread:");
  const bindingCausalFact = linesContaining(lines, ["binding_fact", "binding_causal_fact"], 1)[0];
  const correctionLines = linesContaining(lines, [
    "correction:",
    "authoritative_corrections:",
    "authoritative_replacements:",
    "retired_terms:",
  ], 5).map((value) => ({ value, maxChars: 170 }));
  return compactSemanticLines([
    ...correctionLines,
    { value: firstLineStartingWith(lines, "project_id:"), maxChars: 110 },
    { value: firstLineStartingWith(lines, "current_beat:"), maxChars: 170 },
    { value: firstLineStartingWith(lines, "first_turn_to_spend:"), maxChars: 180 },
    { value: firstLineStartingWith(lines, "next_scene_plan:"), maxChars: 180 },
    { value: bindingCausalFact, maxChars: 190 },
    { value: dueStoryThread, maxChars: 180 },
    { value: dueStoryThread ? "" : summarizeBulletSection(lines, "unresolved_setups:", 2), maxChars: 170 },
    { value: linesContaining(lines, "accepted_scene", 1)[0], maxChars: 125 },
    { value: summarizeBulletSection(lines, "recurring-characters:", 2), maxChars: 170 },
    { value: summarizeBulletSection(lines, "episodic-memory:", 2), maxChars: 180 },
    { value: firstLineStartingWith(lines, "episodic-memory:"), maxChars: 120 },
    {
      value: "memory_authority: corrections and accepted writer pages outrank older recollection; never present an assistant proposal as established canon.",
      maxChars: 140,
    },
  ], bodyLimit);
}

function compactFeatureFilmMapBody(body, bodyLimit) {
  const lines = bodyLines(body);
  return compactSemanticLines([
    { value: firstLineStartingWith(lines, "current_position:"), maxChars: 120 },
    { value: firstLineStartingWith(lines, "current_sequence:"), maxChars: 210 },
    { value: firstLineStartingWith(lines, "active_act_label:"), maxChars: 120 },
    { value: firstLineStartingWith(lines, "position_basis:"), maxChars: 170 },
    { value: firstLineStartingWith(lines, "active_act_pressure:"), maxChars: 190 },
    { value: firstLineStartingWith(lines, "requested_pages:"), maxChars: 90 },
    { value: firstLineStartingWith(lines, "target_act:"), maxChars: 100 },
    { value: firstLineStartingWith(lines, "starting_position:"), maxChars: 110 },
    { value: firstLineStartingWith(lines, "active_sequence_pressure:"), maxChars: 220 },
    { value: firstLineStartingWith(lines, "structural_obligation_due_now:"), maxChars: 220 },
    { value: firstLineStartingWith(lines, "turn_budget:"), maxChars: 150 },
    { value: firstLineStartingWith(lines, "delivery:"), maxChars: 190 },
    { value: firstLineStartingWith(lines, "end_condition:"), maxChars: 180 },
    {
      value: "craft_contract: whole-feature authorship; page batch discipline; expert page engine; subtext engine; image system; speed discipline; objective/obstacle/clock/cost; turn_engine changes state; Fountain first.",
      maxChars: 210,
    },
    { value: firstLineStartingWith(lines, "ending_image:"), maxChars: 180 },
    { value: firstLineStartingWith(lines, "current_scene_objective:"), maxChars: 180 },
    { value: firstLineStartingWith(lines, "current_beat:"), maxChars: 170 },
    { value: firstLineStartingWith(lines, "emotional_handoff:"), maxChars: 170 },
    { value: firstLineStartingWith(lines, "first_turn_to_spend:"), maxChars: 180 },
    { value: firstLineStartingWith(lines, "next_scene_plan:"), maxChars: 180 },
    { value: summarizeBulletSection(lines, "next_page_moves:", 2), maxChars: 200 },
    { value: summarizeBulletSection(lines, "unresolved_setups_to_track:", 2), maxChars: 190 },
    { value: summarizeBulletSection(lines, "act_three_payoff_path:", 2), maxChars: 190 },
  ], bodyLimit);
}

function screenplayModeContract(intent) {
  switch (String(intent || "").trim().toLowerCase()) {
    case "finish_feature":
      return "mode_contract: locate active act/sequence/due obligation; protect setups, payoffs, character need, next three turns, Act III path, and final image; start page requests in Fountain; planning returns an immediate page assignment.";
    case "rewrite_scene":
      return "mode_contract: preserve writer intent and canon while replacing the weak passage with playable pages; raise objective, obstacle, subtext, image, rhythm, and the scene turn; use at most one craft sentence before pages.";
    case "continue_script":
      return "mode_contract: continue from the draft's next visible action without restart or recap; spend the first remembered turn, preserve voice and emotional handoff, and change story state.";
    case "dialogue_punchup":
      return "mode_contract: return only playable replacement screenplay text; give each voice a distinct tactic, subtext, interruption, reversal, behavior, and rhythm.";
    case "scene_doctor":
      return "mode_contract: diagnose with surgical brevity, name the highest-leverage fix, and give one concrete page-level move.";
    case "momentum_rescue":
      return "mode_contract: diagnose the missing pressure, choose one decisive memory-grounded story engine, and convert it into the next playable beat without generic encouragement.";
    default:
      return "mode_contract: stay concrete, cinematic, memory-grounded, and directly useful on the page.";
  }
}

function compactScreenplayTaskBody(body, bodyLimit) {
  const lines = bodyLines(body);
  const intentLine = firstLineStartingWith(lines, "intent:");
  const intent = intentLine.replace(/^intent:\s*/i, "");
  return compactSemanticLines([
    { value: intentLine, maxChars: 100 },
    { value: firstLineStartingWith(lines, "label:"), maxChars: 120 },
    { value: firstLineStartingWith(lines, "role:"), maxChars: 150 },
    { value: firstLineStartingWith(lines, "feature_scope:"), maxChars: 100 },
    { value: firstLineStartingWith(lines, "requested_act:"), maxChars: 100 },
    { value: firstLineStartingWith(lines, "requested_page_batch:"), maxChars: 100 },
    {
      value: "craft_contract: whole-feature authorship; page batch discipline; expert page engine; subtext engine; image system; speed discipline; Fountain pages first; verify continuity.",
      maxChars: 180,
    },
    { value: screenplayModeContract(intent), maxChars: 230 },
    { value: firstLineStartingWith(lines, ["likely_stall:", "diagnosis:", "strongest_engine:", "rank_1:"]), maxChars: 190 },
    { value: firstLineStartingWith(lines, "output:"), maxChars: 180 },
    { value: firstLineStartingWith(lines, "quality:"), maxChars: 170 },
  ], bodyLimit);
}

function compactWriterBlockBody(body, bodyLimit) {
  const limit = Math.max(40, Math.floor(Number(bodyLimit || 0)));
  const lines = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rankLine = lines.find((line) => /^rank_1:/i.test(line)) || "";
  const rankMatch = rankLine.match(
    /^rank_1:\s*engine=([^;]+);\s*score=([^;]+);\s*evidence=([\s\S]*?);\s*move=([\s\S]*?);\s*success_check=([\s\S]*)$/i
  );
  const rule = "rule: execute rank_1 unless a writer correction conflicts; never reset accepted causal facts.";
  let compactRank = rankLine;
  if (rankMatch) {
    const ruleBudget = limit >= 120 ? rule.length + 1 : 0;
    const available = Math.max(32, limit - ruleBudget);
    const engine = compactPromptField(rankMatch[1], 40);
    const fixedChars = 58 + engine.length;
    const fieldBudget = Math.max(24, available - fixedChars);
    const evidenceBudget = Math.max(8, Math.floor(fieldBudget * 0.28));
    const moveBudget = Math.max(8, Math.floor(fieldBudget * 0.50));
    const successBudget = Math.max(8, fieldBudget - evidenceBudget - moveBudget);
    compactRank = [
      `rank_1: engine=${engine}`,
      `evidence=${compactPromptField(rankMatch[3], evidenceBudget)}`,
      `move=${compactPromptField(rankMatch[4], moveBudget)}`,
      `success=${compactPromptField(rankMatch[5], successBudget)}`,
    ].join("; ");
  }
  const rankBudget = limit >= 120 ? limit - rule.length - 1 : limit;
  compactRank = compactPromptField(compactRank, Math.max(24, rankBudget));
  const selected = [compactRank].filter(Boolean);
  if (selected.join("\n").length + rule.length + 1 <= limit) selected.push(rule);
  const optionalPrefixes = [
    "correction_contract:",
    "binding_causal_fact:",
    "accepted_page_anchor:",
    "current_beat:",
    "position:",
  ];
  for (const prefix of optionalPrefixes) {
    const line = lines.find((item) => item.toLowerCase().startsWith(prefix));
    if (!line) continue;
    const used = selected.join("\n").length;
    const remaining = limit - used - 1;
    if (remaining < 32) break;
    selected.push(compactPromptField(line, remaining));
  }
  return selected.join("\n").slice(0, limit).trim();
}

function compactTaggedBlock(block, maxChars) {
  const clean = String(block || "").trim();
  const limit = Math.max(120, Math.floor(Number(maxChars || 0)));
  if (!clean) return clean;

  const tagMatch = clean.match(/^<([a-z0-9_:-]+)\b[^>]*>/i);
  if (!tagMatch) {
    if (clean.length <= limit) return clean;
    const head = clean.slice(0, Math.max(40, Math.floor(limit * 0.55))).trimEnd();
    const tail = clean.slice(Math.max(0, clean.length - Math.max(40, limit - head.length - 6))).trimStart();
    return `${head}\n...\n${tail}`.slice(0, limit).trim();
  }

  const tag = tagMatch[1];
  const normalizedTag = tag.toLowerCase();
  // A fitted screenplay task always needs its invariant mode contract.
  if (clean.length <= limit && normalizedTag !== "screenplay_task") return clean;
  const closeTag = `</${tag}>`;
  const openTag = tagMatch[0];
  const body = clean
    .slice(openTag.length, clean.toLowerCase().lastIndexOf(closeTag.toLowerCase()))
    .trim();
  const marker = "\n...\n";
  const bodyLimit = Math.max(40, limit - openTag.length - closeTag.length - marker.length - 2);
  const semanticBodyLimit = Math.max(40, limit - openTag.length - closeTag.length - 2);
  const semanticCompactors = {
    clementine_core: compactClementineCoreBody,
    clementine_safety_contract: compactSafetyContractBody,
    creative_memory: compactCreativeMemoryBody,
    session: compactSessionBody,
    feature_film_map: compactFeatureFilmMapBody,
    screenplay_task: compactScreenplayTaskBody,
  };
  const semanticCompactor = semanticCompactors[normalizedTag];
  if (semanticCompactor) {
    const priorityBody = semanticCompactor(body, semanticBodyLimit);
    if (priorityBody) {
      return `${openTag}\n${priorityBody}\n${closeTag}`.trim();
    }
  }
  if (normalizedTag === "writer_block_memory") {
    const priorityBody = compactWriterBlockBody(body, bodyLimit);
    if (priorityBody) {
      return `${openTag}\n${priorityBody}\n${closeTag}`.trim();
    }
  }
  const headLen = Math.max(20, Math.floor(bodyLimit * 0.62));
  const tailLen = Math.max(20, bodyLimit - headLen);
  const head = body.slice(0, headLen).trimEnd();
  const tail = body.slice(Math.max(0, body.length - tailLen)).trimStart();
  const rendered = `${openTag}\n${head}${marker}${tail}\n${closeTag}`.trim();
  if (rendered.length <= limit) return rendered;

  const overflow = rendered.length - limit;
  const tighterTailLen = Math.max(0, tailLen - overflow - 4);
  const tighterTail = tighterTailLen > 0
    ? body.slice(Math.max(0, body.length - tighterTailLen)).trimStart()
    : "";
  const tighterBody = tighterTail
    ? `${head}${marker}${tighterTail}`
    : head.slice(0, Math.max(20, limit - openTag.length - closeTag.length - marker.length - 4)).trimEnd();
  return `${openTag}\n${tighterBody}\n${closeTag}`.trim();
}

function buildProtectedSection(blocks, budget) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  const totalBudget = Math.max(0, Math.floor(Number(budget || 0)));
  if (totalBudget < 160) return "";
  const parts = [];
  const blockWeight = (tag) => {
    switch (String(tag || "").toLowerCase()) {
      case "creative_memory": return 2.5;
      case "writer_block_memory": return 2.4;
      case "feature_film_map": return 2;
      case "session": return 1.6;
      case "screenplay_task": return 1.3;
      default: return 1;
    }
  };
  for (let i = 0; i < blocks.length; i += 1) {
    const entry = blocks[i];
    const used = parts.join("\n\n").length;
    const separatorBudget = parts.length ? 2 : 0;
    const remaining = totalBudget - used - separatorBudget;
    if (remaining < 120) break;
    const remainingWeights = blocks
      .slice(i)
      .reduce((sum, item) => sum + blockWeight(item?.tag), 0);
    const weightedShare = remainingWeights > 0
      ? remaining * (blockWeight(entry?.tag) / remainingWeights)
      : remaining;
    const futureBlockCount = blocks.length - i - 1;
    const maxCurrentBudget = Math.max(120, remaining - futureBlockCount * 122);
    const perBlockBudget = Math.max(
      120,
      Math.min(maxCurrentBudget, Math.floor(weightedShare) - 2)
    );
    const compacted = compactTaggedBlock(entry.block, Math.min(remaining, perBlockBudget));
    if (!compacted) continue;
    const projected = used + separatorBudget + compacted.length;
    if (projected <= totalBudget) {
      parts.push(compacted);
      continue;
    }
    const finalAttempt = compactTaggedBlock(entry.block, remaining);
    if (finalAttempt && used + separatorBudget + finalAttempt.length <= totalBudget) {
      parts.push(finalAttempt);
    }
  }
  return parts.join("\n\n").trim();
}

function fitSystemPromptForTurnLatency(
  systemPrompt,
  {
    turnPlanner,
    flags,
    routingLane,
    chatModelPlan,
    fastMaxChars = 3_800,
    richMaxChars = 6_200,
    protectedTagNames = DEFAULT_PROTECTED_TAGS,
  } = {}
) {
  const normalized = normalizePromptText(systemPrompt);
  if (!normalized) return "";

  const lane = String(routingLane || "normal_rotation");
  const tier = String(chatModelPlan?.tier || "fast");
  const needsRichBudget =
    tier === "rich" ||
    Boolean(turnPlanner?.requiresSubstantiveAnswer) ||
    Boolean(flags?.therapeuticDepth) ||
    Boolean(flags?.isVulnerable) ||
    Boolean(flags?.isVenting) ||
    Boolean(flags?.socialSpark) ||
    lane === "high_distress_safety" ||
    lane === "therapeutic_depth" ||
    lane === "philosophical" ||
    lane === "creative";

  const budget = Math.max(500, Math.floor(needsRichBudget ? richMaxChars : fastMaxChars));
  if (normalized.length <= budget) return normalized;

  const protectedBlocks = extractTaggedBlocks(normalized, protectedTagNames);
  if (protectedBlocks.length === 0) {
    const headBudget = Math.max(900, Math.floor(budget * 0.58));
    const tailBudget = Math.max(800, budget - headBudget - 5);
    const head = normalized.slice(0, headBudget).trimEnd();
    const tail = normalized.slice(Math.max(0, normalized.length - tailBudget)).trimStart();
    return `${head}\n...\n${tail}`.slice(0, budget).trim();
  }

  const protectedBudget = Math.max(240, Math.floor(budget * 0.82));
  const protectedSection = buildProtectedSection(protectedBlocks, protectedBudget);
  const base = removeTaggedBlocks(normalized, protectedBlocks);
  const remainingBudget = Math.max(240, budget - protectedSection.length - 8);
  const headBudget = Math.max(160, Math.floor(remainingBudget * 0.52));
  const tailBudget = Math.max(120, remainingBudget - headBudget - 5);
  const head = base.slice(0, headBudget).trimEnd();
  const tail = base.slice(Math.max(0, base.length - tailBudget)).trimStart();
  let baseSection = `${head}\n...\n${tail}`.trim();
  const baseBudget = Math.max(0, budget - protectedSection.length - (baseSection ? 2 : 0));
  if (baseSection.length > baseBudget) {
    baseSection = baseSection.slice(0, baseBudget).trim();
  }
  const joined = baseSection
    ? `${baseSection}\n\n${protectedSection}`
    : protectedSection;
  return joined.length <= budget ? joined.trim() : protectedSection.trim();
}

export {
  DEFAULT_PROTECTED_TAGS,
  extractTaggedBlocks,
  fitSystemPromptForTurnLatency,
};
