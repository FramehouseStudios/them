# Page multipass (F2 / F3)

Intentional craft loop for the **Page** lane: **Plan → Draft → Critique → Revise**.

Owner bar: top-class creative writer. Speed only exists so draft→revise can loop. Prefer correctness, abortability, and wallet honesty over cleverness.

## Flags (default OFF)

| Flag | Default | Effect |
| --- | --- | --- |
| `CLEMENTINE_PAGE_MULTIPASS=1` | off | Enable multipass for Page-lane talk generation |
| `PAGE_MULTIPASS_REPAIR=1` | off | After revise (or draft if revise skipped), if F1 heuristic `overall < 3.5`, run **one** extra metered revise |

Production must keep multipass **off** until deliberately enabled. Main stays safe with defaults. F3 routing does **not** force Muse on globally.

## Stages

1. **plan** — short beat/intent outline (want / obstacle / cost / motif / voice). Cheap, low effort. **Not wallet-metered.**
2. **draft** — Fountain page executing the plan. **Metered.**
3. **critique** — structured JSON against F1 rubric dimensions (heuristic by default; optional injected LLM supplier). **Not wallet-metered.**
4. **revise** — one revise pass consuming critique directives. **Metered.**
5. **repair** (optional) — one extra revise when `PAGE_MULTIPASS_REPAIR=1` and score is below F1 PASS floor (`3.5`). **Metered.**

Every stage honors `AbortSignal` / page cancel (`gatePageGeneration` + `createPageCancelledError`).

## F3 — Per-stage model / effort routing

| Stage family | Stages | Default model | Default effort | Notes |
| --- | --- | --- | --- | --- |
| **Cheap** | plan, critique | `CHAT_MODEL_FAST` (`gpt-4o-mini`) | `low` | Unmetered scaffolding |
| **Craft** | draft, revise | `CHAT_MODEL_STRUCTURAL` when Muse off; `MUSE_MODEL` (`muse-spark-1.2`) when Muse on | `medium` | Owner-bar page text |
| **Craft repair** | repair | same as revise | `CHAT_SCREENPLAY_REPAIR_REASONING_EFFORT` (`medium`) when Muse off; `medium` on Muse | Optional third metered pass |

Env overrides (all optional):

| Variable | Default when unset |
| --- | --- |
| `PAGE_MULTIPASS_PLAN_MODEL` / `_EFFORT` | `CHAT_MODEL_FAST` / `low` |
| `PAGE_MULTIPASS_CRITIQUE_MODEL` / `_EFFORT` | `CHAT_MODEL_FAST` / `low` |
| `PAGE_MULTIPASS_DRAFT_MODEL` / `_EFFORT` | structural or Muse / `medium` |
| `PAGE_MULTIPASS_REVISE_MODEL` / `_EFFORT` | same family as draft / `medium` |
| `PAGE_MULTIPASS_REPAIR_MODEL` / `_EFFORT` | same family as revise / repair effort above |

Implementation: `backend/lib/clementine/page_multipass_routing.js` → DI into `runTalkGeneratePageMultipass` (each `chatSupplier.chat` call gets `model`, `reasoningEffort`/`effort`, `apiMode`, and optional `preferProvider`).

### Muse-enabled choice (documented)

Evidence: `docs/product/clementine-muse-cutover.md` routes the whole Page lane through Muse when `CLEMENTINE_MUSE_ENABLED` + key are set; F2/D012 wallet honesty leaves plan/critique **unmetered** scaffolding; `lanes.js` bumps Page multi-beat toward `medium` and Deep craft toward `medium`/`high`.

**Choice:** when Muse is enabled, **plan/critique prefer OpenAI cheap** (`preferProvider: "openai"` + `CHAT_MODEL_FAST`, effort `low`) so Spark is not burned on outline/scorecard. **Draft / revise / repair stay on Muse Standard** at elevated effort (`medium`). Multipass does not flip `CLEMENTINE_MUSE_ENABLED`.

`createMuseAwareChatSupplier` honors `preferProvider: "openai"` as a thin escape hatch for those cheap stages only.

## Wallet honesty

**Meter draft + revise (+ optional repair) only.** Plan and critique are scaffolding — writers should not burn Page turns for an outline or a scorecard.

When the multipass flag is on, `beginPageWork` doubles `max_output_tokens` for the **wallet reserve** so draft+revise headroom is held up front. Commit settles to summed actual output tokens from metered stages only.

See also `docs/product/clementine-wallet.md`.

## Modules / wiring

- `backend/lib/clementine/page_multipass.js` — orchestration + talk_generate bridge
- `backend/lib/clementine/page_multipass_routing.js` — F3 stage → model/effort/provider
- `page_lane_adapter.js` — sets `req.clementine.pageMultipass`, doubles reserve when flagged
- `talk_generate.js` — thin hook: if `shouldRunPageMultipass(req)`, delegates to `runTalkGeneratePageMultipass` (no streaming in MVP)
- Acceptance seam: `backend/evals/page_craft/score_page.js` (`scorePageHeuristic`)

## Tests

`backend/tests/page_multipass.test.mjs` — fake suppliers, no live API:

- flag off → single-pass `runTalkGenerate`
- flag on → stages run; abort mid-stage; wallet metering counts; repair path
- F3 → routing defaults + env overrides; talk bridge asserts per-stage model/effort; Muse prefer OpenAI on plan

## Out of scope

- Enabling multipass by default in production
- Full F4 memory bible
- Expanding all gold fixtures
- Rewriting ScreenplayStudioScreen

## Next beats (pills)

When the flag is on, the plan prompt ends with three bullet lines starting
with `Next:`. `parseNextBeats` lifts them (bullets optional, max 3, 180
chars each) onto `req.clementine.multipass.nextBeats`; the talk handler
stores them on the turn-meta record and `GET /talk/turn/:turnId` returns
them as `next_beats` (see `docs/schemas/talk-turn-meta.md`). They are
model suggestions for the Studio pills — never written into `req.body`
(`next_three_turns` there is writer-supplied canon and is persisted).

## Residuals

- **F4** — memory bible / longitudinal craft memory for Page
- **Calibration** — live eval of cheap vs craft tiers once multipass is enabled in a non-prod env

## Change log

- 2026-09-01 — F2 MVP: flag-gated Plan→Draft→Critique→Revise + optional repair; F1 heuristic acceptance seam.
- 2026-09-02 — F3: per-stage model/effort routing + Muse prefer-OpenAI for plan/critique.
- 2026-09-05 — Next beats: plan prompt asks for 3 `Next:` lines; parsed onto `req.clementine.multipass.nextBeats` and surfaced as `next_beats` in the turn-meta envelope.
