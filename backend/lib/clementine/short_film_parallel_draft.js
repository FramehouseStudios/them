// Simultaneous multi-character paper helper — splits per-character lines simulation.
// D009 strangler: no backend/index.js growth. Takes project.characterContexts and draft.

function trimToString(v) {
  return v == null ? "" : String(v).trim();
}

function getCharacterNames(project) {
  if (!project || !Array.isArray(project.characterContexts)) return [];
  return project.characterContexts.map((c) => trimToString(c.name)).filter(Boolean);
}

function isCharacterCue(line, namesUpper) {
  const t = trimToString(line);
  if (!t) return null;
  if (t.startsWith("INT.") || t.startsWith("EXT.") || t.startsWith("INT/EXT")) return null;
  const upper = t.toUpperCase();
  // must be all caps (allow letters, numbers, spaces, apostrophe, hyphen, period)
  if (t !== upper) return null;
  if (upper.length > 40) return null;
  if (!/^[A-Z0-9 '\-\.]+$/.test(upper)) return null;
  // match known character name
  const found = namesUpper.get(upper);
  if (found) return found;
  return null;
}

/**
 * Split a Fountain draft into per-character simulations.
 * @param {object} project - expects project.characterContexts: [{name}]
 * @param {string} draft - Fountain screenplay text
 * @returns {{ sharedHeader: string, perCharacter: Record<string,string[]>, ordered: Array<{character:string,cue:string,text:string,index:number}> }}
 */
export function splitDraftByCharacter(project, draft) {
  // support both (project, draft) and (draft, project) for tolerance
  if (typeof project === "string" && draft && typeof draft === "object") {
    const tmp = project;
    project = draft;
    draft = tmp;
  }
  const text = draft == null ? "" : String(draft);
  const names = getCharacterNames(project);
  const namesUpper = new Map(names.map((n) => [n.toUpperCase(), n]));
  const lines = text.split("\n");

  let firstCueIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isCharacterCue(lines[i], namesUpper)) { firstCueIdx = i; break; }
  }
  const sharedHeader = firstCueIdx === -1 ? text.trimEnd() : lines.slice(0, firstCueIdx).join("\n").trimEnd();

  const perCharacter = {};
  for (const n of names) perCharacter[n] = [];
  const ordered = [];

  for (let i = 0; i < lines.length; i++) {
    const cue = isCharacterCue(lines[i], namesUpper);
    if (!cue) continue;
    // find next non-empty line as dialogue
    let j = i + 1;
    while (j < lines.length && trimToString(lines[j]) === "") j++;
    if (j >= lines.length) continue;
    const dialogue = trimToString(lines[j]);
    if (!dialogue) continue;
    // avoid capturing another cue as dialogue
    if (isCharacterCue(dialogue, namesUpper)) continue;
    perCharacter[cue].push(dialogue);
    ordered.push({ character: cue, cue: cue.toUpperCase(), text: dialogue, index: ordered.length });
  }

  return { sharedHeader, perCharacter, ordered };
}

/**
 * Simulate parallel drafts — one Fountain snippet per character.
 * Each snippet contains the shared header + that character's lines only.
 * @returns {Array<{name:string,draft:string,lines:string[]}>}
 */
export function simulateParallelDrafts(project, draft) {
  if (typeof project === "string" && draft && typeof draft === "object") {
    const tmp = project; project = draft; draft = tmp;
  }
  const split = splitDraftByCharacter(project, draft);
  const names = getCharacterNames(project);
  if (!names.length) {
    return [{ name: "", draft: String(draft || ""), lines: [] }];
  }
  return names.map((name) => {
    const lines = split.perCharacter[name] || [];
    const body = lines.map((t) => `${name.toUpperCase()}\n${t}`).join("\n\n");
    const d = [split.sharedHeader, body].filter(Boolean).join("\n\n");
    return { name, draft: d, lines: lines.slice() };
  });
}

/**
 * Merge per-character drafts back into a single Fountain draft.
 * Accepts: split result {sharedHeader, ordered}, or array of {name,draft,lines}, or Record<string,string|string[]>
 */
export function mergeCharacterDrafts(input) {
  if (input == null) return "";
  if (typeof input === "string") return input;

  // split result with ordered
  if (typeof input === "object" && Array.isArray(input.ordered)) {
    const header = trimToString(input.sharedHeader);
    const body = input.ordered.map((o) => `${String(o.character).toUpperCase()}\n${trimToString(o.text)}`).join("\n\n");
    return [header, body].filter(Boolean).join("\n\n");
  }

  // array of drafts
  if (Array.isArray(input)) {
    if (input.length === 0) return "";
    // if first element has ordered (split result inside array) — not expected
    // check if elements are {name, draft} or strings or lines
    const hasDraftKey = input.some((v) => v && typeof v === "object" && typeof v.draft === "string");
    if (hasDraftKey) {
      // Reconstruct by merging ordered lines if lines available, else concat drafts with deduped header
      const headers = new Set();
      const ordered = [];
      for (const item of input) {
        if (!item || typeof item.draft !== "string") continue;
        const headerPart = item.draft.split("\n").slice(0, 20).join("\n");
        headers.add(headerPart);
        if (Array.isArray(item.lines)) {
          for (const t of item.lines) ordered.push({ character: item.name, text: t });
        } else {
          // parse draft to extract lines for this character
          const nm = trimToString(item.name);
          if (!nm) continue;
          const re = new RegExp(`^${nm.toUpperCase()}\\s*\\n([^\\n]+)`, "gm");
          let m;
          while ((m = re.exec(item.draft)) !== null) ordered.push({ character: nm, text: trimToString(m[1]) });
        }
      }
      // If we have ordered, sort by appearance in original? We keep insertion order which mirrors character order
      // For true round-trip, caller should pass split result directly. For array merge, just interleave by concatenation
      // Deduplicate header: take shared header from first item's split if available
      const firstHeader = (() => {
        const first = input.find((v) => v && typeof v.draft === "string");
        if (!first) return "";
        const splitIdx = first.draft.indexOf(first.name ? first.name.toUpperCase() : "");
        if (splitIdx > 0) return first.draft.slice(0, splitIdx).trimEnd();
        return "";
      })();
      if (ordered.length) {
        const body = ordered.map((o) => `${String(o.character).toUpperCase()}\n${o.text}`).join("\n\n");
        return [firstHeader, body].filter(Boolean).join("\n\n");
      }
      // fallback concat
      return input.map((v) => typeof v === "string" ? v : (v.draft || "")).filter(Boolean).join("\n\n");
    }
    // array of strings
    return input.filter((v) => typeof v === "string" && trimToString(v)).join("\n\n");
  }

  // object map: perCharacter or {sharedHeader, perCharacter}
  if (typeof input === "object") {
    if (input.perCharacter && typeof input.perCharacter === "object") {
      const header = trimToString(input.sharedHeader);
      const ordered = input.ordered && Array.isArray(input.ordered) ? input.ordered : null;
      if (ordered) return mergeCharacterDrafts(input);
      // without order, concatenate per-character blocks in name order
      const blocks = Object.entries(input.perCharacter).map(([name, lines]) => {
        const arr = Array.isArray(lines) ? lines : [String(lines)];
        return arr.map((t) => `${String(name).toUpperCase()}\n${trimToString(t)}`).join("\n\n");
      }).filter(Boolean).join("\n\n");
      return [header, blocks].filter(Boolean).join("\n\n");
    }
    // plain Record<string,string|string[]>
    const vals = Object.values(input);
    if (vals.every((v) => typeof v === "string")) return vals.join("\n\n");
    if (vals.every((v) => Array.isArray(v))) {
      const blocks = Object.entries(input).map(([name, arr]) => arr.map((t) => `${String(name).toUpperCase()}\n${trimToString(t)}`).join("\n\n")).filter(Boolean).join("\n\n");
      return blocks;
    }
  }

  return "";
}

export { getCharacterNames };
