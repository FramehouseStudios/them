// T-screenplay-import-fountain — pure Fountain parser.
//
// Reverse of T-fountain-export-endpoint. Takes a Fountain-formatted
// string and produces the canonical screenplay shape the export
// endpoint accepts as input:
//
//   {
//     title?: { title, credit?, author?, source?, draftDate?, contact?, notes? },
//     scenes: [
//       {
//         heading?: string,
//         lines: [
//           { kind: "action", text },
//           { kind: "character", name, parenthetical?, dialogue: string[] },
//           { kind: "transition", text },
//           { kind: "section", level, text },
//           { kind: "synopsis", text }
//         ]
//       }
//     ]
//   }
//
// Round-trip target: exportToFountain(importFromFountain(text)) ≈ text
// (lossy on whitespace + un-escaped formatting; lossless on structure).
//
// Spec: https://fountain.io/syntax — V1 covers the common case:
// title pages, scene headings (INT./EXT.), action, character cues +
// parentheticals + dialogue, transitions ending in TO:, # sections,
// = synopses, and `!` forced action.

const TITLE_FIELDS = Object.freeze({
  "title": "title",
  "credit": "credit",
  "author": "author",
  "authors": "author",
  "source": "source",
  "draft date": "draftDate",
  "contact": "contact",
  "notes": "notes",
});

function isSceneHeading(line) {
  if (!line) return false;
  const trimmed = line.trim();
  return /^(INT\.|EXT\.|INT\/EXT|EST\.|INT |EXT )/i.test(trimmed)
    || /^\./.test(trimmed); // Fountain forced scene heading
}

function isTransition(line) {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  // ALL CAPS ending in "TO:" or beginning with ">"
  if (/^> /.test(trimmed)) return true;
  if (trimmed === trimmed.toUpperCase() && /\bTO:$/.test(trimmed)) return true;
  return false;
}

function isCharacterCue(line, nextLine) {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Must be ALL CAPS with a letter; cannot be a scene heading or
  // transition; the next non-empty line must be dialogue or
  // parenthetical (i.e. non-empty and not another cue / heading).
  if (isSceneHeading(trimmed) || isTransition(trimmed)) return false;
  if (!/[A-Z]/.test(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  // Allow trailing parenthetical extension on the cue line ("JUNE (V.O.)").
  const cueRegex = /^[A-Z][A-Z0-9 .'\-()@]+$/;
  if (!cueRegex.test(trimmed)) return false;
  if (typeof nextLine !== "string" || !nextLine.trim()) return false;
  return true;
}

function isParenthetical(line) {
  if (!line) return false;
  const trimmed = line.trim();
  return /^\(.*\)$/.test(trimmed);
}

function parseTitlePage(rawLines) {
  // Title page is the leading block where every line either contains
  // ":" (a field) or starts with indentation (a continuation). Ends
  // at the first blank line followed by non-title content (scene
  // heading, action, etc).
  let i = 0;
  const out = {};
  let currentKey = null;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (line === "") {
      // Look ahead: blank line ends title page only when followed by
      // non-title content (which we treat as anything that's not a
      // "Field: value" pattern).
      const next = rawLines[i + 1];
      if (next === undefined) { i += 1; break; }
      if (/^[A-Za-z][A-Za-z ]*:/.test(next)) {
        i += 1;
        continue;
      }
      i += 1; // skip the blank
      break;
    }
    const m = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
    if (m) {
      const rawKey = m[1].toLowerCase();
      const mapped = TITLE_FIELDS[rawKey];
      if (!mapped) {
        // Unknown title field — bail out; everything was probably
        // body, not title.
        if (Object.keys(out).length === 0) return { title: null, consumedLineCount: 0 };
        currentKey = null;
        i += 1;
        continue;
      }
      currentKey = mapped;
      out[mapped] = m[2].trim();
      i += 1;
      continue;
    }
    if (currentKey && /^ {2,}|\t/.test(line)) {
      // Indented continuation.
      out[currentKey] = `${out[currentKey] || ""}\n${line.trim()}`;
      i += 1;
      continue;
    }
    // Not a title field and not a continuation — we're past title page.
    break;
  }
  if (Object.keys(out).length === 0) return { title: null, consumedLineCount: 0 };
  return { title: out, consumedLineCount: i };
}

function parseBody(rawLines, startIdx) {
  const scenes = [];
  let currentScene = null;
  const ensureScene = () => {
    if (!currentScene) {
      currentScene = { heading: "", lines: [] };
      scenes.push(currentScene);
    }
    return currentScene;
  };
  let i = startIdx;
  while (i < rawLines.length) {
    const line = rawLines[i] || "";
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isSceneHeading(trimmed)) {
      const heading = trimmed.replace(/^\./, ""); // strip forced-heading dot
      currentScene = { heading: heading.toUpperCase(), lines: [] };
      scenes.push(currentScene);
      i += 1;
      continue;
    }

    // # section
    if (/^#{1,3} /.test(trimmed)) {
      const m = trimmed.match(/^(#{1,3}) +(.*)$/);
      if (m) {
        ensureScene().lines.push({ kind: "section", level: m[1].length, text: m[2] });
      }
      i += 1;
      continue;
    }

    // = synopsis
    if (trimmed.startsWith("= ")) {
      ensureScene().lines.push({ kind: "synopsis", text: trimmed.slice(2) });
      i += 1;
      continue;
    }

    // > transition <
    if (isTransition(trimmed)) {
      const text = trimmed.replace(/^> /, "").replace(/ <$/, "");
      ensureScene().lines.push({ kind: "transition", text });
      i += 1;
      continue;
    }

    // ! forced action
    if (trimmed.startsWith("!")) {
      ensureScene().lines.push({ kind: "action", text: trimmed.slice(1).trim() });
      i += 1;
      continue;
    }

    // Character cue?
    if (isCharacterCue(line, rawLines[i + 1])) {
      // Parse cue + optional parenthetical + dialogue lines.
      let cueLine = trimmed;
      let parenthetical = null;
      // Trailing parenthetical extension on the cue itself: "JUNE (V.O.)"
      const parenInCue = cueLine.match(/^(.+?)\s*(\([^)]+\))\s*$/);
      let name = cueLine;
      if (parenInCue) {
        name = parenInCue[1];
        parenthetical = parenInCue[2].slice(1, -1).trim();
      }
      const dialogue = [];
      i += 1;
      while (i < rawLines.length) {
        const dLine = rawLines[i];
        const dTrim = (dLine || "").trim();
        if (!dTrim) break;
        // Parenthetical between dialogue lines.
        if (isParenthetical(dTrim)) {
          if (parenthetical === null) {
            parenthetical = dTrim.slice(1, -1).trim();
          } else {
            // Multiple parentheticals: append to dialogue verbatim
            // (rare; lossy but preserves the text).
            dialogue.push(dTrim);
          }
          i += 1;
          continue;
        }
        // A new cue / heading / transition ends dialogue.
        if (isSceneHeading(dTrim) || isTransition(dTrim) || isCharacterCue(dLine, rawLines[i + 1])) {
          break;
        }
        dialogue.push(dTrim);
        i += 1;
      }
      const entry = { kind: "character", name, dialogue };
      if (parenthetical) entry.parenthetical = parenthetical;
      ensureScene().lines.push(entry);
      continue;
    }

    // Default: action.
    ensureScene().lines.push({ kind: "action", text: trimmed });
    i += 1;
  }
  return scenes.filter((s) => s.heading || (s.lines && s.lines.length));
}

function importFromFountain(text) {
  const raw = typeof text === "string" ? text : "";
  // Normalize line endings.
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const { title, consumedLineCount } = parseTitlePage(lines);
  const scenes = parseBody(lines, consumedLineCount);
  const out = { scenes };
  if (title) out.title = title;
  return out;
}

export {
  importFromFountain,
  parseTitlePage,
  parseBody,
  isSceneHeading,
  isTransition,
  isCharacterCue,
  isParenthetical,
};
