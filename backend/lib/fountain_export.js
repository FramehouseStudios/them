// T-fountain-export-endpoint — pure Fountain serializer.
//
// Takes a structured screenplay representation and produces a
// Fountain-formatted string. Format spec:
//   https://fountain.io/syntax
//
// Input shape (V1, deliberately small):
//
//   {
//     title?: {
//       title: string,
//       credit?: string,
//       author?: string,
//       source?: string,
//       draftDate?: string,
//       contact?: string,
//       notes?: string,
//     },
//     scenes: [
//       {
//         heading?: string,         // "INT. KITCHEN - NIGHT"
//         lines: [
//           { kind: "action", text: string },
//           { kind: "character", name: string,
//             parenthetical?: string, forced?: boolean,
//             dualDialogue?: boolean,
//             dialogue: string | string[] },
//           { kind: "transition", text: string, forced?: boolean },
//           { kind: "centered", text: string },
//           { kind: "lyrics", text: string },
//           { kind: "section", level?: 1|2|3, text: string },
//           { kind: "synopsis", text: string },
//           { kind: "blank" }
//         ]
//       }
//     ]
//   }
//
// Output is plain text suitable for download as `.fountain`. The
// serializer is pure: same input → same output, byte-for-byte.

const TITLE_FIELDS = Object.freeze([
  ["title", "Title"],
  ["credit", "Credit"],
  ["author", "Author"],
  ["source", "Source"],
  ["draftDate", "Draft date"],
  ["contact", "Contact"],
  ["notes", "Notes"],
]);

function trim(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function serializeTitlePage(title) {
  if (!title || typeof title !== "object" || Array.isArray(title)) return "";
  const lines = [];
  for (const [key, label] of TITLE_FIELDS) {
    const value = trim(title[key]);
    if (!value) continue;
    if (value.includes("\n")) {
      // Multi-line values use indented continuation per Fountain spec.
      const [first, ...rest] = value.split("\n");
      lines.push(`${label}: ${first}`);
      for (const r of rest) lines.push(`    ${r}`);
    } else {
      lines.push(`${label}: ${value}`);
    }
  }
  return lines.length ? `${lines.join("\n")}\n\n` : "";
}

function isAllUpper(s) {
  if (!s) return false;
  return s === s.toUpperCase() && /[A-Z]/.test(s);
}

function serializeHeading(heading) {
  const text = trim(heading);
  if (!text) return "";
  // Fountain prefers scene headings ALL CAPS; we uppercase defensively
  // unless the caller already did.
  return isAllUpper(text) ? text : text.toUpperCase();
}

function serializeAction(line) {
  const text = trim(line.text);
  if (!text) return "";
  // Fountain treats a line of all-caps as a character cue; if a writer
  // intends action that's all-caps (rare but possible), force it with
  // a leading `!`. Caller-supplied action text is taken as-is unless
  // it would be ambiguous.
  if (isAllUpper(text) && !text.includes("\n")) {
    return `!${text}`;
  }
  return text;
}

function serializeCharacter(line) {
  let name = trim(line.name);
  if (!name) return "";
  const explicitlyForced = name.startsWith("@");
  if (explicitlyForced) name = name.slice(1).trim();
  const explicitlyDual = /\^\s*$/.test(name);
  if (explicitlyDual) name = name.replace(/\s*\^\s*$/, "").trim();
  if (!name) return "";
  let cue = isAllUpper(name) ? name : name.toUpperCase();
  const ambiguous = /^(?:INT\.|EXT\.|INT\/EXT|EST\.|[!~.>@=#])/.test(cue)
    || /\bTO:$/.test(cue);
  if (line.forced === true || explicitlyForced || ambiguous) cue = `@${cue}`;
  if (line.dualDialogue === true || explicitlyDual) cue = `${cue} ^`;
  const out = [cue];
  if (line.parenthetical) {
    const p = trim(line.parenthetical).replace(/^\(|\)$/g, "");
    if (p) out.push(`(${p})`);
  }
  const dialogue = Array.isArray(line.dialogue)
    ? line.dialogue.map(trim).filter(Boolean).join("\n")
    : trim(line.dialogue);
  if (dialogue) {
    out.push(dialogue);
  } else {
    // Empty dialogue under a cue would produce a dangling cue —
    // drop the cue.
    return "";
  }
  return out.join("\n");
}

function serializeTransition(line) {
  const text = trim(line.text);
  if (!text) return "";
  // Fountain detects transitions as ALL-CAPS lines ending with "TO:";
  // we force the convention so they round-trip.
  const upper = text.toUpperCase();
  if (line.forced === true) return `> ${upper.replace(/^>\s*/, "")}`;
  return upper.endsWith("TO:") ? upper : `${upper.replace(/:$/, "")} TO:`;
}

function serializeCentered(line) {
  const text = trim(line.text).replace(/^>\s*/, "").replace(/\s*<$/, "").trim();
  return text ? `> ${text} <` : "";
}

function serializeLyrics(line) {
  const text = trim(line.text).replace(/^~/, "").trim();
  return text ? `~${text}` : "";
}

function serializeSection(line) {
  const text = trim(line.text);
  if (!text) return "";
  const level = Math.max(1, Math.min(3, Number(line.level) || 1));
  return `${"#".repeat(level)} ${text}`;
}

function serializeSynopsis(line) {
  const text = trim(line.text);
  if (!text) return "";
  return `= ${text}`;
}

function serializeLine(line) {
  if (!line || typeof line !== "object") return "";
  switch (line.kind) {
    case "action":     return serializeAction(line);
    case "character":  return serializeCharacter(line);
    case "transition": return serializeTransition(line);
    case "centered":   return serializeCentered(line);
    case "lyrics":     return serializeLyrics(line);
    case "section":    return serializeSection(line);
    case "synopsis":   return serializeSynopsis(line);
    case "blank":      return "";
    default:           return "";
  }
}

function serializeScene(scene) {
  if (!scene || typeof scene !== "object") return "";
  const out = [];
  const heading = serializeHeading(scene.heading);
  if (heading) out.push(heading);
  if (Array.isArray(scene.lines)) {
    for (const line of scene.lines) {
      const text = serializeLine(line);
      if (text) out.push(text);
    }
  }
  return out.join("\n\n");
}

function exportToFountain(screenplay = {}) {
  if (!screenplay || typeof screenplay !== "object") return "";
  const titleBlock = serializeTitlePage(screenplay.title);
  const scenes = Array.isArray(screenplay.scenes) ? screenplay.scenes : [];
  const body = scenes
    .map(serializeScene)
    .filter(Boolean)
    .join("\n\n");
  return `${titleBlock}${body}`.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export {
  exportToFountain,
  serializeTitlePage,
  serializeHeading,
  serializeAction,
  serializeCharacter,
  serializeTransition,
  serializeCentered,
  serializeLyrics,
  serializeSection,
  serializeSynopsis,
  serializeScene,
};
