// Recap for a day of page writes. Its summary and highlights were the
// flattened page text ("FADE IN: EXT. STATE CAPITOL - NIGHT A granite dome
// in the rain…", 2026-09-30), which reads as noise. A page thread is named by
// the scenes it wrote; other threads keep their own words.
const HEADING = /(?:INT|EXT|INT\.?\/EXT|EXT\/INT|I\/E)\.\s[^a-z]*?\s[-–]\s(?:DAY|NIGHT|MORNING|AFTERNOON|EVENING|DUSK|DAWN|SUNSET|SUNRISE|CONTINUOUS|LATER|MOMENTS LATER|SAME(?: TIME)?)\b/g;

export function sceneHeadingsIn(text = "") {
  const seen = new Set();
  const out = [];
  for (const match of String(text || "").matchAll(HEADING)) {
    const heading = match[0].replace(/\s+/g, " ").trim();
    if (!seen.has(heading)) { seen.add(heading); out.push(heading); }
  }
  return out;
}

export function isPageThread(thread = {}) {
  return String(thread?.screenplayTarget || thread?.screenplay_target || "").toLowerCase() === "page";
}

// "Wrote INT. SENATE CHAMBER - CONTINUOUS" (two scenes at most, "and more").
export function pageThreadHighlight(thread = {}) {
  if (!isPageThread(thread)) return "";
  const headings = sceneHeadingsIn(thread?.assistant || thread?.preview || "");
  if (!headings.length) return "Wrote a page";
  const named = headings.slice(0, 2).join(", ");
  return `Wrote ${named}${headings.length > 2 ? ", and more" : ""}`;
}

// "Wrote 12 pages, through INT. SENATE CHAMBER - CONTINUOUS." for the window,
// newest thread first. "" when the window has no page writes.
export function pageRecapLine(threads = []) {
  const pages = (Array.isArray(threads) ? threads : []).filter(isPageThread);
  if (!pages.length) return "";
  const latest = sceneHeadingsIn(pages[0]?.assistant || pages[0]?.preview || "").pop();
  const count = pages.length === 1 ? "1 page" : `${pages.length} pages`;
  return latest ? `Wrote ${count}, through ${latest}.` : `Wrote ${count}.`;
}
