# T05 - First Page Written Telemetry

## Event

`first_page_written` is stored in the screenplay companion analytics snapshot the first time a user commits an authoritative screenplay-formatted page write. The app records it from the central `lastCommittedWrite` path so typed and voice-driven page commits share one measurement hook.

## Trigger

The event fires only when all of the following are true:

- `ScreenplayCommittedWrite.isAuthoritativeWrite` is true. Stub writes are ignored.
- The inserted text passes `FountainFormatter.isStrongStudioPageWriteCandidate(..., allowActionOnly: true)`.
- `companionAnalytics.firstPageWrittenAt` is still empty.

## Analytics Destination

The event is persisted through `/screenplay/companion/state` under `analytics`:

- `first_page_written_at`: ISO timestamp for the committed write.
- `first_page_written_source_raw`: `voice`, `typed`, or empty if unavailable.
- `first_page_written_project_id`: active screenplay project id when known.
- `first_page_written_version_id`: active screenplay version id when known.

The backend normalizes both camelCase client payloads and snake_case API payloads. If a later client update omits the first-page fields, the backend preserves the already-recorded event so it remains once per user.

## Verification

- Swift Codable coverage lives in `themTests/ScreenplayPromptModeTests.swift`.
- Backend persistence and legacy-preservation coverage lives in `backend/tests/screenplay_companion_state.test.mjs`.
