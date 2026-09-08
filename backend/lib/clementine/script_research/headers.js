// Script research headers — x-research-* for talk_clementine_headers (D009)
import { getBrief } from "./store.js";

function encodeCap(v, cap){
  const s = String(v||"");
  if(!s) return "";
  try{ return encodeURIComponent(s.slice(0,cap)); }catch{ return ""; }
}

export function buildResearchHeaders({ ownerKey } = {}){
  const entry = getBrief(ownerKey);
  if(!entry || !entry.brief) return {};
  const b = entry.brief;
  const strengths = Array.isArray(b.strengths)? b.strengths.join(" | "): "";
  const weaknesses = Array.isArray(b.weaknesses)? b.weaknesses.join(" | "): "";
  const exerciseTitle = b.exercise?.title||"";
  const exercisePrompt = b.exercise?.prompt||"";
  const nextHint = b.nextSceneHint||"";
  const citations = Array.isArray(b.citations)? b.citations.join(" | "): "";
  return {
    "x-research-brief": encodeCap(JSON.stringify({strengths: b.strengths, weaknesses: b.weaknesses, citations: b.citations}), 800),
    "x-research-strengths": encodeCap(strengths, 500),
    "x-research-weaknesses": encodeCap(weaknesses, 500),
    "x-research-exercise": encodeCap(JSON.stringify(b.exercise||{}), 800),
    "x-research-exercise-title": encodeCap(exerciseTitle, 200),
    "x-research-next-hint": encodeCap(nextHint, 300),
    "x-research-citations": encodeCap(citations, 400),
  };
}

export function applyResearchHeaders(res, { ownerKey } = {}){
  const headers = buildResearchHeaders({ ownerKey });
  for(const [k,v] of Object.entries(headers)){
    if(v) try{ res.setHeader(k, v); }catch{}
  }
  return headers;
}

export default { buildResearchHeaders, applyResearchHeaders };
