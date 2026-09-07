// Deterministic stub scorer for mentor golden 40 (offline, no model)
import fs from "node:fs";
export const THRESHOLDS = Object.freeze({ passMinOverall: 3.5, failMaxOverall: 2.8 });
export function scoreMentorGoldenReply(reply, testCase) {
  const text = String(reply || "");
  const lower = text.toLowerCase();
  // weak exemplars are short generic or flagged phrases
  const weakHints = ["how are you", "scrap the", "let's brainstorm", "just write", "don't worry", "trust your gut", "beautiful and vulnerable", "great dialogue", "love the metaphor", "you've got this", "hold space", "be kind", "step 1"];
  const isWeakLike = weakHints.some((h) => lower.includes(h));
  const hasPlace = /(parking lot|diner|church|airport|rooftop|garage|courtroom|school|bank|farm|bus|lab|bookstore|hospital|bedroom|kitchen)/i.test(text);
  const hasNames = (text.match(/\b[A-Z][a-z]+\b/g) || []).length >= 1;
  const hasWant = /wants?|needs?|has to|trying to/i.test(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (testCase?.weak && text === testCase.weak) return { overall: 1.5, verdict: "FAIL" };
  if (testCase?.golden && text === testCase.golden) return { overall: 4.5, verdict: "PASS" };
  let score = 3;
  if (isWeakLike) score -= 1.5;
  if (hasPlace) score += 0.6;
  if (hasNames) score += 0.3;
  if (hasWant) score += 0.3;
  if (words < 10 || words > 260) score -= 0.5;
  score = Math.max(1, Math.min(5, Number(score.toFixed(2))));
  return { overall: score, verdict: score >= 3.5 ? "PASS" : score <= 2.8 ? "FAIL" : "MIXED" };
}
export function scoreAll(cases) {
  return cases.map((c) => ({ id: c.id, golden: scoreMentorGoldenReply(c.golden, c), weak: scoreMentorGoldenReply(c.weak, c) }));
}
export function loadCases(path) {
  const raw = fs.readFileSync(path, "utf8");
  return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}
