// Export & Share — one tap to industry FDX/PDF.
// D009 strangler.

import { exportVisualFDX } from "./visual_pagination.js";

export function buildExportLink({ projectId, format="fdx" } = {}) {
  const id = String(projectId||"").trim() || "unknown";
  const token = Buffer.from(`${id}:${Date.now()}`).toString("base64").slice(0,16);
  return `https://them.app/export/${id}.${format}?token=${token}`;
}
export function exportAndShare({ project, draft, format="fdx" } = {}) {
  let fdx = "";
  try { fdx = exportVisualFDX(draft||project?.versions?.[0]?.draft||"", project); } catch { fdx = `<FinalDraft project="${project?.id||""}"/>`; }
  const link = buildExportLink({ projectId: project?.id, format });
  return { fdx, link, format, xExportAvailable: "1", xExportLink: link };
}
export default { buildExportLink, exportAndShare };
