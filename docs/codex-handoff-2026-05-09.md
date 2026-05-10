# Codex Handoff Savepoint — 2026-05-09

This savepoint records the Studio polish and screenwriting craft release work completed before the T10 design-system PR.

## Studio Polish

- Restored the Studio navigation strip with Document, Pages, Revisions, Snapshots, and Scenes.
- Restored Document as a working draft tools tab and Scenes as a working right-rail tab.
- Restored pinned badges, top utility actions, Tear Off Paper / Reopen Paper, floating Desktop Paper, and recent torn-off page chips.
- Built and visually verified the restored Studio polish in the canonical main app project at `them_MAIN.xcodeproj`.

## Craft Runtime And Corpus

- Added the canonical screenwriting craft corpus with 240 cards.
- Coverage: 16 craft areas, 15 cards each.
- Provenance: 240 cards with provenance.
- Added release readiness proof at `backend/evals/screenwriting_release_readiness.latest.json`.
- Regenerated `backend/knowledge_embeddings_cache.json` after quota/billing was restored.

## Verification Recorded

- macOS app build: passed.
- Swift craft/client tests: passed, 7/7.
- Backend craft tests: passed, 39/39.
- Full `./scripts/quality_gate.sh`: passed after embedding quota was restored and the cache was regenerated.

## Historical Note

The first handoff pass correctly reported the release gate failing because embeddings were not fresh. After quota/billing was restored, Codex regenerated the vector cache, rebuilt the readiness artifact, fixed the one unrelated nightly regression that surfaced, and reran the full quality gate successfully.
