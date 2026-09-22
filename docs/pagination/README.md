# Printed-page model

One engine, two implementations, one fixture file.

| | |
| --- | --- |
| Backend | `backend/lib/screenplay_pagination.js`, served by `POST /screenplay/paginate` |
| iPhone | `them/ScreenplayPageLayout.swift`, behind the Studio home page chip and the Pages overview |
| Parity | `docs/pagination/fixtures.json` — both test suites must reproduce every page's source range, rendered line count, and first/last line |

Rules (12-point Courier lines; see NOTICE-opendraft.md for provenance):

- US Letter with 1-inch top and bottom margins: **54** body lines per page (`lines_per_page` may override within 24–120).
- Characters per line: scene heading and action 62, character 41, dialogue 36, parenthetical 26, transition 21. Greedy word wrap; a word longer than the width is cut at it.
- Space before a block: scene heading 2, action 1, character 1, transition 1, dialogue and parenthetical 0. Nothing at the top of a page.
- A scene heading never ends a page; it moves with the block after it.
- A character cue keeps at least two lines of its speech. A speech that does not fit splits with `(MORE)` at the foot and `CUE (CONT'D)` at the head of the next page, each one line, only when at least two dialogue lines stay on both sides.
- Blocks longer than a page (long action) overflow line by line.
- One page ≈ one minute of screen; `est_minutes` uses rendered lines.

`start_line` / `end_line` are 1-based source lines of the draft; a speech split across a break reports its source lines on both pages.

Regenerate the fixtures after a deliberate rule change:

```sh
cd backend && node evals/generate_pagination_fixtures.mjs   # writes docs/pagination/fixtures.json
```
