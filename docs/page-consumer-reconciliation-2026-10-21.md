# T-1097 consumer / imported-print follow-up

October21, 2026. Parent a67c477; runtime
`e32ade0e3dfd13d58ced2cfac50682aa7bd57a4e` on
`codex/T-1097-source-page-contract`. Original histories stay preserved.

## Root fixes

- Derived collaboration cursors now use the existing canonical printed-page
  engine, not physical lines/55. No inferred cursor for title-only/empty text,
  no arbitrary first project character, no silent clamp of invalid coordinates.
  JSON adds `basis` and `authoritative:false`: an explicit caller cursor or
  supplied fragment is NOT validated editor selection/edit authorization.
- The legacy debug-only live-paper block was duplicated. One metadata emitter
  remains for compatibility, with additive pagination-availability/source fields.
  Metadata-only input explicitly has no draft or authoritative page count.
  Removed an unused mutation of output after its header had already serialized.
- Repository-wide reads found no Swift consumer for these headers; the two
  legacy views are unmounted. Their comments now say that accurately. Do not
  mount a second document writer just to claim a missing wire was connected:
  the existing bridge/editor and cached current-draft layout remain canonical.
  Source-safe editing and actual live insertion stay on those established paths.
- Header voice-profile lookup now reuses existing `trustedUserId`, removing a
  body.ownerKey fallback and duplicated identity resolution. No auth middleware
  or permission loosening. The full existing auth/route suites pass; a dedicated
  cross-user voice-profile HTTP attack was not separately run, so this is source
  boundary hardening, not a newly proven vulnerability or blanket security claim.
- Imported CRLF print bug reproduced on the real signed native renderer:
  continued speech lost MAYA (CONT'D). The attributed copy normalized CRLF while
  outer scans retained original offsets. Every CoreText range/scan now addresses
  one LF-normalized derived print copy; original saved Fountain is untouched.
  CR-only imports are covered too. No production print flag/rollout change.

Jarvis tradeoff: one real editor owner and explicit non-authoritative compatibility
hints instead of introducing a second document renderer/state stream. No new
framework, dependency, production secret, paid call or accepted-decision edit.

## Proof

Permanent artifacts:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1097-consumers-20261021.ECQkab/`

`runtime-changed-files.txt` contains all9 runtime/test/comment paths; source patch
and archive pin the exact runtime. This document and TASKS.md are additional docs.

- Native import regression red0/1/0, retained in newline-red. A result-file lookup
  initially guessed the wrong suffix; actual38810 bundle was used. xcresulttool
  needed scoped write access for its cache; no observation failure was treated
  as a reason to restart the test.
- Corrected signed ScreenplayPrintServiceTests **12/0/0**, erased owned Pro
  11CF5EFB-D8C3-4F19-8062-28AF37F27D93, iOS26.2/23C54. Actual39490 bundle.
  Includes existing title, numbering, paper/kill switch, long speech checks.
- New regression renders LF/CRLF/CR documents with title and120 unique dialogue
  markers. Every marker appears exactly once; complete extracted page text,
  count and continuation labels agree. All9 pages per variant were Poppler-
  rendered; SHA256 pixel hashes agree for all27 PNGs. Continued and final pages
  visually inspected: upright, no overprinted continuation, markers retained.
- Full backend **Node20.20.2: 2861 pass /0 fail /2 skip**, frozen public source,
  network-disabled container. No runtime edits after that frozen e32ade0 source.
  Skips remain real Postgres prefix query (no DATABASE_URL) and existing skipped
  talk page-preview header case. Not claimed covered.
- Focused host Node24: cursor/page/edit14/0/0 and metadata/cursor/dual12/0/0.
  D009 and diff pass. Existing Swift actor/Sendable warnings remain.

No fresh full themTests, macOS build or voice/UI rerun in this follow-up. Prior
checkpoint aae4425 has26 focused native, two actual-app synthetic writer checks
and macOS proof, not relabeled as this head's results. T-1098 will exercise current
Pages actions plus typing on the integrated candidate and compile the Mac scaffold.

## Status / next

T-1097 is ready for guarded review, not landed. Existing editor live-writing
behavior is not newly claimed from legacy helper tests. Original #643 follows
the Pages boundary, after T-1098's full-width narrow navigator. Genuine approval,
integrated-main full gates, physical phone/intended backend and production
credential hold remain. No main change, review impersonation or deployment.
