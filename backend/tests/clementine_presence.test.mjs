import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidPresence, buildPresencePayload, getClementinePresence, DEFAULT_PRESENCE } from "../lib/clementine/clementine_presence.js";

describe("Clementine presence", () => {
  it("normalize/valid", () => {
    assert.equal(isValidPresence("present"), true);
    assert.equal(isValidPresence("bogus"), false);
    assert.equal(DEFAULT_PRESENCE, "idle");
  });
  it("presence payload + get", () => {
    const p = buildPresencePayload({ presence: "present", characterContexts: [{ name: "John", voice: "v", memory: [1,2] }] });
    assert.equal(p.presence, "present");
    assert.equal(p.isPresent, true);
    const g = getClementinePresence({ samanthaPresence: { state: "present", history: ["idle","present"] } });
    assert.deepEqual(g.history, ["idle","present"]);
  });
});
