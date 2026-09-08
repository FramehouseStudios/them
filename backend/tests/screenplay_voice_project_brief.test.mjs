import assert from "node:assert/strict";
import test from "node:test";
import {
  VOICE_PROJECT_BRIEF_FIELD_ORDER,
  applyVoiceProjectBriefMutation,
  buildConfirmedVoiceProjectBriefSnapshot,
  buildVoiceProjectBriefRequestHash,
  normalizeVoiceProjectBrief,
  parseVoiceProjectBriefPrecondition,
  reduceVoiceProjectBrief,
  toVoiceProjectBriefPayload,
} from "../lib/screenplay_voice_project_brief.js";

function project() {
  return { id: "project-1", title: "The Quiet House" };
}

test("normalizes the v1 schema and derives status and next field", () => {
  const brief = normalizeVoiceProjectBrief({
    schemaVersion: 99,
    revision: "4",
    status: "ready",
    nextField: "stakes",
    fields: {
      format: { state: "confirmed", value: " feature " },
      premise: { state: "candidate", value: "  A house listens. " },
      targetPages: { state: "confirmed", value: 900 },
    },
  });
  assert.equal(brief.schemaVersion, 1);
  assert.equal(brief.revision, 4);
  assert.deepEqual(brief.fields.format, { state: "confirmed", value: "feature" });
  assert.deepEqual(brief.fields.targetPages, { state: "unset", value: null });
  assert.equal(brief.status, "collecting");
  assert.equal(brief.nextField, "genre");
  assert.deepEqual(Object.keys(brief.fields), VOICE_PROJECT_BRIEF_FIELD_ORDER);
});

test("bundled candidates reduce deterministically independent of order", () => {
  const initial = normalizeVoiceProjectBrief();
  const candidatesA = [
    { field: "tone", value: " tense " },
    { field: "format", value: "feature" },
    { field: "genre", value: "thriller" },
    { field: "tone", value: "dreamlike" },
  ];
  const candidatesB = [...candidatesA].reverse();
  const first = reduceVoiceProjectBrief(initial, { type: "candidates", candidates: candidatesA });
  const second = reduceVoiceProjectBrief(initial, { type: "candidates", candidates: candidatesB });
  assert.equal(first.ok, true);
  assert.deepEqual(first.brief, second.brief);
  assert.equal(first.brief.fields.format.state, "candidate");
  assert.equal(first.brief.fields.genre.value, "thriller");
  assert.deepEqual(first.brief.fields.tone, { state: "unset", value: null }, "ambiguous duplicate candidates stay unresolved");
  assert.equal(first.brief.nextField, "premise", "canonical missing fields take priority over review candidates");
});

test("candidate bundles never overwrite resolved writer decisions", () => {
  const initial = normalizeVoiceProjectBrief({
    fields: {
      format: { state: "confirmed", value: "feature" },
      premise: { state: "skipped" },
      genre: { state: "provisional", value: "drama" },
    },
  });
  const result = reduceVoiceProjectBrief(initial, {
    type: "candidates",
    candidates: { format: "pilot", premise: "Replacement", genre: "horror", tone: "warm" },
  });
  assert.deepEqual(result.brief.fields.format, initial.fields.format);
  assert.deepEqual(result.brief.fields.premise, initial.fields.premise);
  assert.deepEqual(result.brief.fields.genre, initial.fields.genre);
  assert.deepEqual(result.brief.fields.tone, { state: "candidate", value: "warm" });
});

test("confirm and explicit correction produce confirmed authoritative values", () => {
  const candidate = reduceVoiceProjectBrief(null, {
    type: "candidates",
    candidates: { format: "feature", genre: "horror" },
  }).brief;
  const confirmed = reduceVoiceProjectBrief(candidate, { type: "confirm", field: "format" });
  assert.deepEqual(confirmed.brief.fields.format, { state: "confirmed", value: "feature" });
  const corrected = reduceVoiceProjectBrief(confirmed.brief, {
    type: "correct",
    field: "format",
    value: "limited series pilot",
  });
  assert.deepEqual(corrected.brief.fields.format, { state: "confirmed", value: "limited series pilot" });
  assert.equal(corrected.brief.revision, 3);
});

test("skip current and you-decide resolve only the current field", () => {
  const skipped = reduceVoiceProjectBrief(null, { type: "skip_current" });
  assert.deepEqual(skipped.brief.fields.format, { state: "skipped", value: null });
  assert.equal(skipped.brief.nextField, "premise");
  const provisional = reduceVoiceProjectBrief(skipped.brief, { type: "you_decide" });
  assert.deepEqual(provisional.brief.fields.premise, { state: "provisional", value: null });
  assert.equal(provisional.brief.nextField, "genre");
});

test("brief becomes ready only when every field is explicitly resolved", () => {
  let brief = normalizeVoiceProjectBrief();
  for (const field of VOICE_PROJECT_BRIEF_FIELD_ORDER.filter((field) => field !== "deliveryDeadline")) {
    const action = field === "format"
      ? { type: "you_decide", field, value: "feature" }
      : { type: "skip_current" };
    const result = reduceVoiceProjectBrief(brief, action);
    assert.equal(result.ok, true);
    brief = result.brief;
  }
  assert.equal(brief.status, "ready");
  assert.equal(brief.nextField, null);
  assert.deepEqual(brief.fields.deliveryDeadline, { state: "unset", value: null });
});

test("bundled science-fiction brief preserves five characters, three locations, and a before-midnight clock", () => {
  const bundled = reduceVoiceProjectBrief(null, {
    type: "candidates",
    candidates: {
      format: "feature",
      genre: "science fiction",
      characters: ["Mara", "Eli", "JO", "Venn", "Cato", "mara"],
      locations: ["Orbital station", "Night market", "Flood tunnel", "night market"],
      story_clock: "The chase must finish before midnight.",
      constraints: ["Keep the chase physical", "No time travel", "keep the chase physical"],
      target_pages: 90,
      delivery_deadline: "Friday at 5 PM",
    },
  });
  assert.equal(bundled.ok, true);
  assert.deepEqual(bundled.brief.fields.characters.value, ["Mara", "Eli", "JO", "Venn", "Cato"]);
  assert.deepEqual(bundled.brief.fields.locations.value, ["Orbital station", "Night market", "Flood tunnel"]);
  assert.equal(bundled.brief.fields.storyClock.value, "The chase must finish before midnight.");
  assert.deepEqual(bundled.brief.fields.constraints.value, ["Keep the chase physical", "No time travel"]);
  assert.equal(bundled.brief.fields.targetPages.value, 90);
  assert.equal(bundled.brief.fields.deliveryDeadline.value, "Friday at 5 PM");

  let confirmed = bundled.brief;
  for (const field of ["format", "genre", "characters", "locations", "storyClock", "constraints", "targetPages"]) {
    confirmed = reduceVoiceProjectBrief(confirmed, { type: "confirm", field }).brief;
  }
  const record = project();
  record.voiceProjectBrief = confirmed;
  const snapshot = buildConfirmedVoiceProjectBriefSnapshot(record);
  assert.deepEqual(snapshot.fields.characters, ["Mara", "Eli", "JO", "Venn", "Cato"]);
  assert.deepEqual(snapshot.fields.locations, ["Orbital station", "Night market", "Flood tunnel"]);
  assert.deepEqual(snapshot.fields.constraints, ["Keep the chase physical", "No time travel"]);
  assert.equal(snapshot.fields.storyClock, "The chase must finish before midnight.");
  assert.equal(snapshot.fields.deliveryDeadline, undefined, "an unconfirmed delivery deadline cannot enter generation");
});

test("conflicting aliases cannot collide into one field", () => {
  const result = reduceVoiceProjectBrief(null, {
    type: "candidates",
    candidates: [
      { field: "story_clock", value: "before midnight" },
      { field: "storyClock", value: "before sunrise" },
    ],
  });
  assert.equal(result.ok, false, "an all-ambiguous bundle must not silently choose a value");
  assert.deepEqual(result.brief.fields.storyClock, { state: "unset", value: null });
});

test("collection fields preserve first mention and spelling across repeated normalization", () => {
  const once = normalizeVoiceProjectBrief({
    fields: {
      characters: { state: "confirmed", value: ["Mara", "Eli", "mara", "JO"] },
      locations: { state: "confirmed", value: ["Orbital station", "Night market", "ORBITAL STATION"] },
    },
  });
  const twice = normalizeVoiceProjectBrief(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(once.fields.characters.value, ["Mara", "Eli", "JO"]);
  assert.deepEqual(once.fields.locations.value, ["Orbital station", "Night market"]);
});

test("collection fields are case-insensitive and bounded", () => {
  const result = reduceVoiceProjectBrief(null, {
    type: "candidates",
    candidates: {
      characters: Array.from({ length: 24 }, (_, index) => `Character ${String(index).padStart(2, "0")}${"x".repeat(100)}`),
      locations: Array.from({ length: 18 }, (_, index) => `Location ${String(index).padStart(2, "0")}${"y".repeat(150)}`),
      constraints: Array.from({ length: 20 }, (_, index) => `Constraint ${String(index).padStart(2, "0")}${"z".repeat(300)}`),
    },
  });
  assert.equal(result.brief.fields.characters.value.length, 16);
  assert.equal(result.brief.fields.locations.value.length, 12);
  assert.equal(result.brief.fields.constraints.value.length, 16);
  assert.ok(result.brief.fields.characters.value.every((item) => item.length <= 80));
  assert.ok(result.brief.fields.locations.value.every((item) => item.length <= 120));
  assert.ok(result.brief.fields.constraints.value.every((item) => item.length <= 240));
});

test("precondition and request hash helpers normalize aliases and semantic order", () => {
  assert.deepEqual(parseVoiceProjectBriefPrecondition({
    client_request_id: " voice-1 ",
    expected_revision: "2",
  }), { ok: true, clientRequestId: "voice-1", expectedRevision: 2 });
  assert.equal(parseVoiceProjectBriefPrecondition({ client_request_id: "voice-1" }).ok, false);
  assert.equal(parseVoiceProjectBriefPrecondition({
    client_request_id: "voice-1",
    clientRequestId: "voice-2",
    expected_revision: 2,
  }).error, "invalid_write_precondition");
  assert.equal(parseVoiceProjectBriefPrecondition({
    client_request_id: "x".repeat(97),
    expected_revision: 2,
  }).error, "invalid_write_precondition");
  assert.equal(parseVoiceProjectBriefPrecondition({
    client_request_id: "voice request with spaces",
    expected_revision: 2,
  }).error, "invalid_write_precondition");
  assert.equal(
    buildVoiceProjectBriefRequestHash({ type: "candidates", candidates: { tone: "warm", genre: "drama" } }),
    buildVoiceProjectBriefRequestHash({ type: "candidates", candidates: { genre: "drama", tone: "warm" } })
  );
});

test("expected revision enforces CAS and client request id replays exactly", () => {
  const record = project();
  const request = {
    client_request_id: "voice-write-1",
    expected_revision: 0,
    action: { type: "candidates", candidates: { genre: "thriller", format: "feature" } },
  };
  const saved = applyVoiceProjectBriefMutation(record, request);
  assert.equal(saved.commit, true);
  assert.equal(saved.kind, "saved");
  assert.equal(saved.brief.revision, 1);

  const replay = applyVoiceProjectBriefMutation(record, request);
  assert.equal(replay.commit, false);
  assert.equal(replay.kind, "replayed");
  assert.equal(replay.replayed, true);

  const reused = applyVoiceProjectBriefMutation(record, {
    ...request,
    action: { type: "candidates", candidates: { genre: "comedy" } },
  });
  assert.equal(reused.kind, "request_id_reused");
  assert.equal(reused.conflict, true);

  const stale = applyVoiceProjectBriefMutation(record, {
    client_request_id: "voice-write-2",
    expected_revision: 0,
    action: { type: "confirm", field: "genre" },
  });
  assert.equal(stale.kind, "stale_revision");
  assert.equal(stale.conflict, true);
});

test("a rejected stale write does not mutate an uninitialized project record", () => {
  const record = project();
  const result = applyVoiceProjectBriefMutation(record, {
    client_request_id: "voice-stale",
    expected_revision: 4,
    action: { type: "skip_current" },
  });
  assert.equal(result.kind, "stale_revision");
  assert.equal(Object.prototype.hasOwnProperty.call(record, "voiceProjectBrief"), false);
});

test("a valid replay becomes superseded after a later committed mutation", () => {
  const record = project();
  const first = {
    client_request_id: "voice-first",
    expected_revision: 0,
    action: { type: "candidates", candidates: { format: "feature" } },
  };
  assert.equal(applyVoiceProjectBriefMutation(record, first).kind, "saved");
  assert.equal(applyVoiceProjectBriefMutation(record, {
    client_request_id: "voice-second",
    expected_revision: 1,
    action: { type: "confirm", field: "format" },
  }).kind, "saved");
  const replay = applyVoiceProjectBriefMutation(record, first);
  assert.equal(replay.kind, "replayed_superseded");
  assert.equal(replay.conflict, true);
});

test("payload title always derives from the authoritative screenplay project", () => {
  const record = project();
  const first = toVoiceProjectBriefPayload(record);
  assert.equal(first.title, "The Quiet House");
  record.title = "A Better Title";
  const second = toVoiceProjectBriefPayload(record);
  assert.equal(second.title, "A Better Title");
  assert.equal(Object.prototype.hasOwnProperty.call(second.fields, "title"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(record, "voiceProjectBrief"), false, "read payloads must not mutate the project");
});

test("generation snapshot contains title and confirmed fields only", () => {
  const record = project();
  record.voiceProjectBrief = normalizeVoiceProjectBrief({
    revision: 7,
    fields: {
      format: { state: "confirmed", value: "feature" },
      premise: { state: "candidate", value: "A candidate premise" },
      genre: { state: "provisional", value: "thriller" },
      tone: { state: "skipped" },
      characters: { state: "confirmed", value: ["Mara", "Eli", "mara"] },
      locations: { state: "confirmed", value: ["Courthouse", "Parking garage"] },
      constraints: { state: "candidate", value: ["One night only"] },
      targetPages: { state: "confirmed", value: 90 },
    },
  });
  const snapshot = buildConfirmedVoiceProjectBriefSnapshot(record);
  assert.deepEqual(snapshot, {
    schema_version: 1,
    project_id: "project-1",
    title: "The Quiet House",
    brief_revision: 7,
    fields: {
      format: "feature",
      characters: ["Mara", "Eli"],
      locations: ["Courthouse", "Parking garage"],
      targetPages: 90,
    },
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.fields), true);
});
