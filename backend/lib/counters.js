// D009 — pure count* helpers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { normalizeSnippet } from "./utils.js";

function countConsecutiveDayStreak(dayStamps, endStamp = "") {
  const uniqueStamps = Array.isArray(dayStamps)
    ? [...new Set(
      dayStamps
        .map((x) => String(x || "").trim())
        .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))
    )].sort()
    : [];
  if (!uniqueStamps.length) return 0;

  const targetEnd = /^\d{4}-\d{2}-\d{2}$/.test(String(endStamp || ""))
    ? String(endStamp).trim()
    : uniqueStamps[uniqueStamps.length - 1];
  let idx = uniqueStamps.lastIndexOf(targetEnd);
  if (idx === -1) {
    idx = uniqueStamps.length - 1;
  }

  let streak = 1;
  let cursor = new Date(`${uniqueStamps[idx]}T00:00:00`);
  if (!Number.isFinite(cursor.getTime())) return 0;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const prev = new Date(`${uniqueStamps[i]}T00:00:00`);
    if (!Number.isFinite(prev.getTime())) break;
    const diffDays = Math.round((cursor.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      streak += 1;
      cursor = prev;
      continue;
    }
    if (diffDays > 1) break;
  }
  return streak;
}

function countScreenplayMemoryWords(text = "") {
  const matches = normalizeSnippet(text, 500).match(/[A-Za-z0-9'][A-Za-z0-9'-]*/g);
  return Array.isArray(matches) ? matches.length : 0;
}

function countKeywordHits(text, keywords) {
  const t = String(text || "");
  return keywords.reduce((count, keyword) => (
    keyword && t.includes(keyword) ? count + 1 : count
  ), 0);
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

export {
  countConsecutiveDayStreak,
  countKeywordHits,
  countScreenplayMemoryWords,
  countWords,
};
