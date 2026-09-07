// Short-film beta intent parser (PR1 — no side effects).
// Parses voice utterance like:
// "Hey Clementine, I want to write a short film today 15 pages, genre will be horror film,
//  one location, in a bedroom, three characters, one John, one Sally, one Sam. Write first five pages."
// Returns { totalPages, requestedPages, genre, setting, characters } or null.

const parseCache = new Map();
const PARSE_CACHE_MAX = 128;

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  "twenty-one": 21, "twenty one": 21, "twenty-two": 22, "twenty two": 22, "twenty-three": 23, "twenty three": 23,
  "twenty-four": 24, "twenty four": 24, "twenty-five": 25, "twenty five": 25, "twenty-six": 26, "twenty six": 26,
  "twenty-seven": 27, "twenty seven": 27, "twenty-eight": 28, "twenty eight": 28, "twenty-nine": 29, "twenty nine": 29,
  thirty: 30,
};

function wordToNumber(word) {
  const n = Number(word);
  if (Number.isFinite(n) && n > 0) return n;
  const lower = String(word).toLowerCase();
  if (WORD_NUM[lower] != null) return WORD_NUM[lower];
  return null;
}

function parseTotalPages(text) {
  // Accept "15 pages" or "15 page" singular, word numbers to thirty
  const re = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[-\s]?one|two|three|four|five|six|seven|eight|nine)?|thirty)\s*pages?\b/gi;
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
  // "write first five pages" / "write the first 5 pages" / "first five pages" — singular/plural, to thirty
  const num = "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[-\\s]?one|two|three|four|five|six|seven|eight|nine)?|thirty)";
  const patterns = [
    new RegExp(`write[^.]*?first\\s+${num}\\s*pages?`, "i"),
    new RegExp(`first\\s+${num}\\s*pages?`, "i"),
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
  // "genre will be horror film" / "genre horror" / any free-text genre — skip filler will/be/is
  const m = lower.match(/genre(?:\s+will)?(?:\s+be)?(?:\s+is)?\s+([a-z][a-z-]*)/);
  if (m) {
    const g = m[1].trim().toLowerCase().split(/\s+/)[0];
    if (g) {
      if (g === "scifi") return "sci-fi";
      return g;
    }
  }
  const m2 = lower.match(/genre[^a-z]*([a-z-]+)(?:\s+film)?/);
  if (m2) {
    const g = m2[1].trim().toLowerCase().split(/\s+/)[0];
    if (g && !["will","be","is","a","an"].includes(g)) {
      if (g === "scifi") return "sci-fi";
      return g;
    }
  }
  // Fallback: standalone genre word without "genre" keyword (e.g., "short film drama") — open vocab
  const common = ["horror","comedy","drama","thriller","sci-fi","scifi","action","romance","mystery","fantasy","western","noir","sci-fi"];
  for (const g of common) {
    if (lower.includes(g)) return g === "scifi" ? "sci-fi" : g;
  }
  return null;
}

function parseInfluences(text) {
  const lower = text.toLowerCase();
  const directors = [];
  const writers = [];
  const tones = [];
  // Directors: "like Christopher Nolan", "like Stanley Kubrick", "Wachowski", "Nolan", "Kubrick", "del Toro"
  const dirPatterns = [
    /like\s+([a-z]+(?:\s+[a-z]+){0,2})\s*(?:,|\.|\band\b|$)/gi,
    /(?:directed by|director)\s+([a-z]+(?:\s+[a-z]+){0,2})/gi,
  ];
  for (const re of dirPatterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim();
      if (name.length > 2 && !["the", "a", "an"].includes(name.toLowerCase()) && !directors.includes(name)) directors.push(name);
    }
  }
  // Known directors shorthand
  if (lower.includes("nolan") && !directors.some(d => d.toLowerCase().includes("nolan"))) directors.push("Christopher Nolan");
  if (lower.includes("kubrick") && !directors.some(d => d.toLowerCase().includes("kubrick"))) directors.push("Stanley Kubrick");
  if (lower.includes("wachowski") && !directors.some(d => d.toLowerCase().includes("wachowski"))) directors.push("Wachowski");
  if (lower.includes("del toro") && !directors.some(d => d.toLowerCase().includes("toro"))) directors.push("Guillermo del Toro");
  // Writers
  if (lower.includes("kaufman") && !writers.includes("Charlie Kaufman")) writers.push("Charlie Kaufman");
  if (lower.includes("sorkin") && !writers.includes("Aaron Sorkin")) writers.push("Aaron Sorkin");
  // Tones: look for "tone" word or adjectives
  const toneRe = /tone\s+([a-z-]+)/gi;
  let tm;
  while ((tm = toneRe.exec(text)) !== null) {
    const t = tm[1].toLowerCase();
    if (t && !tones.includes(t)) tones.push(t);
  }
  return { directors, writers, tones };
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
  let charIdx = lower.indexOf("character");
  // Fallback: if no "character" word, look for name lists like "John, Sally and Sam" after short-film context
  if (charIdx === -1) {
    // Try to find a list of capitalized names after "short film" as characters (e.g., "John, Sally and Sam")
    const shortIdx = lower.indexOf("short film");
    const searchStart = shortIdx !== -1 ? shortIdx : 0;
    const nameListRe = /\b([A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)+(?:\s+and\s+[A-Z][a-z]+)?)\b/g;
    let m;
    while ((m = nameListRe.exec(text)) !== null) {
      if (m.index < searchStart) continue;
      const names = m[1].split(/\s*,\s*|\s+and\s+/).map(s => s.trim()).filter(Boolean);
      if (names.length >= 2 && names.length <= 5) {
        const titles = names.map(n => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());
        // Filter stop words already handled below
        return titles;
      }
    }
    return null;
  }
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
 * Now handles all genres (open vocab), directors/writers/tones via influences.
 */
function parseShortFilmIntent(utterance) {
  const text = String(utterance ?? "");
  if (!text.trim()) return null;
  const cacheKey = text.trim().toLowerCase().slice(0, 512);
  if (parseCache.has(cacheKey)) return parseCache.get(cacheKey);
  const lower = text.toLowerCase();
  // Must look like short-film request — accept "short film" or page count + genre
  if (!lower.includes("short film") && !lower.includes("short-film") && !lower.includes("shortfilm")) return null;
  if (!lower.includes("pages") && !lower.includes("page")) return null;

  const totalPages = parseTotalPages(text);
  const requestedPages = parseRequestedPages(text);
  const genre = parseGenre(text);
  const setting = parseSetting(text);
  const characters = parseCharacters(text);
  const influences = parseInfluences(text);

  if (totalPages == null) return null;
  if (genre == null) return null;
  if (!characters || characters.length === 0) return null;

  const result = {
    totalPages,
    requestedPages: requestedPages ?? totalPages,
    genre: genre.toLowerCase(),
    setting: setting ? setting.toLowerCase() : null,
    characters,
    influences,
  };
  if (parseCache.size >= PARSE_CACHE_MAX) {
    const firstKey = parseCache.keys().next().value;
    parseCache.delete(firstKey);
  }
  parseCache.set(cacheKey, result);
  return result;
}

export {
  parseShortFilmIntent,
  parseTotalPages,
  parseRequestedPages,
  parseGenre,
  parseSetting,
  parseCharacters,
};
