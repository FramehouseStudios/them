# T-1100 — Current-writer coverage integration

October21, 2026. Parent `7b8d185907470b98cd06984dca13c65b5f74a590`.
Branch `codex/T-1100-coverage-current-writer`.
Final production runtime `0919fc82482088db6d7f43061e3203c5a3e19fe0`;
workflow-only navigation correction `4dc346ae1a344ea8833e4355e2dd795786db31c6`.
Local integration proof, NOT protected main, shipping backend or phone proof.

## Preserved implementation / current integration

- Read original #644 body, all three commits and both follow-up comments;
  preserve head `047672ac` with no-ff merge `d33d307`.
- Read and preserve original #880 `b619d7d` via `1fec259`, and original #881
  `b7a0ea5` via `2f58c18`. Keep their extracted Craft panel, actual authenticated
  route test, canonical ephemeral fixture and session/project/request guards.
- Replayed existing connected-read/accessibility correction `a28c7e1` as
  `1d32c93` and exact-byte/title correction `619f988` as `c3b3209`.
- Original #644 explicitly relies on selected #597, rather than its omitted
  linter variants. Read its current head/body/commits; preserving merge `4ebbc4e`
  retains head `7b120904` and all original attribution. No replacement linter PR.
- Conflicts: keep both task ledgers; keep current authenticated action context
  beside coverage summary; move the current Craft panel into its existing child
  with the canonical framework setter; keep recovery-store/outbox/craft injection
  alongside optional coverage identity injection. No duplicate document writer,
  speech owner, HTTP client or framework. No original heads rewritten.

## Root problems fixed

VERIFIED direct local probe after selected #597: same script body scored6.5,
title+body6.4, CR-only4.7; title-only produced a0-page2.6 grade. The linter still
treated title metadata as a cue, and analyzers did not share newline/body input.
New body regressions were red5 pass/2 fail before the root change.

`e5b7efa` fixes this across the actual contract:

- Client retains document bytes and explicit title, rather than stripping the
  body before another parser can mistake a body-leading `Title:` for metadata.
  Empty/title-only native requests clear the read and do not request/speak.
- Backend derives the canonical body once for analyzers. Pagination receives the
  original complete document, not the already-extracted body; scene coordinates
  include its title/leading-line offset. Imported LF/CRLF/CR and supported Unicode
  physical separators produce the same read for the same body.
- Stateless route retains original source before parsing and maps empty bodies
  to existing400 `screenplay_coverage/draft_required`; unexpected errors forward
  to existing middleware. No caller project ID becomes an auth boundary, no data
  store/model call added. Real-route signed-out requests still fail401.
- Canonical normalization is reused by backend pagination and a derived-only
  Swift pagination source. Raw body/saved text is not normalized or rewritten.
  Three shared Unicode-separator fixtures agree across the actual engines.
- Linter masks metadata lines from analysis while retaining full-document line
  and normalized-range coordinates. Actual lowercase cues still get warnings;
  ordinary action paragraphs and forced/Unicode/dual cues retain #597's rules.
- Card explicitly calls the scores rule-based estimates, not professional
  coverage or a prediction of story quality. Deterministic grades do not prove
  dramatic beats, audience response, commercial value or craft intelligence.

Integration gates exposed two further source failures, fixed in `0919fc8`:
the old exact-text helper is absent on this foundation; use the existing
UTF8-elements-equal pattern already used by save/undo. New coverage HTTP uses
the canonical BackendHTTPRedirectGuard instead of an unguarded URLSession call.
An imported UI test referenced an absent older reveal helper; `4dc346a` uses
current pinned-tab reachability without weakening its grade/save assertions.

## Exact files and evidence

Permanent folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1100-20261021.RF6AiX/`

`changed-files-before-handoff.txt` contains all38 integration paths, including
TASKS and five preserved historical reports. This new report is additional.
`integration.patch`, `commits.txt`, `public-source-current.tar.gz` pin the source;
`backend-source-0919fc8.tar.gz` pins the full backend proof snapshot. The only
later source difference is the two-line UI-test helper correction, not runtime.
Private environments/keys were not copied into these public-source archives.

VERIFIED results:

- Focused body/format/pagination/actions65/0/0 after correction. Original red
  body5/2/0 and earlier corrected49/0/0 retained, not hidden.
- First full Node20.20.2: **2893 pass /1 fail /2 skip**, failure was the new
  coverage request missing the iOS redirect delegate. Direct corrected contract
  2/0/0; final full **2894 pass /0 fail /2 skip**, network-disabled container,
  temporary stores, no .env/provider access. Skips remain real Postgres prefix
  query without DATABASE_URL and the existing skipped talk page-preview test.
- First signed native and macOS builds failed before units could execute:
  absent older exact-text helper. Corrected macOS BUILD SUCCEEDED. Second native
  build failed compiling the imported UI target's missing reveal helper, despite
  selecting themTests. Retained both failed bundles/logs. No body-test failure
  or false unit count invented for these compilation failures.
- Final full signed **themTests822 pass /0 fail /0 skip**, erased owned
  iPhone17Pro `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS26.2/23C54.
  `native-final/v1-ui-smoke-local-1-57540.xcresult`. Includes ownership,
  supersession/cancellation, Unicode exact bytes, title-only/body behavior,
  layout/shared fixtures and existing recovery/action suites. Normal signing.
- Final authenticated actual-app writer/Craft journey **1/0/0**:
  `writer-coverage/writer-coverage.xcresult`. Create project/type/save via UI;
  Craft Read it returns the same grade/verdict/page/scene count as independent
  authenticated coverage HTTP; native Files cancel then save; relaunch restores
  the exact draft with one matching server version. Synthetic chat1/stt0/tts0;
  NOT live model, microphone, audible read, offline or phone proof.
- Native Files pre-save screenshots inspected. The completed export exists in
  Files-provider storage outside THEM's app container:35 bytes, valid UTF8,
  exactly one synthetic writer marker. Retained `writer-export.md` and
  `export-byte-check.json` (SHA256
  `9c3445b717eb501b8683a2d4a7e9c874e9ed29fac6bc8a4d76bedb558e6df765`).
  This verifies saved bytes, NOT an observed external open. Read-only screenshot
  after the test showed the home screen, not a coverage-card visual proof.
- D009/diff pass. Current monitored counts: index33557, Studio17337, Root14992,
  bridge12934, MemoryAPI10845. Against task parent, Studio−50 and MemoryAPI−1;
  all others unchanged. Existing actor/Sendable/NSLock warnings remain.

## Remaining gaps / next

HUMAN_INPUT_REQUIRED for external visual opening: computer-use reports the Mac
locked. Unlock manually and say unlocked; never share the password. No unlock
bypass attempted. Continue code work while this observation is unavailable.

T-1101 tracks completed same-project read freshness: #881 fences foreign and
in-flight results, but prior completed scores can remain after editing. Retain
the useful card with explicit earlier-snapshot wording and avoid treating it as
current in conversation, while preserving original #646 bounded refresh and
#774 quiet announcements. No additional polling or paid read loop.

Original #648 still owns controls/coverage-read prompt survival and reply-path
repairs; later rehearsal authority safeguards must remain. No reliable full
voice-actions claim. Legacy clementine/coverage is not used by this new route;
its remaining orphan disposition is not silently declared completed here.

Actual next product child is #645 `8a7f367a`, based on #644. Reconcile its mentor
page map with the human's flexible120-page three-act direction; never pad,
truncate or force a chosen length. Physical microphone/reply/rewrite, shipping
host, offline/cross-device, real-phone export opening and120-page performance
remain unproven by this boundary.

Fresh GitHub: main78b8c94f; #9645faa43d6 has all three required checks SUCCESS
but REVIEW_REQUIRED. No independent review impersonation, main merge, original
branch mutation, deletion, force/squash/replacement PR, paid model call, secret
change or deployment. Production credential hold remains. Save the scoped
integration backup normally and continue; do not call THEM complete.
