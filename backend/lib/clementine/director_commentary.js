// Director commentary — industry notes in-line while pages write.
// D009 strangler.

import { rateCoverage } from "./coverage.js";

export function buildCommentary({ project, draft, page } = {}) {
  const coverage = (()=>{ try{ return rateCoverage({ draft: draft||"", project }); }catch{ return { overall:3, verdict:"CONSIDER" }; }})();
  const notes = [];
  if (coverage.overall < 3) notes.push(`Pacing: tight, need breath on line ${Number(page)||1}`);
  if (project?.characterContexts?.length) notes.push(`${project.characterContexts[0].name}'s want is thinning — add image echo`);
  return { coverage, notes, xCommentary: notes.join(" | ") };
}
export default { buildCommentary };
