# T1198 — project-owned character voice hints

- Base: `5996de800bd332e0293476ccd99660270ffcce2a`.
- Branch/worktree: `codex/T-1198-character-voice-project-scope`, `/Users/halfmutantfilms/io.them-worktrees/codex-character-voice-project-scope`.
- Files: BackendClient's existing traits method/auth-header helper; existing character-voice cache policy and Bridge capability; traits refresh policy/ViewModel ingress; existing BackendClientCraftAPITests, ScreenplayCraftModelsTests and StudioThreadViewStateSupportTests; this handoff. Root/Screen/parent source remain untouched.

## Source-verified cause

Root serialized `screenplay_character_voice_memories` from a cache scoped only by user. Empty character focus returned the entire previous library; name focus could match a different project's same-named character. Project fetches also silently fell back to the global library, then wrote that result into the same cache without provenance. This was an actual request-producer path, distinct from displaying last-applied history.

## Fix

- The single existing cache records optional original user/login-intent, project ID and backend provenance. Its key/store is unchanged. Untagged legacy/global snapshots remain display-only; no current project is inferred for them.
- Page selection validates this scope before empty-focus or name matching. Project, login/account or backend changes reject the old cache, including after relaunch.
- Existing per-record `projectId` response evidence is required for Page hints. A scoped request cannot retag foreign/global records; both HTTP ingress and cache admission use the same canonical record filter. Scoped requests use project ID without title aliases.
- The existing traits HTTP method accepts optional expectedScope, uses captured canonical auth identity through the existing header helper, checks scope/owner before and after await, and validates actual response origin. Explicit wrong-user responses preserve safe 409/auth_request_superseded rather than exposing raw character data in a 502 error.
- ViewModel's existing refresh task/ID carries its original scope; stale results, errors and cleanup cannot follow a newer project/request. Scoped empty stays empty. Explicit unscoped library retrieval remains available for display, with no Page scope.
- Existing cache snapshot/selection/normalization moved into its existing policy file for substantive D009 reduction. No new map, store, transport or framework was added.

## Verification and limits

- VERIFIED: diff checks and canonical god-file gate passed. Bridge shrank from 12,762 at the exact base to 12,734 lines (cap 12,774).
- VERIFIED: redirect source coverage contract **4 pass / 0 fail / 0 skip**, run with host Node **26.7.0**. This is source lint, not native or Node20 runtime proof.
- Added five intercepted HTTP regressions plus cache/persistence/policy coverage for original headers and ID, explicit record provenance, empty scoped results, stale owner, wrong backend/project/origin, safe ownership errors, library compatibility, same-name/empty focus, login generation and relaunch isolation.
- Swift compilation and all focused/full/native/UI regressions: **UNRUN in this helper**. No provider/model calls, network requests, push, merge, deployment or main changes were performed. Legacy voice hints without verifiable project records intentionally remain excluded from Page metadata.

Preserve this local commit into the parent's combined tree, then compile and run signed focused/full/UI/macOS proof there. Do not apply earlier native pass counts to this source. Helper freezes after handoff.
