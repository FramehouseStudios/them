import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const smokePath = fileURLToPath(new URL("./run_studio_inspector_tabs_visual_smoke.mjs", import.meta.url));
const result = spawnSync("node", [smokePath], {
  encoding: "utf8",
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: process.env,
});

if (result.status !== 0) {
  throw new Error((result.stderr || result.stdout || "them mode picker smoke wrapper failed").trim());
}

const payload = JSON.parse((result.stdout || "").trim());
const transitions = Array.isArray(payload?.themModeTransitions) ? payload.themModeTransitions : [];
assert(transitions.length === 3, `Expected 3 them mode transitions, got ${transitions.length}`);

const modes = ["coach", "co_writer", "comfort"];
for (const mode of modes) {
  const transition = transitions.find((entry) => String(entry?.mode || "") === mode);
  assert(transition, `Missing them mode transition for ${mode}`);
  assert(transition.themCompanionMode === mode, `Expected themCompanionMode ${mode}, got ${transition.themCompanionMode || "<missing>"}`);
  assert(transition.themModeControlStyle === "segmented", `Expected segmented mode control for ${mode}`);
  assert(transition.themUnifiedSurface === true, `Expected unified them surface for ${mode}`);
}

console.log(JSON.stringify({
  ok: true,
  sourceSmoke: smokePath,
  transitions,
  themQueued: payload?.themQueued || null,
  themSeeded: payload?.themSeeded || null,
}, null, 2));
