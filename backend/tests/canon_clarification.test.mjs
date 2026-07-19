import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCanonClarificationPayload } from "../lib/canon_clarification.js";

test("canon clarification payload exposes only a durable pending ambiguity", () => {
  const payload = buildCanonClarificationPayload({
    canonCorrectionAmbiguity: {
      id: "canon_ambiguity_123",
      status: "pending",
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      correctionText: "Mara goes back for both of them.",
      candidateFacts: [
        "Mara abandons Eli at the east ferry dock.",
        "Mara abandons June at the east ferry dock.",
      ],
      correctionMemoryId: "episode-9",
      createdAt: 1_725_000_000_000,
    },
  });

  assert.deepEqual(payload, {
    id: "canon_ambiguity_123",
    status: "pending",
    project_id: "split-ferries",
    project_title: "Split Ferries",
    correction_text: "Mara goes back for both of them.",
    candidate_facts: [
      "Mara abandons Eli at the east ferry dock.",
      "Mara abandons June at the east ferry dock.",
    ],
    correction_memory_id: "episode-9",
    selected_fact: null,
    receipt_id: null,
    created_at: 1_725_000_000_000,
    resolved_at: null,
  });
});

test("canon clarification payload rejects incomplete or resolved records", () => {
  assert.equal(buildCanonClarificationPayload(null), null);
  assert.equal(buildCanonClarificationPayload({ canonCorrectionAmbiguity: {} }), null);
  assert.equal(buildCanonClarificationPayload({
    canonCorrectionAmbiguity: {
      id: "canon_ambiguity_123",
      status: "pending",
      candidateFacts: ["Only one candidate."],
    },
  }), null);
  assert.equal(buildCanonClarificationPayload({
    canonCorrectionAmbiguity: {
      id: "canon_ambiguity_123",
      status: "resolved",
      candidateFacts: ["First.", "Second."],
    },
  }), null);
});
