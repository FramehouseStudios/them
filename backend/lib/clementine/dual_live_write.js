// Dual live write — talk + screenplay Fountain streamed concurrently, correct format (D009)
// Wires dual_channel + studio_live_paper + page_flip + visual_pagination for live page stream.

import { runDualChannel } from "./dual_channel.js";
import { buildLivePaperPayload } from "./studio_live_paper.js";
import { paginateVisualDraft } from "./visual_pagination.js";
import { exportVisualFDX } from "./visual_pagination.js";

export async function dualLiveWrite({ req, parsed, project, chatSupplier, baseSystem, signal, chatModelPlan, onPageChunk, onConversationChunk } = {}) {
  // Run dual channel in parallel (page draft + conversation reply)
  const { draft, conversationReply, usage } = await runDualChannel({ req, parsed, project, chatSupplier, baseSystem, signal, chatModelPlan });
  // Stream pages as Fountain 55-line chunks while talk continues
  const pages = paginateVisualDraft(draft);
  if (typeof onPageChunk === "function") {
    for (let i=0;i<pages.length;i++) {
      try { onPageChunk({ page: i+1, totalPages: pages.length, pageText: pages[i], pages }); } catch {}
      // small yield to keep talk streaming interleaved
      await new Promise(r=> setTimeout(r, 10));
    }
  }
  if (typeof onConversationChunk === "function" && conversationReply) {
    try { onConversationChunk(conversationReply); } catch {}
  }
  const livePaper = buildLivePaperPayload(project, { draft, currentPage: 1, totalPages: pages.length });
  const fdx = exportVisualFDX(draft);
  return { draft, conversationReply, usage, pages, livePaper, fdx, totalPages: pages.length };
}

export default { dualLiveWrite };
