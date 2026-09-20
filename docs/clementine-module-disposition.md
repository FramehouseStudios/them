# Clementine module disposition — main 647e01fc

Owner: Codex. Status: **RECOMMENDATION; implementation pending**.

## Scope and evidence

The production import graph has **90 files: 89 modules plus index.js**.
**37 reachable; 53 unreachable.** Entry point: backend/index.js, corroborated by
package.json start scripts, run.production.sh and Dockerfile. The AST walk follows
static imports, re-exports, literal dynamic imports and require calls recursively.
Tests, evals, comments and disconnected cycles do not count as production roots.
Computed imports fail closed for review. Nested JS/MJS/CJS modules are included.
The current graph has no computed imports. Reachability is necessary, not proof
of function execution, correct authorization, persistence or a working feature.

Run from backend:

```sh
node tools/check_clementine_imports.mjs
node --test tests/module_reachability.test.mjs tests/clementine_production_imports.test.mjs
```

The strict repository test is part of the existing tests/*.test.mjs glob and
**fails on the 53 existing orphans**. This is a draft cleanup gate, not a green
merge candidate. No baseline exemption, dummy runtime import, skip or TODO test
hides the debt. Scanner unit tests alone passing does not mean this gate passes.

## Dispositions

KEEP preserves an existing production edge. WIRE / REPLACE requires a real
consumer and handler-level proof, not importing the old implementation as-is.
DELETE / REPLACE retires the disconnected implementation, not the product idea.
No runtime files have been deleted in this audit. Before each removal, review
repository-wide import consumers (including tests and Swift mirrors), update them
in the same small PR, and preserve behavior tests against the canonical path.
All follow-up work below is owned by Codex. Keep cleanup changes separate from
identity, mentor, pagination, voice actions and coverage feature ports.

| Module | Disposition | Reason / required replacement |
| --- | --- | --- |
| `beat_craft.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `beat_sheet_export.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `cache_policy.js` | KEEP | Reachable via `lib/clementine/muse_provider.js`; retain current path, not a claim of behavioral correctness. |
| `character_arc.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `character_voice.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `chess_edit.js` | DELETE / REPLACE | Replace through validated revision-aware line targeting; no global replacement or silent target clamping. |
| `collab_edit.js` | DELETE / REPLACE | Remove separate process-local collaboration history; use canonical project mutation/conflict flow. |
| `coverage.js` | WIRE / REPLACE | Replace with #476/#479 authenticated coverage route and spoken read; remove existing heuristic implementation. |
| `craft_cards.js` | KEEP | Reachable via `lib/clementine/samantha_intuition.js`; retain current path, not a claim of behavioral correctness. |
| `craft_suggestion.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `dialogue_notes.js` | WIRE / REPLACE | Replace with #473 mentor integration; do not inject // subtext comments into saved dialogue. |
| `dialogue_parenthetical.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `dialogue_punchup.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `dialogue_subtext.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `director_commentary.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `draft_notes.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `dual_channel.js` | DELETE / REPLACE | Replace via canonical supplier/streaming pipeline; rawText is not a validated draft and conversation usage is omitted. |
| `dual_live_write.js` | DELETE / REPLACE | Remove simulated streaming after Promise.all; preserve requirement in real live writing pipeline. |
| `export_share.js` | DELETE / REPLACE | Remove fabricated export URLs/tokens; retain actual authenticated export route. |
| `feature_structure_knowledge.js` | KEEP | Reachable via `lib/clementine/studio_live_paper.js`; retain current path, not a claim of behavioral correctness. |
| `final_image_echo.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `ghost_ledger.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `ghost_page.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `ghost_payoff.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `ghost_payoff_ledger.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `iap_app_store_verify.js` | KEEP | Reachable via `config.js`; retain current path, not a claim of behavioral correctness. |
| `iap_credit_route.js` | KEEP | Reachable via `index.js`; retain current path, not a claim of behavioral correctness. |
| `iap_verify.js` | KEEP | Reachable via `index.js`; retain current path, not a claim of behavioral correctness. |
| `image_echo.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `image_ledger.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `index.js` | DELETE / REPLACE | Remove unused production barrel after converting test consumers to direct imports. |
| `inspector_ux.js` | WIRE / REPLACE | Replace with #475/#478 capability-validated actions; reconcile Swift mirror, not just backend tests. |
| `intents.js` | KEEP | Reachable via `lib/clementine/page_lane_adapter.js`; retain current path, not a claim of behavioral correctness. |
| `lanes.js` | KEEP | Reachable via `lib/clementine/page_lane_adapter.js`; retain current path, not a claim of behavioral correctness. |
| `marketability.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `memory_compaction_job.js` | DELETE / REPLACE | Remove process-local no-op job; any future compaction belongs to durable canonical memory workflow. |
| `memory_persist.js` | WIRE / REPLACE | Wire only through authenticated owner/project mutation; eliminate implicit first-project fallback; prove restart persistence. |
| `memory_tools.js` | WIRE / REPLACE | Wire through canonical creative-memory store only after owner/project isolation; no silent scratch success in production. |
| `memory_working_set.js` | WIRE / REPLACE | Reconcile with existing prompt memory budget; fix zero-keep and token-estimate boundaries before integration. |
| `muse_client.js` | KEEP | Reachable via `lib/clementine/muse_provider.js`; retain current path, not a claim of behavioral correctness. |
| `muse_provider.js` | KEEP | Reachable via `lib/talk_handler.js`; retain current path, not a claim of behavioral correctness. |
| `pack_catalog.js` | KEEP | Reachable via `lib/clementine/iap_credit_route.js`; retain current path, not a claim of behavioral correctness. |
| `page_abort.js` | KEEP | Reachable via `lib/talk_handler.js`; retain current path, not a claim of behavioral correctness. |
| `page_cancel.js` | KEEP | Reachable via `index.js`; retain current path, not a claim of behavioral correctness. |
| `page_flip.js` | KEEP | Reachable via `lib/clementine/studio_live_paper.js`; retain current path, not a claim of behavioral correctness. |
| `page_lane_adapter.js` | KEEP | Reachable via `lib/talk_pipeline.js`; retain current path, not a claim of behavioral correctness. |
| `page_multipass.js` | KEEP | Reachable via `lib/clementine/page_lane_adapter.js`; retain current path, not a claim of behavioral correctness. |
| `page_multipass_routing.js` | KEEP | Reachable via `lib/clementine/page_multipass.js`; retain current path, not a claim of behavioral correctness. |
| `polish_pass.js` | DELETE / REPLACE | Remove whitespace-flattening and naive grammar rewrite; never apply to saved Fountain. |
| `prose_polish.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `reflex_classifier.js` | KEEP | Reachable via `lib/clementine/reflex_lane.js`; retain current path, not a claim of behavioral correctness. |
| `reflex_lane.js` | KEEP | Reachable via `lib/clementine/talk_edge_adapter.js`; retain current path, not a claim of behavioral correctness. |
| `reflex_templates.js` | KEEP | Reachable via `lib/clementine/reflex_lane.js`; retain current path, not a claim of behavioral correctness. |
| `rewrite_notes.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `samantha_intuition.js` | KEEP | Reachable via `lib/clementine/talk_clementine_headers.js`; retain current path, not a claim of behavioral correctness. Rename in identity PR with persisted-state/header compatibility. |
| `samantha_presence.js` | KEEP | Reachable via `lib/clementine/talk_clementine_headers.js`; retain current path, not a claim of behavioral correctness. Rename in identity PR with persisted-state/header compatibility. |
| `samantha_voice.js` | KEEP | Reachable via `lib/clementine/talk_clementine_headers.js`; retain current path, not a claim of behavioral correctness. Rename in identity PR with persisted-state/header compatibility. |
| `scene_beat_craft.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `scene_craft.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `scene_craft_image.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `scene_craft_suggestion.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `scene_ghost_image.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `scene_ghost_payoff.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `scene_image_echo2.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `scene_track_changes.js` | DELETE / REPLACE | Remove scene-number-only history keys; history must be owner/project scoped. |
| `sequence_craft_coverage.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `short_film_beta.js` | KEEP | Reachable via `lib/talk_handler.js`; retain current path, not a claim of behavioral correctness. |
| `short_film_character_context.js` | KEEP | Reachable via `lib/talk_generate.js`; retain current path, not a claim of behavioral correctness. |
| `short_film_intent.js` | KEEP | Reachable via `lib/talk_handler.js`; retain current path, not a claim of behavioral correctness. |
| `short_film_intent_llm.js` | KEEP | Reachable via `lib/talk_generate.js`; retain current path, not a claim of behavioral correctness. |
| `short_film_lane.js` | KEEP | Reachable via `lib/talk_generate.js`; retain current path, not a claim of behavioral correctness. |
| `short_film_parallel_draft.js` | DELETE / REPLACE | Remove simulated split/merge path; loses action/order and is not simultaneous generation. |
| `short_film_prompt.js` | KEEP | Reachable via `lib/clementine/short_film_lane.js`; retain current path, not a claim of behavioral correctness. |
| `short_film_store.js` | KEEP | Reachable via `lib/talk_generate.js`; retain current path, not a claim of behavioral correctness. |
| `short_film_story_elements.js` | KEEP | Reachable via `lib/clementine/short_film_store.js`; retain current path, not a claim of behavioral correctness. |
| `story_structure_knowledge.js` | KEEP | Reachable via `lib/clementine/feature_structure_knowledge.js`; retain current path, not a claim of behavioral correctness. |
| `stream_helpers.js` | DELETE / REPLACE | Remove unused accumulator; canonical transport owns buffering, cancellation and sentence boundaries. |
| `studio_actions.js` | WIRE / REPLACE | Replace with #475/#478 action contract, authorization, undo and real client dispatch. |
| `studio_live_paper.js` | KEEP | Reachable via `lib/talk_handler.js`; retain current path, not a claim of behavioral correctness. |
| `subplot_thread.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `talk_clementine_headers.js` | KEEP | Reachable via `lib/talk_handler.js`; retain current path, not a claim of behavioral correctness. |
| `talk_edge_adapter.js` | KEEP | Reachable via `lib/clementine/page_lane_adapter.js`; retain current path, not a claim of behavioral correctness. |
| `theme_throughline.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `title_logline.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `track_changes.js` | DELETE / REPLACE | Remove process-local history; use canonical project revisions. |
| `visual_pagination.js` | WIRE / REPLACE | Replace with #471 reconciled with #613 and page_flip; shared page fixtures, no scene-as-page fallback. |
| `voice_lexicon_polish.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |
| `wallet.js` | KEEP | Reachable via `index.js`; retain current path, not a claim of behavioral correctness. |
| `wallet_persistence.js` | KEEP | Reachable via `index.js`; retain current path, not a claim of behavioral correctness. |
| `writer_learning.js` | DELETE / REPLACE | Retire disconnected prototype; preserve useful craft intent in the canonical mentor/coverage ports, not another runtime island. |

## Critical boundaries

- Do not wire placeholder craft as real intelligence: hard-coded John/Sam,
  bedroom, scar and eight-scene defaults must not overwrite a writer's intent.
- export_share fabricates links; polish_pass collapses whitespace; dual_live_write
  emits chunks only after both generations finish. Remove those implementations
  through scoped cleanup, not by presenting them as working product features.
- Memory tooling needs owner/project authorization and durable acknowledgements;
  process-local scratch or a no-op compaction job is not persisted memory.
- The graph can be fooled by a gratuitous barrel import. Review must also require
  a real caller and behavior proof. Do not import index.js to silence this test.
- This inventory is not an exhaustive security or behavior audit of the 37
  retained files. Their existing gates and targeted follow-up reviews still apply.
