import test from "node:test";
import assert from "node:assert/strict";
import {
  STUDIO_ACTIONS, STUDIO_TABS,
  validateStudioAction, assertValidStudioAction, buildStudioAction,
  mapVoiceIntentToStudioAction, parseStudioAction
} from "../lib/clementine/studio_actions.js";

test("constants: 3 actions and tabs include coverage/beats/mentor", () => {
  assert.deepEqual([...STUDIO_ACTIONS].sort(), ["openStudio","refreshCoverage","selectBeat"].sort());
  assert.ok(STUDIO_TABS.includes("coverage"));
  assert.ok(STUDIO_TABS.includes("beats"));
  assert.ok(STUDIO_TABS.includes("mentor"));
});

test("validateStudioAction openStudio valid and invalid tab", () => {
  assert.equal(validateStudioAction({ type:"openStudio" }).valid, true);
  assert.equal(validateStudioAction({ type:"openStudio", tab:"coverage" }).valid, true);
  assert.equal(validateStudioAction({ type:"openStudio", tab:"mentor" }).valid, true);
  assert.equal(validateStudioAction({ type:"openStudio", tab:"bogus" }).valid, false);
  assert.equal(validateStudioAction({ type:"openStudio", tab:"BEATS" }).valid, true); // case-insensitive
  assert.equal(validateStudioAction(null).valid, false);
  assert.equal(validateStudioAction({}).valid, false);
  assert.equal(validateStudioAction({ type:"unknown" }).valid, false);
});

test("validateStudioAction refreshCoverage", () => {
  assert.equal(validateStudioAction({ type:"refreshCoverage" }).valid, true);
  assert.equal(validateStudioAction({ type:"refreshCoverage", projectId:"p123" }).valid, true);
  assert.equal(validateStudioAction({ type:"refreshCoverage", projectId:"  " , tab:"coverage"}).valid, true); // whitespace projectId treated as absent
  assert.equal(validateStudioAction({ type:"selectBeat" }).valid, false);
});

test("validateStudioAction selectBeat requires beatId and validates beats list", () => {
  assert.equal(validateStudioAction({ type:"selectBeat" }).valid, false);
  assert.equal(validateStudioAction({ type:"selectBeat", beatId:"" }).valid, false);
  assert.equal(validateStudioAction({ type:"selectBeat", beatId:"b1" }).valid, true);
  assert.equal(validateStudioAction({ type:"selectBeat", beatId:"b1", beatIndex: 1 }).valid, true);
  assert.equal(validateStudioAction({ type:"selectBeat", beatId:"b1", beatIndex: 0 }).valid, false);
  assert.equal(validateStudioAction({ type:"selectBeat", beatId:"b1", beatIndex: 91 }).valid, false);
  // beats list validation
  const beats = [{id:"b1"}, {id:"b2"}, {id:"b3"}];
  assert.equal(validateStudioAction({ type:"selectBeat", beatId:"b2", _beats: beats }).valid, true);
  assert.equal(validateStudioAction({ type:"selectBeat", beatId:"b9", _beats: beats }).valid, false);
  assert.equal(validateStudioAction({ type:"selectBeat", beatId:"x".repeat(65) }).valid, false);
});

test("assertValidStudioAction throws on invalid", () => {
  assert.throws(() => assertValidStudioAction({ type:"openStudio", tab:"bad" }), /invalid tab/);
  assert.doesNotThrow(() => assertValidStudioAction({ type:"openStudio" }));
});

test("buildStudioAction throws/succeeds", () => {
  assert.deepEqual(buildStudioAction("openStudio"), { type:"openStudio" });
  assert.deepEqual(buildStudioAction("refreshCoverage", { projectId:"p1" }), { type:"refreshCoverage", projectId:"p1" });
  assert.deepEqual(buildStudioAction("selectBeat", { beatId:"b3" }), { type:"selectBeat", beatId:"b3" });
  assert.throws(() => buildStudioAction("selectBeat", {}), /beatId/);
  assert.throws(() => buildStudioAction("bogus"), /unknown action/);
});

test("mapVoiceIntentToStudioAction openStudio heuristics", () => {
  assert.deepEqual(mapVoiceIntentToStudioAction("open studio"), { type:"openStudio" });
  assert.deepEqual(mapVoiceIntentToStudioAction("show studio"), { type:"openStudio" });
  assert.deepEqual(mapVoiceIntentToStudioAction("open coverage tab"), { type:"openStudio", tab:"coverage" });
  assert.deepEqual(mapVoiceIntentToStudioAction("show beats"), { type:"openStudio", tab:"beats" });
  assert.deepEqual(mapVoiceIntentToStudioAction("go to mentor tab"), { type:"openStudio", tab:"mentor" });
  assert.equal(mapVoiceIntentToStudioAction(""), null);
  assert.equal(mapVoiceIntentToStudioAction("hello there"), null);
});

test("mapVoiceIntentToStudioAction refreshCoverage", () => {
  const a = mapVoiceIntentToStudioAction("refresh coverage");
  assert.equal(a.type, "refreshCoverage");
  assert.equal(mapVoiceIntentToStudioAction("update coverage").type, "refreshCoverage");
  assert.equal(mapVoiceIntentToStudioAction("reload coverage").type, "refreshCoverage");
  // with projectId opts
  const b = mapVoiceIntentToStudioAction("refresh coverage", { projectId:"p9" });
  assert.equal(b.projectId, "p9");
});

test("mapVoiceIntentToStudioAction selectBeat", () => {
  assert.deepEqual(mapVoiceIntentToStudioAction("select beat 3"), { type:"selectBeat", beatId:"b3" });
  assert.deepEqual(mapVoiceIntentToStudioAction("go to beat 5"), { type:"selectBeat", beatId:"b5" });
  assert.deepEqual(mapVoiceIntentToStudioAction("open beat b2"), { type:"selectBeat", beatId:"b2" });
  assert.deepEqual(mapVoiceIntentToStudioAction("beat 1"), { type:"selectBeat", beatId:"b1" });
  // beats context validation
  const beats = [{id:"b1"}, {id:"b2"}];
  assert.equal(mapVoiceIntentToStudioAction("select beat 9", { beats }), null);
  assert.deepEqual(mapVoiceIntentToStudioAction("select beat 1", { beats }), { type:"selectBeat", beatId:"b1" });
  // hint-based
  assert.deepEqual(mapVoiceIntentToStudioAction("irrelevant", { intent:"selectBeat", beatId:"b2" }), { type:"selectBeat", beatId:"b2" });
  assert.equal(mapVoiceIntentToStudioAction("irrelevant", { intent:"selectBeat" }), null);
});

test("parseStudioAction handles string and object", () => {
  assert.deepEqual(parseStudioAction("open studio"), { type:"openStudio" });
  assert.deepEqual(parseStudioAction({ type:"openStudio" }), { type:"openStudio" });
  assert.deepEqual(parseStudioAction({ type:"selectBeat", beatId:"b1" }), { type:"selectBeat", beatId:"b1" });
  assert.equal(parseStudioAction({ type:"selectBeat" }), null);
  assert.equal(parseStudioAction(null), null);
  assert.equal(parseStudioAction({ utterance:"refresh coverage" }).type, "refreshCoverage");
  assert.equal(parseStudioAction(123), null);
});

test("backend/index.js gate stays at 33626", async () => {
  const fs = await import("node:fs");
  const text = fs.readFileSync(new URL("../../backend/index.js", import.meta.url),"utf8");
  const lines = text.split("\n").length;
  // allow wc -l style: count newlines exact
  const wc = text.length===0?0:text.split("\n").length - (text.endsWith("\n")?0:0) + (text.endsWith("\n")?0:1);
  // simpler: use file line count via reading and counting \n
  let c=0; for(let i=0;i<text.length;i++) if(text[i]==="\n") c++;
  if(text.length>0 && !text.endsWith("\n")) c+=1;
  assert.equal(c, 33626);
});
