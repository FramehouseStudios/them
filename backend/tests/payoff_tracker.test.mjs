// T-payoff-tracker — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  trackPayoffs,
  PAYOFF_TRACKER_SCHEMA_VERSION,
} from "../lib/payoff_tracker.js";
import { mountCraftRoutes } from "../lib/craft_routes.js";

const PAID_OBJECT = `INT. KITCHEN - NIGHT

She picks up the Silver Locket from the table.

EXT. ROOFTOP - DAWN

The Silver Locket glints in her hand. She throws it.`;

const UNPAID_OBJECT = `INT. ATTIC - DAY

In the corner sits the Antique Compass nobody talks about.

She walks out.`;

const NAMED_CHARACTER = `INT. KITCHEN - NIGHT

JUNE
Marcus said you'd be here.

EXT. ROOFTOP - DAWN

MARCUS
I told him to find you.`;

const PROMISE = `INT. ROOM - NIGHT

She promised to come back. She swore she would. He warned her.`;

const THREAT = `INT. ALLEY - NIGHT

I'll kill him. I'll burn it down.`;

// ---------- shape ----------

test("[payoff] returns canonical schema", () => {
  const r = trackPayoffs({ text: PAID_OBJECT });
  assert.equal(r.schemaVersion, PAYOFF_TRACKER_SCHEMA_VERSION);
  assert.ok(Array.isArray(r.setups));
  assert.ok(r.counts && typeof r.counts.total === "number");
  assert.equal(typeof r.summary, "string");
});

// ---------- named-object setups ----------

test("[payoff] named-object that recurs later is paid", () => {
  const r = trackPayoffs({ text: PAID_OBJECT });
  const locket = r.setups.find((s) => s.kind === "named-object" && /silver locket/i.test(s.text));
  assert.ok(locket, "expected Silver Locket setup");
  assert.equal(locket.status, "paid");
  assert.ok(locket.payoffIndex > locket.sourceIndex);
});

test("[payoff] named-object that never recurs is unpaid", () => {
  const r = trackPayoffs({ text: UNPAID_OBJECT });
  const compass = r.setups.find((s) => s.kind === "named-object" && /antique compass/i.test(s.text));
  assert.ok(compass);
  assert.equal(compass.status, "unpaid");
  assert.equal(compass.payoffIndex, null);
});

// ---------- named-character setups ----------

test("[payoff] character mentioned before their cue is detected as a setup", () => {
  const r = trackPayoffs({ text: NAMED_CHARACTER });
  const marcus = r.setups.find((s) => s.kind === "named-character" && s.text === "Marcus");
  assert.ok(marcus, "expected Marcus setup");
  assert.equal(marcus.status, "paid");
  assert.ok(marcus.payoffIndex > marcus.sourceIndex);
});

// ---------- promise / threat setups ----------

test("[payoff] promise verbs produce promise-kind setups", () => {
  const r = trackPayoffs({ text: PROMISE });
  const promises = r.setups.filter((s) => s.kind === "promise");
  assert.ok(promises.length >= 1, "expected at least one promise setup");
  for (const p of promises) assert.equal(p.status, "weak");
});

test("[payoff] threat verbs produce threat-kind setups", () => {
  const r = trackPayoffs({ text: THREAT });
  const threats = r.setups.filter((s) => s.kind === "threat");
  assert.ok(threats.length >= 1);
  for (const t of threats) assert.equal(t.status, "weak");
});

// ---------- counts + summary ----------

test("[payoff] counts reflect paid/unpaid/weak buckets", () => {
  const r = trackPayoffs({ text: PAID_OBJECT });
  assert.equal(r.counts.total, r.setups.length);
  assert.equal(r.counts.paid + r.counts.unpaid + r.counts.weak, r.counts.total);
});

test("[payoff] empty text returns empty setups", () => {
  const r = trackPayoffs({ text: "" });
  assert.equal(r.setups.length, 0);
  assert.match(r.summary, /no notable setups/i);
});

test("[payoff] non-string input returns empty shape (no throw)", () => {
  const r = trackPayoffs({ text: 42 });
  assert.equal(r.schemaVersion, PAYOFF_TRACKER_SCHEMA_VERSION);
});

test("[payoff] determinism: same input → same output", () => {
  const a = trackPayoffs({ text: PAID_OBJECT });
  const b = trackPayoffs({ text: PAID_OBJECT });
  assert.deepEqual(a, b);
});

// ---------- endpoint integration ----------

async function withTestServer(fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = { id: "payoff-test-user" };
    req.userId = req.authUser.id;
    next();
  });
  mountCraftRoutes(app, { authorizeProjectAccess: async () => true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseURL, p, body) {
  const r = await fetch(`${baseURL}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[payoff] POST /craft/payoff/track returns the report", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postJson(baseURL, "/craft/payoff/track", { text: UNPAID_OBJECT });
    assert.equal(r.status, 200);
    assert.ok(r.body.setups.some((s) => s.status === "unpaid"));
  });
});

test("[payoff] POST /craft/payoff/track rejects missing text", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postJson(baseURL, "/craft/payoff/track", {});
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "craft_invalid_screenplay");
  });
});

// Codex review on #92 flagged that repeated mentions of a named
// object created spurious setups: each new mention got its own
// setup record, and the LAST mention was marked unpaid because
// nothing came after it. The dedupe fix tracks seen named-objects
// across the whole text and only emits ONE setup per object — at
// its first mention.

test("[payoff] repeated named-object mentions produce ONE setup, not N", () => {
  const text = `INT. KITCHEN - NIGHT

She picks up the Silver Locket from the table.

EXT. ROOFTOP - DAWN

She clutches the Silver Locket as she stands at the edge.

EXT. BRIDGE - NIGHT

She drops the Silver Locket into the river.`;
  const r = trackPayoffs({ text });
  const locketSetups = r.setups.filter(
    (s) => s.kind === "named-object" && /silver locket/i.test(s.text),
  );
  assert.equal(
    locketSetups.length,
    1,
    `expected 1 setup for Silver Locket, got ${locketSetups.length}: ${JSON.stringify(locketSetups.map((s) => ({ status: s.status, line: s.sourceIndex })))}`,
  );
  assert.equal(locketSetups[0].status, "paid", "single setup should be paid (it has payoffs)");
});

test("[payoff] LAST mention of an object is no longer falsely flagged unpaid", () => {
  const text = `INT. SHOP - DAY

He admires the Golden Watch in the case.

INT. SHOP - LATER

He buys the Golden Watch.

INT. HOME - NIGHT

He hides the Golden Watch in the drawer.`;
  const r = trackPayoffs({ text });
  const unpaid = r.setups.filter(
    (s) => s.kind === "named-object" && s.status === "unpaid" && /golden watch/i.test(s.text),
  );
  assert.equal(unpaid.length, 0, `LAST mention should not be unpaid: ${JSON.stringify(unpaid)}`);
});
