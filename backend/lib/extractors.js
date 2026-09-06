// D009 — pure extract* helpers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { normalizeScreenplayCorrectionTerm, normalizeTaskPriority, normalizeWhitespace } from "./normalizers.js";
import { parseSimpleDueAt } from "./parsers.js";
import { normalizeSnippet } from "./utils.js";

function extractTaskCandidatesFromText(text, maxItems = 6) {
  const source = String(text || "").trim();
  if (!source) return [];
  const normalized = source
    .replace(/\n+/g, ",")
    .replace(/\band\b/gi, ",")
    .split(",")
    .map((part) => normalizeSnippet(part, 160))
    .filter(Boolean)
    .map((part) => part.replace(/^[-*\d.\)\s]+/, "").trim())
    .filter(Boolean);

  const candidates = [];
  for (const part of normalized) {
    if (candidates.length >= maxItems) break;
    if (part.length < 4) continue;
    candidates.push(part);
  }
  return candidates;
}

function extractTaskCreateIntent(transcript) {
  const source = String(transcript || "").trim();
  if (!source) {
    return { shouldCreate: false, title: "", dueAt: 0, priority: "normal", trigger: "" };
  }
  const lower = source.toLowerCase();
  const triggers = [
    "remind me to",
    "create a task",
    "add a task",
    "new task",
    "todo",
    "to do",
    "add this task",
  ];
  let trigger = "";
  let triggerIndex = -1;
  for (const candidate of triggers) {
    const idx = lower.indexOf(candidate);
    if (idx >= 0 && (triggerIndex === -1 || idx < triggerIndex)) {
      trigger = candidate;
      triggerIndex = idx;
    }
  }
  if (triggerIndex < 0) {
    return { shouldCreate: false, title: "", dueAt: 0, priority: "normal", trigger: "" };
  }

  let title = source
    .slice(triggerIndex + trigger.length)
    .replace(/^[\s:,\-–—]+/, "")
    .trim();
  title = title.replace(/^to\s+/i, "").trim();
  title = normalizeSnippet(title, 160);
  if (!title) {
    return { shouldCreate: false, title: "", dueAt: 0, priority: "normal", trigger };
  }

  const priority = lower.includes("urgent") || lower.includes("asap") || lower.includes("high priority")
    ? "high"
    : (lower.includes("low priority") ? "low" : "normal");

  return {
    shouldCreate: true,
    title,
    dueAt: parseSimpleDueAt(source),
    priority: normalizeTaskPriority(priority),
    trigger,
  };
}

function extractTaskCompleteIntent(transcript) {
  const source = String(transcript || "").trim();
  if (!source) {
    return { shouldComplete: false, query: "", trigger: "" };
  }
  const lower = source.toLowerCase();
  const triggers = [
    "mark task done",
    "mark it done",
    "mark this done",
    "check this off",
    "check it off",
    "complete task",
    "complete this task",
    "task done",
    "i finished that task",
    "i finished this task",
  ];
  let trigger = "";
  let triggerIndex = -1;
  for (const candidate of triggers) {
    const idx = lower.indexOf(candidate);
    if (idx >= 0 && (triggerIndex === -1 || idx < triggerIndex)) {
      trigger = candidate;
      triggerIndex = idx;
    }
  }
  if (triggerIndex < 0) {
    return { shouldComplete: false, query: "", trigger: "" };
  }
  let query = source
    .slice(triggerIndex + trigger.length)
    .replace(/^[\s:,\-–—]+/, "")
    .trim();
  query = normalizeSnippet(query, 160);
  return {
    shouldComplete: true,
    query,
    trigger,
  };
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

function extractQuestionSnippet(text) {
  const source = String(text || "").trim();
  if (!source.includes("?")) return "";
  const parts = source
    .split("?")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return normalizeSnippet(`${parts[0]}?`, 140);
}

function extractScreenplayReplacementTermBeforeNot(text = "", notIndex = -1) {
  const beforeNot = String(text || "").slice(0, Math.max(0, notIndex));
  const latestClause = beforeNot.split(/[.!?;]/).at(-1)?.trim() || "";
  const explicitValue = latestClause.match(
    /\b(?:is|should\s+be|=)\s+(?:a|an|the)?\s*([^,]{2,140}?)\s*,?$/i
  );
  if (explicitValue?.[1]) {
    const candidate = normalizeScreenplayCorrectionTerm(explicitValue[1], 120);
    if (candidate) return candidate;
  }
  const articlePattern = /\b(?:a|an|the)\s+([A-Za-z0-9][A-Za-z0-9'-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'-]*){0,3})/gi;
  const matches = [...beforeNot.matchAll(articlePattern)];
  for (const match of matches.reverse()) {
    const candidate = normalizeScreenplayCorrectionTerm(
      String(match[1] || "").replace(/\s+(?:under|inside|behind|before|after|with|to|from)\b.*$/i, ""),
      120
    );
    if (candidate && !/\b(?:scene|act|page|story|character|truth)\b/i.test(candidate)) {
      return candidate;
    }
  }
  return "";
}

function extractResponsesText(payload) {
  const direct = normalizeSnippet(payload?.output_text ?? payload?.outputText ?? "", 12_000);
  if (direct) return direct;

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const entry of content) {
      const text = normalizeSnippet(entry?.text ?? entry?.transcript ?? "", 4_000);
      if (text) {
        parts.push(text);
      }
    }
  }
  return normalizeSnippet(parts.join("\n\n"), 12_000);
}

function extractQuotedTitle(transcript = "") {
  const match = String(transcript || "").match(/["']([^"']+)["']/);
  return normalizeWhitespace(String(match?.[1] || ""));
}

function extractLeadNameCandidate(transcript = "") {
  const raw = String(transcript || "");
  const quickIsMatch = raw.match(/\bis\s+([A-Z][a-z]+)\b/);
  if (quickIsMatch?.[1]) return quickIsMatch[1];
  const capitalMatch = raw.match(/\b([A-Z][a-z]{2,})\b/);
  return String(capitalMatch?.[1] || "").trim();
}

export {
  extractJsonObject,
  extractLeadNameCandidate,
  extractQuestionSnippet,
  extractQuotedTitle,
  extractResponsesText,
  extractScreenplayReplacementTermBeforeNot,
  extractTaskCandidatesFromText,
  extractTaskCompleteIntent,
  extractTaskCreateIntent,
};
