// Script research score — deterministic strengths/weaknesses (D009 strangler, no 33626 growth)
// Wraps coverage/ghost/image/beat/theme/writer modules. samantha is clementine.
import { rateCoverage } from "../coverage.js";
import { buildGhostPayoffLedger } from "../ghost_payoff_ledger.js";
import { trackMotif } from "../image_ledger.js";
import { assignCraftPerBeat } from "../beat_craft.js";
import { learnFromDraft } from "../writer_learning.js";

function trimmed(v){ return String(v||"").trim(); }

export function scoreScript({ draft, genre="horror", tone="dark", character="John", ghost="bedroom memory", want="prove safe", need="admit fear", motif="listening shadow", scar="second hand missing", finalImage="final echo bedroom", project, ownerKey } = {}){
  const text = String(draft||"");
  const coverage = (()=>{ try{ return rateCoverage({ draft: text, project }); }catch{ return { overall:3, verdict:"CONSIDER", notes: [] }; }})();
  const ghostLedger = (()=>{ try{ return buildGhostPayoffLedger({ characters:[{name:character, ghost, want, need}], finalImage }); }catch{ return []; }})();
  const image = (()=>{ try{ return trackMotif({ draft: text, motif, sequences: [{seq:1,title:"S1"},{seq:2,title:"S2"},{seq:3,title:"S3"},{seq:4,title:"S4"},{seq:5,title:"S5"},{seq:6,title:"S6"},{seq:7,title:"S7"},{seq:8,title:"S8"}] }); }catch{ return { missing: [], total:0 }; }})();
  const beat = (()=>{ try{ return assignCraftPerBeat({ genre, tone, totalPages:90 }); }catch{ return []; }})();
  const writer = (()=>{ try{ return learnFromDraft({ ownerKey: ownerKey||"default", draft: text, motif }); }catch{ return { hedges:0, passive:0, avgLen:0 }; }})();
  const ghostPaidRatio = ghostLedger.length ? ghostLedger.filter(g=> g.paid).length / ghostLedger.length : 0;
  const imageMissing = Array.isArray(image.missing)? image.missing: [];
  const strengths = [];
  const weaknesses = [];
  if (coverage.overall >=4) strengths.push("Clean format — headings + cues correct");
  else weaknesses.push("Add INT./EXT. heading + character cue so reader can locate scene");
  if (!text.includes("INT.") && !text.includes("EXT.")) weaknesses.push("No heading — add INT./EXT. so reader can locate");
  if (text.length < 800) weaknesses.push("Thin draft — add want/obstacle/cost per 1-8 (len <800)");
  if (ghostPaidRatio===1 && ghostLedger.length) strengths.push("Ghost always paid at final image with scar");
  else if (ghostPaidRatio<1) weaknesses.push("Ghost not paid — final image echo missing scar");
  if (imageMissing.length===0) strengths.push("Motif threaded every sequence");
  if (imageMissing.some(m=> m.seq===4)) weaknesses.push("Motif missing at Midpoint seq4 p45 — add imageEcho listening shadow");
  if (writer.hedges>2) weaknesses.push(`Hedges very/really ${writer.hedges} — tighten hedges`);
  if (writer.passive>1) weaknesses.push(`Passive was -ing ${writer.passive} — active voice`);
  if (writer.avgLen>80) weaknesses.push(`Long lines avg ${writer.avgLen} — shorten`);
  if (writer.hedges<=1 && writer.passive<=1) strengths.push("Active, tight prose");
  if (beat.length===40) strengths.push("40 beats / 8 seq craft complete");
  const scores = { coverage, ghostLedger, ghostPaidRatio, image, beatCount: beat.length, writer, excerptLen: text.slice(0,800).length };
  return { scores, strengths: strengths.slice(0,5), weaknesses: weaknesses.slice(0,5) };
}

export default { scoreScript };
