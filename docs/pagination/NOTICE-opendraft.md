# Pagination rules ported from OpenDraft

The element-aware page model in `backend/lib/screenplay_pagination.js` and
`them/ScreenplayPageLayout.swift` follows the rules of OpenDraft's pagination
engine (`frontend/src/editor/pagination.ts`, `utils/elementSpacing.ts`,
`stores/industryStandardTemplate.ts`): 12-point lines, Final Draft indents at
10.33 characters per inch, per-element space-before, scene headings kept with
the block after them, character cues kept with two lines of speech, and
dialogue split across a page break with (MORE) / (CONT'D). The code here is a
re-implementation in this repository's style; the rule set is theirs.

OpenDraft — https://github.com/Proteus-Technologies-Private-Limited/OpenDraft

MIT License

Copyright (c) 2026 Proteus Technologies

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

When `THIRD_PARTY_NOTICES.md` (PR #456) lands, this notice belongs there too.
