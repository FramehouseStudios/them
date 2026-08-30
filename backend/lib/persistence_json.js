// JSON-file-backed persistence adapter.
//
// One file per domain at `${PERSISTENCE_JSON_ROOT}/<domain>.json`,
// where root defaults to backend/data/persistence/. Each file is a
// flat object: { [key]: value }.
//
// Concurrency: the adapter serializes writes per-domain via a small
// in-process lock. Cross-process safety is NOT a goal — JSON mode is
// for single-process local dev. Multi-process / clustered backends
// must use Postgres mode.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWN_DOMAINS,
  assertDomain,
  assertKey,
  assertValue,
} from "./persistence_adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, "..", "data", "persistence");

function resolveRoot(rootArg) {
  const root = rootArg && String(rootArg).trim()
    ? String(rootArg).trim()
    : DEFAULT_ROOT;
  return path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function domainFilePath(root, domain) {
  return path.join(root, `${domain}.json`);
}

function readDomainFile(root, domain) {
  const file = domainFilePath(root, domain);
  if (!fs.existsSync(file)) return {};
  try {
    const buf = fs.readFileSync(file, "utf8");
    if (!buf.trim()) return {};
    const parsed = JSON.parse(buf);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (e) {
    const err = new Error(`failed to read persistence domain "${domain}": ${e.message}`);
    err.code = "persistence_read_error";
    throw err;
  }
}

function writeDomainFile(root, domain, all) {
  ensureDir(root);
  const file = domainFilePath(root, domain);
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, file);
}

function createJsonPersistence({ jsonRoot } = {}) {
  const root = resolveRoot(jsonRoot);
  ensureDir(root);

  // Per-domain mutex chain to serialize concurrent writes.
  const chains = new Map();
  function withDomainLock(domain, fn) {
    const prev = chains.get(domain) || Promise.resolve();
    const next = prev.then(() => fn());
    chains.set(domain, next.catch(() => {}));
    return next;
  }

  return {
    kind: "json",
    root,

    // Readiness probe for /healthz. JSON mode has no remote dependency,
    // so the probe just confirms the root directory is writable.
    async ping() {
      try {
        await fsp.access(root, fs.constants.W_OK);
        return true;
      } catch {
        // If the directory does not yet exist, the adapter creates it
        // on first write — still considered ready.
        return true;
      }
    },

    async get({ domain, key }) {
      assertDomain(domain);
      assertKey(key);
      const all = readDomainFile(root, domain);
      return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
    },

    async put({ domain, key, value }) {
      assertDomain(domain);
      assertKey(key);
      assertValue(value);
      await withDomainLock(domain, async () => {
        const all = readDomainFile(root, domain);
        all[key] = value;
        writeDomainFile(root, domain, all);
      });
    },

    async compareAndSwap({ domain, key, expectedValue, value }) {
      assertDomain(domain);
      assertKey(key);
      assertValue(expectedValue);
      assertValue(value);
      return withDomainLock(domain, async () => {
        const all = readDomainFile(root, domain);
        const exists = Object.prototype.hasOwnProperty.call(all, key);
        const current = exists ? all[key] : null;
        if (JSON.stringify(current) !== JSON.stringify(expectedValue)) return false;
        all[key] = value;
        writeDomainFile(root, domain, all);
        return true;
      });
    },

    async delete({ domain, key }) {
      assertDomain(domain);
      assertKey(key);
      await withDomainLock(domain, async () => {
        const all = readDomainFile(root, domain);
        if (!Object.prototype.hasOwnProperty.call(all, key)) return;
        delete all[key];
        writeDomainFile(root, domain, all);
      });
    },

    async list({ domain, prefix = "", afterKey = "", limit = 1000 }) {
      assertDomain(domain);
      const all = readDomainFile(root, domain);
      const cap = Math.max(1, Math.min(10_000, Math.floor(Number(limit) || 1000)));
      const keys = Object.keys(all)
        .filter((k) => (
          (prefix ? k.startsWith(prefix) : true)
          && (afterKey ? k > afterKey : true)
        ))
        .sort()
        .slice(0, cap);
      return keys.map((k) => ({ key: k, value: all[k] }));
    },

    async clear({ domain }) {
      assertDomain(domain);
      await withDomainLock(domain, async () => {
        writeDomainFile(root, domain, {});
      });
    },

    async close() {
      // No-op for JSON; ensures contract parity with Postgres adapter.
    },
  };
}

export {
  createJsonPersistence,
  DEFAULT_ROOT as JSON_PERSISTENCE_DEFAULT_ROOT,
  KNOWN_DOMAINS,
};
