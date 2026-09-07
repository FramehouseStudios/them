import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStudioCapabilities,
  buildStudioControlsBlock,
  extractStudioActions,
  inferSpokenActions,
  encodeStudioActionsHeader,
  STUDIO_TABS,
  REVISION_COLORS,
  MAX_ACTIONS_PER_TURN,
} from "../lib/studio_actions.js";

const caps = parseStudioCapabilities(JSON.stringify({
  tabs: ["draft", "beats", "craft", "outline", "them", "saved"],
  draft_tools_sections: ["pages", "revisions", "snapshots", "saved"],
  sidebar_sections: ["projects", "files"],
  revision_colors: ["white", "blue", "pink", "yellow", "green", "goldenrod", "buff", "salmon", "cherry"],
  scene_labels: ["INT. KITCHEN - NIGHT", "EXT. PORCH - DAWN", "INT. DINER - NIGHT"],
  current_tab: "them",
  has_project: true,
  has_draft: true,
  studio_open: true,
}));

test("[studio-actions] capabilities parse with defaults and reject junk", () => {
  assert.equal(caps.enabled, true);
  assert.deepEqual(caps.tabs, [...STUDIO_TABS]);
  assert.equal(caps.currentTab, "them");
  assert.equal(caps.sceneLabels.length, 3);
  assert.equal(parseStudioCapabilities("").enabled, false);
  assert.equal(parseStudioCapabilities("{not json").enabled, false);
  assert.equal(parseStudioCapabilities(undefined).enabled, false);
  const partial = parseStudioCapabilities({ tabs: ["beats", "nonsense"], revision_colors: ["pink"], has_draft: false });
  assert.deepEqual(partial.tabs, ["beats"]);
  assert.deepEqual(partial.revisionColors, ["pink"]);
  assert.equal(partial.hasDraft, false);
  assert.deepEqual(parseStudioCapabilities({ tabs: ["nonsense"] }).tabs, [...STUDIO_TABS], "all-junk lists fall back to the full set");
});

test("[studio-actions] the controls block names only what the app offers and the tag syntax", () => {
  const block = buildStudioControlsBlock(caps);
  assert.match(block, /STUDIO CONTROLS/);
  assert.match(block, /Tabs: draft, beats, craft, outline, them, saved \(open now: them\)/);
  assert.match(block, /Revision colors, in production order: white, blue, pink/);
  assert.match(block, /"INT\. KITCHEN - NIGHT"/);
  assert.match(block, /\[\[studio: save_revision color=pink\]\]/);
  assert.match(block, /never read them aloud/);
  assert.equal(buildStudioControlsBlock({ enabled: false }), "");
});

test("[studio-actions] tags are stripped from speech, validated, and emitted", () => {
  const reply = "Saving this pass as a pink revision, and I'll open the beats so we can pick the next turn.\n\n[[studio: save_revision color=pink]]\n[[studio: open_tab tab=beats]]";
  const r = extractStudioActions(reply, caps);
  assert.equal(r.spokenText, "Saving this pass as a pink revision, and I'll open the beats so we can pick the next turn.");
  assert.equal(r.stripped, true);
  assert.deepEqual(r.actions, [
    { type: "save_revision", color: "pink", source: "tag" },
    { type: "open_tab", tab: "beats", source: "tag" },
  ]);
  assert.deepEqual(r.rejected, []);
  const header = encodeStudioActionsHeader(r.actions);
  assert.deepEqual(JSON.parse(decodeURIComponent(header)), r.actions);
});

test("[studio-actions] anything the app does not have is rejected, never guessed", () => {
  const r = extractStudioActions("Opening the timeline tab and saving in teal. [[studio: open_tab tab=timeline]] [[studio: save_revision color=teal]] [[studio: fly]] [[studio: jump_to_scene scene=\"INT. BASEMENT\"]]", caps);
  assert.deepEqual(r.actions, []);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["unknown_tab:timeline", "unknown_color:teal", "unknown_type:fly", "unknown_scene:INT. BASEMENT"]);
  assert.equal(r.spokenText, "Opening the timeline tab and saving in teal.");
  const noDraft = extractStudioActions("[[studio: save_revision color=pink]] [[studio: start_rewrite]]", parseStudioCapabilities({ has_draft: false }));
  assert.deepEqual(noDraft.rejected.map((x) => x.reason), ["no_draft", "no_draft"]);
});

test("[studio-actions] scene labels resolve exactly or by a single unambiguous match", () => {
  assert.deepEqual(extractStudioActions("[[studio: jump_to_scene scene=\"int. kitchen - night\"]]", caps).actions[0], { type: "jump_to_scene", scene: "INT. KITCHEN - NIGHT", source: "tag" });
  assert.deepEqual(extractStudioActions("[[studio: jump_to_scene scene=porch]]", caps).actions[0], { type: "jump_to_scene", scene: "EXT. PORCH - DAWN", source: "tag" });
  assert.equal(extractStudioActions("[[studio: jump_to_scene scene=night]]", caps).rejected[0].reason, "unknown_scene:night", "two scenes match 'night'");
  const rewrite = extractStudioActions("[[studio: start_rewrite scope=scene scene=diner]]", caps).actions[0];
  assert.deepEqual(rewrite, { type: "start_rewrite", scope: "scene", scene: "INT. DINER - NIGHT", source: "tag" });
});

test("[studio-actions] unambiguous spoken commitments are inferred when the tag is missing", () => {
  assert.deepEqual(inferSpokenActions("Okay, I'll start a rewrite on the diner scene.").map((a) => a.type), ["start_rewrite"]);
  assert.deepEqual(inferSpokenActions("Saving a revision in pink so we can compare.").map((a) => [a.type, a.args.color]), [["save_revision", "pink"]]);
  assert.deepEqual(inferSpokenActions("Which story beat would you like to change?").map((a) => a.type), ["choose_beat"]);
  assert.deepEqual(inferSpokenActions("Pulling up the beats tab now.").map((a) => [a.type, a.args.tab]), [["open_tab", "beats"]]);
  assert.deepEqual(inferSpokenActions("I saved the draft."), [], "past tense is not a commitment");
  assert.deepEqual(inferSpokenActions("The porch light is wrong."), []);
  const r = extractStudioActions("Saving a revision in pink.", caps);
  assert.deepEqual(r.actions, [{ type: "save_revision", color: "pink", source: "spoken" }]);
  const tagged = extractStudioActions("Saving a revision in pink. [[studio: save_revision color=blue]]", caps);
  assert.deepEqual(tagged.actions, [{ type: "save_revision", color: "blue", source: "tag" }], "an explicit tag wins over the spoken inference for the same type");
});

test("[studio-actions] limits, dedupe, and disabled capabilities", () => {
  const many = Array.from({ length: 6 }, () => "[[studio: open_tab tab=beats]] [[studio: open_tab tab=craft]] [[studio: open_tab tab=saved]]").join(" ");
  const r = extractStudioActions(many, caps);
  assert.equal(r.actions.length, 3, "duplicates collapse");
  const five = extractStudioActions("[[studio: open_tab tab=beats]] [[studio: open_tab tab=craft]] [[studio: open_tab tab=saved]] [[studio: open_tab tab=outline]] [[studio: open_tab tab=draft]]", caps);
  assert.equal(five.actions.length, MAX_ACTIONS_PER_TURN);
  assert.equal(five.rejected[0].reason, "too_many");
  const off = extractStudioActions("Hi there. [[studio: open_tab tab=beats]]", { enabled: false });
  assert.equal(off.spokenText, "Hi there.");
  assert.deepEqual(off.actions, [], "no capabilities → nothing executes, but tags never reach the voice");
  assert.equal(encodeStudioActionsHeader([]), "");
  assert.equal(REVISION_COLORS[2], "pink");
});
