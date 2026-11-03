import { createHash } from "node:crypto";

const SCREENPLAY_DRAFT_HASH_VERSION = "screenplay-draft-sha256-v1";

function canonicalizeScreenplayDraft(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function hashCanonicalScreenplayDraft(value) {
  return createHash("sha256")
    .update(canonicalizeScreenplayDraft(value), "utf8")
    .digest("hex");
}

export {
  SCREENPLAY_DRAFT_HASH_VERSION,
  canonicalizeScreenplayDraft,
  hashCanonicalScreenplayDraft,
};
