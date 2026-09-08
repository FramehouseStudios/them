// Script research cron — nightly loop (D009 strangler, hash-guard, concurrency 1)
// Runs via setInterval or backend worker. Offline friendly: uses mockBrief when no chatSupplier.
// samantha is clementine.
import { getRows, rowsHash, getBrief, setBrief } from "./store.js";
import { buildRollup, buildBriefInput } from "./aggregate.js";
import { buildBriefWithLLM } from "./brief_llm.js";

let _running = false;

export async function runResearchCron({ ownerKeys = [], chatSupplier, baseSystem } = {}){
  if(_running) return { ok:false, reason:"already_running" };
  _running = true;
  const results = [];
  try{
    const keys = Array.isArray(ownerKeys) && ownerKeys.length ? ownerKeys : ["default"];
    for(const key of keys){
      const rows = getRows(key);
      if(!rows.length) { results.push({ ownerKey:key, skipped:"no_rows" }); continue; }
      const hash = rowsHash(key);
      const existing = getBrief(key);
      if(existing && existing.hash===hash) { results.push({ ownerKey:key, skipped:"unchanged", hash }); continue; }
      const rollup = buildRollup(key);
      const input = buildBriefInput(key);
      const { brief, prompt, usage } = await buildBriefWithLLM({ ownerKey:key, rollup, rows: input.rows, chatSupplier, baseSystem });
      setBrief({ ownerKey:key, hash, brief, usage });
      results.push({ ownerKey:key, hash, brief: brief?.strengths||[], usage });
    }
    return { ok:true, results };
  }finally{ _running = false; }
}

export function startResearchCron({ intervalMs = 24*60*60*1000, ownerKeysProvider, chatSupplier, baseSystem } = {}){
  const ms = Math.max(60*1000, Number(intervalMs)|| 24*60*60*1000);
  const timer = setInterval(async ()=>{
    try{
      const keys = typeof ownerKeysProvider==="function" ? await ownerKeysProvider() : ["default"];
      await runResearchCron({ ownerKeys: keys, chatSupplier, baseSystem });
    }catch{}
  }, ms);
  // do not keep process alive in tests
  if(timer.unref) timer.unref();
  return { timer, stop: ()=> clearInterval(timer) };
}

export default { runResearchCron, startResearchCron };
