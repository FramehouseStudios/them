// Logline + synopsis + 3-act beats for singular project.
// Clementine writes these autonomously per genre/tone/mood + per-character memory.
// Uses story_structure_knowledge when available for genre-omniscient beats.
// No backend/index.js growth.

import { getThreeActBeats } from "./story_structure_knowledge.js";
import { getFeatureBeats } from "./feature_structure_knowledge.js";

function trimToString(v) { return v == null ? "" : String(v).trim(); }

function buildLogline({ parsed, project }) {
  const genre = trimToString(parsed?.genre || project?.tone || "horror");
  const setting = trimToString(parsed?.setting || project?.setting || "bedroom");
  const title = trimToString(project?.title || parsed?.title || `Untitled ${genre} short`);
  const chars = Array.isArray(parsed?.characters) ? parsed.characters : (project?.characters || []).map((c)=>c.name);
  const charStr = chars.slice(0, 3).join(", ") + (chars.length > 3 ? ` and ${chars.length - 3} more` : "");
  const tone = parsed?.influences?.tones?.[0] ? `, ${parsed.influences.tones[0]}` : "";
  // Classic logline: When [inciting], a [flawed protagonist] must [want] or [cost] in [setting]
  return `When a ${genre}${tone} night traps ${charStr} in a single ${setting}, ${chars[0] || "they"} must face what ${setting} remembers — or be remembered by it. — ${title}`;
}

function buildSynopsis({ parsed, project, logline }) {
  const genre = trimToString(parsed?.genre || "horror");
  const setting = trimToString(parsed?.setting || "bedroom");
  const chars = Array.isArray(parsed?.characters) ? parsed.characters : (project?.characters || []).map((c)=>c.name);
  const directors = parsed?.influences?.directors?.join(", ") || "";
  const beatsRef = `three-act ${parsed?.totalPages || 15}-page arc`;
  const voice = directors ? `in the spirit of ${directors}` : "";
  // 3-paragraph synopsis: setup / confrontation / resolution — 120-180 words, uses per-character want
  const contexts = project?.characterContexts || [];
  const johnWant = contexts.find((c)=>c.name===chars[0])?.arcState?.want || "leave before midnight";
  const sallyWant = contexts.find((c)=>c.name===chars[1])?.arcState?.want || "be seen";
  return [
    `${logline}`,
    `Act 1 — Setup (${setting.toUpperCase()}): ${chars.join(", ")} arrive with ${johnWant}. A whisper, a shadow by the door, an image that will echo.`,
    `Act 2 — Confrontation: Want/obstacle/cost sharpens. ${chars.slice(0,2).join(" and ")} chase and are chased; midnight is the clock. Each voice stays distinct — ${contexts.map((c)=>`${c.name} (${c.voice})`).join(", ") || chars.join(", ")}. ${voice}`,
    `Act 3 — Resolution: Payoff pays the cost. The ${setting} gives back what it was owed; the last image mirrors the first. Beats land on paper simultaneously, 5 pages now of ${beatsRef}, synopsis holds the rest.`,
  ].join("\n\n");
}

function buildBeats({ parsed, project }) {
  const total = Number(parsed?.totalPages) || 15;
  const genre = trimToString(parsed?.genre || "horror");
  const setting = trimToString(parsed?.setting || "bedroom");
  const chars = Array.isArray(parsed?.characters) ? parsed.characters : (project?.characters || []).map((c)=>c.name);
  const tones = parsed?.influences?.tones?.join(", ") || trimToString(parsed?.influences?.directors?.[0]) || genre;
  // Try knowledge-driven beats per genre/tone/mood — feature-aware 15-90p
  try {
    const tone0 = parsed?.influences?.tones?.[0] || genre;
    const kb = total > 30
      ? getFeatureBeats({ genre, tone: tone0, mood: parsed?.mood || "", totalPages: total, influences: parsed?.influences })
      : getThreeActBeats({ genre, tone: tone0, mood: parsed?.mood || "", influences: parsed?.influences });
    if (kb && Array.isArray(kb.acts)) {
      // Expand 3-act scaffold (6 strings) into 15 page beats with character/setting
      const actBeats = [...kb.acts[0].beats, ...kb.acts[1].beats, ...kb.acts[2].beats];
      const labels = ["Opening Image","Theme Stated","Set-Up","Inciting Incident","Debate","Break into Two","B Story","Fun and Games","Midpoint","Bad Guys Close In","All Is Lost","Dark Night","Finale Setup","Finale Confrontation","Final Image"];
      const kbBeats = actBeats.slice(0, 6).map((t,i)=>({ id:`kb${i+1}`, label: labels[i] || `Beat ${i+1}`, text: `${t} — ${kb.motif} in ${setting} with ${chars.slice(0,2).join(" & ")}` }));
      // Fill remainder with full 15-beat template so every page has a beat (genre-omniscient)
      const template = [
        { id: "b1", page: 1, label: "Opening Image", text: `INT. ${setting.toUpperCase()} — ${kb.motif} (${tones}).` },
        { id: "b2", page: 2, label: "Theme Stated", text: `${chars[0] || "Alex"} says what the film is really about, ${chars[1] || "Maya"} doesn't hear it yet.` },
        { id: "b3", page: 3, label: "Set-Up", text: `Introduce ${chars.join(", ")} each with distinct voice; want/obstacle seeded.` },
        { id: "b4", page: 4, label: "Inciting Incident", text: `The ${setting} remembers — whisper, shadow, or fake-set glitch forces a choice before midnight.` },
      ];
      // Merge: first 4 from kb+template, then remainder 11 so 15 total ends with Final Image
      const rest = [
        { id: "b5", page: 5, label: "Debate", text: `Should we stay? ${chars.slice(0,2).join(" vs ")} — cost of leaving named.` },
        { id: "b6", page: 6, label: "Break into Two", text: `Decision made; they step deeper into ${setting}.` },
        { id: "b7", page: 7, label: "B Story", text: `${chars[1] || "Maya"} and ${chars[2] || "Jonah"} share a truth; motif ${kb.motif} returns.` },
        { id: "b8", page: 8, label: "Fun and Games", text: `Chase begins — ${setting} corridors, three locations at once, promise of the premise.` },
        { id: "b9", page: 9, label: "Midpoint", text: `False victory or false defeat; the fake set reveals it's watching.` },
        { id: "b10", page: 10, label: "Bad Guys Close In", text: `Want vs need sharpens; each character's pressure +1.` },
        { id: "b11", page: 11, label: "All Is Lost", text: `Whisper becomes answer; someone must be left behind.` },
        { id: "b12", page: 12, label: "Dark Night", text: `Quiet image echo; ${chars[0] || "Alex"} chooses need over want.` },
        { id: "b13", page: 13, label: "Finale Setup", text: `Plan to trick the ${setting} — or trick each other.` },
        { id: "b14", page: 14, label: "Finale Confrontation", text: `Chase at speed; the midnight clock, the door, the listening shadow.` },
        { id: "b15", page: 15, label: "Final Image", text: `Mirror of opening, cost paid, ${chars.join(", ")} changed or gone.` },
      ];
      // For 90p, space pages across 90: page = round((i+1)*total/15) so Final Image = total
      const sliced = [...kbBeats.slice(0,4), ...rest].slice(0, Math.max(5, Math.min(30, total)));
      return sliced.map((b,i)=>({ ...b, id:`b${i+1}`, page: total>30 ? Math.round(((i+1)*total)/sliced.length) : i+1, genre: kb.genre, tone: tones, motif: kb.motif }));
    }
  } catch {}
  // 15 beats for 15p = 1 per page; for 5p delivery first 5 are written now, rest are roadmap
  const allBeats = [
    { id: "b1", page: 1, label: "Opening Image", text: `INT. ${setting.toUpperCase()} — the room holds its breath (${tones}).` },
    { id: "b2", page: 2, label: "Theme Stated", text: `${chars[0] || "Alex"} says what the film is really about, ${chars[1] || "Maya"} doesn't hear it yet.` },
    { id: "b3", page: 3, label: "Set-Up", text: `Introduce ${chars.join(", ")} each with distinct voice; want/obstacle seeded.` },
    { id: "b4", page: 4, label: "Inciting Incident", text: `The ${setting} remembers — whisper, shadow, or fake-set glitch forces a choice before midnight.` },
    { id: "b5", page: 5, label: "Debate", text: `Should we stay? ${chars.slice(0,2).join(" vs ")} — cost of leaving named.` },
    { id: "b6", page: 6, label: "Break into Two", text: `Decision made; they step deeper into ${setting}.` },
    { id: "b7", page: 7, label: "B Story", text: `${chars[1] || "Maya"} and ${chars[2] || "Jonah"} share a truth; motif image returns.` },
    { id: "b8", page: 8, label: "Fun and Games", text: `Chase begins — ${setting} corridors, three locations at once, promise of the premise.` },
    { id: "b9", page: 9, label: "Midpoint", text: `False victory or false defeat; the fake set reveals it's watching.` },
    { id: "b10", page: 10, label: "Bad Guys Close In", text: `Want vs need sharpens; each character's pressure +1.` },
    { id: "b11", page: 11, label: "All Is Lost", text: `Whisper becomes answer; someone must be left behind.` },
    { id: "b12", page: 12, label: "Dark Night", text: `Quiet image echo; ${chars[0] || "Alex"} chooses need over want.` },
    { id: "b13", page: 13, label: "Finale Setup", text: `Plan to trick the ${setting} — or trick each other.` },
    { id: "b14", page: 14, label: "Finale Confrontation", text: `Chase at speed; the midnight clock, the door, the listening shadow.` },
    { id: "b15", page: 15, label: "Final Image", text: `Mirror of opening, cost paid, ${chars.join(", ")} changed or gone.` },
  ];
  // Slice to totalPages, attach genre/tone hint — for 90p space pages proportionally
  const baseSliced = allBeats.slice(0, Math.max(5, Math.min(30, total)));
  return baseSliced.map((b,i)=>({ ...b, page: total>30 ? Math.round(((i+1)*total)/baseSliced.length) : b.page, genre, tone: tones }));
}

function attachStoryElements(project, parsed) {
  if (!project) throw new Error("project required");
  const logline = buildLogline({ parsed, project });
  const beats = buildBeats({ parsed, project });
  const synopsis = buildSynopsis({ parsed, project, logline });
  project.logline = logline;
  project.synopsis = synopsis;
  project.beats = beats;
  project.beatsUpdatedAt = Date.now();
  // Also keep outline.beats in sync for legacy outline consumers
  if (project.outline && typeof project.outline === "object") {
    project.outline.beats = beats.map((b)=>({ id:b.id, label:b.label, page:b.page }));
    project.outline.updatedAt = Date.now();
  }
  return { logline, synopsis, beats };
}

export { buildLogline, buildSynopsis, buildBeats, attachStoryElements };
