---
id: T-screenplay-markdown-export-tests
title: Direct tests for backend/lib/screenplay_markdown_export.js
owner: claude
status: merged
branch: claude/T-screenplay-markdown-export-tests
pillar: infra (test coverage)
v1_pillar: screenplay
v1_effect: closes a zero-coverage gap on the markdown-projection lib used by the POST /screenplay/export `format=md|markdown` branch; pins the paragraph-typing rules in the lib header
---

## Scope

Ships `backend/tests/screenplay_markdown_export.test.mjs` — 19
direct tests for `exportScreenplayToMarkdown` +
`paragraphTypeForLine` + `respondScreenplayMarkdown`.

### Coverage

#### `paragraphTypeForLine` (line-typing rules)

- Scene heading: `INT./EXT./EST./INT\/EXT./I\/E.` prefixes
- Transition: `CUT TO: / DISSOLVE TO: / FADE OUT. / THE END`
- Parenthetical: `(softly)` style
- Character: short all-caps without `:` or `.`; length cap 32
- Character rejected when too long (>32 chars)
- Dialogue: line after `Character | Parenthetical | Dialogue`
- Action: default for anything that doesn't match
- Empty line returns null type

#### `exportScreenplayToMarkdown` (full export)

- Non-string input → empty string (defensive)
- Empty draft → just `\n`
- Scene heading + action renders correctly (`## ...` + plain)
- Character + dialogue (bold cue + plain dialogue)
- Parenthetical → italic
- Transition → blockquote `> ...`
- CRLF line endings normalize to LF
- 3+ blank lines collapse to 1
- Output ends with exactly one trailing newline
- Determinism (same input → same output)

#### `respondScreenplayMarkdown` (route helper)

- Sets `Content-Type: text/markdown; charset=utf-8`
- Sets `Content-Disposition: attachment; filename="<base>.md"`
- Sends 200 + body

## V1 pillar / effect

- `V1 pillar: screenplay`
- `V1 effect: closes the zero-coverage gap on the markdown
  export branch. V1 line 39 ("Manual smoke: create project →
  write scene → save → export → reopen") covers Fountain + FDX;
  the markdown branch is the third export format and now has
  its rules pinned.`

## Verification

```
node --test backend/tests/screenplay_markdown_export.test.mjs
```

→ **19/19 pass**.

## Done when

`screenplay_markdown_export.test.mjs` ships and passes.
