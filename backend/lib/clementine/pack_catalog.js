// D011 — Clementine IAP pack catalog.
// Maps internal pack ids and App Store productIds → Companion/Page turns.
// Never include TPM / token-rate fields in catalog or API projections.

/** @typedef {{ id: string, productId: string, companionTurns: number, pageTurns: number, label: string }} PackDefinition */

/** @type {readonly PackDefinition[]} */
const PACKS = Object.freeze([
  Object.freeze({
    id: "starter_evening",
    productId: "io.them.clementine.pack.starter_evening",
    companionTurns: 140,
    pageTurns: 25,
    label: "About a week of evening chats",
  }),
  Object.freeze({
    id: "writer_fortnight",
    productId: "io.them.clementine.pack.writer_fortnight",
    companionTurns: 280,
    pageTurns: 60,
    label: "About two weeks of writing nights",
  }),
  Object.freeze({
    id: "page_boost",
    productId: "io.them.clementine.pack.page_boost",
    companionTurns: 0,
    pageTurns: 80,
    label: "Extra Page voice→scene turns",
  }),
]);

const byId = new Map(PACKS.map((p) => [p.id, p]));
const byProductId = new Map(PACKS.map((p) => [p.productId, p]));

function listPacks() {
  return PACKS.map((p) => ({ ...p }));
}

function getPackById(packId) {
  const id = String(packId || "").trim();
  const pack = byId.get(id);
  return pack ? { ...pack } : null;
}

function getPackByProductId(productId) {
  const id = String(productId || "").trim();
  const pack = byProductId.get(id);
  return pack ? { ...pack } : null;
}

/**
 * Calm public projection — turns + framing only (no TPM).
 */
function publicPackShape(pack) {
  if (!pack) return null;
  return {
    id: pack.id,
    productId: pack.productId,
    companionTurns: pack.companionTurns,
    pageTurns: pack.pageTurns,
    label: pack.label,
  };
}

export {
  PACKS,
  listPacks,
  getPackById,
  getPackByProductId,
  publicPackShape,
};
