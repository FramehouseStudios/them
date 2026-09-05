// Story -> Screenplay intelligence for STORY intent.
// Translates natural narrative explanation into properly formatted screenplay beat/page.
// Used when classifyIntent returns STORY (user explaining story to Clementine).

const STORY_SYSTEM_ADDENDUM = `
You are Clementine, a screenwriting partner. The user is explaining their story in natural language — not dictating screenplay format.
Your job is to translate that explanation into a properly formatted screenplay beat/page and commit it to the draft.

Intelligence steps (do internally, don't show):
1) Extract: protagonist name (if not named, keep "PROTAGONIST"), logline in one sentence, Want (external goal), Need (internal growth), Antagonistic Force, World/Setting, Inciting Incident if mentioned.
2) Map to ScreenplayFeatureSpine: protagonistWant, protagonistNeed, antagonisticForce, logline, centralQuestion, actPosition — these persist for continuity.
2b) Roster: support unlimited characters — each has name, background, objective (scene want), goal (external want), pursuits (what they chase episode-to-episode), weakness/flaw, strength/skill. Keep each character's voice distinct via their objective+weakness. Add new characters as introduced via "add character NAME" or "NAME is a ..." without dropping prior ones.
3) Write as screenplay: Scene Heading (INT./EXT. DAY/NIGHT), Action (present tense, visual, 3-4 lines max), Character cue (UPPERCASE, centered), Dialogue (distinct voice per character, parenthetical only when needed), Transition only to end scene.
4) Character consistency: reuse exact name spelling and voice once introduced; do not rename. Differentiate voices by objective: e.g., protagonist wants to find a missing person (direct, urgent), other character needs to trust (hesitant, subtext) — so same topic sounds different per want/need. For any character, strength shows in how they handle pressure, weakness shows under stress.
5) Subtext: want/need must be shown through action/image, not stated. Dialogue with subtext_density — characters rarely say what they mean; use obstacle/cost to imply. E.g., instead of "I want to find her," show protagonist staring at a photo, hesitating to dial, then saying "I'm fine" while not calling.
6) Anti-cliché: never use "this changes everything", "we need to talk", "I can't do this anymore", "are you okay?", "I'm sorry" as standalone, "what do you mean?", "trust your instinct" — replace with specific, visual action or subtext. See page_craft CLICHE_PATTERNS.
7) Preserve voice: keep the user's tone, but tighten to screenplay economy. No purple prose.
8) One beat per turn: 1-2 pages max, end on a button or question that echoes centralQuestion/motif.
9) Never invent a new protagonist name if not given — use "PROTAGONIST" or ask.
10) If story is vague, write what is given and leave a TODO comment as Action: "TODO: clarify [X]" — do not hallucinate plot.
11) When asked "what is NAME's background/objective/goal/pursuits/weakness/strength?" answer from persisted roster (writerCanon) concisely, then offer to show it on the page.
`.trim();

function isStoryIntent(intent) {
  return String(intent || "").toLowerCase() === "story";
}

function extractStoryCanonTargets(utterance = "") {
  const text = String(utterance || "");
  const out = [];
  // Protagonist name: "my protagonist Alex", "Alex wants", generic detection
  const nameMatch = text.match(/\b(?:protagonist|hero|character|heroine)\s+(?:is\s+)?([A-Z][a-z]+)\b/) ||
    text.match(/\b([A-Z][a-z]+)\s+(?:is\s+(?:a\s+)?\d+[-\s]?year-old[^.]*?)?wants\b/) ||
    text.match(/\b([A-Z][a-z]+)\s+wants\b/);
  if (nameMatch) {
    const name = String(nameMatch[1] || "").trim();
    if (name && name.length >= 2 && name.length <= 32 && !/^(My|The|She|He|They)$/i.test(name)) {
      out.push({ field: "protagonistName", value: name, source: "writer_correction" });
    }
  }
  const want = text.match(/\bwants?\s+to\s+([^.]+)/i);
  if (want) out.push({ field: "protagonistWant", value: want[1].trim().slice(0, 180), source: "writer_correction" });
  // Also capture "wants to" even when preceded by age clause
  else {
    const wantAlt = text.match(/\bwants?\s+([^.]{8,180})/i);
    if (wantAlt) out.push({ field: "protagonistWant", value: wantAlt[1].trim().slice(0, 180), source: "writer_correction" });
  }
  const need = text.match(/\bneeds?\s+to\s+([^.]+)/i);
  if (need) out.push({ field: "protagonistNeed", value: need[1].trim().slice(0, 180), source: "writer_correction" });
  // Act / structure hints for ScreenplayFeatureSpine actPosition
  const act = text.match(/\b(act\s+(one|two|three)|inciting incident|climax|resolution)\b/i);
  if (act) out.push({ field: "actPosition", value: act[1].trim().slice(0, 80), source: "writer_correction" });
  const cq = text.match(/\b(what if|central question is)\s+([^.]{10,180})/i);
  if (cq) out.push({ field: "centralQuestion", value: cq[2].trim().slice(0, 180), source: "writer_correction" });
  const motif = text.match(/\b(dreams?|memory|tape|key|letter|photo|house|ocean|desert)\b/i);
  if (motif) out.push({ field: "motifImage", value: motif[1].toLowerCase().slice(0, 40), source: "writer_correction" });
  // Voice sample: capture a quoted line or first dialogue-like sentence for distinct_character_voice few-shot
  const quoted = text.match(/"([^"]{8,120})"/);
  if (quoted) out.push({ field: "characterVoiceSample", value: quoted[1].trim().slice(0, 120), source: "writer_correction" });
  else {
    const sent = text.match(/[^.!?]{12,100}[.!?]/);
    if (sent) out.push({ field: "characterVoiceSample", value: sent[0].trim().slice(0, 120), source: "writer_correction" });
  }
  // Unlimited roster: capture additional characters introduced via "add character NAME" or "NAME is a ..."
  const rosterNames = new Set();
  const addMatches = [...text.matchAll(/\badd\s+character\s+([A-Z][a-z]+)\b/gi)];
  for (const m of addMatches) {
    const n = String(m[1] || "").trim();
    if (n && n.length >= 2 && n.length <= 32) rosterNames.add(n);
  }
  const isMatches = [...text.matchAll(/\b([A-Z][a-z]{2,})\s+is\s+(?:a\s+)?(?:\d+[-\s]?year-old\s+)?(?:detective|doctor|teacher|ex-[a-z]+|[a-z]+\s+)?/g)];
  for (const m of isMatches) {
    const n = String(m[1] || "").trim();
    if (n && !/^(My|The|She|He|They|This|That)$/i.test(n) && n.length <= 32) {
      if (!rosterNames.has(n) && text.toLowerCase().includes(n.toLowerCase() + " ")) rosterNames.add(n);
    }
  }
  for (const name of [...rosterNames].slice(0, 6)) {
    if (!out.some(o => String(o.value).toLowerCase() === name.toLowerCase() && o.field === "protagonistName")) {
      out.push({ field: "characterName", value: name, source: "writer_correction" });
    }
  }
  // Per-character attributes: background, objective, goal, pursuits, weakness, strength
  const attrPatterns = [
    { re: /\bbackground\s*(?:is|:)?\s*([^.]{8,160})/i, field: "characterBackground" },
    { re: /\bbackstory\s*(?:is|:)?\s*([^.]{8,160})/i, field: "characterBackground" },
    { re: /\bobjective\s*(?:is|:)?\s*([^.]{8,160})/i, field: "characterObjective" },
    { re: /\bweakness\s*(?:is|:)?\s*([^.]{8,160})/i, field: "characterWeakness" },
    { re: /\bflaw\s*(?:is|:)?\s*([^.]{8,160})/i, field: "characterWeakness" },
    { re: /\bstrength\s*(?:is|:)?\s*([^.]{8,160})/i, field: "characterStrength" },
    { re: /\bstrengths?\s*(?:are|:)?\s*([^.]{8,160})/i, field: "characterStrength" },
    { re: /\bpursuits?\s*(?:is|are|:)?\s*([^.]{8,160})/i, field: "characterPursuits" },
    { re: /\bgoal\s*(?:is|:)?\s*([^.]{8,160})/i, field: "characterGoal" },
  ];
  for (const { re, field } of attrPatterns) {
    const m = text.match(re);
    if (m) out.push({ field, value: m[1].trim().slice(0, 180), source: "writer_correction" });
  }
  return out.slice(0, 16);
}

function summarizeDraftForFeature(draft = "") {
  const d = String(draft || "");
  if (d.length <= 4000) return d;
  const head = d.slice(0, 900);
  const tail = d.slice(-3200);
  return `${head}\n...\n[skipped ${d.length - 4100} chars for feature context]\n...\n${tail}`;
}
function storyPromptAddendum(utterance, draftContext = "") {
  const clean = String(utterance || "").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const wantsFeature = /\b(90|120|ninety|hundred)\s*(page|pages)\b/.test(lower) || /\b(feature\s*(script|screenplay|film)|full\s*script|complete\s*screenplay)\b/.test(lower);
  const words = clean.split(/\s+/).length;
  const isMultiBeat = wantsFeature || words > 120 || (clean.match(/\b(INT|EXT)\./g) || []).length >= 2 || clean.includes("—") && words > 80;
  const beatInstruction = wantsFeature
    ? "FEATURE-LENGTH REQUEST (90/120 pages): Build the spine then write Act One opening pages now (5-7 pages, properly paginated with INT./EXT., Action, Character, Dialogue). Keep a tight 3-act spine in mind (Inciting Incident ~p12, Break into Two ~p25, Midpoint ~p55, Break into Three ~p85) and leave a trailing TODO: clarify [next beat] if story gaps remain. Do NOT attempt all 90 pages in one turn; lay the foundation and use 'continue' to fill."
    : isMultiBeat
    ? "This is a long tell — write 2-3 contiguous beats/pages (use INT./EXT. headings per beat, keep character names consistent, end each beat on a button that leads to the next; keep total 2-3 pages, not 10)."
    : "One beat per turn: 1-2 pages max, end on a button or question that echoes centralQuestion/motif.";
  const addendum = STORY_SYSTEM_ADDENDUM.replace("8) One beat per turn: 1-2 pages max, end on a button or question that echoes centralQuestion/motif.", `8) ${beatInstruction}`);
  const draftForPrompt = wantsFeature ? summarizeDraftForFeature(draftContext) : String(draftContext || "").slice(0, 4000);
  return `${addendum}

User's story explanation to translate:
"""
${clean}
"""

Existing draft context (if any, for continuity):
"""
${draftForPrompt}
"""

Now write the next page/beat from that explanation, properly formatted.
`.trim();
}

const PAGE_REWRITE_ADDENDUM_PREFIX = `
You are Clementine revising the current screenplay page. The user wants a tighter, less on-the-nose pass on the existing draft — not a new scene.
Rules: keep slugline/characters, show don't tell, cut cliché ("are you okay?", "we need to talk", "I can't do this anymore"), tighten dialogue by subtext, keep each character's voice distinct via objective/weakness. Output full revised page text only, properly formatted.
`.trim();

function pageRewritePromptAddendum(utterance, draftContext = "") {
  const clean = String(utterance || "").trim();
  if (!clean) return "";
  const draft = String(draftContext || "");
  return `${PAGE_REWRITE_ADDENDUM_PREFIX}

User's rewrite note:
"""
${clean}
"""

Current draft to revise (edit in place, don't invent new plot):
"""
${draft.slice(0, 6000)}
"""

Now rewrite the page tighter, keeping continuity and the same character names/spellings.
`.trim();
}

function isPageRewriteIntent(intent) {
  return String(intent || "").toLowerCase() === "page_rewrite";
}

export { STORY_SYSTEM_ADDENDUM, isStoryIntent, storyPromptAddendum, extractStoryCanonTargets, PAGE_REWRITE_ADDENDUM_PREFIX, pageRewritePromptAddendum, isPageRewriteIntent };
