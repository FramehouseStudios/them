// M2b — per-character context + memory inside one singular script project.
// No backend/index.js growth. Project holds characters[] (from short_film_store) plus
// characterContexts: [{ name, voice, backstory, arcState, memory: [] }]
// Each character retains its own short-term lines and arc between pages.

function trimToString(v) {
  return v == null ? "" : String(v).trim();
}

function defaultVoiceFor(name, idx, genre) {
  const voices = ["terse", "lyrical", "wry", "urgent", "deadpan"];
  const g = String(genre || "horror").toLowerCase();
  if (g.includes("sci-fi")) return ["clinical", "wondering", "dry", "awe-struck"][idx % 4];
  if (g.includes("comedy")) return ["wry", "deadpan", "earnest"][idx % 3];
  return voices[idx % voices.length];
}

function buildCharacterContexts({ characters, genre, setting, influences = {} } = {}) {
  const chars = Array.isArray(characters) ? characters.map((c) => trimToString(c)).filter(Boolean) : [];
  return chars.map((name, idx) => ({
    name,
    description: `${name} — ${trimToString(setting) || "bedroom"} ${trimToString(genre) || "horror"} voice, distinct want/obstacle/cost`,
    voice: defaultVoiceFor(name, idx, genre),
    backstory: `${name} carries a secret tied to ${trimToString(setting) || "the location"}; cost is ${idx === 0 ? "leaving before answer" : idx === 1 ? "being remembered" : "listening too closely"}`,
    influences: {
      directors: Array.isArray(influences.directors) ? influences.directors.slice(0, 3) : [],
      writers: Array.isArray(influences.writers) ? influences.writers.slice(0, 3) : [],
      tones: Array.isArray(influences.tones) ? influences.tones.slice(0, 3) : [],
    },
    arcState: { position: "setup", want: `stay/leave ${trimToString(setting) || "bedroom"}`, need: "be seen", pressure: 0 },
    memory: [], // last 6 lines for this character: [{ role, text, page }]
    updatedAt: Date.now(),
  }));
}

function ensureCharacterContexts(project, parsed) {
  if (!project) throw new Error("project required");
  if (!Array.isArray(project.characterContexts)) project.characterContexts = [];
  const desired = buildCharacterContexts({
    characters: parsed?.characters || project.characters?.map((c) => c.name) || [],
    genre: parsed?.genre || project.tone,
    setting: parsed?.setting || project.setting,
    influences: parsed?.influences,
  });
  // Merge id-only by name
  const byName = new Map(project.characterContexts.map((c) => [String(c.name).toLowerCase(), c]));
  for (const ctx of desired) {
    const key = String(ctx.name).toLowerCase();
    if (!byName.has(key)) {
      project.characterContexts.push(ctx);
      byName.set(key, ctx);
    } else {
      // refresh description/voice if genre/setting changed, keep memory
      const existing = byName.get(key);
      existing.description = ctx.description;
      existing.voice = existing.voice || ctx.voice;
      existing.influences = ctx.influences;
      existing.updatedAt = Date.now();
    }
  }
  // Remove stale contexts not in desired (only if desired non-empty)
  if (desired.length) {
    const wanted = new Set(desired.map((c) => String(c.name).toLowerCase()));
    project.characterContexts = project.characterContexts.filter((c) => wanted.has(String(c.name).toLowerCase()));
  }
  project.characterContexts.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return project.characterContexts;
}

function pushCharacterMemory(project, { name, text, page = 1, role = "dialogue" } = {}) {
  if (!project || !Array.isArray(project.characterContexts)) return null;
  const key = String(name || "").toLowerCase();
  const ctx = project.characterContexts.find((c) => String(c.name).toLowerCase() === key);
  if (!ctx) return null;
  if (!Array.isArray(ctx.memory)) ctx.memory = [];
  ctx.memory.push({ role: String(role), text: trimToString(text).slice(0, 400), page: Math.max(1, Number(page) || 1), at: Date.now() });
  if (ctx.memory.length > 6) ctx.memory.splice(0, ctx.memory.length - 6);
  ctx.arcState.pressure = Math.min(10, Number(ctx.arcState.pressure || 0) + 1);
  ctx.updatedAt = Date.now();
  return ctx;
}

function getCharacterContext(project, name) {
  if (!project || !Array.isArray(project.characterContexts)) return null;
  return project.characterContexts.find((c) => String(c.name).toLowerCase() === String(name).toLowerCase()) || null;
}

function snapshotCharacterVoices(project) {
  if (!project || !Array.isArray(project.characterContexts)) return "";
  return project.characterContexts.map((c) => `${c.name} (${c.voice}): ${c.memory.slice(-2).map((m) => `"${m.text}"`).join(" | ") || "no lines yet"}`).join("\n");
}

export { buildCharacterContexts, ensureCharacterContexts, pushCharacterMemory, getCharacterContext, snapshotCharacterVoices };
