import test from "node:test";
import assert from "node:assert/strict";
import { pageRecapLine, pageThreadHighlight, sceneHeadingsIn } from "../lib/recap_pages.js";

// 2026-09-30: Recap read "FADE IN: EXT. STATE CAPITOL - NIGHT A granite dome in the rain…".
const page = (assistant) => ({ screenplayTarget: "page", assistant });

test("a page thread is named by the scenes it wrote", () => {
  assert.deepEqual(
    sceneHeadingsIn("FADE IN: EXT. STATE CAPITOL - NIGHT A granite dome in the rain. INT. SENATE CORRIDOR - CONTINUOUS A clock over the doors."),
    ["EXT. STATE CAPITOL - NIGHT", "INT. SENATE CORRIDOR - CONTINUOUS"],
  );
  assert.equal(pageThreadHighlight(page("INT. SENATE CHAMBER - DAY Empty. Morning light.")), "Wrote INT. SENATE CHAMBER - DAY");
  assert.equal(pageThreadHighlight(page("NORA I counted. DANNY Again?")), "Wrote a page");
  assert.equal(pageThreadHighlight({ screenplayTarget: "voice_pin", assistant: "INT. HALL - NIGHT" }), "", "only page writes");
});

test("the recap line counts the pages and names where they ended", () => {
  assert.equal(pageRecapLine([page("INT. SENATE CHAMBER - CONTINUOUS Osgood."), page("EXT. STATE CAPITOL - NIGHT Rain.")]),
    "Wrote 2 pages, through INT. SENATE CHAMBER - CONTINUOUS.");
  assert.equal(pageRecapLine([page("NORA Again.")]), "Wrote 1 page.");
  assert.equal(pageRecapLine([{ screenplayTarget: "", assistant: "Let's talk about Nora." }]), "");
});
