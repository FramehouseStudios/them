// T-fdx-export-endpoint — pure Final Draft XML (FDX) serializer.
//
// Companion to T-fountain-export-endpoint. Takes the same canonical
// screenplay shape and produces an FDX 5 / Final Draft 12-compatible
// XML document. Industry-standard format the comp matchers + most
// screenwriting tools consume.
//
// Same input shape as the Fountain exporter:
//
//   {
//     title?: { title, credit?, author?, source?, draftDate?, contact?, notes? },
//     scenes: [
//       {
//         heading?: string,
//         lines: [
//           { kind: "action", text },
//           { kind: "character", name, parenthetical?, dialogue: string|string[] },
//           { kind: "transition", text, forced?: boolean },
//           { kind: "centered", text },
//           { kind: "lyrics", text },
//           { kind: "section", level?, text },     // emitted as <Paragraph Type="General">
//           { kind: "synopsis", text },            // emitted as <Paragraph Type="General">
//           { kind: "blank" }
//         ]
//       }
//     ]
//   }
//
// Pure: same input → same output, byte-for-byte. No I/O, no LLM.
//
// FDX reference shape (Final Draft 5/12):
//
//   <?xml version="1.0" encoding="UTF-8" standalone="no" ?>
//   <FinalDraft DocumentType="Script" Template="No" Version="5">
//     <Content>
//       <Paragraph Type="Scene Heading"><Text>INT. KITCHEN - NIGHT</Text></Paragraph>
//       <Paragraph Type="Action"><Text>She walks in.</Text></Paragraph>
//       <Paragraph Type="Character"><Text>JUNE</Text></Paragraph>
//       <Paragraph Type="Parenthetical"><Text>(whispering)</Text></Paragraph>
//       <Paragraph Type="Dialogue"><Text>Hello.</Text></Paragraph>
//       <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
//     </Content>
//     <TitlePage>
//       <Content>
//         <Paragraph Alignment="Center"><Text>Title</Text></Paragraph>
//       </Content>
//     </TitlePage>
//   </FinalDraft>

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>';
const FD_OPEN = '<FinalDraft DocumentType="Script" Template="No" Version="5">';
const FD_CLOSE = '</FinalDraft>';

function trim(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function escapeXml(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paragraph(type, text, attrs = {}) {
  const t = trim(text);
  if (!t) return "";
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
    .join("");
  return `<Paragraph Type="${type}"${attrStr}><Text>${escapeXml(t)}</Text></Paragraph>`;
}

function serializeHeading(heading) {
  const t = trim(heading);
  if (!t) return "";
  return paragraph("Scene Heading", t.toUpperCase());
}

function serializeAction(line) {
  return paragraph("Action", line?.text);
}

function serializeCharacter(line) {
  const name = trim(line?.name);
  if (!name) return "";
  const isDual = line?.dual === true || line?.isDual === true || String(line?.align || "").toLowerCase() === "dual";
  const out = [paragraph("Character", name.toUpperCase(), isDual ? { DualDialogue: "Yes" } : {})];
  if (line?.parenthetical) {
    const p = trim(line.parenthetical).replace(/^\(|\)$/g, "");
    if (p) out.push(paragraph("Parenthetical", `(${p})`, isDual ? { DualDialogue: "Yes" } : {}));
  }
  const dialogue = Array.isArray(line?.dialogue)
    ? line.dialogue.map(trim).filter(Boolean)
    : [trim(line?.dialogue)].filter(Boolean);
  if (dialogue.length === 0) {
    return "";
  }
  for (const d of dialogue) {
    out.push(paragraph("Dialogue", d, isDual ? { DualDialogue: "Yes" } : {}));
  }
  return out.filter(Boolean).join("\n  ");
}

function serializeTransition(line) {
  const t = trim(line?.text);
  if (!t) return "";
  const upper = t.toUpperCase();
  const formatted = line?.forced === true
    ? upper.replace(/^>\s*/, "")
    : (upper.endsWith("TO:") ? upper : `${upper.replace(/:$/, "")} TO:`);
  return paragraph("Transition", formatted);
}

function serializeCentered(line) {
  return paragraph("General", line?.text, { Alignment: "Center" });
}

function serializeLyrics(line) {
  return paragraph("Lyrics", line?.text);
}

function serializeSection(line) {
  // FDX has no native "Section" — render as a General paragraph the
  // reader can spot easily.
  const t = trim(line?.text);
  if (!t) return "";
  return paragraph("General", `# ${t}`);
}

function serializeSynopsis(line) {
  const t = trim(line?.text);
  if (!t) return "";
  return paragraph("General", `= ${t}`);
}

function serializeLine(line) {
  if (!line || typeof line !== "object") return "";
  switch (line.kind) {
    case "action":     return serializeAction(line);
    case "character":  return serializeCharacter(line);
    case "transition": return serializeTransition(line);
    case "centered":   return serializeCentered(line);
    case "lyrics":     return serializeLyrics(line);
    case "section":    return serializeSection(line);
    case "synopsis":   return serializeSynopsis(line);
    case "blank":      return "";
    default:           return "";
  }
}

function serializeScene(scene, index = 0) {
  if (!scene || typeof scene !== "object") return "";
  const out = [];
  const heading = serializeHeading(scene.heading);
  if (heading) {
    // Scene numbers for Final Draft parity: Number="1", "2", ... on each Scene Heading.
    const number = index > 0 ? String(index) : "";
    const numbered = number ? heading.replace('<Paragraph Type="Scene Heading">', `<Paragraph Type="Scene Heading" Number="${escapeXml(number)}">`) : heading;
    out.push(numbered);
  }
  if (Array.isArray(scene.lines)) {
    for (const line of scene.lines) {
      const text = serializeLine(line);
      if (text) {
        const isRevision = line?.revision === true;
        const revised = isRevision ? text.replace('<Paragraph ', '<Paragraph Revision="1" ') : text;
        out.push(revised);
      }
    }
  }
  return out.filter(Boolean).join("\n  ");
}

const TITLE_FIELDS = Object.freeze([
  ["title", "Title"],
  ["credit", "Credit"],
  ["author", "Author"],
  ["source", "Source"],
  ["draftDate", "Draft Date"],
  ["contact", "Contact"],
  ["notes", "Notes"],
]);

function serializeTitlePage(title) {
  if (!title || typeof title !== "object" || Array.isArray(title)) return "";
  const paragraphs = [];
  // No clock in here: the Draft Date default lives in the route
  // (applyDraftDateDefault in fdx_export_route.js) so this module stays
  // byte-for-byte deterministic for a given input.
  for (const [key, label] of TITLE_FIELDS) {
    const value = trim(title[key]);
    if (!value) continue;
    paragraphs.push(paragraph("General", `${label}: ${value}`, { Alignment: "Center" }));
  }
  if (paragraphs.length === 0) return "";
  return `<TitlePage>\n  <Content>\n    ${paragraphs.join("\n    ")}\n  </Content>\n</TitlePage>`;
}

function exportToFDX(screenplay = {}) {
  if (!screenplay || typeof screenplay !== "object") {
    return `${XML_HEADER}\n${FD_OPEN}\n  <Content/>\n${FD_CLOSE}\n`;
  }
  const scenes = Array.isArray(screenplay.scenes) ? screenplay.scenes : [];
  const body = scenes
    .map((s, i) => serializeScene(s, i + 1))
    .filter(Boolean)
    .join("\n  ");
  const content = body
    ? `<Content>\n  ${body}\n</Content>`
    : `<Content/>`;
  const titlePage = serializeTitlePage(screenplay.title);
  const parts = [XML_HEADER, FD_OPEN, `  ${content}`];
  if (titlePage) parts.push(`  ${titlePage}`);
  parts.push(FD_CLOSE);
  return parts.join("\n") + "\n";
}

export {
  exportToFDX,
  serializeTitlePage,
  serializeHeading,
  serializeAction,
  serializeCharacter,
  serializeTransition,
  serializeCentered,
  serializeLyrics,
  serializeSection,
  serializeSynopsis,
  serializeScene,
  escapeXml,
};
