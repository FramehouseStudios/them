// Studio actions: what Clementine can do in the app when she says she will.
//
// The client tells each /talk turn what the Studio offers right now
// (`studio_capabilities`: tabs, draft-tool sections, revision colors, scene
// labels). The prompt gets a STUDIO CONTROLS block naming those options and a
// tag syntax; when her reply commits to an action ("saving a revision in
// pink", "I'll start a rewrite", "which beat do you want to change?") she
// ends the reply with one tag per action:
//
//     [[studio: save_revision color=pink]]
//
// extractStudioActions() strips the tags from the spoken text (they are
// never read aloud), validates every action against the capabilities (an
// action that names a tab or color the app does not have is rejected, never
// guessed), and the handler emits the survivors on the x-studio-actions
// header. A small set of unambiguous spoken phrases is inferred when the
// model forgets the tag. Spoken text stays one stream (D008 §5): the
// machine state rides beside it, not inside it.

export const STUDIO_TABS = Object.freeze(["draft", "beats", "craft", "outline", "them", "saved"]);
export const DRAFT_TOOLS_SECTIONS = Object.freeze(["pages", "revisions", "snapshots", "saved"]);
export const SIDEBAR_SECTIONS = Object.freeze(["projects", "files"]);
export const REVISION_COLORS = Object.freeze(["white", "blue", "pink", "yellow", "green", "goldenrod", "buff", "salmon", "cherry"]);
export const REWRITE_SCOPES = Object.freeze(["scene", "line", "page", "selection"]);
export const ACTION_TYPES = Object.freeze([
  "open_tab",
  "open_draft_tools",
  "open_sidebar",
  "save_draft",
  "save_revision",
  "start_rewrite",
  "choose_beat",
  "jump_to_scene",
  "undo_last_page_write",
]);
export const MAX_ACTIONS_PER_TURN = 4;
export const HEADER_NAME = "x-studio-actions";

function listOf(value, allowed, fallback) {
  if (!Array.isArray(value)) return fallback;
  const out = value.map((v) => String(v ?? "").trim().toLowerCase()).filter((v) => allowed.includes(v));
  return out.length ? [...new Set(out)] : fallback;
}

function labelsOf(value, limit = 40) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, limit);
}

const COVERAGE_PILLARS = ["structure", "pacing", "dialogue", "character", "format"];

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;
}

/// The compact summary of the read the phone already showed the writer
/// (from POST /screenplay/coverage). Null when the phone sent none.
export function parseCoverageSummary(raw) {
  if (!raw || typeof raw !== "object") return null;
  const grade = String(raw.grade ?? "").trim().toUpperCase().slice(0, 1);
  const verdict = String(raw.verdict ?? "").trim().toLowerCase();
  const overall = clampScore(raw.overall);
  if (!/^[A-F]$/.test(grade) || !["recommend", "consider", "pass"].includes(verdict) || overall === null) return null;
  const pillars = {};
  for (const key of COVERAGE_PILLARS) {
    const score = clampScore(raw.pillars?.[key]);
    if (score !== null) pillars[key] = score;
  }
  return Object.freeze({
    grade,
    verdict,
    overall,
    pageCount: Math.max(0, Math.trunc(Number(raw.page_count ?? raw.pageCount) || 0)),
    sceneCount: Math.max(0, Math.trunc(Number(raw.scene_count ?? raw.sceneCount) || 0)),
    pillars: Object.freeze(pillars),
    missing: labelsOf(raw.missing, 2),
    move: String(raw.move ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
  });
}

/// Prompt block so her conversation quotes the read the writer is looking at
/// instead of inventing a second opinion. Empty when there is no read.
export function buildCoverageReadBlock(caps) {
  const c = caps?.coverage;
  if (!c) return "";
  const pillarText = COVERAGE_PILLARS.filter((k) => k in c.pillars).map((k) => `${k} ${c.pillars[k]}`).join(", ");
  const lowest = COVERAGE_PILLARS.filter((k) => k in c.pillars).sort((a, b) => c.pillars[a] - c.pillars[b])[0] || "";
  return [
    "YOUR READ OF THE PAGES (the coverage you already gave the writer on the Craft tab; quote it, never recompute or contradict it):",
    `- ${c.pageCount} page${c.pageCount === 1 ? "" : "s"}, ${c.sceneCount} scene${c.sceneCount === 1 ? "" : "s"}. Grade ${c.grade}, verdict ${c.verdict}, ${c.overall} of 10 overall.`,
    pillarText ? `- Pillars: ${pillarText}.${lowest ? ` Lowest: ${lowest}.` : ""}` : "",
    c.missing.length ? `- Missing: ${c.missing.join(" ")}` : "",
    c.move ? `- The move you named: ${c.move}` : "",
    "- When the writer asks how the script is doing, what to fix first, or what you think of the pages, answer from this read: name the grade and the lowest pillar, then the move. Do not invent other scores.",
  ].filter(Boolean).join("\n");
}

export function parseStudioCapabilities(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { enabled: false };
    try { obj = JSON.parse(text); } catch { return { enabled: false, error: "invalid_json" }; }
  }
  if (!obj || typeof obj !== "object") return { enabled: false };
  const tabs = listOf(obj.tabs, STUDIO_TABS, [...STUDIO_TABS]);
  const draftToolsSections = listOf(obj.draft_tools_sections ?? obj.draftToolsSections, DRAFT_TOOLS_SECTIONS, [...DRAFT_TOOLS_SECTIONS]);
  const sidebarSections = listOf(obj.sidebar_sections ?? obj.sidebarSections, SIDEBAR_SECTIONS, [...SIDEBAR_SECTIONS]);
  const revisionColors = listOf(obj.revision_colors ?? obj.revisionColors, REVISION_COLORS, [...REVISION_COLORS]);
  const sceneLabels = labelsOf(obj.scene_labels ?? obj.sceneLabels);
  const beatLabels = labelsOf(obj.beat_labels ?? obj.beatLabels);
  const coverage = parseCoverageSummary(obj.coverage);
  const currentTab = String(obj.current_tab ?? obj.currentTab ?? "").trim().toLowerCase();
  const currentSection = String(obj.current_draft_tools_section ?? obj.currentDraftToolsSection ?? "").trim().toLowerCase();
  return Object.freeze({
    enabled: true,
    tabs,
    draftToolsSections,
    sidebarSections,
    revisionColors,
    sceneLabels,
    beatLabels,
    coverage,
    currentTab: tabs.includes(currentTab) ? currentTab : "",
    currentDraftToolsSection: draftToolsSections.includes(currentSection) ? currentSection : "",
    hasProject: Boolean(obj.has_project ?? obj.hasProject),
    hasDraft: Boolean(obj.has_draft ?? obj.hasDraft) || sceneLabels.length > 0,
    studioOpen: Boolean(obj.studio_open ?? obj.studioOpen),
  });
}

export function buildStudioControlsBlock(caps) {
  if (!caps?.enabled) return "";
  const scenes = caps.sceneLabels.length
    ? caps.sceneLabels.slice(0, 12).map((s) => `"${s}"`).join(", ") + (caps.sceneLabels.length > 12 ? ", …" : "")
    : "(no scenes yet)";
  const beats = caps.beatLabels.length
    ? caps.beatLabels.slice(0, 16).map((b) => `"${b}"`).join(", ") + (caps.beatLabels.length > 16 ? ", …" : "")
    : "(no beats on the outline yet)";
  return [
    "STUDIO CONTROLS (you can operate the app; the writer hears you and sees it happen):",
    `- Tabs: ${caps.tabs.join(", ")}${caps.currentTab ? ` (open now: ${caps.currentTab})` : ""}. Draft tools: ${caps.draftToolsSections.join(", ")}. Sidebar: ${caps.sidebarSections.join(", ")}.`,
    `- Revision colors, in production order: ${caps.revisionColors.join(", ")}.`,
    `- Scenes on the page: ${scenes}.`,
    `- Beats on the outline: ${beats}.`,
    `- Project open: ${caps.hasProject ? "yes" : "no"}. Draft present: ${caps.hasDraft ? "yes" : "no"}. Studio open: ${caps.studioOpen ? "yes" : "no"}.`,
    "- When you commit to doing one of these, say it plainly in the reply, then end the reply with one tag per action, each on its own line, exactly in this form:",
    "  [[studio: open_tab tab=beats]]  [[studio: open_draft_tools section=revisions]]  [[studio: open_sidebar section=projects]]",
    "  [[studio: save_draft]]  [[studio: save_revision color=pink]]  [[studio: start_rewrite scope=scene]]",
    "  [[studio: choose_beat]]  [[studio: choose_beat beat=\"Midpoint\"]]  [[studio: jump_to_scene scene=\"INT. KITCHEN - NIGHT\"]]  [[studio: undo_last_page_write]]",
    "- Only tag what you actually said you will do this turn. Use only the tabs, sections, colors, scene labels, and beat labels listed above; if the writer asks for something not on the list, say so instead of tagging. A question is never a tag, except choose_beat, which opens the Beats tab while you ask which beat to change; with beat=… it selects that beat so the writer can say what to change.",
    "- undo_last_page_write only when the writer asks to undo, remove, or revert the last page you wrote.",
    "- Tags are stripped before your voice is heard; never read them aloud or mention them.",
  ].join("\n");
}

const TAG_RE = /\[\[\s*(?:studio|action)\s*:?\s*([a-z_]+)((?:\s+[a-z_]+=(?:"[^"]*"|'[^']*'|[^\s\]]+))*)\s*\]\]/gi;
const ARG_RE = /([a-z_]+)=("([^"]*)"|'([^']*)'|([^\s\]]+))/gi;

function parseArgs(raw) {
  const args = {};
  let m;
  ARG_RE.lastIndex = 0;
  while ((m = ARG_RE.exec(raw || ""))) {
    args[m[1].toLowerCase()] = (m[3] ?? m[4] ?? m[5] ?? "").trim();
  }
  return args;
}

function matchLabel(label, list) {
  const needle = String(label || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return "";
  const exact = list.find((s) => s.toLowerCase() === needle);
  if (exact) return exact;
  const contains = list.filter((s) => s.toLowerCase().includes(needle) || needle.includes(s.toLowerCase()));
  return contains.length === 1 ? contains[0] : "";
}

function matchScene(label, caps) {
  return matchLabel(label, caps.sceneLabels);
}

function validate(type, args, caps) {
  const t = String(type || "").toLowerCase();
  if (!ACTION_TYPES.includes(t)) return { ok: false, reason: `unknown_type:${t}` };
  switch (t) {
    case "open_tab": {
      const tab = String(args.tab || "").toLowerCase();
      if (!caps.tabs.includes(tab)) return { ok: false, reason: `unknown_tab:${tab || "none"}` };
      return { ok: true, action: { type: t, tab } };
    }
    case "open_draft_tools": {
      const section = String(args.section || "").toLowerCase();
      if (!caps.draftToolsSections.includes(section)) return { ok: false, reason: `unknown_section:${section || "none"}` };
      return { ok: true, action: { type: t, section } };
    }
    case "open_sidebar": {
      const section = String(args.section || "").toLowerCase();
      if (!caps.sidebarSections.includes(section)) return { ok: false, reason: `unknown_sidebar:${section || "none"}` };
      return { ok: true, action: { type: t, section } };
    }
    case "save_draft":
      if (!caps.hasDraft) return { ok: false, reason: "no_draft" };
      return { ok: true, action: { type: t } };
    case "save_revision": {
      const color = String(args.color || "").toLowerCase();
      if (!caps.revisionColors.includes(color)) return { ok: false, reason: `unknown_color:${color || "none"}` };
      if (!caps.hasDraft) return { ok: false, reason: "no_draft" };
      return { ok: true, action: { type: t, color } };
    }
    case "start_rewrite": {
      const scope = String(args.scope || "scene").toLowerCase();
      if (!REWRITE_SCOPES.includes(scope)) return { ok: false, reason: `unknown_scope:${scope}` };
      if (!caps.hasDraft) return { ok: false, reason: "no_draft" };
      const action = { type: t, scope };
      if (args.scene) {
        const scene = matchScene(args.scene, caps);
        if (!scene) return { ok: false, reason: `unknown_scene:${args.scene}` };
        action.scene = scene;
      }
      return { ok: true, action };
    }
    case "choose_beat": {
      // A beat she names must exist on the outline; an unknown or missing
      // beat still opens the Beats tab so the question lands somewhere.
      const beat = args.beat ? matchLabel(args.beat, caps.beatLabels) : "";
      return { ok: true, action: beat ? { type: t, beat } : { type: t } };
    }
    case "jump_to_scene": {
      const scene = matchScene(args.scene, caps);
      if (!scene) return { ok: false, reason: `unknown_scene:${args.scene || "none"}` };
      return { ok: true, action: { type: t, scene } };
    }
    case "undo_last_page_write":
      return { ok: true, action: { type: t } };
    default:
      return { ok: false, reason: `unknown_type:${t}` };
  }
}

const COLOR_ALT = REVISION_COLORS.join("|");
const SPOKEN_PATTERNS = [
  { type: "start_rewrite", re: /\b(?:i'?ll|let me|i'?m going to|i will|i can|let'?s)\s+(?:start|begin|do|take|run)\s+(?:a |the |another )?(?:full )?rewrite\b/i, args: () => ({ scope: "scene" }) },
  { type: "save_revision", re: new RegExp(`\\b(?:sav(?:e|ing)|mark(?:ing)?|log(?:ging)?|fil(?:e|ing))\\s+(?:a |the |this |these |your )?(?:revision|revised pages?|pages?|pass)\\s+(?:in|as)\\s+(${COLOR_ALT})\\b`, "i"), args: (m) => ({ color: m[1].toLowerCase() }) },
  { type: "choose_beat", re: /\bwhich\s+(?:story(?:line)?\s+)?(?:beat|scene)\s+(?:would you like|do you want|should we)\s+to\s+(?:change|rework|revise|fix|rewrite|move)\b/i, args: () => ({}) },
  { type: "choose_beat", re: /\b(?:pull(?:ing)? up|open(?:ing)?|select(?:ing)?|jump(?:ing)? to)\s+(?:the\s+)?["“]?([A-Za-z][^"”\n.,;:]{1,50}?)["”]?\s+beat\b/i, args: (m) => ({ beat: m[1].trim() }) },
  { type: "undo_last_page_write", re: /\b(?:i'?ll|let me|i'?m going to|i will|let'?s)\s+(?:undo|remove|revert|pull back|take back)\s+(?:the |that |this )?(?:last |latest |most recent )?(?:page write|page|write|pages? i (?:just )?wrote)\b/i, args: () => ({}) },
  { type: "open_tab", re: /\b(?:open(?:ing)?|pull(?:ing)? up|switch(?:ing)? to|bring(?:ing)? up)\s+(?:the\s+)?(draft|beats|craft|outline|saved)\s+(?:tab|panel)\b/i, args: (m) => ({ tab: m[1].toLowerCase() }) },
  { type: "open_draft_tools", re: /\b(?:open(?:ing)?|pull(?:ing)? up|switch(?:ing)? to|bring(?:ing)? up)\s+(?:the\s+)?(pages|revisions|snapshots)\b/i, args: (m) => ({ section: m[1].toLowerCase() }) },
  { type: "save_draft", re: /\b(?:sav(?:e|ing))\s+(?:the |this |your )?draft\b/i, args: () => ({}) },
];

export function inferSpokenActions(text) {
  const found = [];
  for (const spec of SPOKEN_PATTERNS) {
    if (found.some((f) => f.type === spec.type)) continue;
    const m = spec.re.exec(String(text || ""));
    if (m) found.push({ type: spec.type, args: spec.args(m), inferred: true });
  }
  return found;
}

export function extractStudioActions(reply, caps) {
  const text = String(reply ?? "");
  const result = { spokenText: text, actions: [], rejected: [], stripped: false };
  if (!caps?.enabled) {
    // Tags are still stripped so a stray one never reaches the voice.
    const cleaned = text.replace(TAG_RE, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    result.stripped = cleaned !== text;
    result.spokenText = cleaned;
    return result;
  }
  const candidates = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text))) {
    candidates.push({ type: m[1].toLowerCase(), args: parseArgs(m[2]), inferred: false });
  }
  const spoken = text.replace(TAG_RE, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  result.stripped = spoken !== text;
  result.spokenText = spoken;
  const tagged = new Set(candidates.map((c) => c.type));
  for (const inferred of inferSpokenActions(spoken)) {
    if (!tagged.has(inferred.type)) candidates.push(inferred);
  }
  const seen = new Set();
  for (const candidate of candidates) {
    const verdict = validate(candidate.type, candidate.args, caps);
    if (!verdict.ok) { result.rejected.push({ type: candidate.type, reason: verdict.reason, inferred: candidate.inferred }); continue; }
    const key = JSON.stringify(verdict.action);
    if (seen.has(key)) continue;
    seen.add(key);
    if (result.actions.length >= MAX_ACTIONS_PER_TURN) { result.rejected.push({ type: candidate.type, reason: "too_many" }); continue; }
    result.actions.push({ ...verdict.action, source: candidate.inferred ? "spoken" : "tag" });
  }
  return result;
}

export function encodeStudioActionsHeader(actions) {
  if (!Array.isArray(actions) || !actions.length) return "";
  const json = JSON.stringify(actions);
  return json.length <= 4000 ? encodeURIComponent(json) : "";
}
