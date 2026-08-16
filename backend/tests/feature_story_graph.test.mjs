import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { buildFeatureStoryGraph } from "../lib/feature_story_graph.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { buildModelPrompt } from "../lib/prompt_assembly.js";

function projectFixture() {
  return {
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    act: "Act II",
    featureSequence: "Midpoint Pressure",
    protagonistWant: "Mara wants to get Eli and June off the island.",
    protagonistNeed: "Mara must trust them without controlling them.",
    characterArcState: "Mara still treats dependence as danger.",
    endingImage: "Mara gives June the wheel.",
    unresolvedSetups: ["The cracked ferry token Mara gave June"],
    actThreePayoffPath: ["June returns the token when Mara gives her the wheel"],
  };
}

function scenesFixture() {
  return [
    {
      acceptedAt: 200,
      act: "Act II",
      sceneHeading: "INT. FERRY TERMINAL - NIGHT",
      summary: "Mara corners Eli beside the locked gate.",
      outcome: "Eli refuses to repeat the names until Mara trusts him.",
      decisions: ["Mara keeps control of the escape plan."],
      relationshipChanges: ["Eli stops cooperating with Mara."],
      nextScenePlan: "June takes the cracked ferry token and leaves through the service tunnel.",
      characterNames: ["Mara", "Eli"],
    },
    {
      acceptedAt: 100,
      act: "Act I",
      sceneHeading: "EXT. EAST FERRY DOCK - NIGHT",
      summary: "Mara burns the ferry ledger and gives June a cracked token.",
      outcome: "The ledger is gone; Eli's memory becomes the only surviving record.",
      irreversibleConsequences: ["Mara burns the ferry ledger beyond recovery."],
      revelations: ["Eli memorized the final page before it burned."],
      unresolvedSetups: ["The cracked ferry token Mara gave June"],
      nextScenePlan: "Mara must rely on Eli's memory to expose the names.",
      characterNames: ["Mara", "Eli", "June"],
    },
  ];
}

test("[feature-story-graph] derives chronological accepted state without inventing causal edges", () => {
  const graph = buildFeatureStoryGraph({
    projectContinuity: projectFixture(),
    acceptedScenes: scenesFixture(),
    acceptedCausalFacts: [{
      kind: "writer_correction",
      authority: "writer_correction",
      fact: "Mara goes back for both Eli and June.",
      replacesFacts: ["Mara abandons Eli.", "Mara abandons June."],
    }],
    dueStoryThread: {
      setup: "The cracked ferry token Mara gave June",
      promisedPayoff: "June returns the token when Mara gives her the wheel",
      sourceSceneHeading: "EXT. EAST FERRY DOCK - NIGHT",
      ageInScenes: 1,
      acceptedSceneCount: 2,
    },
  });

  assert.equal(graph.nodes[0].heading, "EXT. EAST FERRY DOCK - NIGHT");
  assert.equal(graph.nodes[1].heading, "INT. FERRY TERMINAL - NIGHT");
  assert.equal(graph.edges[0].kind, "accepted_handoff");
  assert.match(graph.edges[0].pressure, /rely on Eli's memory/i);
  assert.equal(graph.openThreads[0].sourceSceneId, "scene_1");
  assert.equal(graph.openThreads[0].status, "due");
  assert.equal(graph.bindingFacts[0].authority, "writer_correction");
  assert.equal(graph.currentState.lastAcceptedOutcome, "Eli refuses to repeat the names until Mara trusts him.");
  assert.equal(graph.currentState.nextScenePlan, "June takes the cracked ferry token and leaves through the service tunnel.");
  assert.equal(graph.edges.some((edge) => edge.kind === "causes"), false);
  assert.equal(graph.currentDueConsequence.kind, "irreversible_consequence");
  assert.match(graph.currentDueConsequence.fact, /burns the ferry ledger beyond recovery/i);
  assert.equal(graph.currentDueConsequence.status, "due");
  assert.equal(graph.consequenceSummary.total, 4);
});

test("[feature-story-graph] marks accepted changes as carried forward without claiming they are resolved", () => {
  const graph = buildFeatureStoryGraph({
    acceptedScenes: [
      {
        acceptedAt: 100,
        act: "Act I",
        sceneHeading: "EXT. EAST FERRY DOCK - NIGHT",
        characterNames: ["Mara", "June"],
        decisions: ["Mara gives June the cracked ferry token."],
        irreversibleConsequences: ["Mara burns the ferry ledger beyond recovery."],
      },
      {
        acceptedAt: 200,
        act: "Act II",
        sceneHeading: "INT. SERVICE TUNNEL - NIGHT",
        characterNames: ["Mara", "June"],
        summary: "June pockets Mara's cracked ferry token while burned ledger ash stains Mara's coat.",
        relationshipChanges: ["June no longer waits for Mara's permission."],
      },
    ],
  });

  const token = graph.consequenceLedger.find((item) => /cracked ferry token/i.test(item.fact));
  const ledger = graph.consequenceLedger.find((item) => /ferry ledger beyond recovery/i.test(item.fact));
  assert.equal(token.status, "carried_forward");
  assert.equal(token.referencedBySceneHeading, "INT. SERVICE TUNNEL - NIGHT");
  assert.equal(ledger.status, "carried_forward");
  assert.equal(graph.currentDueConsequence.fact, "June no longer waits for Mara's permission.");
  assert.equal(graph.edges.some((edge) => edge.kind === "causes"), false);
});

test("[feature-story-graph] removes a paid-off setup from the open queue using accepted evidence", () => {
  const graph = buildFeatureStoryGraph({
    projectContinuity: projectFixture(),
    dueStoryThread: {
      setup: "The cracked ferry token Mara gave June",
      promisedPayoff: "June returns the token when Mara gives her the wheel",
      ageInScenes: 4,
    },
    acceptedScenes: [{
      acceptedAt: 100,
      act: "Act III",
      sceneHeading: "INT. PILOT HOUSE - DAWN",
      storyObligationChanges: [{
        kind: "setup",
        obligation: "The cracked ferry token Mara gave June",
        status: "paid_off",
        result: "June returns the cracked token after Mara gives her the wheel.",
        evidence: "June sets the cracked token in Mara's open palm, then takes the wheel.",
      }],
    }],
  });

  assert.equal(graph.version, 3);
  assert.equal(graph.openThreads.length, 0);
  assert.equal(graph.storyObligationLedger[0].status, "paid_off");
  assert.match(graph.currentStoryObligationChange.result, /June returns the cracked token/i);
  assert.equal(graph.edges.some((edge) => edge.kind === "causes"), false);

  const prompt = buildModelPrompt({
    persona: "Clementine",
    creativeMemory: { featureStoryGraph: graph },
    userInput: "Continue the screenplay.",
  });
  assert.match(prompt, /evidence_grounded_obligation_ledger:/);
  assert.match(prompt, /status=paid_off; kind=setup/);
  assert.match(prompt, /accepted_evidence=June sets the cracked token/i);
  assert.match(prompt, /is PAID_OFF by accepted evidence/i);
  assert.match(prompt, /never reopen or repay the original obligation/i);
});

test("[feature-story-graph] turns a transformed accepted consequence into current state instead of a due replay", () => {
  const obligation = "Mara burns the ferry ledger beyond recovery.";
  const graph = buildFeatureStoryGraph({
    acceptedScenes: [{
      acceptedAt: 100,
      act: "Act I",
      sceneHeading: "EXT. EAST FERRY DOCK - NIGHT",
      irreversibleConsequences: [obligation],
    }, {
      acceptedAt: 200,
      act: "Act II",
      sceneHeading: "INT. HARBOR ARCHIVE - NIGHT",
      storyObligationChanges: [{
        kind: "accepted_consequence",
        obligation,
        status: "transformed",
        result: "The burned ledger makes Eli's memorized names the only admissible record.",
        evidence: "Eli recites the names while Mara holds up the ledger's burned binding.",
      }],
    }],
  });

  assert.equal(graph.currentDueConsequence, null);
  assert.equal(graph.consequenceLedger[0].status, "transformed");
  assert.match(graph.consequenceLedger[0].result, /only admissible record/i);
  assert.match(graph.currentStoryObligationChange.result, /only admissible record/i);
});

test("[feature-story-graph] carries a grounded causal handoff when no future scene plan exists", () => {
  const graph = buildFeatureStoryGraph({
    projectContinuity: projectFixture(),
    acceptedScenes: [
      {
        acceptedAt: 100,
        sceneHeading: "EXT. EAST FERRY DOCK - NIGHT",
        outcome: "Mara burns the ferry ledger beyond recovery.",
        causalHandoff: "Eli's memory is now the only surviving record.",
      },
      {
        acceptedAt: 200,
        sceneHeading: "INT. FERRY TERMINAL - NIGHT",
        outcome: "Eli refuses to repeat the names.",
      },
    ],
  });
  const prompt = buildModelPrompt({
    persona: "Clementine",
    creativeMemory: { featureStoryGraph: graph },
    userInput: "Continue the screenplay.",
  });

  assert.equal(graph.edges[0].kind, "accepted_handoff");
  assert.equal(graph.edges[0].pressure, "Eli's memory is now the only surviving record.");
  assert.match(prompt, /handoff=Eli's memory is now the only surviving record/i);
});

test("[feature-story-graph] survives account restore and applies canon correction before graph derivation", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-feature-story-graph-"));
  const first = createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
  await first.recordProjectContinuity({
    userId: "writer-graph",
    continuity: {
      ...projectFixture(),
      correctedTerms: ["cassette"],
      correctionReplacements: ["cassette -> MiniDV tape"],
      acceptedScenes: [{
        acceptedAt: 100,
        act: "Act I",
        sceneHeading: "INT. FERRY OFFICE - NIGHT",
        summary: "Mara hides the cassette in the radio cabinet.",
        outcome: "Eli finds the cassette before the fire.",
        revelations: ["The cassette contains the harbor master's confession."],
        nextScenePlan: "Eli carries the cassette to the dock.",
      }],
    },
  });

  const restored = createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
  const memory = await restored.getCreativeMemoryForPrompt({
    userId: "writer-graph",
    projectId: "split-ferries",
    query: "Continue from the accepted page.",
  });

  assert.ok(memory.featureStoryGraph);
  assert.match(JSON.stringify(memory.featureStoryGraph), /MiniDV tape/);
  assert.doesNotMatch(JSON.stringify(memory.featureStoryGraph), /cassette/i);
});

test("[feature-story-graph] centralized prompt exposes current state, accepted changes, and due promise", () => {
  const graph = buildFeatureStoryGraph({
    projectContinuity: projectFixture(),
    acceptedScenes: scenesFixture(),
    acceptedCausalFacts: [{
      kind: "irreversible_consequence",
      fact: "Mara burns the ferry ledger beyond recovery.",
      sourceAct: "Act I",
      sourceSceneHeading: "EXT. EAST FERRY DOCK - NIGHT",
    }],
    dueStoryThread: {
      setup: "The cracked ferry token Mara gave June",
      promisedPayoff: "June returns the token when Mara gives her the wheel",
      sourceSceneHeading: "EXT. EAST FERRY DOCK - NIGHT",
      ageInScenes: 1,
    },
  });
  const prompt = buildModelPrompt({
    persona: "Clementine",
    creativeMemory: { featureStoryGraph: graph },
    userInput: "What happens next?",
  });

  assert.match(prompt, /feature-story-graph:/);
  assert.match(prompt, /causal working state derived from accepted Studio pages/i);
  assert.match(prompt, /current_state:.*changed_state=Eli refuses/i);
  assert.match(prompt, /accepted_changes=.*Mara burns the ferry ledger beyond recovery/i);
  assert.match(prompt, /status=DUE; setup=The cracked ferry token Mara gave June/i);
  assert.match(prompt, /accepted_consequence_ledger:/);
  assert.match(prompt, /status=DUE_NOW; kind=irreversible_consequence; fact=Mara burns the ferry ledger beyond recovery/i);
  assert.match(prompt, /due_consequence_contract: the next scene must visibly inherit Mara burns the ferry ledger beyond recovery/i);
  assert.match(prompt, /begin from current_state/i);
});

test("[feature-story-graph] bounds prompt nodes while retaining the full accepted-scene count", () => {
  const acceptedScenes = Array.from({ length: 12 }, (_, index) => ({
    acceptedAt: index + 1,
    sceneHeading: `INT. LOCATION ${index + 1} - NIGHT`,
    outcome: `Story state ${index + 1} becomes binding.`,
  }));
  const graph = buildFeatureStoryGraph({
    projectContinuity: { projectId: "bounded-feature", act: "Act II" },
    acceptedScenes,
  });

  assert.equal(graph.acceptedSceneCount, 12);
  assert.equal(graph.nodes.length, 8);
  assert.equal(graph.nodes[0].heading, "INT. LOCATION 5 - NIGHT");
  assert.equal(graph.nodes[0].id, "scene_5");
  assert.equal(graph.nodes[7].heading, "INT. LOCATION 12 - NIGHT");
  assert.equal(graph.nodes[7].id, "scene_12");
});

test("[feature-story-graph] scans feature-length accepted history while bounding the prompt ledger", () => {
  const acceptedScenes = Array.from({ length: 30 }, (_, index) => ({
    acceptedAt: index + 1,
    sceneHeading: `INT. LOCATION ${index + 1} - NIGHT`,
    decisions: [`Codeword${index + 1}`],
  }));
  const graph = buildFeatureStoryGraph({ acceptedScenes });

  assert.equal(graph.consequenceSummary.total, 30);
  assert.equal(graph.consequenceSummary.due, 30);
  assert.equal(graph.consequenceLedger.length, 24);
  assert.equal(graph.currentDueConsequence.sourceSceneId, "scene_1");
});
