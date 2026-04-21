import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UTILS_FILE_PATH = fileURLToPath(import.meta.url);
const UTILS_DIR_PATH = path.dirname(UTILS_FILE_PATH);
const BACKEND_ROOT_DIR = path.dirname(UTILS_DIR_PATH);
const DEFAULT_PERSONA_PRESET = "clementine";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNumberInRange(value, min, max, fallback) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseBool(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

function parseOneOf(value, allowedSet, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedSet.has(normalized) ? normalized : fallback;
}

function normalizeElevenLabsVoiceId(value, fallback = "") {
  const fallbackValue = String(fallback || "").trim();
  const raw = String(value || "").trim();
  if (!raw) return fallbackValue;

  if (/^[A-Za-z0-9_-]{12,128}$/.test(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = String(segments[i] || "").trim();
      if (/^[A-Za-z0-9_-]{12,128}$/.test(segment)) return segment;
    }
  } catch (_) {
    // no-op
  }

  return fallbackValue;
}

function resolveStorePath(defaultFilename, envValue) {
  const configured = String(envValue || "").trim();
  const filename = configured || defaultFilename;
  if (path.isAbsolute(filename)) return filename;
  return path.resolve(BACKEND_ROOT_DIR, filename);
}

function writeJsonFileAtomic(filePath, payload, logTag = "store") {
  const directory = path.dirname(filePath);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {
      // no-op cleanup path
    }
    console.error(`[${logTag}] Failed atomic write ${filePath}:`, err);
    return false;
  }
}

function normalizePersonaPreset(value, fallbackPreset = DEFAULT_PERSONA_PRESET) {
  const resolvedFallback = String(fallbackPreset || DEFAULT_PERSONA_PRESET).trim().toLowerCase() || DEFAULT_PERSONA_PRESET;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return resolvedFallback;
  if (
    normalized === "flirty-playful" ||
    normalized === "soft-nurturing" ||
    normalized === "direct-big-sis" ||
    normalized === resolvedFallback
  ) {
    return resolvedFallback;
  }
  return resolvedFallback;
}

function createRequestId() {
  return randomBytes(8).toString("hex");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimToMax(value, maxChars) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trim()}…`;
}

function slugifyForFilename(value, fallback = "note") {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || fallback;
}

function normalizeSnippet(text, maxChars = 160) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

function clampUnit(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, n));
}

export {
  BACKEND_ROOT_DIR,
  clampUnit,
  createRequestId,
  escapeRegex,
  normalizeElevenLabsVoiceId,
  normalizePersonaPreset,
  normalizeSnippet,
  parseBool,
  parseNonNegativeInt,
  parseNumberInRange,
  parseOneOf,
  parsePositiveInt,
  resolveStorePath,
  slugifyForFilename,
  trimToMax,
  writeJsonFileAtomic,
};
