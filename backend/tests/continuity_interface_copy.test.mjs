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
