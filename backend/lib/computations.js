// D009 — pure compute* helpers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { createHash } from "node:crypto";

function computeSpeculativePromptHash(value) {
  const prompt = String(value || "");
  if (!prompt.trim()) return "";
  return createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 16);
}

function computeThemeStalenessDays(theme, nowTs = Date.now()) {
  const now = Math.max(0, Number(nowTs || Date.now()));
  const anchorTs = Math.max(
    0,
    Number(theme?.lastUsedAt || 0),
    Number(theme?.lastMentionedAt || 0),
    Number(theme?.qualityLastFeedbackAt || 0)
  );
  if (!anchorTs || now <= anchorTs) return 0;
  return Math.max(0, Math.floor((now - anchorTs) / (24 * 60 * 60 * 1000)));
}

function computeSessionLengthScore(sessionStartedAt, nowTs = Date.now()) {
  const startedAt = Number(sessionStartedAt || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || nowTs <= startedAt) return 0;
  const minutes = (nowTs - startedAt) / (60 * 1000);
  if (minutes < 2) return 0;
  if (minutes < 5) return 2;
  if (minutes < 10) return 3;
  if (minutes < 20) return 4;
  return 5;
}

function computeBehaviorDepthSessionScore({
  currentScore,
  flags,
  detectedFeeling,
  answeredReflective,
  deepReflective,
  topicRecurrence,
}) {
  let next = Math.max(0, Math.min(10, Number(currentScore || 0)));
  if (flags?.isVulnerable) next += 2.5;
  if (String(detectedFeeling || "").trim()) next += 2.0;
  if (topicRecurrence) next += 2.0;
  if (answeredReflective) next += deepReflective ? 3.5 : 2.5;
  return Math.max(0, Math.min(10, next));
}

function computeInactiveDays(lastUpdatedAt, nowTs = Date.now()) {
  const lastTs = Number(lastUpdatedAt || 0);
  if (!Number.isFinite(lastTs) || lastTs <= 0) return 0;
  if (nowTs <= lastTs) return 0;
  return Math.max(0, Math.floor((nowTs - lastTs) / (24 * 60 * 60 * 1000)));
}

function computeRelationshipDepthDecayForInactiveDays(inactiveDays) {
  const days = Math.max(0, Math.floor(Number(inactiveDays || 0)));
  if (days <= 3) return 0;
  const day4to7 = Math.max(0, Math.min(days, 7) - 3);
  const day8to30 = Math.max(0, Math.min(days, 30) - 7);
  return (day4to7 * 2) + day8to30;
}

function computeGrowthTarget(memory) {
  const turns = Math.max(0, Number(memory?.turns || 0));
  const trust = Math.max(0, Math.min(1, Number(memory?.trust || 0)));
  const direct = Math.max(0, Math.min(1, Number(memory?.directness || 0)));
  const vuln = Math.max(0, Math.min(1, Number(memory?.vulnerability || 0)));

  const turnsNorm = Math.min(1, turns / 64);
  let target =
    (turnsNorm * 0.45) +
    (trust * 0.30) +
    (vuln * 0.15) +
    (direct * 0.10);

  if (turns < 3) target = Math.min(target, 0.20);
  return Math.max(0, Math.min(1, target));
}

export {
  computeBehaviorDepthSessionScore,
  computeGrowthTarget,
  computeInactiveDays,
  computeRelationshipDepthDecayForInactiveDays,
  computeSessionLengthScore,
  computeSpeculativePromptHash,
  computeThemeStalenessDays,
};
