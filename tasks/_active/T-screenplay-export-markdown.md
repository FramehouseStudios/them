---
id: T-screenplay-export-markdown
title: POST /screenplay/export format=md|markdown
owner: claude
status: review
branch: claude/T-screenplay-export-markdown
pillar: layer-1-craft (export)
---

## Scope

`POST /screenplay/export` already handles `fountain`, `txt`, `fdx`,
and rejects `pdf`. This PR adds `md` / `markdown` as a fourth format,
useful for handing a screenplay to any tool that consumes Markdown
(GitHub, Notion, Obsidian, Pandoc).

Conversion rules mirror the FDX paragraph-typing rules so a given
line ends up in the same logical role in both outputs:

- Scene Heading                       → `## ...`
- Character                           → `**...**`
- Parenthetical                       → `*...*`
- Transition                          → `> ...`
- Dialogue / Action                   → plain paragraph

Pure helper at `backend/lib/screenplay_markdown_export.js` so the
conversion is unit-testable without spinning up the full app.
12 unit tests cover paragraph typing, full conversion, empty/null
input, `\r\n` normalization, blank-line collapsing, and determinism.

## Done when

`POST /screenplay/export` accepts `format=md` and `format=markdown`,
returns `text/markdown; charset=utf-8` with a `.md` Content-Disposition;
the conversion helper is tested; `npm test` green.
