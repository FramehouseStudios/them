import test from "node:test";
import assert from "node:assert/strict";
import { continuityPosition, draftReachedTheEnd, withoutInterfaceCopy } from "../lib/continuity_interface_copy.js";

test("stored Feature Compass interface text is dropped from story outcomes", () => {
  assert.equal(withoutInterfaceCopy("Write or accept a page batch and it will stay reviewable here."), "");
  assert.equal(withoutInterfaceCopy("Open the thread to review accepted page writes."), "");
  assert.equal(withoutInterfaceCopy("Latest: L45-L49, 5 lines · ABCD1234"), "");
  assert.equal(withoutInterfaceCopy(undefined), "");
});

test("real story outcomes pass through untouched", () => {
  assert.equal(withoutInterfaceCopy("  Mae leaves the pier without the letter. "), "Mae leaves the pier without the letter.");
  assert.equal(
    withoutInterfaceCopy("Joe writes or accepts nothing; the page batch burns in the stove."),
    "Joe writes or accepts nothing; the page batch burns in the stove."
  );
});

test("the compass placeholder for an unknown next scene is never a story fact", () => {
  assert.equal(withoutInterfaceCopy("the next scene: DINER"), "");
  assert.equal(withoutInterfaceCopy("Next scene: the next scene. DINER"), "");
  assert.equal(withoutInterfaceCopy("Write the next scene: DINER"), "");
  assert.equal(withoutInterfaceCopy("JOE's next emotional turn: Write the next scene: DINER."), "");
  assert.equal(withoutInterfaceCopy("Next scene: INT. DINER - NIGHT. Mae lies."), "Next scene: INT. DINER - NIGHT. Mae lies.");
  assert.equal(withoutInterfaceCopy("She dreads the next scene of her life."), "She dreads the next scene of her life.");
});

test("continuity position does not repeat the act", () => {
  assert.equal(continuityPosition("Act I", "Act I - Opening Image (p1-p12); 4 pages drafted"), "Act I - Opening Image (p1-p12); 4 pages drafted");
  assert.equal(continuityPosition("Act I", "Act II - Fun and Games"), "Act I / Act II - Fun and Games");
  assert.equal(continuityPosition("Act II", ""), "Act II");
  assert.equal(continuityPosition("", "Opening Image"), "Opening Image");
});

// Seen on Home 2026-09-30: "MAE and DRIVER were carrying this: INT. BUS DEPOT -
// NIGHT Rain on the roof ... Next move: Act I - Opening Image / Ordinary World: ..."
test("where we left off: the page itself is not what the characters were carrying", async () => {
  const { continuityStoryState } = await import("../lib/continuity_interface_copy.js");
  assert.equal(continuityStoryState([
    "INT. BUS DEPOT - NIGHT Rain on the roof. A single bus idles with its doors open. MAE Last one tonight?",
    "BUS DEPOT",
    "Force the protagonist into a choice that makes Act II unavoidable.",
    "Mae is under pressure from: Mae climbs aboard and takes the seat behind him.",
    "Mae chose the last bus over going home.",
  ]), "Mae chose the last bus over going home.");
  assert.equal(continuityStoryState(["INT. WARD - NIGHT Nora waits.", "Open on behavior that shows the wound before anyone explains it."]), "");
});

test("where we left off: the planner's wording is not the next move", async () => {
  const { continuityNextMove } = await import("../lib/continuity_interface_copy.js");
  assert.equal(continuityNextMove([
    "Act I - Opening Image / Ordinary World: Plant the emotional question the ending must answer. Open on behavior that shows the wound before anyone explains it.",
    "Pay off the next story turn: Turn the character pressure into a visible choice or reversal.",
    "Open on behavior that shows the wound before anyone explains it.",
    "Mae hides the coat from the driver.",
  ]), "Mae hides the coat from the driver.");
  assert.equal(continuityNextMove(["Write the next scene: BUS DEPOT"]), "");
});

test("a draft ending on FADE OUT or THE END is finished; one that mentions it earlier is not", () => {
  // Seen live 2026-09-30: Home called a finished 74-page script "Act II".
  assert.equal(draftReachedTheEnd("NORA\nSine die.\n\nFADE OUT.\n\nTHE END\n"), true);
  assert.equal(draftReachedTheEnd("The lights go down.\n\nFADE TO BLACK."), true);
  assert.equal(draftReachedTheEnd("FADE IN:\n\nINT. SENATE - NIGHT\n\nNora counts."), false);
  assert.equal(draftReachedTheEnd("DANNY\nWhen do we fade out?\n\nNora doesn't answer.\n\nShe keeps counting.\n\nThe clock reads 11:40."), false);
  assert.equal(draftReachedTheEnd(""), false);
});

test("the recap names people, not words memory mistook for names", async () => {
  // Seen 2026-09-30: "OSGOOD and To were carrying this"; memory held ['OSGOOD', 'To', 'Into', 'Try'].
  const { recapCharacterNames } = await import("../lib/continuity_interface_copy.js");
  assert.deepEqual(recapCharacterNames(["OSGOOD", "To", "Into", "Try", "Nora"]), ["OSGOOD", "Nora"]);
  assert.deepEqual(recapCharacterNames(["June", "Will"]), ["June", "Will"], "names that are also words stay");
});

test("a declared character name is one the writer capitalized", async () => {
  const { extractDeclaredCharacterNames } = await import("../lib/creative_memory_store.js");
  assert.deepEqual(extractDeclaredCharacterNames("Walk the lawyer to the hearing, then send the lead into the chamber."), []);
  assert.deepEqual(extractDeclaredCharacterNames("My protagonist is named Maya."), ["Maya"]);
  assert.deepEqual(extractDeclaredCharacterNames("Nora is a lawyer who counts votes."), ["Nora"]);
});

test("the recap names only the people its story line is about", async () => {
  const { recapCharacterNames } = await import("../lib/continuity_interface_copy.js");
  const story = "Osgood stands on the step stool beneath the brass clock, alone.";
  assert.deepEqual(recapCharacterNames(["CAL", "DECKER", "OSGOOD"], 2, story), ["OSGOOD"]);
  assert.deepEqual(recapCharacterNames(["CAL", "DECKER"], 2, story), [], "nobody named in the line: no one is credited with it");
  assert.deepEqual(recapCharacterNames(["CAL", "DECKER", "To"], 2), ["CAL", "DECKER"], "no story line: the cast as stored");
});

test("memory's own templates are not the recap's next move or story line", async () => {
  const { continuityNextMove, continuityStoryState } = await import("../lib/continuity_interface_copy.js");
  assert.equal(continuityNextMove(["Rain returns as proof or cost in Act III.", "Decker asks for the Journal."]), "Decker asks for the Journal.");
  assert.equal(continuityStoryState(["NORA's next public choice must pay off the private pressure planted here.", "Nora sets the badge down."]), "Nora sets the badge down.");
});

test("the recap names the open script when memory is about another one", async () => {
  // 2026-09-30: "Where we left off · Clerk Stops T" while "Clerk Stops The Clock" was open.
  const { continuitySnapshotOptions, openProjectRecap } = await import("../lib/continuity_interface_copy.js");
  const owner = { activeProjectId: "p2", projects: [{ id: "p1", title: "Clerk Stops T" }, { id: "p2", title: "Clerk Stops The Clock" }] };
  const options = continuitySnapshotOptions(owner, (project) => ({ draft: project.id === "p2" ? "INT. HALL - NIGHT\n\nRain.\n\nEXT. STEPS - DAY\n\nWind." : "" }));
  assert.deepEqual(options.activeProject, { id: "p2", title: "Clerk Stops The Clock", lastHeading: "EXT. STEPS - DAY" });
  const recap = openProjectRecap("p1", options);
  assert.equal(recap.project_id, "p2");
  assert.equal(recap.project_title, "Clerk Stops The Clock");
  assert.equal(recap.opening_line, "Welcome back. We were in Clerk Stops The Clock, at EXT. STEPS - DAY.");
  assert.equal(openProjectRecap("P2", options), null, "memory about the open script keeps the full recap");
  assert.equal(openProjectRecap("p1", { activeProjectId: "", activeProject: null }), null, "nothing open: memory's own recap");
});
