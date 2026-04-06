#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");

const BASE_URL = String(process.env.BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
const APP_TOKEN = String(process.env.APP_TOKEN || "").trim();
const AUDIO_FILE = String(process.env.LOAD_AUDIO_FILE || path.join(backendDir, "test.wav")).trim();
const CONCURRENCY = Math.max(1, Math.min(24, Number.parseInt(process.env.LOAD_CONCURRENCY || "4", 10) || 4));
const TURNS_PER_WORKER = Math.max(1, Math.min(24, Number.parseInt(process.env.LOAD_TURNS_PER_WORKER || "3", 10) || 3));
const MAX_ERROR_RATE = Math.max(0, Math.min(1, Number.parseFloat(process.env.LOAD_MAX_ERROR_RATE || "0.25")));
const MAX_P95_MS = Math.max(500, Number.parseInt(process.env.LOAD_MAX_P95_MS || "12000", 10) || 12000);
const TALK_STREAM_MODE = String(process.env.LOAD_TALK_STREAM_MODE || "audio").trim();

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch (_) {
    json = null;
  }
  return { res, raw, json };
}

async function createSessionToken() {
  const headers = APP_TOKEN ? { "X-APP-TOKEN": APP_TOKEN } : {};
  const out = await httpJson(`${BASE_URL}/session`, {
    method: "POST",
    headers,
  });
  if (!out.res.ok) {
    throw new Error(`session failed status=${out.res.status} body=${out.raw.slice(0, 280)}`);
  }
  const token = String(out.json?.client_token || out.json?.session_id || "").trim();
  if (!token) throw new Error("session missing client_token");
  return token;
}

async function runOneTalk({ token, audioBuffer, turnIndex, workerIndex }) {
  const form = new FormData();
  const filename = path.basename(AUDIO_FILE);
  const file = new File([audioBuffer], filename, { type: "audio/wav" });
  form.append("file", file);
  const headers = {
    "X-Client-Token": token,
    "X-Talk-Stream": TALK_STREAM_MODE,
    "X-Idempotency-Key": `load-${workerIndex}-${turnIndex}-${randomUUID().slice(0, 8)}`,
  };
  if (APP_TOKEN) headers["X-APP-TOKEN"] = APP_TOKEN;
  const startedAt = Date.now();
  const res = await fetch(`${BASE_URL}/talk`, {
    method: "POST",
    headers,
    body: form,
  });
  const elapsedMs = Date.now() - startedAt;
  const contentType = String(res.headers.get("content-type") || "");
  const bytes = Number.parseInt(String(res.headers.get("content-length") || "0"), 10) || 0;
  const body = await res.arrayBuffer();
  return {
    ok: res.ok,
    status: res.status,
    elapsedMs,
    contentType,
    bytes: bytes || body.byteLength,
  };
}

async function workerRun(index, audioBuffer) {
  const token = await createSessionToken();
  const rows = [];
  for (let i = 0; i < TURNS_PER_WORKER; i += 1) {
    try {
      const one = await runOneTalk({
        token,
        audioBuffer,
        turnIndex: i + 1,
        workerIndex: index,
      });
      rows.push(one);
    } catch (err) {
      rows.push({
        ok: false,
        status: 0,
        elapsedMs: 0,
        contentType: "",
        bytes: 0,
        error: String(err?.message || err),
      });
    }
  }
  return rows;
}

async function main() {
  if (!fs.existsSync(AUDIO_FILE)) {
    throw new Error(`missing audio file: ${AUDIO_FILE}`);
  }
  const audioBuffer = fs.readFileSync(AUDIO_FILE);
  if (!audioBuffer.length) {
    throw new Error(`empty audio file: ${AUDIO_FILE}`);
  }

  console.log(`Load profile start: base=${BASE_URL} concurrency=${CONCURRENCY} turns_per_worker=${TURNS_PER_WORKER} stream=${TALK_STREAM_MODE}`);
  const tasks = [];
  for (let i = 0; i < CONCURRENCY; i += 1) {
    tasks.push(workerRun(i + 1, audioBuffer));
  }
  const settled = await Promise.all(tasks);
  const rows = settled.flat();
  const total = rows.length;
  const success = rows.filter((x) => x.ok).length;
  const errors = total - success;
  const errorRate = total > 0 ? errors / total : 1;
  const latencies = rows.filter((x) => x.ok).map((x) => Number(x.elapsedMs || 0));
  const p50 = percentile(latencies, 0.50);
  const p95 = percentile(latencies, 0.95);

  console.log(`Load summary: total=${total} success=${success} errors=${errors} error_rate=${errorRate.toFixed(3)} p50_ms=${p50} p95_ms=${p95}`);
  const opsHeaders = APP_TOKEN ? { "X-APP-TOKEN": APP_TOKEN } : {};
  try {
    const ops = await httpJson(`${BASE_URL}/ops/metrics`, { headers: opsHeaders });
    if (ops.res.ok && ops.json) {
      console.log(
        `Ops snapshot: status=${ops.json.status} sample_count=${ops.json.metrics?.sampleCount ?? "n/a"} p95_total_ms=${ops.json.metrics?.p95TotalMs ?? "n/a"} error_rate=${Number(ops.json.metrics?.errorRate || 0).toFixed(3)}`
      );
    }
  } catch (_) {
    // non-fatal for load run
  }

  if (errorRate > MAX_ERROR_RATE) {
    console.error(`Load FAIL: error_rate ${errorRate.toFixed(3)} > max ${MAX_ERROR_RATE.toFixed(3)}`);
    process.exit(1);
  }
  if (p95 > MAX_P95_MS) {
    console.error(`Load FAIL: p95_ms ${p95} > max ${MAX_P95_MS}`);
    process.exit(1);
  }
  console.log("Load PASS");
}

main().catch((err) => {
  console.error(`Load runner failed: ${String(err?.message || err)}`);
  process.exit(1);
});
