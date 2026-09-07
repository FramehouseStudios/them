// Scene craft — per-scene want/obstacle/cost + theme/motif threading (screenwriting craft, D009)
// Pure helper, no backend/index.js growth.

function trimmed(v){ return String(v||"").trim(); }

export function buildSceneCraft({ sceneIndex = 1, totalScenes = 8, character, want, need, ghost, sequence, motif, theme } = {}) {
  const seq = sequence || { seq: sceneIndex, title: `Seq ${sceneIndex}`, setpiece: "setpiece" };
  const who = trimmed(character) || "JOHN";
  const w = trimmed(want) || `prove ${who.toLowerCase()} is safe`;
  const n = trimmed(need) || "admit fear";
  const g = trimmed(ghost) || "bedroom memory";
  const m = trimmed(motif) || "listening shadow";
  const t = trimmed(theme) || "cost of being remembered";
  const obstacle = `Scene ${sceneIndex} obstacle: ${seq.title.toLowerCase()} — ${seq.setpiece}`;
  const cost = `If ${who} gets want (${w}), pays with ${n} — ghost ${g.slice(0,60)}`;
  const imageEcho = `${m} returns with ${sceneIndex % 2 ? "stain" : "light change"}`;
  return {
    scene: sceneIndex,
    totalScenes,
    character: who,
    want: w,
    need: n,
    ghost: g,
    obstacle,
    cost,
    motif: m,
    theme: t,
    sequence: seq.title,
    setpiece: seq.setpiece,
    imageEcho,
    logline: `S${sceneIndex}: ${who} wants ${w} vs ${obstacle} → ${cost}`,
  };
}

export function threadMotifThroughScenes({ scenes, motif } = {}) {
  const m = trimmed(motif) || "listening shadow";
  return (Array.isArray(scenes) ? scenes : []).map((s, idx) => ({
    ...s,
    motifThread: idx % 2 === 0 ? m : `${m} echo`,
    imageEcho: s.imageEcho || `${m} ${idx % 2 ? "with stain" : "clean"}`,
  }));
}

export default { buildSceneCraft, threadMotifThroughScenes };
