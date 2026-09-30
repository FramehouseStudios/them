import assert from "node:assert/strict";
import test from "node:test";

import { isDistilledMemoryTemplate } from "../lib/distilled_memory_templates.js";

test("[distilled-memory-templates] memory's own templates are recognised; story is not", () => {
  for (const line of [
    "Nora is under pressure from: Teddy mumbles in his sleep.",
    "Who controls the photograph?",
    "Window returns as proof or cost in Act III.",
    "Force the consequence of: She keeps moving.",
    "Make Nora choose a new tactic under pressure from rain.",
    "Nora must decide what the jar costs them.",
  ]) {
    assert.equal(isDistilledMemoryTemplate(line), true, line);
  }
  for (const line of [
    "Tolliver controls the swing vote.",
    "Who told you?",
    "Nora trades the reading for a floor vote.",
  ]) {
    assert.equal(isDistilledMemoryTemplate(line), false, line);
  }
});
