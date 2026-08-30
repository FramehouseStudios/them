import assert from "node:assert/strict";
import test from "node:test";

import { normalizeStudioTextOutput } from "../lib/studio_text_output.js";

test("[studio-text] preserves Fountain headings, cues, dialogue, and blank lines", () => {
  const source = "INT. TERMINAL - NIGHT\r\n\r\nMARA   \r\nKeep moving.\r\n\r\nEli follows.";
  assert.equal(
    normalizeStudioTextOutput(source),
    "INT. TERMINAL - NIGHT\n\nMARA\nKeep moving.\n\nEli follows.",
  );
});

test("[studio-text] bounds output without flattening the surviving page", () => {
  assert.equal(normalizeStudioTextOutput("MARA\nOne.\n\nELI\nTwo.", 11), "MARA\nOne.");
});
