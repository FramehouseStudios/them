import test from "node:test";
import assert from "node:assert/strict";
import { withoutInterfaceCopy } from "../lib/continuity_interface_copy.js";

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
