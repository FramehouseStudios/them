# T-951 — Original pages integration and bounded continuation

Goal requirements advanced: 2 (page agreement), 5 (full-length correctness),
7 (integration proof). This does not close #80 or prove printed exports.

## Provenance and acceptance

- Parent T-950 `ccb50270`; original #642 head `7c40428b`, base
  `claude/filmmaker-dialogue-port`, both original commits read.
- Preserving merge `66c89f56`, no conflicts; no original-head rewrite,
  replacement PR, squash, main merge or deployment.
- Binary criteria: bounded speech pages, every dialogue line exactly once,
  Unicode-safe Swift/Node parity on every rendered line, full Node20 backend,
  signed full units after owned-device erase, numbered page UI, macOS build,
  offline golden, D009 and diff checks.

## Reproduction and root corrections

- VERIFIED original engine: 14 filler lines followed by a 200-sentence speech,
  limit24, produced pages `[24,194]`. The first continuation placed the entire
  remaining speech on one page. A speech beginning at the page top instead
  used action overflow and omitted the continuation markers.
- VERIFIED original JS wrapping uses UTF-16 lengths/slices; wrapping repeated
  astronaut emoji at width2 returns detached modifier/ZWJ/surrogate fragments,
  unlike Swift Character wrapping. JS cue detection also excluded non-ASCII
  letters; Swift whitespace splitting handled only space/tab.
- Regression log `/tmp/them-951-pagination-red.log`: 7 pass, 2 fail before fix.
- Existing speech layout now repeats the reserve-MORE / repeat-original-cue
  boundary for every page. Start-of-page and near-footer cases share it.
  Independent tests assert all pages <=24 and complete ordered dialogue once.
- JS uses Intl.Segmenter graphemes to mirror Swift Characters; Unicode letters
  qualify for cues; Swift word splitting includes Unicode whitespace.
- Shared fixtures now include multi-page speech, emoji/combining characters,
  non-ASCII cues and NBSP; both suites compare every rendered line, not just
  counts and first/last text. Fixture generation remains the existing script.
- Focused backend pagination after corrections: 9/0/0 on the host.
- Initial combined Node20 backend: 2,798 pass, 0 fail, 2 skip; offline
  mentor exemplar gate passes. After the measured ASCII optimization, a fresh
  complete Node20 rerun also passes **2,798/0/2** and offline mentor gate.
  Networking disabled; skips are the real PostgreSQL prefix test (no configured
  DATABASE_URL) and opt-in live page-response test (RUN_LIVE_PAGE_TESTS=0).
- Signed full Swift units on corrected `964bb7a7`: 669/0/0. After preserving
  #893, final Swift source at `eb188b19` passes 669 units plus the original
  numbered overview UI workflow: 670 total, 0 fail, 0 skip. Both runs used
  normal signing after task-owned simulator erases, iPhone17Pro iOS26.2/23C54,
  simulator11CF5EFB-D8C3-4F19-8062-28AF37F27D93.
- Screenshot attachment from the numbered overview was visually inspected:
  the single-slugline card, page number, summary and Done label are readable
  at this device width. This is not proof of long-line/multi-page card fitting.
- macOS scaffold build passes on the #893-inclusive Swift tree using the
  canonical `scripts/desktop_preflight.sh` build-only configuration. Tests are
  signed; the scaffold build uses its existing unsigned build-only defaults.

## Measured backend cost

Node20.20.2 test image, network disabled, 6,480 synthetic source lines,
284,012 UTF-8 bytes, 120 output pages; five sequential samples, with local
build activity on this machine. Before the ASCII fast path: milliseconds
`[960.92,1002.4,765.73,636.13,763.67]`. After:
`[34.83,19.87,36.57,24.58,34.51]`. Logs preserve the raw values. This caught
the expensive per-word ICU calls introduced by the Unicode correction.
Printable ASCII now skips ICU; Unicode retains grapheme segmentation.
These measurements are backend-only, not a statistical benchmark, phone
typing-latency measurement or clearance of the 120-page UI requirement.

## Existing repair to preserve

#893 `58c3ff33` is an additive repair based on #642: guard the iOS-only
navigationBarTitleDisplayMode modifier. Its body, full diff and provenance
were read. Preserving merge `eb188b19` includes the exact original commit;
the merge happened only after the first Xcode run terminated. No recreation
of the repair or original branch mutation.

Backend optimization commit `eddb2ed5` changes no Swift. The final units,
numbered overview and macOS proof use exactly the current Swift tree.
- Authenticated writer workflow on final code `eddb2ed5`: **1/0/0**, after
  another owned-simulator erase, normal signing. Existing synthetic runner sets
  REQUIRE_USER_AUTH=1; creates/types/saves a script, exercises backend Markdown
  export and verifies restoration after app relaunch. Provider counters all0:
  this is not speech, generated-page quality or external file-opening proof.
- Node20 fixture regeneration leaves the committed fixture bytes unchanged.
  D009 versus T-950 passes: Studio17435 ->17432; other protected files unchanged
  (index33557, Root15024, bridge12926, MemoryAPI10865). `git diff --check` passes.
- Durable private artifacts, not committed/uploaded:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-951-20261016.AtOqss/`.
  Contains the initial red regression log, focused green log, initial and final
  backend logs, timing logs, fixture regeneration log, macOS log, both unit
  bundles/logs, final writer bundle/log and exported page screenshot/manifest.
- No test was repaired by retrying an unchanged failing implementation. The
  original regression log remains red; root fixes precede green proof. Later
  runs follow the preserved #893 repair and measured backend optimization.

## Limits and next work

Changed files versus T-950 (includes the preserved original implementation):

```text
TASKS.md
backend/evals/generate_pagination_fixtures.mjs
backend/lib/screenplay_companion_routes.js
backend/lib/screenplay_pagination.js
backend/tests/screenplay_pagination.test.mjs
docs/pages-integration-proof-2026-10-16.md
docs/pagination/NOTICE-opendraft.md
docs/pagination/README.md
docs/pagination/fixtures.json
them/ScreenplayPageLayout.swift
them/ScreenplayStudioPagesOverviewView.swift
them/ScreenplayStudioScreen+PagesOverview.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioViewModel.swift
themTests/ScreenplayPageLayoutTests.swift
themUITests/V1SmokeUITests.swift
```

- These are deterministic/local checks, not microphone, model, phone or shipping
  persistence proof. No paid provider calls are required for pagination.
- Page card rendering still uses a coarse classifier; editor/export agreement
  (#80), page_flip reconciliation, title-page exclusion and later UI fitting
  work retain their existing original stack ownership. Do not claim this
  partial stack renders the final exported screenplay identically.
- Full-session 120-page UI responsiveness is not measured by these unit tests.
- Existing Swift concurrency warnings are not resolved by this pagination work.
- Next original product boundary is #643 `86cc5b24`, base `claude/pages-port`.
  #893 is a sibling repair, not a replacement for that product boundary.
- #766 then #770 still require actual non-author approval before main landing.

## Copy-and-paste handoff

T-951 preserved original #642 head7c40428b and #893 head58c3ff33 using no-ff
merges onto T-950. Corrections964bb7a7 fix unbounded multi-page speeches and
Unicode wrapping/cue parity, with independent regression tests and full-line
shared fixtures. Optimizationeddb2ed5 avoids per-word ICU overhead on ASCII.
Final backend Node20:2798/0/2; signed units669/0/0 plus overviewUI1/0/0;
authenticated writerUI1/0/0; macOS/offline golden/fixture reproduction/D009/diff
pass. Evidence retained here and the durable directory above. Original heads
and main unchanged, no replacement PR, deployment or paid model calls. Retain
#80/export/120-page UI/physical shipping gaps; next original product PR is#643.
