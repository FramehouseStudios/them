import { createHash } from "node:crypto";

const MAX_OUTLINE_MUTATION_RECEIPTS = 64;
const OUTLINE_MUTATION_HASH_VERSION = 1;

const NON_SEMANTIC_MUTATION_KEYS = new Set([
  "baseOutlineRevision",
  "baseRevision",
  "base_outline_revision",
  "base_revision",
  "clientRequestId",
  "client_request_id",
  "expectedOutlineRevision",
  "expected_outline_revision",
  "outlineRevision",
  "outline_revision",
  "requestId",
  "request_id",
]);

const SERVER_TIME_KEYS = new Set([
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
]);

function normalizeOutlineRevision(value, fallback = 0) {
  const normalizedFallback = toNonnegativeSafeInteger(fallback);
  return toNonnegativeSafeInteger(value) ?? normalizedFallback ?? 0;
}

function stableCanonicalJson(value) {
  return JSON.stringify(canonicalizeJson(value));
}

function buildOutlineMutationRequestHash(body, { operation = "replace" } = {}) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const semanticIntent = {
    hashVersion: OUTLINE_MUTATION_HASH_VERSION,
    operation: normalizeOperation(operation),
    acts: semanticOutlineCollection(source.acts),
    scenes: semanticOutlineCollection(source.scenes),
    beats: semanticOutlineCollection(source.beats),
    title: explicitField(source, "title"),
    phase: explicitField(source, "phase"),
  };
  return createHash("sha256")
    .update(stableCanonicalJson(semanticIntent), "utf8")
    .digest("hex");
}

function normalizeOutlineMutationReceipts(receipts) {
  if (!Array.isArray(receipts)) return [];

  const normalized = receipts
    .map(normalizeReceipt)
    .filter(Boolean)
    .sort(compareReceipts);
  const seenRequestIds = new Set();
  const deduped = [];
  for (const receipt of normalized) {
    if (seenRequestIds.has(receipt.requestId)) continue;
    seenRequestIds.add(receipt.requestId);
    deduped.push(receipt);
    if (deduped.length >= MAX_OUTLINE_MUTATION_RECEIPTS) break;
  }
  return deduped;
}

function appendBoundedOutlineReceipt(receipts, receipt) {
  const existing = Array.isArray(receipts) ? receipts : [];
  return normalizeOutlineMutationReceipts([...existing, receipt]);
}

function toNonnegativeSafeInteger(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol") continue;
      result[key] = canonicalizeJson(item);
    }
    return result;
  }
  return value;
}

function semanticOutlineCollection(value) {
  if (!Array.isArray(value)) return [];
  return value.map(stripNonSemanticMutationFields);
}

function stripNonSemanticMutationFields(value) {
  if (Array.isArray(value)) {
    return value.map(stripNonSemanticMutationFields);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (NON_SEMANTIC_MUTATION_KEYS.has(key) || SERVER_TIME_KEYS.has(key)) continue;
      if (item === undefined || typeof item === "function" || typeof item === "symbol") continue;
      result[key] = stripNonSemanticMutationFields(item);
    }
    return result;
  }
  return value;
}

function explicitField(source, key) {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    return { present: false };
  }
  return {
    present: true,
    value: stripNonSemanticMutationFields(source[key]),
  };
}

function normalizeOperation(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized || "replace";
}

function firstDefined(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
      return source[key];
    }
  }
  return undefined;
}

function normalizeReceipt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const requestId = normalizeText(firstDefined(value, [
    "requestId",
    "request_id",
    "clientRequestId",
    "client_request_id",
  ]));
  const requestHash = normalizeText(firstDefined(value, ["requestHash", "request_hash"])).toLowerCase();
  if (!requestId || !requestHash) return null;

  return {
    requestId,
    hashVersion: normalizeOutlineRevision(firstDefined(value, ["hashVersion", "hash_version"]), 1) || 1,
    operation: normalizeOperation(firstDefined(value, ["operation"])),
    requestHash,
    baseRevision: normalizeOutlineRevision(firstDefined(value, ["baseRevision", "base_revision"])),
    committedRevision: normalizeOutlineRevision(firstDefined(value, [
      "committedRevision",
      "committed_revision",
    ])),
    committedAt: normalizeOutlineRevision(firstDefined(value, ["committedAt", "committed_at"])),
  };
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compareReceipts(left, right) {
  if (left.committedRevision !== right.committedRevision) {
    return left.committedRevision > right.committedRevision ? -1 : 1;
  }
  const requestIdOrder = compareCodeUnits(left.requestId, right.requestId);
  if (requestIdOrder !== 0) return requestIdOrder;
  if (left.committedAt !== right.committedAt) {
    return left.committedAt > right.committedAt ? -1 : 1;
  }
  if (left.hashVersion !== right.hashVersion) {
    return left.hashVersion > right.hashVersion ? -1 : 1;
  }
  const hashOrder = compareCodeUnits(left.requestHash, right.requestHash);
  if (hashOrder !== 0) return hashOrder;
  const operationOrder = compareCodeUnits(left.operation, right.operation);
  if (operationOrder !== 0) return operationOrder;
  if (left.baseRevision !== right.baseRevision) {
    return left.baseRevision > right.baseRevision ? -1 : 1;
  }
  return 0;
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export {
  MAX_OUTLINE_MUTATION_RECEIPTS,
  OUTLINE_MUTATION_HASH_VERSION,
  normalizeOutlineRevision,
  stableCanonicalJson,
  buildOutlineMutationRequestHash,
  normalizeOutlineMutationReceipts,
  appendBoundedOutlineReceipt,
};
