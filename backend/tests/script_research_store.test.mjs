import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getFingerprint, ingestRow, getRows, setScores, getBrief, setBrief, rowsHash, clearResearch } from "../lib/clementine/script_research/store.js";

describe("script research store (nightly brief, samantha is clementine)", () => {
  it("ingest + fingerprint + dedup + 800-char excerpt", () => {
    clearResearch("owner-test-store");
    const draft = "INT. BEDROOM - NIGHT\nWe see John ghost bedroom memory.\n\nJOHN\nPlease stay.";
    const fp = getFingerprint(draft);
    const r1 = ingestRow({ ownerKey:"owner-test-store", draft, genre:"horror" });
    const r2 = ingestRow({ ownerKey:"owner-test-store", draft, genre:"horror" });
    assert.equal(r1.fingerprint, fp);
    assert.equal(r1.id, r2.id);
    assert.ok(r1.excerpt.length <=800);
    assert.equal(getRows("owner-test-store").length,1);
  });
  it("scores + brief + rowsHash + clear", () => {
    clearResearch("owner-test-brief");
    const draft = "INT. bedroom - NIGHT\nWe see Sally is scared ghost.\n\nSALLY\nPlease stay with listening shadow very.";
    const row = ingestRow({ ownerKey:"owner-test-brief", draft });
    const scores = { coverage:{overall:2}, ghostPaidRatio:0 };
    setScores({ ownerKey:"owner-test-brief", fingerprint: row.fingerprint, scores, strengths:["good"], weaknesses:["thin"] });
    const rows = getRows("owner-test-brief");
    assert.equal(rows[0].strengths[0],"good");
    const brief = { strengths:["a","b"], weaknesses:["c","d"], exercise:{title:"t",prompt:"p",lines:[]}, nextSceneHint:"hi" };
    setBrief({ ownerKey:"owner-test-brief", hash: rowsHash("owner-test-brief"), brief });
    assert.ok(getBrief("owner-test-brief").brief.strengths.length===2);
    clearResearch("owner-test-brief");
    assert.equal(getRows("owner-test-brief").length,0);
  });
});
