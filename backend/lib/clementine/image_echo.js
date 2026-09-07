// Image echo — per-scene image echo with scar (writing craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildImageEcho({ scene, motif, scar } = {}) {
  const s = Math.max(1, Number(scene)||1);
  const m = trimmed(motif) || "listening shadow";
  const c = trimmed(scar) || "second hand missing";
  // opening vs final: scar evolves
  const img = s === 1 ? `${m} clean` : s === 8 ? `${m} with ${c} — scar kept` : `${m} with stain`;
  return { scene: s, motif: m, scar: c, image: img, echo: `${m} ${s===8?"final":"mid"}: ${img}` };
}

export function threadImageEcho({ scenes, motif, scar } = {}) {
  const arr = Array.isArray(scenes) ? scenes : [];
  return arr.map((s, idx)=> ({ ...s, imageEcho: buildImageEcho({ scene: idx+1, motif, scar }).image }));
}

export default { buildImageEcho, threadImageEcho };
