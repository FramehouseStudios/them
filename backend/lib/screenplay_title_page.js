// The Fountain title page at the top of a draft ("Title: …", "Credit: …",
// "Author: …", ended by a blank line). Mirrors the app's
// ScreenplayTitlePage.split: only known keys (or indented continuations)
// count, so a script that opens with "SAM: Hi." is never a title page.

const FIELD_BY_KEY = Object.freeze({
  title: "title",
  credit: "credit",
  author: "author",
  authors: "author",
  source: "source",
  "draft date": "draftDate",
  date: "draftDate",
  contact: "contact",
  notes: "notes",
  copyright: null,
  revision: null,
});

function keyOf(line) {
  if (/^[ \t]/.test(line)) return null;
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const name = line.slice(0, colon).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(FIELD_BY_KEY, name)) return null;
  return { field: FIELD_BY_KEY[name], value: line.slice(colon + 1).trim() };
}

/**
 * Reads the title page from the first lines of a draft.
 * Returns { titlePage, lineIndexes } where lineIndexes are the 0-based
 * indexes (into `lines`) that belong to it; titlePage is null when the draft
 * does not open with one.
 */
export function readTitlePage(lines) {
  const list = Array.isArray(lines) ? lines.map((line) => String(line ?? "")) : [];
  let index = 0;
  while (index < list.length && !list[index].trim()) index += 1;
  if (index >= list.length || !keyOf(list[index])) return { titlePage: null, lineIndexes: [] };

  const titlePage = {};
  const lineIndexes = [];
  let field = null;
  for (; index < list.length; index += 1) {
    const line = list[index];
    if (!line.trim()) break;
    const key = keyOf(line);
    if (key) {
      field = key.field;
      if (field) titlePage[field] = key.value;
    } else if (/^(\t| {3})/.test(line)) {
      if (field) titlePage[field] = titlePage[field] ? `${titlePage[field]}\n${line.trim()}` : line.trim();
    } else {
      return { titlePage: null, lineIndexes: [] };
    }
    lineIndexes.push(index);
  }
  return { titlePage, lineIndexes };
}
