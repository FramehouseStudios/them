// T-screenplay-export-formats-list-route — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountScreenplayExportFormatsRoute,
  SUPPORTED_FORMATS,
  SCREENPLAY_EXPORT_FORMATS_SCHEMA_VERSION,
} from "../lib/screenplay_export_formats_route.js";

// ---------- snapshot ----------

test("[export-formats] canonical format set is frozen", () => {
  assert.ok(Object.isFrozen(SUPPORTED_FORMATS));
  for (const f of SUPPORTED_FORMATS) {
    assert.ok(Object.isFrozen(f));
  }
});

test("[export-formats] canonical set includes the production routes", () => {
  const names = SUPPORTED_FORMATS.map((f) => f.format);
  assert.deepEqual(
    [...names].sort(),
    ["fdx", "fountain", "markdown", "md", "pdf", "txt"],
  );
});

test("[export-formats] supported flag matches what /screenplay/export actually serves", () => {
  const byFormat = Object.fromEntries(SUPPORTED_FORMATS.map((f) => [f.format, f]));
  // Production-supported.
  for (const supported of ["fountain", "txt", "fdx", "md", "markdown"]) {
    assert.equal(byFormat[supported].supported, true, `${supported} should be supported=true`);
  }
  // Documented-but-not-supported.
  assert.equal(byFormat.pdf.supported, false);
});

test("[export-formats] every entry has a non-empty mediaType + extension", () => {
  for (const f of SUPPORTED_FORMATS) {
    assert.ok(typeof f.mediaType === "string" && f.mediaType.length > 0, `${f.format} mediaType missing`);
    assert.ok(typeof f.extension === "string" && f.extension.length > 0, `${f.format} extension missing`);
  }
});

// ---------- endpoint integration ----------

async function withTestServer(fn) {
  const app = express();
  mountScreenplayExportFormatsRoute(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.json().catch(() => null) };
}

test("[export-formats] GET /screenplay/export/formats returns the snapshot", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/screenplay/export/formats");
    assert.equal(r.status, 200);
    assert.equal(r.body.schemaVersion, SCREENPLAY_EXPORT_FORMATS_SCHEMA_VERSION);
    assert.equal(r.body.defaultFormat, "fountain");
    assert.equal(r.body.formats.length, SUPPORTED_FORMATS.length);
    // Spot-check one supported and one unsupported.
    const md = r.body.formats.find((f) => f.format === "md");
    const pdf = r.body.formats.find((f) => f.format === "pdf");
    assert.equal(md.mediaType, "text/markdown; charset=utf-8");
    assert.equal(pdf.supported, false);
  });
});

test("[export-formats] response has Cache-Control: no-store", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/screenplay/export/formats");
    assert.equal(r.headers["cache-control"], "no-store");
  });
});

test("[export-formats] mountScreenplayExportFormatsRoute requires an Express app", () => {
  assert.throws(() => mountScreenplayExportFormatsRoute(null));
});
