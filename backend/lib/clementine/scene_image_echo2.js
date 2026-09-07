// Scene image echo 2 — per-scene image echo variation (writing craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildSceneImageEcho2({ scene, motif, variation } = {}) {
  const s = Math.max(1, Number(scene)||1);
  const m = trimmed(motif) || "listening shadow";
  const v = trimmed(variation) || (s % 3 === 1 ? "clean" : s % 3 === 2 ? "stain" : "scar");
  return { scene: s, motif: m, variation: v, image: `${m} ${v} at scene ${s}`, echo: `${m} echo ${v}` };
}

export default { buildSceneImageEcho2 };
