// Short-film prompt builder + deterministic offline draft (PR2).
// Builds system+user prompt for 5-page horror bedroom with 3 chars, and
// a deterministic Fountain draft when OPENAI_API_KEY absent (CI offline).

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Build short-film prompt for Page lane.
 * @param {{totalPages:number,requestedPages:number,genre:string,setting:string,characters:string[]}} parsed
 * @returns {{system:string,user:string,outline:string}}
 */
function buildShortFilmPrompt(parsed) {
  const total = Number(parsed?.totalPages) || 15;
  const req = Number(parsed?.requestedPages) || 5;
  const genre = trimToString(parsed?.genre) || "horror";
  const setting = trimToString(parsed?.setting) || "bedroom";
  const chars = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const charLine = chars.length ? `Characters: ${chars.join(", ")}.` : "";
  const charNames = chars.join(", ");

  const outline = [
    `${total}-page outline scaffold (3 acts):`,
    `Act 1 SETUP — ${genre} in ${setting}, introduce ${charNames}, inciting pressure.`,
    `Act 2 CONFRONTATION — tension escalates, want/obstacle/cost sharpens.`,
    `Act 3 RESOLUTION — payoff, image echo, cost paid.`,
    `This request delivers the first ${req} pages.`,
  ].join("\n");

  const system = [
    `You are Clementine writing Fountain screenplay pages.`,
    `Owner bar: distinct character voice, subtext, want/obstacle/cost, motif image echo, anti-cliché, playable format.`,
    `Constraints: Genre=${genre}. Single location INT. ${setting.toUpperCase()}. Must use ${chars.length} characters: ${charNames}.`,
    `Total length ${total} pages (delivering ${req} pages now). This turn writes exactly ${req} pages.`,
    `Output only Fountain screenplay text — plain Fountain, no PAGE markers, no preamble, no logline.`,
    outline,
    charLine,
  ].filter(Boolean).join("\n\n");

  const user = [
    `Write the first ${req} pages of a ${total}-page ${genre} short film.`,
    `One location: ${setting} (INT. ${setting.toUpperCase()}).`,
    charLine,
    `Deliver exactly ${req} pages of plain Fountain.`,
  ].join(" ");

  return { system, user, outline };
}

/**
 * Deterministic offline draft for tests — plain Fountain, no "--- PAGE n ---" markers.
 * Injected from tests only; production never falls back to this.
 */
function generateOfflineShortFilmDraft(parsed) {
  const setting = (trimToString(parsed?.setting) || "bedroom").toUpperCase();
  const chars = Array.isArray(parsed?.characters) && parsed.characters.length ? parsed.characters : ["John", "Sally", "Sam"];
  const [c1, c2, c3] = chars;
  const req = Number(parsed?.requestedPages) || 5;
  const pages = [];
  for (let i = 1; i <= req; i++) {
    pages.push([
      `INT. ${setting}`,
      ``,
      `The room holds its breath. A whisper clings to the dark.`,
      ``,
      `${c1.toUpperCase()}`,
      `We shouldn't have stayed.`,
      ``,
      `${c2.toUpperCase()}`,
      `The bedroom remembers what we tried to forget.`,
      ``,
      `${c3.toUpperCase()}`,
      `Listen — the shadow by the door is listening too.`,
      ``,
      `They move around the ${setting.toLowerCase()}, fear tightening as blood thins the night.`,
      ``,
    ].join("\n"));
  }
  // Plain Fountain, pages separated by blank lines (no markers)
  return pages.join("\n\n");
}

export {
  buildShortFilmPrompt,
  generateOfflineShortFilmDraft,
};
