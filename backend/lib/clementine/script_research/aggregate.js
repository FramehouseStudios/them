// Script research aggregate — rollup across rows per owner (D009 strangler)
import { getRows } from "./store.js";

function mean(arr){ if(!arr.length) return 0; return arr.reduce((s,v)=> s+v,0)/arr.length; }

export function buildRollup(ownerKey){
  const rows = getRows(ownerKey);
  if (!rows.length) return { ownerKey: String(ownerKey||"default"), totalScripts:0, hedgesMean:0, passiveMean:0, avgLenMean:0, coverageMean:0, ghostPaidRatio:0, imageMissingRate:0, beatCoverage:0, favMotif:"listening shadow" };
  const hedges = rows.map(r=> Number(r.scores?.writer?.hedges||0));
  const passive = rows.map(r=> Number(r.scores?.writer?.passive||0));
  const avgLen = rows.map(r=> Number(r.scores?.writer?.avgLen||0));
  const coverage = rows.map(r=> Number(r.scores?.coverage?.overall||3));
  const ghostPaid = rows.map(r=> Number(r.scores?.ghostPaidRatio||0));
  const imageMissing = rows.map(r=> Array.isArray(r.scores?.image?.missing) && r.scores.image.missing.length?1:0);
  const beatCov = rows.map(r=> Number(r.scores?.beatCount||0)===40?1:0);
  const firstAt = Math.min(...rows.map(r=> r.createdAt||Date.now()));
  const lastAt = Math.max(...rows.map(r=> r.createdAt||Date.now()));
  return {
    ownerKey: String(ownerKey||"default"),
    totalScripts: rows.length,
    range: { firstAt, lastAt },
    hedgesMean: Math.round(mean(hedges)*10)/10,
    passiveMean: Math.round(mean(passive)*10)/10,
    avgLenMean: Math.round(mean(avgLen)),
    coverageMean: Math.round(mean(coverage)*10)/10,
    ghostPaidRatio: Math.round(mean(ghostPaid)*100)/100,
    imageMissingRate: Math.round(mean(imageMissing)*100)/100,
    beatCoverage: Math.round(mean(beatCov)*100)/100,
    favMotif: "listening shadow",
    recurringWeakness: rows.flatMap(r=> r.weaknesses||[]).slice(0,3),
    recurringStrength: rows.flatMap(r=> r.strengths||[]).slice(0,3)
  };
}

export function buildBriefInput(ownerKey){
  const rows = getRows(ownerKey);
  const rollup = buildRollup(ownerKey);
  return { ownerKey: String(ownerKey||"default"), totalScripts: rows.length, rows: rows.slice(-25), rollup };
}

export default { buildRollup, buildBriefInput };
