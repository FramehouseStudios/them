# T-1097 — Title/source/page integrity checkpoint

October21, 2026 (client America/Los_Angeles date). This is a locally verified
checkpoint, not an integrated-main, production or physical-iPhone result.

Branch: `codex/T-1097-source-page-contract`, parent `75632c3b`.
Original #613 head `4143d9c3a6196528a4d654b59addfb09cfdff62c` remains intact;
both original commits are ancestors through preserving merge `1661fee`.
Runtime repair: `aae442509dc1ac5854a57e3d62479f6cd6481a9e`.

## Completed / root causes

Original PR body, commits, tests and follow-ups were read before integration.
One ViewModel conflict was reconciled: retain request-ID, exact-draft and density
ownership; send the full original document to the backend. The server now owns
title exclusion and full-document ranges, avoiding client strip + server reparse
or double line-offset application. Title-only drafts still avoid client calls.

VERIFIED corrections:

1. Original first-scene helper used `dropFirst(2)` for CRLF, but Swift treats
   CRLF as one Character. Direct reproduction returned `NT. ROOM` for
   `\r\nINT. ROOM`. Drop one grapheme instead; preserve the complete scene.
2. Whitespace-only title separators were consumed as metadata continuation.
   Both native and backend boundaries now stop there, retaining colon-bearing
   action such as `TIME: Midnight.` and the exact body bytes/terminators.
3. Backend title parsing is extended in the existing Fountain import owner,
   not via import/export reserialization. Full-document operations require a
   first Title field; the structured importer retains its historical support
   for other known first metadata fields. Unknown title fields and continuation
   lines remain outside the body. Nested `Title:` action is not reparsed.
4. Local layout and direct HTTP pagination exclude titles, preserve complete
   document line ranges, and report zero screenplay pages for title-only text.
   An actual route test exposed a second fallback inventing an empty page1;
   removing that fallback, rather than weakening the test, fixed the route.
5. Full-document editor inference leaves nil metadata entries at their physical
   positions. Body-only inference is a separate explicit API so already-stripped
   bodies are not parsed twice. Fallback voice cues exclude title metadata.
6. Scene-per-page / duplicate visual pagination was replaced by compatibility
   adapters over the existing shared54-line engine. Explicit custom density
   remains supported. The five-scene offline fixture occupies two formatted
   pages, not five invented pages. This does not prove requested-length generation.
7. The legacy edit preview no longer trims/joins pages into a replacement draft.
   It uses source-line mapping and replaces one original source span, preserving
   all other bytes. Invalid, generated, wrapped, wrong-character or multiline
   targets fail closed instead of silently changing some other line. Repository-
   wide imports show no production caller for chess_edit; its old in-place
   version/memory persistence is explicitly fenced. Precise spoken line editing
   is NOT claimed implemented by this preview helper.
8. Real native PDF attachments passed text/count assertions but rendered upside
   down, including body text. Visual inspection exposed the flipped CGContext.
   CoreText now retains its native y-up coordinates, with one shared conversion
   for top-anchored layout rectangles. Title pages are upright/unnumbered and
   body numbering starts1 at the upper right. UTF16 widow pull-back lengths are
   corrected; continuation header/footer positioning no longer flips glyphs.
   Matching macOS code compiles; macOS PDF pixels were not separately rendered.

Preview counts use the existing canonical layout; actual PDF page counts come
from PDFKit. No claim that CoreText exports and editor element inference have
full page-for-page parity (#80 remains open). Print rollout/kill switch and the
production hold are unchanged. No new dependency/framework, invented byline,
accepted decision change, paid call or production secret change.

## Exact files and retained evidence

`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1097-20261021.VvBbzM/`

`runtime-changed-files.txt` lists all28 source/fixture/test paths changed versus
the task parent, including the preserved original files. `source.patch` and
`public-source-aae4425.tar.gz` record the exact integrated runtime, without private
environment files or signing material. Documentation adds TASKS.md and this file.

| Verification | Actual result / scope |
| --- | --- |
| Final backend Node20.20.2 | 2,858 pass /0 fail /2 skip, full `npm test`, frozen exact runtime commit, Docker external network disabled. `them-1097-node20-corrected.log`. |
| Earlier full backend failures | First2856/1/2: historical compatibility test pinned55 after canonical default changed54. Second2857/1/2: new actual HTTP title-only check exposed fake page1. Both logs retained; neither described as a flake. |
| Local focused backend |52/0/0 initially, then actual corrected route/source/compatibility24/0/0 under host Node24. These are not represented as Node20 full-suite results. |
| Fountain package |27/0/0 via `swift test --package-path Packages/ScreenplayStudio`; includes CRLF loss and whitespace boundary regressions. |
| Signed focused native |26/0/0 on erased task-owned Pro11CF5EFB-D8C3-4F19-8062-28AF37F27D93, iOS26.2/23C54. Print, page-layout, classify and shared parity suites. `native-fixed/v1-ui-smoke-local-1-18929.xcresult`. |
| Initial native text-only pass |25/0/0, but subsequent actual PDF PNGs were upside down. Initial command also misspelled the parity suite selector; correct suite was included in final26. The initial pass is not visual proof. |
| Native PDF visual check | Actual PDF test attachments exported from the final result bundle and rendered by Poppler. Both title-only and title+body pages inspected: upright text, correct byline, separate title, body1 upper right. Pre-fix PDFs/PNGs retained. |
| Authenticated writer UI |1/0/0: actual app create/type/save/Files export/relaunch/exact restored words against an isolated auth-required backend. `writer-ui/writer-ui.xcresult`; synthetic provider counts STT0/chat0/TTS0. |
| Longer-audio writer UI |1/0/0: current server transcript -> complete page -> save -> exact restoration. `voice-ui/voice-ui.xcresult`; synthetic STT1/chat2/TTS1. No paid model, real microphone or physical phone. |
| macOS scaffold | BUILD SUCCEEDED, `macos/scaffold.log`; build-only, not a Mac interaction/PDF visual pass. |
| D009 / diff | Pass. No monitored god file grew. index33,557; Studio17,408; Root14,992; bridge12,934; BackendMemoryAPI10,865. |

Backend skips: real PostgreSQL literal-prefix query (DATABASE_URL absent) and
the existing skipped talk page-write preview-header test. Existing Swift actor/
Sendable warnings remain. One initial unprivileged host HTTP attempt failed five
listen operations with EPERM; properly authorized local/server-isolated runs
passed, without changing the assertions. A guessed native result filename did
not exist; the runner's actual18929 bundle was used for all final evidence.

No fresh full themTests run on this checkpoint; the parent's779/0/0 is historical,
not claimed as current. Focused verification was chosen for the touched behavior;
full integrated-main gates remain required at protected landing.

## GitHub and remaining implementation

Fresh reads before saving: main `78b8c94f43b4a11f18c2e61df556b9cd7370e735`,
existing backup `75632c3b7a1b08ffdbdce333077e28fbc7a4f9e4`, original #613 head
unchanged/open/draft/REVIEW_REQUIRED. #964 remains open/non-draft/main-based at
`5faa43d6c087813be926246be14f3425ad651880`, REVIEW_REQUIRED. No approvals were
selected or submitted, no main merge/force/squash/replacement PR or deployment.
Normal backup target remains `codex/T-1084-security-foundation-sync`.

T-1097 remains in progress: `buildCollabCursorHeader` still derives a cursor
from raw55-line division, and live-paper packets are duplicated in the debug
talk branch with metadata-only input. A repository-wide Swift search finds only
the two declared live-paper views, not an x-live-paper header consumer. Do not
invent an authoritative complete draft or call those features wired. Resolve
the remaining consumer contract, then T-1098's narrow full-width Pages controls.

Original #643 is still the next product boundary after Pages, with its existing
safety fixes to preserve. Independent protected landing, integrated-main full
gates, physical-iPhone/intended-backend proof and production App Store credential
hold remain. Orb, Clementine and the established aesthetic are preserved.

## Copy/paste integration briefing

Codex preserved original #613 through merge1661fee and committed root corrections
as aae4425 above75632c3. Fixed single-CRLF character loss, whitespace title/body
boundaries, full-document ranges, fake HTTP page1, scene-as-page counts, unsafe
legacy page reconstruction and upside-down native PDFs. Source bytes are never
reconstructed from preview pages. Final proof: Node20 full2858/0/2, signed
focused26/0/0, package27/0/0, actual PDF PNG review, authenticated writer1/0/0,
longer-audio synthetic writer1/0/0, macOS/D009/diff pass. Main/original heads
unchanged; no paid models, deploy or physical-phone claim. T-1097 is not closed:
canonical cursor and actual live-paper producer/consumer wiring remain, then
T-1098 narrow Pages inspector. No new broad tests needed for unchanged code;
fix those concrete remaining contracts and verify their actual boundary.
