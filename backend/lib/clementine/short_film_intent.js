// Short-film beta intent parser (PR1 — no side effects).
// Parses voice utterance like:
// "Hey Clementine, I want to write a short film today 15 pages, genre will be horror film,
//  one location, in a bedroom, three characters, one John, one Sally, one Sam. Write first five pages."
// Returns { totalPages, requestedPages, genre, setting, characters } or null.

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

const GENRES = ["horror", "comedy", "drama", "thriller", "sci-fi", "scifi", "action", "romance", "mystery"];
const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

function wordToNumber(word) {
  const n = Number(word);
  if (Number.isFinite(n) && n > 0) return n;
  const lower = String(word).toLowerCase();
  if (WORD_NUM[lower] != null) return WORD_NUM[lower];
  return null;
}

function parseTotalPages(text) {
  // Prefer "15 pages" before genre, but take first plausible 1-30 near "short film" or "pages"
  const re = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\s*pages?\b/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const n = wordToNumber(match[1]);
    if (n != null && n >= 1 && n <= 30) {
      // Avoid picking up "first five pages" as total — check context
      const before = text.slice(Math.max(0, match.index - 20), match.index).toLowerCase();
      if (before.includes("first") || before.includes("write")) continue;
      return n;
    }
  }
  return null;
}

function parseRequestedPages(text) {
  // "write first five pages" / "write the first 5 pages" / "first five pages"
  const patterns = [
    /write[^.]*?first\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*pages?/i,
    /first\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*pages?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = wordToNumber(m[1]);
      if (n != null && n >= 1 && n <= 30) return n;
    }
  }
  return null;
}

function parseGenre(text) {
  const lower = text.toLowerCase();
  // "genre will be horror film" / "genre horror" / standalone horror
  const m = lower.match(/genre[^a-z]*([a-z-]+)(?:\s+film)?/);
  if (m) {
    const g = m[1].trim().toLowerCase();
    if (GENRES.includes(g)) return g;
    if (g === "scifi") return "sci-fi";
    // Accept raw if close
    if (GENRES.includes(g)) return g;
  }
  for (const g of GENRES) {
    if (lower.includes(g)) return g;
  }
  return null;
}

function parseSetting(text) {
  // "one location, in a bedroom" / "one location bedroom" / "location.*bedroom"
  const lower = text.toLowerCase();
  const m = lower.match(/location[^a-z]*?(?:in\s+a\s+)?([a-z]+)/);
  if (m) {
    const s = m[1].trim().toLowerCase();
    // Filter out filler words
    if (s && !["a", "an", "the", "one", "single"].includes(s)) return s;
  }
  // Fallback: "in a bedroom" near location context
  const m2 = text.match(/in\s+a\s+([A-Za-z]+)\b/i);
  if (m2 && lower.includes("location")) {
    return m2[1].toLowerCase();
  }
  return null;
}

function parseCharacters(text) {
  const lower = text.toLowerCase();
  const charIdx = lower.indexOf("character");
  if (charIdx === -1) return null;
  // Bound segment to next section keyword so "genre horror" isn't taken as a name
  let endIdx = text.length;
  for (const kw of ["one location", "location", "genre", "write", "pages"]) {
    const idx = lower.indexOf(kw, charIdx + 9);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }
  const segment = text.slice(charIdx, endIdx);
  const stopWordsLower = new Set(["write", "genre", "location", "short", "film", "pages", "one", "two", "three", "four", "five", "six", "first", "hey", "clementine", "today", "will", "be", "and", "we", "from", "there", "with", "for", "characters", "character", "the", "a", "an", "in", "of", "to", "is", "are", "my", "our", "your", "his", "her"])
  // Match both TitleCase and ALL CAPS: "John" and "JOHN" -> normalize to Title
  const nameRe = /\bone\s+([A-Za-z]+)\b/gi;
  const names = [];
  let m;
  while ((m = nameRe.exec(segment)) !== null) {
    const raw = m[1];
    const normLower = raw.toLowerCase();
    if (stopWordsLower.has(normLower)) continue;
    if (raw.length < 2) continue;
    // Title-case normalize: JOHN -> John, john -> John
    const title = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    if (!names.includes(title)) names.push(title);
    if (names.length >= 5) break;
  }
  // Fallback: if no "one NAME" pattern, try words sequence after characters (handles ALL CAPS like JOHN)
  if (names.length === 0) {
    const capRe = /\b([A-Za-z]{2,})\b/g;
    while ((m = capRe.exec(segment)) !== null) {
      const raw = m[1];
      const lower = raw.toLowerCase();
      if (stopWordsLower.has(lower)) continue;
      // Skip short filler + require at least one alpha, title-case normalize
      if (raw.length < 2) continue;
      const title = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      if (!names.includes(title)) names.push(title);
      if (names.length >= 5) break;
    }
    // If we picked up setting word (bedroom/kitchen) as name, filter it out
    const settingLower = parseSetting(segment)?.toLowerCase();
    if (settingLower) {
      const idx = names.findIndex((n) => n.toLowerCase() === settingLower);
      if (idx !== -1) names.splice(idx, 1);
    }
  }
  if (names.length === 0) return null;
  return names;
}

/**
 * Parse short-film beta utterance into structured params.
 * Returns null if required fields missing (totalPages, genre, characters).
 * requestedPages defaults to totalPages if not said, but M1 expects explicit.
 */
function parseShortFilmIntent(utterance) {
  const text = String(utterance ?? "");
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  // Must look like short-film request
  if (!lower.includes("short film") && !lower.includes("short-film")) return null;
  if (!lower.includes("pages")) return null;

  const totalPages = parseTotalPages(text);
  const requestedPages = parseRequestedPages(text);
  const genre = parseGenre(text);
  const setting = parseSetting(text);
  const characters = parseCharacters(text);

  if (totalPages == null) return null;
  if (genre == null) return null;
  if (!characters || characters.length === 0) return null;

  return {
    totalPages,
    requestedPages: requestedPages ?? totalPages,
    genre: genre.toLowerCase(),
    setting: setting ? setting.toLowerCase() : null,
    characters,
  };
}

export {
  parseShortFilmIntent,
  parseTotalPages,
  parseRequestedPages,
  parseGenre,
  parseSetting,
  parseCharacters,
};
