// The sentences project memory writes for itself when it distills a page
// without the model (index.js buildDistilledScreenplay*): a template around a
// line or a motif ("Nora is under pressure from: <last action line>", "Who
// controls the photograph?", "Window returns as proof or cost in Act III.").
// They guide a prompt; they are not story the next page must repeat.
const DISTILLED_MEMORY_TEMPLATES = Object.freeze([
  /^[A-Za-z][\w'-]* (?:is under pressure from|must change tactics after):/,
  /^Who else knows about .+\?$/,
  /^What happened to .+\?$/,
  /^Who controls the .+\?$/,
  /^Force the consequence of: /,
  /^Make \S+ choose a new tactic under pressure\b/,
  /^Complicate or pay off .+ so it changes the next scene\.$/,
  / returns as proof or cost in Act III\.$/,
  /'s next public choice must pay off the private pressure planted here\.$/,
  / is being pushed from private control toward public truth\.$/,
  / must decide what .+ costs them\.$/,
  // The app's own feature brief, stored as a "correction" before the writer's
  // direction was cut at the next bullet (2026-09-30): not story either.
  /- (?:Current feature position|Coming next|Current sequence|Sequence obligation|Sequence page moves|Next scene plan|Latest accepted page batch): /,
]);

export function isDistilledMemoryTemplate(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return Boolean(text) && DISTILLED_MEMORY_TEMPLATES.some((pattern) => pattern.test(text));
}
