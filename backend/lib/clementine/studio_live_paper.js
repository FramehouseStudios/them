// D009 Studio Live Paper — pure helper (buildLivePaperPayload).
// Strangler under lib/clementine; backend/index.js stays at 33626.
// Wires project.logline/synopsis/beats/characterContexts to talk_handler
// x-screenplay-output headers and ScreenplayLiveDraftBridge.

function toTrimmedString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function clampString(s, max) {
  const t = toTrimmedString(s);
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max).trim();
}

function normalizeBeats(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < raw.length && out.length < 32; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      const s = clampString(item, 200);
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `beat-${out.length + 1}`, title: s, order: out.length + 1 });
      continue;
    }
    const id = clampString(item.id || item.beatId || item.beat_id || `beat-${out.length + 1}`, 64) || `beat-${out.length + 1}`;
    const title = clampString(item.title || item.name || item.label || item.text || "", 200);
    const summary = clampString(item.summary || item.description || item.synopsis || "", 500);
    const orderRaw = Number(item.order ?? item.index ?? out.length + 1);
    const order = Number.isFinite(orderRaw) ? Math.max(1, Math.round(orderRaw)) : out.length + 1;
    const key = `${id.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const beat = { id, order };
    if (title) beat.title = title;
    if (summary) beat.summary = summary;
    // preserve optional act tag if present
    const act = clampString(item.act || item.actTag || "", 32);
    if (act) beat.act = act;
    out.push(beat);
  }
  out.sort((a,b) => (a.order||0)-(b.order||0));
  return out.map((b,i) => ({ ...b, order: i+1 }));
}

function normalizeCharacterContexts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (count >= 32) break;
    const key = clampString(k, 64);
    if (!key) continue;
    const val = clampString(v, 800);
    if (!val) continue;
    out[key] = val;
    count++;
  }
  return out;
}

import { paginateFountainDraft } from "./page_flip.js";

export function buildLivePaperPayload(project, opts = {}) {
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    return { logline: "", synopsis: "", beats: [], characterContexts: {}, pages: [], totalPages: 0, currentPage: 1 };
  }
  const logline = clampString(project.logline ?? project.screenplayLogline ?? project.screenplay_logline ?? "", 280);
  const synopsis = clampString(project.synopsis ?? project.screenplaySynopsis ?? project.screenplay_synopsis ?? project.summary ?? project.overview ?? "", 4000);
  const beats = normalizeBeats(project.beats ?? project.outlineBeats ?? project.outline_beats ?? project.beatSequence ?? project.beat_sequence ?? []);
  // accept both camel and snake
  const rawContexts = project.characterContexts ?? project.character_contexts ?? project.character_context ?? project.characterContext ?? project.characterVoiceContexts ?? {};
  const characterContexts = normalizeCharacterContexts(rawContexts);
  // Flip-through: paginate draft if available (latest version draft or opts.draft)
  const draft = String(opts.draft || project?.versions?.[0]?.draft || project?.latestDraft || "");
  let pages = [];
  try {
    if (draft) pages = paginateFountainDraft(draft);
  } catch {}
  const totalPages = pages.length || Math.max(1, Number(opts.currentPage) || 1);
  const currentPage = Math.max(1, Math.min(totalPages, Number(opts.currentPage) || 1));
  return { logline, synopsis, beats, characterContexts, pages, totalPages, currentPage, projectId: String(project.id || "") };
}

export default { buildLivePaperPayload };
