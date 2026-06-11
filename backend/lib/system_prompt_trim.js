const DEFAULT_PROTECTED_TAGS = Object.freeze([
  "clementine_core",
  "clementine_safety_contract",
  "creative_memory",
  "session",
  "feature_film_map",
  "accepted_twists",
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

function compactTaggedBlock(block, maxChars) {
  const clean = String(block || "").trim();
  const limit = Math.max(120, Math.floor(Number(maxChars || 0)));
  if (!clean || clean.length <= limit) return clean;

  const tagMatch = clean.match(/^<([a-z0-9_:-]+)\b[^>]*>/i);
  if (!tagMatch) {
    const head = clean.slice(0, Math.max(40, Math.floor(limit * 0.55))).trimEnd();
    const tail = clean.slice(Math.max(0, clean.length - Math.max(40, limit - head.length - 6))).trimStart();
    return `${head}\n...\n${tail}`.slice(0, limit).trim();
  }

  const tag = tagMatch[1];
  const closeTag = `</${tag}>`;
  const openTag = tagMatch[0];
  const body = clean
    .slice(openTag.length, clean.toLowerCase().lastIndexOf(closeTag.toLowerCase()))
    .trim();
  const marker = "\n...\n";
  const bodyLimit = Math.max(40, limit - openTag.length - closeTag.length - marker.length - 2);
  const headLen = Math.max(20, Math.floor(bodyLimit * 0.62));
  const tailLen = Math.max(20, bodyLimit - headLen);
  const head = body.slice(0, headLen).trimEnd();
  const tail = body.slice(Math.max(0, body.length - tailLen)).trimStart();
  return `${openTag}\n${head}${marker}${tail}\n${closeTag}`.slice(0, limit).trim();
}

function buildProtectedSection(blocks, budget) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  const totalBudget = Math.max(0, Math.floor(Number(budget || 0)));
  if (totalBudget < 160) return "";
  const perBlockBudget = Math.max(160, Math.floor(totalBudget / blocks.length) - 2);
  return blocks
    .map((entry) => compactTaggedBlock(entry.block, perBlockBudget))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, totalBudget)
    .trim();
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

  const protectedBudget = Math.max(240, Math.floor(budget * 0.68));
  const protectedSection = buildProtectedSection(protectedBlocks, protectedBudget);
  const base = removeTaggedBlocks(normalized, protectedBlocks);
  const remainingBudget = Math.max(240, budget - protectedSection.length - 8);
  const headBudget = Math.max(160, Math.floor(remainingBudget * 0.52));
  const tailBudget = Math.max(120, remainingBudget - headBudget - 5);
  const head = base.slice(0, headBudget).trimEnd();
  const tail = base.slice(Math.max(0, base.length - tailBudget)).trimStart();
  return `${head}\n...\n${tail}\n\n${protectedSection}`.slice(0, budget).trim();
}

export {
  DEFAULT_PROTECTED_TAGS,
  extractTaggedBlocks,
  fitSystemPromptForTurnLatency,
};
