import test from "node:test";
import assert from "node:assert/strict";
import { continuityPosition, withoutInterfaceCopy } from "../lib/continuity_interface_copy.js";

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
