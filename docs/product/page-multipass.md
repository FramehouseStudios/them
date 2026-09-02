# Page multipass (F2)

Intentional craft loop for the **Page** lane: **Plan → Draft → Critique → Revise**.

Owner bar: top-class creative writer. Speed only exists so draft→revise can loop. Prefer correctness, abortability, and wallet honesty over cleverness.

## Flags (default OFF)

| Flag | Default | Effect |
| --- | --- | --- |
| `CLEMENTINE_PAGE_MULTIPASS=1` | off | Enable multipass for Page-lane talk generation |
| `PAGE_MULTIPASS_REPAIR=1` | off | After revise (or draft if revise skipped), if F1 heuristic `overall < 3.5`, run **one** extra metered revise |

Production must keep multipass **off** until deliberately enabled. Main stays safe with defaults.

## Stages

1. **plan** — short beat/intent outline (want / obstacle / cost / motif / voice). Cheap, low effort. **Not wallet-metered.**
2. **draft** — Fountain page executing the plan. **Metered.**
3. **critique** — structured JSON against F1 rubric dimensions (heuristic by default; optional injected LLM supplier). **Not wallet-metered.**
4. **revise** — one revise pass consuming critique directives. **Metered.**
5. **repair** (optional) — one extra revise when `PAGE_MULTIPASS_REPAIR=1` and score is below F1 PASS floor (`3.5`). **Metered.**

Every stage honors `AbortSignal` / page cancel (`gatePageGeneration` + `createPageCancelledError`).

## Wallet honesty

**Meter draft + revise (+ optional repair) only.** Plan and critique are scaffolding — writers should not burn Page turns for an outline or a scorecard.

When the multipass flag is on, `beginPageWork` doubles `max_output_tokens` for the **wallet reserve** so draft+revise headroom is held up front. Commit settles to summed actual output tokens from metered stages only.

See also `docs/product/clementine-wallet.md`.

## Modules / wiring

- `backend/lib/clementine/page_multipass.js` — orchestration + talk_generate bridge
- `page_lane_adapter.js` — sets `req.clementine.pageMultipass`, doubles reserve when flagged
- `talk_generate.js` — thin hook: if `shouldRunPageMultipass(req)`, delegates to `runTalkGeneratePageMultipass` (no streaming in MVP)
- Acceptance seam: `backend/evals/page_craft/score_page.js` (`scorePageHeuristic`)

## Tests

`backend/tests/page_multipass.test.mjs` — fake suppliers, no live API:

- flag off → single-pass `runTalkGenerate`
- flag on → stages run; abort mid-stage; wallet metering counts; repair path

## Out of scope (F2)

- Full LLM judge in CI
- Expanding all gold fixtures
- Rewriting ScreenplayStudioScreen
- Enabling multipass by default in production

## F3 residuals

Model routing per stage (cheaper plan/critique models vs draft/revise quality tier) is deferred to F3.

## Change log

- 2026-09-01 — F2 MVP: flag-gated Plan→Draft→Critique→Revise + optional repair; F1 heuristic acceptance seam.
