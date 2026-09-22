import test from "node:test";
import assert from "node:assert/strict";
import { inferScreenplayTask, buildModelPrompt } from "../lib/prompt_assembly.js";

test("[dialogue-notes] a line read for judgment is dialogue_notes, not scene_doctor or a punch-up", () => {
  for (const hint of [
    "Notes on this line: I'm so angry at you right now.",
    "Does this line work? He says: I'm scared we're going to lose the house.",
    "Is this exchange too on the nose?",
    "Here's my line. She says: You betrayed me and I can't trust you anymore.",
    "Thoughts on the dialogue in the porch scene?",
    "Read this line: I don't want to die alone.",
  ]) {
    const task = inferScreenplayTask(hint);
    assert.equal(task.intent, "dialogue_notes", hint);
    assert.equal(task.label, "Dialogue Notes");
    assert.match(task.output, /one rewritten line in quotes/);
  }
});

test("[dialogue-notes] explicit rewrite and punch-up asks keep their intents", () => {
  assert.equal(inferScreenplayTask("Punch up this exchange so it has more subtext.").intent, "dialogue_punchup");
  assert.equal(inferScreenplayTask("Rewrite this line so it's sharper.").intent, "rewrite_scene");
  assert.equal(inferScreenplayTask("Give me scene doctor notes.").intent, "scene_doctor");
  assert.equal(inferScreenplayTask("Scene doctor this kitchen confrontation and tell me what's not working.").intent, "scene_doctor");
  assert.equal(inferScreenplayTask("Continue the scene.").intent, "continue_script");
});

test("[dialogue-notes] the task block carries the notes contract and the dialogue loop", () => {
  const prompt = buildModelPrompt({
    persona: "You are Clementine.",
    creativeMemory: null,
    userInput: "",
    sessionContext: { project_id: "notes-1", draft_excerpt: "INT. PORCH - NIGHT" },
    screenplayTask: inferScreenplayTask("Notes on this line: I'm so angry at you right now."),
  });
  assert.match(prompt, /intent: dialogue_notes/);
  assert.match(prompt, /dialogue_notes_contract:/);
  assert.match(prompt, /exactly one rewritten line in quotes/);
  assert.match(prompt, /never praise a line that announces its feeling/i);
  assert.match(prompt, /dialogue_loop:/);
  assert.match(prompt, /tactic_first/);
});
