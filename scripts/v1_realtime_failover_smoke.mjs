#!/usr/bin/env node
//
// scripts/v1_realtime_failover_smoke.mjs
//
// V1 realtime failover smoke. Deterministic, no external APIs.
//
// docs/v1-definition.md line 67: "Manual smoke: primary mint works;
// forced primary failure shows fallback." This script is the
// automatable subset: directly exercise mintWithFailover with
// stubbed primary + stub suppliers and verify the four failover
// paths.
//
// Catches:
//   - Failover state-machine regressions (wrong path taken on
//     primary failure).
//   - fallbackReason key going missing.
//   - Stub-supplier never being loaded when allowFallback is true.
//   - Pinned-provider paths accidentally falling back.

import { mintWithFailover } from "../backend/lib/realtime_supplier_failover.js";

const jsonOutput = process.argv.includes("--json");
const findings = [];

function fakeSupplier({ kind, mintImpl, shouldThrow = null }) {
  return {
    kind,
    async mintClientSecret() {
      if (shouldThrow) throw shouldThrow;
      return mintImpl ? mintImpl() : { value: `${kind}_token`, expiresAt: Date.now() + 60_000, sessionConfig: { type: "realtime", model: "m", voice: "v" } };
    },
    buildSessionConfig() { return { type: "realtime", model: "m", voice: "v" }; },
  };
}

async function runCase(label, fn) {
  try {
    await fn();
  } catch (err) {
    findings.push({ case: label, kind: "unexpected_throw", err: String(err?.message || err) });
  }
}

async function run() {
  // Case 1: primary OK, no fallback attempted.
  await runCase("primary_ok", async () => {
    const primary = fakeSupplier({ kind: "openai" });
    const r = await mintWithFailover({
      primarySupplier: primary,
      mintParams: { instructions: "x" },
      allowFallback: true,
      loadStubSupplier: async () => { findings.push({ case: "primary_ok", kind: "stub_loaded_when_not_needed" }); return fakeSupplier({ kind: "stub" }); },
    });
    if (r.fallbackReason) findings.push({ case: "primary_ok", kind: "fallbackReason_set_on_success", got: r.fallbackReason });
    if (r.supplierUsed.kind !== "openai") findings.push({ case: "primary_ok", kind: "wrong_supplier_used", got: r.supplierUsed.kind });
  });

  // Case 2: primary fails, allowFallback=true → stub mint succeeds.
  await runCase("primary_fail_fallback_ok", async () => {
    let stubMinted = false;
    const primary = fakeSupplier({ kind: "openai", shouldThrow: Object.assign(new Error("primary boom"), { code: "realtime_supplier_request_failed" }) });
    const r = await mintWithFailover({
      primarySupplier: primary,
      mintParams: { instructions: "x" },
      allowFallback: true,
      loadStubSupplier: async () => {
        return fakeSupplier({ kind: "stub", mintImpl: () => { stubMinted = true; return { value: "stub_token", expiresAt: Date.now() + 60_000, sessionConfig: { type: "realtime", model: "m", voice: "v" } }; } });
      },
    });
    if (!stubMinted) findings.push({ case: "primary_fail_fallback_ok", kind: "stub_not_minted" });
    if (r.supplierUsed.kind !== "stub") findings.push({ case: "primary_fail_fallback_ok", kind: "did_not_fall_back", got: r.supplierUsed.kind });
    if (!r.fallbackReason) findings.push({ case: "primary_fail_fallback_ok", kind: "fallbackReason_missing" });
  });

  // Case 3: primary fails AND stub fails → throws supplier_fallback_failed.
  await runCase("primary_fail_fallback_fail", async () => {
    const primary = fakeSupplier({ kind: "openai", shouldThrow: Object.assign(new Error("primary boom"), { code: "realtime_supplier_request_failed" }) });
    let threw = null;
    try {
      await mintWithFailover({
        primarySupplier: primary,
        mintParams: { instructions: "x" },
        allowFallback: true,
        loadStubSupplier: async () => fakeSupplier({ kind: "stub", shouldThrow: new Error("stub boom") }),
      });
    } catch (err) {
      threw = err;
    }
    if (!threw) findings.push({ case: "primary_fail_fallback_fail", kind: "did_not_throw" });
    else if (threw.code !== "supplier_fallback_failed") findings.push({ case: "primary_fail_fallback_fail", kind: "wrong_error_code", got: threw.code });
  });

  // Case 4: allowFallback=false (pinned provider) → primary failure re-throws as-is.
  await runCase("pinned_provider_fail", async () => {
    const err = Object.assign(new Error("primary boom"), { code: "realtime_supplier_request_failed" });
    const primary = fakeSupplier({ kind: "openai", shouldThrow: err });
    let threw = null;
    try {
      await mintWithFailover({
        primarySupplier: primary,
        mintParams: { instructions: "x" },
        allowFallback: false,
        loadStubSupplier: async () => { findings.push({ case: "pinned_provider_fail", kind: "stub_loaded_when_pinned" }); return fakeSupplier({ kind: "stub" }); },
      });
    } catch (e) {
      threw = e;
    }
    if (!threw) findings.push({ case: "pinned_provider_fail", kind: "did_not_throw" });
    else if (threw.code !== "realtime_supplier_request_failed") findings.push({ case: "pinned_provider_fail", kind: "wrong_error_code", got: threw.code });
  });
}

run().then(() => {
  if (jsonOutput) {
    console.log(JSON.stringify({ pass: findings.length === 0, findings }, null, 2));
  } else {
    console.log("v1-realtime-failover-smoke");
    console.log("  cases: primary_ok, primary_fail_fallback_ok, primary_fail_fallback_fail, pinned_provider_fail");
    if (findings.length === 0) console.log("  result: PASS");
    else {
      console.log("  result: FAIL");
      for (const f of findings) console.log(`    - [${f.case}] ${f.kind}: ${JSON.stringify(f)}`);
    }
  }
  process.exit(findings.length === 0 ? 0 : 1);
}).catch((err) => {
  console.error("v1-realtime-failover-smoke: error", err);
  process.exit(2);
});
