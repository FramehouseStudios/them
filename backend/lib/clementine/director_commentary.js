// Director commentary — industry notes in-line while pages write.
// D009 strangler.

import { rateCoverage } from "./coverage.js";

export function buildCommentary({ project, draft, page, line } = {}) {
  const coverage = (()=>{ try{ return rateCoverage({ draft: draft||"", project }); }catch{ return { overall:3, verdict:"CONSIDER" }; }})();
  const notes = [];
  if (coverage.overall < 3) notes.push(`Pacing: tight, need breath on line ${Number(line||page)||1}`);
  if (project?.characterContexts?.length) notes.push(`${project.characterContexts[0].name}'s want is thinning — add image echo`);
  return { coverage, notes, xCommentary: notes.join(" | "), line: Number(line||0)||null, page: Number(page||0)||null, xCommentaryLine: notes.join(" | ") };
}
export function buildInlineCommentary({ project, draft, lines } = {}) {
  const arr = Array.isArray(lines) ? lines : String(draft||"").split("\n");
  return arr.map((text, idx)=> ({ line: idx+1, note: buildCommentary({ project, draft: String(text), line: idx+1 }).xCommentaryLine }));
}
export default { buildCommentary };
