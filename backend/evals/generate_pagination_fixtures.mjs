#!/usr/bin/env node
// Writes docs/pagination/fixtures.json from the backend engine. The Swift
// engine's tests read the same file, so a rule change here must be deliberate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paginateScreenplay } from "../lib/screenplay_pagination.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, "..", "..", "docs", "pagination", "fixtures.json");

const longSpeech = Array.from({ length: 9 }, (_, i) => `Sentence ${i + 1} of a speech that keeps going past the foot of the page because he cannot stop.`).join(" ");
const drafts = {
  title_only: { linesPerPage: 54, draft: "Title: ASHES\nAuthor: Zoë Chen\n\n" },
  title_body_crlf: { linesPerPage: 54, draft: "Title: ASHES\r\nAuthor: Zoë Chen\r\n    \r\nTIME: Midnight.\r\n\r\nINT. CAFÉ - DAY\r\n\r\nZoë waits. 👩🏽‍🚀\r\n" },
  title_body_nested_title: { linesPerPage: 54, draft: "Title: ASHES\n\nTitle: This is a sign in the scene.\n\nThe camera keeps moving." },
  raw_lines_120_at_55: { linesPerPage: 55, draft: Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join("\n") },
  kitchen_at_24: {
    linesPerPage: 24,
    draft: [
      "INT. KITCHEN - NIGHT", "", "JUNE, 30s, rinses a single cup. The tap coughs.", "",
      "JUNE", "(quiet)", "You came back.", "", "MARCUS", "For the cup.", "",
      ...Array.from({ length: 6 }, (_, i) => ["MARCUS", `I could tell you about the road about the road about the road and the ${i} nights I counted them and the way the light goes.`, ""]).flat(),
      "CUT TO:", "", "EXT. PORCH - DAWN", "", "The light is wrong.",
    ].join("\n"),
  },
  split_speech_at_24: {
    linesPerPage: 24,
    draft: [
      "INT. COURTROOM HALLWAY - DAY", "",
      "SIMONE waits by the vending machine. ANDRE holds a sandwich he cannot eat.", "",
      "SIMONE", "Walk back in.", "", "ANDRE", "He's my cousin.", "",
      "Beat. She does not move.", "", "The clock above the door clicks over.", "",
      "SIMONE", longSpeech, "",
      "ANDRE", "Okay.",
    ].join("\n"),
  },
  crlf_and_trim: { linesPerPage: 54, draft: "  INT. GARAGE - NIGHT\r\n\r\nThe engine runs.\r\n\r\nOWEN\r\nSign it.\r\n  " },
  single_line: { linesPerPage: 54, draft: "one line" },
  leading_blank_source_ranges: { linesPerPage: 54, draft: "\n\nINT. ROOM - DAY\n\nMara waits.\n" },
  cr_only_source_ranges: { linesPerPage: 54, draft: "\r\rINT. ROOM - DAY\r\rMara waits.\r" },
  unicode_graphemes: { linesPerPage: 24, draft: ["INT. 船 - NIGHT", "", "李", ("👩🏽‍🚀 e\u0301 界\u00a0listen ").repeat(40)].join("\n") },
  multi_page_speech: { linesPerPage: 24, draft: [...Array.from({length: 14}, (_, i) => `Action line ${i + 1}.`), "", "MARA", Array.from({length: 200}, (_, i) => `Sentence ${i + 1} reaches the radio.`).join(" ")].join("\n") },
};

const fixtures = Object.entries(drafts).map(([id, { draft, linesPerPage }]) => {
  const result = paginateScreenplay(draft, { linesPerPage });
  return {
    id,
    linesPerPage,
    draft,
    expected: {
      lineCount: result.lineCount,
      renderedLineCount: result.renderedLineCount,
      pages: result.pages.map((p) => ({
        page: p.page,
        startLine: p.startLine,
        endLine: p.endLine,
        lineCount: p.lineCount,
        lines: p.lines,
        firstLine: p.lines[0] ?? "",
        lastLine: p.lines[p.lines.length - 1] ?? "",
        moreCount: p.lines.filter((l) => l === "(MORE)").length,
        contdCount: p.lines.filter((l) => l.endsWith("(CONT'D)")).length,
      })),
    },
  };
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ generatedBy: "backend/evals/generate_pagination_fixtures.mjs", fixtures }, null, 2)}\n`);
for (const f of fixtures) {
  console.log(`${f.id}: ${f.expected.pages.length} pages, ${f.expected.renderedLineCount} rendered lines; ` + f.expected.pages.map((p) => `p${p.page} ${p.startLine}-${p.endLine}(${p.lineCount})${p.moreCount ? " MORE" : ""}${p.contdCount ? " CONT'D" : ""}`).join(" | "));
}
console.log(`wrote ${out}`);
