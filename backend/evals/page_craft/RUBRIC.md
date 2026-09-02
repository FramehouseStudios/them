# Page craft rubric (F1)

Owner bar: page/scriptwriting must aim to be the **smartest creative writer** at top-class literary/screen craft. Speed only enables draft→revise loops.

This rubric scores short Fountain / page excerpts. Each dimension is **1–5**. **Overall** is the unweighted mean of the six dimensions (rounded to two decimals).

| Score | Meaning |
| --- | --- |
| 5 | Top-class; publishable craft move |
| 4 | Strong; minor polish only |
| 3 | Competent / mixed; not yet owner-bar |
| 2 | Weak; clear craft failure |
| 1 | Broken / unusable on this dimension |

## Dimensions

### 1. Distinct character voice
Characters are separable by diction, rhythm, tactic, and worldview — not interchangeable “writer voice” under different cues.

### 2. Subtext density
Dialogue and behavior imply more than they state. Avoid on-the-nose emotion labels and audience-lecture exposition.

### 3. Continuity of want / obstacle / cost
The page keeps a live pursuit: someone wants something, pressure blocks it, and a move exacts a visible or relational cost. No orphaned beats or contradictory facts.

### 4. Motif / image echo
A concrete image, object, or sensory motif recurs or transforms so the page feels designed rather than random.

### 5. Anti-cliché
Fresh wording and specific behavior over stock phrases, generic advice-speak, and overwritten adverb emotion.

### 6. Format / playability
Valid Fountain shape (headings, cues, action) and **playable** specificity: a camera or actor can execute the beat without outline-speak.

## Heuristic vs LLM judge

- **Heuristic (CI default):** uses existing detectors in `screenplay_page_quality.js` + `format_linter.js` plus light page-craft patterns. Deterministic; no API key.
- **LLM judge (optional):** enabled only when `PAGE_CRAFT_LLM_JUDGE=1` **and** `OPENAI_API_KEY` is set. Fail-closed: missing key → skip LLM path (do not fail CI).

## Gate thresholds (eval runner)

Documented in `run_page_craft_eval.mjs`:

- **PASS** fixtures: `overall >= 3.5`
- **FAIL** fixtures: `overall <= 2.8`
- Runner exits non-zero if any PASS fixture scores below floor or any FAIL fixture scores above ceiling.

## F2 (shipped MVP)

Multi-pass revise loops consume this scorer as an acceptance signal between draft → critique → revise (optional repair). See `docs/product/page-multipass.md`. F1 remains measurement + golden fixtures; F2 is flag-gated productization.
