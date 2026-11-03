import { selectCraftCards } from "./craft_cards.js";

function clean(value) {
  return value == null ? "" : String(value).trim();
}

/**
 * Select only deliberately relevant craft guidance. The parser's generic
 * horror/empty-tone fallback must not silently inject horror cards.
 */
function resolveShortFilmCraftContext(parsed = {}) {
  const genre = clean(parsed.genre) || "horror";
  const tone = clean(parsed.influences?.tones?.[0]);
  const totalPages = Math.max(1, Number(parsed.totalPages) || 15);
  const hasSpecificCraftSignal = tone.length > 2 || genre.toLowerCase() !== "horror";
  const cardCount = totalPages > 30 ? 2 : 1;

  if (!hasSpecificCraftSignal) {
    return { block: "", cacheKey: "craft:none", cards: [] };
  }

  let cards = [];
  try {
    cards = selectCraftCards({ genre, tone }).slice(0, cardCount);
  } catch {}
  if (!cards.length) {
    return { block: "", cacheKey: `craft:none:${genre.toLowerCase()}:${tone.toLowerCase()}`, cards: [] };
  }

  const cacheKey = [
    "craft:v1",
    genre.toLowerCase(),
    tone.toLowerCase() || "no-tone",
    totalPages > 30 ? "feature" : "short",
    ...cards.map((card) => card.id),
  ].join(":");
  const label = tone || "genre";
  const block = `Craft (selected for ${genre}/${label}):\n${cards
    .map((card) => `${card.title} — ${card.want} / ${card.cost} (motif: ${card.motif})`)
    .join("\n")}`;
  return { block, cacheKey, cards };
}

export { resolveShortFilmCraftContext };
