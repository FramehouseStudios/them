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
  assert.equal(graph.nodes[7].heading, "INT. LOCATION 12 - NIGHT");
});
