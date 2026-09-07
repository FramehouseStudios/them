# Short-film beta — M1 (voice → 5 of 15)

> Behind `CLEMENTINE_SHORT_FILM_BETA=1`. Default OFF so V1 Page/Companion stays green.

## Flag

| Flag | Default | Effect |
|---|---|---|
| `CLEMENTINE_SHORT_FILM_BETA` | `0` | When `1`, `classifyIntent("Hey Clementine, I want to write a short film today 15 pages, genre horror, one location bedroom, three characters John Sally Sam. Write first five pages")` → `SHORT_FILM_BETA` (Page lane, `minimal→low` Spark, own wallet). When `0`, same utterance → `UNKNOWN` or legacy `page_edit` via normal heuristics (no beta side effects). |

Canonical helpers: `backend/lib/clementine/short_film_beta.js` (`isShortFilmBetaEnabled`, `shouldRunShortFilmBeta`) + `short_film_intent.js` (`parseShortFilmIntent`).

## Intent

* **Name:** `SHORT_FILM_BETA`
* **Lane:** `Page` (`lanes.js`), effort `low` (multi-beat may bump to `medium`)
* **Parser:** `parseShortFilmIntent(utterance)` — pure, no I/O. Extracts:
  * `totalPages` (1–30, first `N pages`)
  * `requestedPages` (`write first N pages`, else = totalPages)
  * `genre` (horror/comedy/drama/…)
  * `setting` (single location, e.g. `bedroom`)
  * `characters` (capitalized names after `characters` segment, 1–5)
* Returns `null` if missing `short film`, `pages`, `genre`, or `characters` — safe fallback to legacy lane.

## Relation to D008/D012

* Reuses D008 intent-first + lane routing. `SHORT_FILM_BETA` is additive; flag off → `intents.js:35-94` cascade unchanged.
* M1 is PR1 only (parse + classification). Prompt/lane/wallet/store/bridge land in PR2–PR4. Strangler: new files under `backend/lib/clementine/`, never `backend/index.js`.

## Verification

```bash
# Flag off → UNKNOWN
node -e "import('./backend/lib/clementine/intents.js').then(m=>console.log(m.classifyIntent('I want to write a short film today 15 pages horror bedroom John Sally Sam')))"
# Flag on → SHORT_FILM_BETA
CLEMENTINE_SHORT_FILM_BETA=1 node -e "import('./backend/lib/clementine/intents.js').then(m=>console.log(m.classifyIntent('Hey Clementine, I want to write a short film today 15 pages, genre horror, one location bedroom, three characters John Sally Sam. Write first five pages.')))"
node backend/tests/short_film_intent.test.js  # via npm test
```

See `DECISIONS.md:D016` (proposed).
