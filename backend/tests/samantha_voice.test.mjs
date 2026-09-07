import test from "node:test"; import assert from "node:assert/strict";
import { getWriterVoiceProfile, updateWriterVoiceProfile, shouldAsk, buildVulnerabilityAsk } from "../lib/clementine/samantha_voice.js";
test("voice profile learns", ()=>{ const p=getWriterVoiceProfile("u1"); const before=p.learned; updateWriterVoiceProfile("u1",{sample:"hi"}); assert.ok(getWriterVoiceProfile("u1").learned>=before); });
test("vulnerability ask when low confidence", ()=>{ const ask=buildVulnerabilityAsk({ project:{characterContexts:[{name:"John"}]}, parsed:{characters:["John"]}, confidence:0.4 }); assert.ok(ask.question.includes("not sure")); });
