// Clementine voice — she knows your voice, grows, vulnerable ask loop.
// Writer voice profile per ownerKey, learns cadence, admits uncertainty.
// D009 strangler.

const profiles = new Map();

export function getWriterVoiceProfile(ownerKey) {
  const k = String(ownerKey||"").trim();
  if (!k) return { voice: "grounded", cadence: "naturalistic pause", learned: 0 };
  if (!profiles.has(k)) profiles.set(k, { voice: "grounded", cadence: "naturalistic pause", learned: 0, history: [] });
  return profiles.get(k);
}

export function updateWriterVoiceProfile(ownerKey, { voice, cadence, sample } = {}) {
  const p = getWriterVoiceProfile(ownerKey);
  if (voice) p.voice = String(voice);
  if (cadence) p.cadence = String(cadence);
  if (sample) {
    p.history.push(String(sample).slice(0,120)); if (p.history.length>20) p.history.shift();
    // lexicon learn: top 5 writer words (simple frequency over history)
    const words = p.history.join(" ").toLowerCase().match(/[a-z]{3,}/g) || [];
    const freq = new Map();
    for (const w of words) freq.set(w, (freq.get(w)||0)+1);
    p.lexicon = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w])=>w);
  }
  p.learned = Math.min(10, p.learned+1);
  return p;
}

export function getLexicon(ownerKey) {
  const p = getWriterVoiceProfile(ownerKey);
  return Array.isArray(p.lexicon) ? [...p.lexicon] : [];
}

export function shouldAsk({ draft, confidence = 0.7 } = {}) {
  const low = Number(confidence) < 0.6;
  const thin = String(draft||"").length < 400;
  return low || thin;
}

export function buildVulnerabilityAsk({ project, parsed, confidence } = {}) {
  if (!shouldAsk({ draft: project?.versions?.[0]?.draft, confidence })) return null;
  const char = project?.characterContexts?.[0]?.name || parsed?.characters?.[0] || "John";
  const q = `I’m not sure — do you want ${char} to stay or be remembered? I can write both splits and you flip A/B.`;
  return { question: q, options: [`${char} stays`, `${char} is remembered`], xUncertainty: String(confidence||0.5) };
}

export default { getWriterVoiceProfile, updateWriterVoiceProfile, shouldAsk, buildVulnerabilityAsk };
