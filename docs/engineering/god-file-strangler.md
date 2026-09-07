# God-file strangler rules

> Accepted under **D009**. Goal: organize megafauna files without rewriting the product.

## Why

God files concentrate risk. Splitting them by line number usually breaks auth flush order, voice interrupt, and outbox drain. We strangle instead: façade stays, capability moves, behavior stays locked.

## Non-negotiables

1. **No big-bang rewrite** of `backend/index.js`, `talk_handler`, `ScreenplayLiveDraftBridge`, `RootExperienceView`, `ScreenplayStudioScreen`, or peers.
2. **One capability per PR**, mergeable in a day, revertible.
3. **Characterization first** — HTTP contracts and critical UI smokes green before/after.
4. **God-file line count must not grow** on feature work; new code lands beside the façade.
5. **Delete the old path in the same PR** once the new mount is proven (flag ≤ one release).

## Backend sequence

| ID | Seam | Done when |
| --- | --- | --- |
| B1 | Wire existing `auth_routes` / remove inline auth from `index.js` | Single auth mount path |
| B2 | Talk HTTP stays in pipeline/adapters (Clementine edge) | No new talk routes in `index.js` |
| B3 | Stage-split `talk_handler` (`prompt` / `stream` / `persist`) | Handler is orchestration only |
| B4 | Stores/persistence only via `lib` adapters | No new store logic in `index.js` |
| B5 | `index.js` = boot + wire-up | CI/CODEOWNERS discourage growth |

**Team rule:** new backend features land under `backend/lib/...` using `mountX(app, deps)` (or equivalent). Growing `index.js` requires a one-line PR justification.

**Current owners (D009, `backend/index.js` 33626):** `lib/clementine` — `short_film_{beta,intent,prompt,lane,store,character_context,intent_llm,story_elements,feature_structure_knowledge,story_structure_knowledge,craft_cards,page_flip,visual_pagination,studio_actions,coverage,studio_live_paper,memory_persist,dual_channel,chess_edit,samantha_{presence,intuition,voice},inspector_ux,stream_helpers}` + `lib/visual_context_route`, `lib/normalizers`, `lib/limits`; flag `CLEMENTINE_SHORT_FILM_BETA` (D016, `short_film_beta.js`) gates 5→90p lane, id-only store + `x-screenplay-project-id`, canary `RUN_BETA_SHORT_FILM_CANARY` default 0.

## iOS sequence

| ID | Seam | Done when |
| --- | --- | --- |
| I1 | Views do not own networking | Talk/page-cancel via client/service only |
| I2 | Split live-draft bridge by concern | Insert / outbox / reconcile / interrupt modules behind façade |
| I3 | Feature ViewModels off Studio | Craft/export/sync/editor bindings isolated |
| I4 | Compose god views from children | Screen files shrink via composition |
| I5 | One shell | Dead or duplicate `AppShell` path removed or canonicalized |

**Team rule:** no new product `@State` on Root/Studio god views — dedicated types only.

## PR checklist

- [ ] Names the **capability** being moved (not a line range)
- [ ] Characterization / existing tests cover the seam
- [ ] God file diffstat: lines down or unchanged; new files absorb behavior
- [ ] Old path removed or clearly flagged with removal issue
- [ ] No parallel “new architecture” scope sneaked in

## Anti-goals

- Rewrite in a new app architecture as a project
- Stuffing underpowered Packages before façades are thin
- Agent-driven 10k-line view splits without characterization
- Five open extract branches that never merge

## Related

- D008 — Clementine Muse runtime (talk-edge extracts should follow these rules)
- `backend/lib/README.md` — mount/deps pattern
