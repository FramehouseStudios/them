// Craft suggestion — tailored to writer's learned patterns (partner learning, D009)
import { getWriterProfile } from "./writer_learning.js";
import { selectCraftCards } from "./craft_cards.js";

function trimmed(v){ return String(v||"").trim(); }

export function suggestCraftForWriter({ ownerKey, genre, tone } = {}) {
  const profile = getWriterProfile(ownerKey);
  const cards = selectCraftCards({ genre: genre||"horror", tone: tone||"dark" });
  // if writer hedges, suggest tighten card; if passive, suggest active voice card
  let pick = cards[0];
  if (profile.hedges > 2) pick = cards.find(c=> c.technique.toLowerCase().includes("tighten") || c.title.includes("Tighten")) || cards[0];
  if (profile.passive > 1) pick = cards.find(c=> c.technique.toLowerCase().includes("active") || c.title.includes("Active")) || pick;
  // fallback to most relevant genre/tone
  return { craft: pick, reason: profile.corrections[0] || "craft for your genre/tone", profile };
}

export default { suggestCraftForWriter };
