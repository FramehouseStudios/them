import test from "node:test"; import assert from "node:assert/strict";
import { shouldSuggest, buildSuggestion } from "../lib/clementine/clementine_intuition.js";
test("shouldSuggest high pressure", ()=>{ assert.equal(shouldSuggest({ project:{characterContexts:[{arcState:{pressure:6}}]}, draft:"x".repeat(100) }), true); });
test("buildSuggestion", ()=>{ const s=buildSuggestion({ project:{characterContexts:[{name:"John", arcState:{pressure:5}}]}, parsed:{genre:"horror", influences:{tones:["tense"]}}, draft:"INT." }); assert.ok(s.xSuggestion.includes("John")); });
