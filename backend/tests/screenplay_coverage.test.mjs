import test from "node:test";
import assert from "node:assert/strict";
import { rateScreenplay, gradeFor, verdictFor, PILLARS } from "../lib/screenplay_coverage.js";

const sceneBlock = (n) => [
  `INT. ${["KITCHEN", "PORCH", "DINER", "GARAGE", "COURTROOM", "CAR", "HOSPITAL", "MOTEL"][n % 8]} - ${n % 2 ? "DAY" : "NIGHT"}`,
  "",
  `JUNE, 30s, sets the cup down without looking at him. The tap coughs. ${"She counts the tiles. ".repeat(3)}`,
  "",
  "JUNE",
  "You left the porch light on. Again.",
  "",
  "MARCUS",
  "It's cheaper than a lock.",
  "",
  "She slides the key across. He doesn't take it.",
  "",
  "JUNE",
  "Then you won't need this.",
  "",
  "MARCUS",
  "(beat)",
  "Keep it. Read me the email.",
  "",
  "He turns the cup so the handle faces her.",
  "",
].join("\n");

const strong = Array.from({ length: 30 }, (_, i) => sceneBlock(i)).join("\n");

const flat = [
  "INT. LIVING ROOM - DAY",
  "",
  "Anna is sad. Bob is angry.",
  "",
  "ANNA",
  "I'm so sad and I love you and I always have.",
  "",
  "BOB",
  "I'm so angry at you right now. We need to talk. This changes everything.",
  "",
  "ANNA",
  "Are you okay? I'm sorry. What do you mean?",
  "",
  "BOB",
  "Trust your instinct.",
].join("\n");

test("[coverage] grades and verdicts follow studio coverage bands", () => {
  assert.equal(gradeFor(9), "A"); assert.equal(gradeFor(7.4), "B"); assert.equal(gradeFor(5.6), "C"); assert.equal(gradeFor(4.2), "D"); assert.equal(gradeFor(2), "F");
  assert.equal(verdictFor(8.2), "RECOMMEND"); assert.equal(verdictFor(6.5), "CONSIDER"); assert.equal(verdictFor(5), "PASS");
});

test("[coverage] a tactical multi-scene draft reads better than a flat on-the-nose scene", () => {
  const good = rateScreenplay({ draft: strong, title: "Porch Light" });
  const bad = rateScreenplay({ draft: flat, title: "Living Room" });
  for (const p of PILLARS) {
    assert.ok(typeof good.pillars[p].score === "number", p);
    assert.ok(good.pillars[p].score >= 1 && good.pillars[p].score <= 10, p);
  }
  assert.ok(good.overall > bad.overall, `good ${good.overall} vs bad ${bad.overall}`);
  assert.ok(good.pillars.dialogue.score > bad.pillars.dialogue.score, "tactical lines outscore announced feelings");
  assert.ok(good.pillars.structure.score > bad.pillars.structure.score, "thirty scenes have a shape; one scene does not");
  assert.ok(bad.missing.length >= 1);
  assert.match(bad.spoken, /Here's my read on "Living Room"/);
  assert.match(bad.spoken, /The move:/);
  assert.match(bad.spoken, /Want to start there\?$/);
  assert.equal(good.title, "Porch Light");
  assert.ok(good.pageCount >= 5);
  assert.equal(good.sceneCount, 30);
  assert.equal(good.schemaVersion, 1);
});

test("[coverage] the read is deterministic and explainable", () => {
  const a = rateScreenplay({ draft: strong });
  const b = rateScreenplay({ draft: strong });
  assert.deepEqual(a, b);
  assert.ok(a.works.length <= 2 && a.missing.length <= 2);
  assert.ok(a.move.length > 20);
  assert.ok(Array.isArray(a.structureTurns) && a.structureTurns.length === 3);
  assert.ok(a.spoken.split(". ").length >= 3);
});

test("[coverage] format problems lower the format pillar and are named", () => {
  const broken = strong.replace(/INT\. KITCHEN - NIGHT/g, "int kitchen night").replace(/\nJUNE\n/g, "\njune\n");
  const clean = rateScreenplay({ draft: strong });
  const messy = rateScreenplay({ draft: broken });
  assert.ok(messy.pillars.format.score < clean.pillars.format.score, `${messy.pillars.format.score} < ${clean.pillars.format.score}`);
});

test("[coverage] an empty draft is refused", () => {
  assert.throws(() => rateScreenplay({ draft: "   " }), /draft_required/);
});
