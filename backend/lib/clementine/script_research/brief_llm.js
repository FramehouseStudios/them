// Script research brief LLM — prompt + withOutputContract (D009 strangler, offline friendly)
// samantha is clementine — uses clementine_voice/intuition alias.

function trimmed(v){ return String(v||"").trim(); }

export const BRIEF_CONTRACT = {
  type: "object",
  required: ["strengths","weaknesses","exercise","nextSceneHint"],
  properties: {
    strengths: { type:"array", items:{type:"string"}, minItems:2, maxItems:3 },
    weaknesses: { type:"array", items:{type:"string"}, minItems:2, maxItems:3 },
    exercise: { type:"object", required:["title","prompt","lines"], properties:{ title:{type:"string"}, prompt:{type:"string"}, lines:{type:"array", items:{type:"string"}} } },
    nextSceneHint: { type:"string" },
    citations: { type:"array", items:{type:"string"} }
  }
};

export function buildPrompt({ ownerKey, rollup, rows } = {}){
  const r = rollup||{};
  const list = Array.isArray(rows)? rows: [];
  return `Owner ${trimmed(ownerKey)||"default"} — ${r.totalScripts||0} scripts, coverageMean ${r.coverageMean||0}, ghostPaidRatio ${r.ghostPaidRatio||0}, imageMissingRate ${r.imageMissingRate||0}, hedgesMean ${r.hedgesMean||0}
Rollup: ${JSON.stringify({hedgesMean:r.hedgesMean, passiveMean:r.passiveMean, coverageMean:r.coverageMean, ghostPaidRatio:r.ghostPaidRatio, imageMissingRate:r.imageMissingRate}).slice(0,400)}
Rows (excerpt + scores, newest first, 800 chars each):
${list.slice(-25).reverse().slice(0,12).map((row,i)=> `#${i+1} ${row.genre||"horror"}/${row.tone||"dark"} pages:${row.pages||1} coverage:${row.scores?.coverage?.overall||3} ${row.scores?.coverage?.verdict||""} ghostPaid:${row.scores?.ghostPaidRatio||0} imageMissing:${(row.scores?.image?.missing||[]).map(m=>m.seq).join(",")||"none"} hedges:${row.scores?.writer?.hedges||0} excerpt:"${String(row.excerpt||"").replace(/\n/g," ").slice(0,120)}"`).join("\n")}

Task: output JSON only per contract. Cite citations from rows only. Exercise must use favMotif listening shadow + scar second hand missing, writable in 55-line Fountain (one INT. + one cue + 6 lines).`;
}

export function mockBrief({ rollup, rows } = {}){
  const r = rollup||{};
  const strengths = [];
  const weaknesses = [];
  if ((r.coverageMean||0) >=3.5) strengths.push("Image echo threaded S1 clean → S8 scar kept (rollup)");
  else strengths.push("Ghost always paid at final image with scar (where present)");
  strengths.push("Dialogue voice distinct: John short control vs Sally lyrical (lexicon hit)");
  if ((r.imageMissingRate||0) >0.3) weaknesses.push("Motif drops at seq4 Midpoint 4/9 scripts (p45) — add imageEcho");
  else weaknesses.push("Thin draft in recent scripts (len <800) — add want/obstacle/cost per 1-8");
  if ((r.hedgesMean||0) >2) weaknesses.push(`Hedges very/really ${r.hedgesMean} avg — tighten hedges`);
  else weaknesses.push("Passive was -ing occasional — active voice");
  return {
    strengths: strengths.slice(0,3),
    weaknesses: weaknesses.slice(0,3),
    exercise: { title:"Midpoint listening", prompt:"Write INT. BEDROOM - NIGHT where Sally hears listening shadow at p45 and chooses cost", lines:["INT. BEDROOM - NIGHT","SALLY listens — listening shadow with quiet hands","SALLY","I stay?","(beat)","The clock with second hand missing ticks."]},
    nextSceneHint: "Next time you say 'really', I’ll tighten to active — want me to?",
    citations: ["Row 2,4,6 imageMissing:4","Rollup hedgesMean "+String(r.hedgesMean||0)]
  };
}

export function validateBrief(obj){
  if(!obj || typeof obj!=="object") return { ok:false, error:"not object" };
  const c = BRIEF_CONTRACT;
  for(const k of c.required){ if(!(k in obj)) return { ok:false, error:`missing ${k}` }; }
  if(!Array.isArray(obj.strengths) || obj.strengths.length<2 || obj.strengths.length>3) return { ok:false, error:"strengths 2-3" };
  if(!Array.isArray(obj.weaknesses) || obj.weaknesses.length<2 || obj.weaknesses.length>3) return { ok:false, error:"weaknesses 2-3" };
  if(!obj.exercise || typeof obj.exercise.title!=="string") return { ok:false, error:"exercise title" };
  return { ok:true };
}

// Real LLM path: caller injects chatSupplier(baseSystem + prompt + contract), we just build prompt + validate here for determinism.
export async function buildBriefWithLLM({ ownerKey, rollup, rows, chatSupplier, baseSystem } = {}){
  const prompt = buildPrompt({ ownerKey, rollup, rows });
  if (typeof chatSupplier !== "function") {
    const mock = mockBrief({ rollup, rows });
    return { brief: mock, prompt, usage: { tokens: 0, mocked:true } };
  }
  try{
    const raw = await chatSupplier({ system: baseSystem||"You are Clementine — story partner. samantha is clementine. Concise, cite rows.", prompt, contract: BRIEF_CONTRACT });
    const obj = typeof raw==="string"? JSON.parse(raw): raw;
    const v = validateBrief(obj);
    if(!v.ok) return { brief: mockBrief({ rollup, rows }), prompt, usage:{tokens:0, fallback:v.error} };
    return { brief: obj, prompt, usage:{tokens: JSON.stringify(obj).length} };
  }catch(e){
    return { brief: mockBrief({ rollup, rows }), prompt, usage:{tokens:0, error:String(e&&e.message||e)} };
  }
}

export default { BRIEF_CONTRACT, buildPrompt, mockBrief, validateBrief, buildBriefWithLLM };
