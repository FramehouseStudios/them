import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SCREENPLAY_DRAFT_HASH_VERSION,
  canonicalizeScreenplayDraft,
  hashCanonicalScreenplayDraft,
} from "../lib/screenplay_draft_receipt_protocol.js";

test("[screenplay-draft-receipt] canonical hash contract normalizes CRLF and ECMAScript edges", () => {
  const raw = "\uFEFF  A\r\nB\u3000";
  const canonical = "A\nB";

  assert.equal(SCREENPLAY_DRAFT_HASH_VERSION, "screenplay-draft-sha256-v1");
  assert.equal(canonicalizeScreenplayDraft(raw), canonical);
  assert.equal(
    hashCanonicalScreenplayDraft(raw),
    "23519a43c66b4c342f25b32e09797ec5f3fc0be388cd8243fb3449afbdce4013"
  );
});

test("[screenplay-draft-receipt] lone carriage returns remain significant", () => {
  const loneCR = "INT. LAB\rJOHN";
  const lineFeed = "INT. LAB\nJOHN";

  assert.equal(canonicalizeScreenplayDraft(loneCR), loneCR);
  assert.notEqual(hashCanonicalScreenplayDraft(loneCR), hashCanonicalScreenplayDraft(lineFeed));
});

test("[screenplay-draft-receipt] nullish and UTF-8 vectors are stable", () => {
  const utf8 = "INT. CAFÉ – NIGHT\nÉVA\nÇa commence.";

  assert.equal(canonicalizeScreenplayDraft(null), "");
  assert.equal(canonicalizeScreenplayDraft(undefined), "");
  assert.equal(
    hashCanonicalScreenplayDraft(utf8),
    "049467d11d16f89b4ec82a467272e8ecf99f1bef090308537a9b4e75eaf8608f"
  );
});
