// T-screenplay-export-markdown — pure Fountain-style draft → Markdown
// projection. Used by POST /screenplay/export when format=md|markdown.
//
// Rules (mirrors the FDX paragraph-typing rules in index.js so a given
// line ends up in the same logical role in both outputs):
//
//   - "INT./EXT./EST./..." prefix          → "## ..." (Scene Heading)
//   - "CUT TO:" / "FADE OUT." / etc.       → "> ..." (Transition)
//   - "(softly)" parenthetical             → "*...*" (Parenthetical)
//   - Short, all-caps line, no ":" or "."  → "**...**" (Character)
//   - Line following Character|Paren|Dialogue
//     when not one of the above            → plain text (Dialogue)
//   - Anything else                        → plain text (Action)

function paragraphTypeForLine(trimmed, previousType) {
  if (!trimmed) return null;
  if (/^(INT|EXT|EST|INT\/EXT|I\/E)\./i.test(trimmed)) return "Scene Heading";
  if (/^(?:CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|WIPE TO:|INTERCUT WITH:|FADE IN:|FADE IN ON:|FADE OUT:|FADE OUT\.|FADE TO BLACK:|FADE TO BLACK\.|SMASH TO BLACK:|THE END)$/i.test(trimmed)) {
    return "Transition";
  }
  if (/^\([^)\n]+\)$/.test(trimmed)) return "Parenthetical";
  if (
    trimmed === trimmed.toUpperCase() &&
    trimmed.length <= 32 &&
    /[A-Z]/.test(trimmed) &&
    !trimmed.includes(":") &&
    !trimmed.includes(".")
  ) {
    return "Character";
  }
  if (previousType === "Character" || previousType === "Parenthetical" || previousType === "Dialogue") {
    return "Dialogue";
  }
  return "Action";
}

function exportScreenplayToMarkdown(draft) {
  if (typeof draft !== "string") return "";
  const lines = draft.replace(/\r\n/g, "\n").split("\n");
  const mdLines = [];
  let previousType = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (mdLines.length && mdLines[mdLines.length - 1] !== "") mdLines.push("");
      previousType = null;
      continue;
    }
    const type = paragraphTypeForLine(trimmed, previousType);
    if (type === "Scene Heading") mdLines.push(`## ${trimmed}`);
    else if (type === "Character") mdLines.push(`**${trimmed}**`);
    else if (type === "Parenthetical") mdLines.push(`*${trimmed}*`);
    else if (type === "Transition") mdLines.push(`> ${trimmed}`);
    else mdLines.push(trimmed);
    previousType = type;
  }
  return mdLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "") + "\n";
}

export { exportScreenplayToMarkdown, paragraphTypeForLine };
