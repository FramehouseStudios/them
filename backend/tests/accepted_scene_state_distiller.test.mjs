import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildDeterministicAcceptedSceneState,
  distillAcceptedSceneState,
  parseAcceptedSceneStateResponse,
  validateAcceptedSceneStatePayload,
} from "../lib/accepted_scene_state_distiller.js";
import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

const PAGE = `INT. EAST FERRY - NIGHT

Mara tears up both tickets.

MARA
I choose June.

She locks the gate as Eli runs toward them.`;

function freshPersistence() {
  const root = mkdtempSync(path.join(tmpdir(), "them-accepted-state-"));
  return createJsonPersistence({ jsonRoot: root });
}

test("accepted scene state keeps only facts grounded by exact page evidence", () => {
  const payload = {
    sceneState: {
      summary: {
        fact: "Mara tears up both tickets.",
        evidence: "Mara tears up both tickets.",
      },
      outcome: {
        fact: "Mara locks the gate as Eli runs toward them.",
        evidence: "She locks the gate as Eli runs toward them.",
      },
      causalHandoff: {
        fact: "Eli is left outside the locked gate.",
        evidence: "She locks the gate as Eli runs toward them.",
      },
      decisions: [{
        fact: "Mara chooses June.",
        evidence: "I choose June.",
      }],
      revelations: [],
      relationshipChanges: [],
      irreversibleConsequences: [{
        fact: "Mara shoots Eli.",
        evidence: "She locks the gate as Eli runs toward them.",
      }],
    },
  };

  const result = validateAcceptedSceneStatePayload(payload, PAGE);

  assert.equal(result.acceptedFacts, 4);
  assert.equal(result.rejectedFacts, 1);
  assert.equal(result.fields.decisions[0].fact, "Mara chooses June.");
  assert.equal(result.fields.irreversibleConsequences, undefined);
});

test("accepted scene state rejects fabricated evidence even when the fact sounds plausible", () => {
  const result = validateAcceptedSceneStatePayload({
    decisions: [{
      fact: "Mara chooses June.",
      evidence: "Mara takes June's hand and leaves Eli behind.",
    }],
  }, PAGE);

  assert.equal(result.acceptedFacts, 0);
  assert.equal(result.rejectedFacts, 1);
  assert.deepEqual(result.fields, {});
});

test("malformed model output falls back to deterministic accepted-page state", async () => {
  const fallback = buildDeterministicAcceptedSceneState(PAGE);
  const state = await distillAcceptedSceneState({
    pageText: PAGE,
    renderText: async () => "I cannot return JSON today.",
  });

  assert.equal(state.source, "deterministic");
  assert.equal(state.outcome, fallback.outcome);
  assert.deepEqual(state.decisions, fallback.decisions);
});

test("model output may enrich accepted state without displacing deterministic fallback", async () => {
  const state = await distillAcceptedSceneState({
    pageText: PAGE,
    renderText: async () => JSON.stringify({
      sceneState: {
        summary: {
          fact: "Mara tears up both tickets.",
          evidence: "Mara tears up both tickets.",
        },
        outcome: {
          fact: "Mara locks the gate as Eli runs toward them.",
          evidence: "She locks the gate as Eli runs toward them.",
        },
        causalHandoff: {
          fact: "Eli remains outside the locked gate.",
          evidence: "She locks the gate as Eli runs toward them.",
        },
        decisions: [{
          fact: "Mara chooses June.",
          evidence: "I choose June.",
        }],
        revelations: [],
        relationshipChanges: [],
        irreversibleConsequences: [],
      },
    }),
  });

  assert.equal(state.source, "model_grounded");
  assert.equal(state.outcome, "Mara locks the gate as Eli runs toward them.");
  assert.equal(state.causalHandoff, "Eli remains outside the locked gate.");
  assert.equal(state.decisions.includes("Mara chooses June."), true);
  assert.equal(state.stateEvidence.some((item) => item.includes("I choose June.")), true);
});

test("fenced JSON responses parse without relaxing schema validation", () => {
  const parsed = parseAcceptedSceneStateResponse(`\`\`\`json
{"sceneState":{"summary":{},"outcome":{},"causalHandoff":{},"decisions":[],"revelations":[],"relationshipChanges":[],"irreversibleConsequences":[]}}
\`\`\``);

  assert.deepEqual(parsed.sceneState.decisions, []);
});

test("accepted pages persist immediately and receive non-blocking grounded enrichment", async () => {
  const store = createCreativeMemoryStore({
    persistence: freshPersistence(),
    renderAcceptedSceneState: async () => JSON.stringify({
      sceneState: {
        summary: {
          fact: "Mara tears up both tickets.",
          evidence: "Mara tears up both tickets.",
        },
        outcome: {
          fact: "Mara locks the gate as Eli runs toward them.",
          evidence: "She locks the gate as Eli runs toward them.",
        },
        causalHandoff: {
          fact: "Eli remains outside the locked gate.",
          evidence: "She locks the gate as Eli runs toward them.",
        },
        decisions: [{
          fact: "Mara chooses June.",
          evidence: "I choose June.",
        }],
        revelations: [],
        relationshipChanges: [],
        irreversibleConsequences: [],
      },
    }),
  });

  const summary = await store.recordTriggersFromTalkTurn({
    userId: "writer-accepted-state",
    transcript: "Keep this version.",
    reply: PAGE,
    acceptedPageText: PAGE,
    acceptedSceneContext: {
      anchorSceneId: "east-ferry-choice",
      documentRevisionId: "revision-12",
    },
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    projectContinuity: {
      act: "Act II",
      featureSequence: "Midpoint choice",
    },
    source: "talk_screenplay_output",
  });

  assert.equal(summary.acceptedScenesRecorded, 1);
  assert.equal(summary.acceptedSceneDistillationsQueued, 1);
  await store.drainAcceptedSceneDistillations();

  const ledger = await store.getCreativeMemoryLedger({ userId: "writer-accepted-state" });
  const project = ledger.projects.find((item) => item.projectId === "split-ferries");
  const scene = project.acceptedScenes[0];
  assert.equal(scene.stateDistillationSource, "model_grounded");
  assert.equal(scene.stateDistillationVersion, "1");
  assert.equal(scene.outcome, "Mara locks the gate as Eli runs toward them.");
  assert.equal(scene.nextScenePlan, "Eli remains outside the locked gate.");
  assert.equal(scene.decisions.includes("Mara chooses June."), true);
  assert.equal(scene.stateEvidence.some((item) => item.includes("I choose June.")), true);
});

test("generated draft pages never invoke accepted-state distillation", async () => {
  let renderCalls = 0;
  const store = createCreativeMemoryStore({
    persistence: freshPersistence(),
    renderAcceptedSceneState: async () => {
      renderCalls += 1;
      return "{}";
    },
  });

  const summary = await store.recordTriggersFromTalkTurn({
    userId: "writer-draft-only",
    transcript: "Draft the ferry choice.",
    reply: PAGE,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    source: "talk_screenplay_output",
  });
  await store.drainAcceptedSceneDistillations();

  assert.equal(summary.acceptedScenesRecorded, 0);
  assert.equal(summary.acceptedSceneDistillationsQueued, 0);
  assert.equal(renderCalls, 0);
});

test("an in-flight distillation cannot resurrect a writer-corrected page fact", async () => {
  let releaseRender;
  const renderGate = new Promise((resolve) => {
    releaseRender = resolve;
  });
  const page = `INT. COURTHOUSE STEPS - DAY

Mara burns the only affidavit before the cameras arrive.`;
  const store = createCreativeMemoryStore({
    persistence: freshPersistence(),
    renderAcceptedSceneState: async () => {
      await renderGate;
      return JSON.stringify({
        sceneState: {
          summary: {
            fact: "Mara burns the only affidavit.",
            evidence: "Mara burns the only affidavit before the cameras arrive.",
          },
          outcome: {
            fact: "Mara burns the only affidavit before the cameras arrive.",
            evidence: "Mara burns the only affidavit before the cameras arrive.",
          },
          causalHandoff: {
            fact: "The only affidavit is burned.",
            evidence: "Mara burns the only affidavit before the cameras arrive.",
          },
          decisions: [],
          revelations: [],
          relationshipChanges: [],
          irreversibleConsequences: [{
            fact: "Mara burns the only affidavit before the cameras arrive.",
            evidence: "Mara burns the only affidavit before the cameras arrive.",
          }],
        },
      });
    },
  });

  await store.recordTriggersFromTalkTurn({
    userId: "writer-correction-race",
    transcript: "Commit this scene.",
    reply: page,
    acceptedPageText: page,
    acceptedSceneContext: { anchorSceneId: "courthouse-fire" },
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    projectContinuity: {
      sceneSummary: "The cameras arrive at the courthouse.",
    },
    source: "talk_screenplay_output",
  });
  const correction = await store.recordTriggersFromTalkTurn({
    userId: "writer-correction-race",
    transcript: "Actually, Mara never burns the affidavit. It survives, and Mara hides it in Eli's ferry locker.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_turn",
  });
  assert.equal(correction.acceptedCanonFactsRetired, 1);

  releaseRender();
  await store.drainAcceptedSceneDistillations();

  const ledger = await store.getCreativeMemoryLedger({ userId: "writer-correction-race" });
  const project = ledger.projects.find((item) => item.projectId === "rain-docket");
  assert.doesNotMatch(JSON.stringify(project.acceptedScenes), /burns the only affidavit/i);
  assert.equal(project.acceptedScenes[0].summary, "The cameras arrive at the courthouse.");
  assert.match(JSON.stringify(project.writerCanonFacts), /survives/i);
});

test("an older scene revision cannot overwrite a newer accepted page", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstPage = "INT. FERRY - NIGHT\n\nMara locks the west gate.";
  const secondPage = "INT. FERRY - NIGHT\n\nMara opens the east gate for June.";
  const store = createCreativeMemoryStore({
    persistence: freshPersistence(),
    renderAcceptedSceneState: async ({ userPrompt }) => {
      if (userPrompt.includes("west gate")) await firstGate;
      const evidence = userPrompt.includes("west gate")
        ? "Mara locks the west gate."
        : "Mara opens the east gate for June.";
      return JSON.stringify({
        sceneState: {
          summary: { fact: evidence, evidence },
          outcome: { fact: evidence, evidence },
          causalHandoff: { fact: evidence, evidence },
          decisions: [],
          revelations: [],
          relationshipChanges: [],
          irreversibleConsequences: [],
        },
      });
    },
  });
  const base = {
    userId: "writer-revision-race",
    transcript: "Keep this revision.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    source: "talk_screenplay_output",
  };

  await store.recordTriggersFromTalkTurn({
    ...base,
    reply: firstPage,
    acceptedPageText: firstPage,
    acceptedSceneContext: { anchorSceneId: "ferry-choice", documentRevisionId: "revision-1" },
  });
  await store.recordTriggersFromTalkTurn({
    ...base,
    reply: secondPage,
    acceptedPageText: secondPage,
    acceptedSceneContext: { anchorSceneId: "ferry-choice", documentRevisionId: "revision-2" },
  });
  releaseFirst();
  await store.drainAcceptedSceneDistillations();

  const ledger = await store.getCreativeMemoryLedger({ userId: "writer-revision-race" });
  const scene = ledger.projects[0].acceptedScenes[0];
  assert.equal(scene.documentRevisionId, "revision-2");
  assert.match(scene.outcome, /opens the east gate/i);
  assert.doesNotMatch(JSON.stringify(scene), /west gate/i);
});
