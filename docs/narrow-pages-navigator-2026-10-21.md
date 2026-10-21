# T-1098 — Readable Pages navigator

October21, 2026. Parent `51741e26d21694999fc890cc611973c169f38f97`.
Branch `codex/T-1098-narrow-page-navigator`. Local integration proof, NOT main,
production, a physical phone or a live-model result.
Runtime commit: `1ee926942b308bd7d52fb6493b92b44923c06bf6`.

## Completed / decisions

VERIFIED: the fixed112pt thumbnail beside collapsing metadata is replaced by
full-width compact cards. The complete230pt component and real signed iPhone
app screenshots were inspected: labels wrap normally, not letter-per-line.
The established warm paper style, orb and Clementine are preserved.

One extracted SwiftUI component owns only preview selection. It reuses the
existing current-draft pagination presentation, source jump and refresh handlers.
It adds current/total summary, estimated screenplay time, bounded Previous/Next,
explicit Fewer/More lines, standard reset, labeled Recalculate Pages and readable
source previews. Accessibility containment keeps distinct child identifiers;
the old parent identifier otherwise overwrote summary/control identifiers.

DECIDED implementation tradeoff: the canonical engine's standard is54, not the
old raw55 helper. Custom55 remains selectable. Preview density explicitly does
not change saved words or PDF geometry; duration is labeled an estimate at the
standard density. A single source line can cover several printed pages; the
panel explains that a jump opens the original line rather than inventing a
character-range destination. Title-only documents have zero screenplay pages.

The UI fixture also exposed a real engine defect: a heading followed by an
oversized action paragraph produced a page containing only the heading. Swift
and JS now keep the heading with the start of action, splitting an impossible
whole-paragraph bundle while retaining every word/source mapping. Shared
fixtures cover54 and24-line cases; the independent regression covers paragraph
sizes equal to density, density+11 and three times density. No new framework.

## Exact files / retained evidence

Permanent folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1098-20261021.6ltxeI/`

`runtime-changed-files.txt` lists the exact12 app/backend/fixture/test paths.
`runtime.patch` and `public-source.tar.gz` pin the final runtime and tests.
TASKS.md and this document are the additional documentation changes.

## Verification

- Signed focused native23 pass /0 fail /0 skip: presentation8, layout12,
  classification2, shared Swift/JS fixture parity1. Erased task-owned simulator
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iPhone17Pro, iOS26.2/23C54.
  `focused-native/v1-ui-smoke-local-1-46633.xcresult`.
  This preceded the final accessibility-container line; the current signed
  actual-app UI below compiled and exercised that final line.
- Actual authenticated Pages UI1/0/0:
  `navigator-ui/navigator-ui.xcresult`. Restored the real saved source, opened
  Draft then Pages, exercised boundaries/navigation/density/reset/recalculate
  and page2. One Recalculate press delivered exactly+1 actual request and+1
  HTTP200. Total successful pagination responses8 includes automatic updates,
  NOT eight manual presses. Client UTF8 equals original; server has exactly one
  version with the same draft after all actions. No text rewrite/save occurred.
- Existing uninterrupted native typing and home page-overview UI2/0/0:
  `typing-overview/v1-ui-smoke-local-1-49799.xcresult`, fresh erased same device.
- Full backend Node20.20.2: **2862 pass /0 fail /2 skip** in network-disabled
  container, frozen final backend source. No subsequent backend runtime edits.
  Skips: real Postgres prefix query without DATABASE_URL and existing skipped
  talk page-preview header case. Focused pagination27/0/0, proof-fixture3/0/0.
- macOS scaffold BUILD SUCCEEDED; D009 and git diff --check pass. The macOS
  build precedes the one final accessibility-container line; no fresh final-line
  macOS claim. Current iOS workflow compiled it. Existing actor/Sendable warnings
  were not fixed or hidden here.

The strict local producer uses real auth/project/version/pagination HTTP with
test-only route counters and blocked external providers. Provider calls were
stt0/chat0/tts0. The new test requires this dedicated producer; generic runners
without it skip explicitly. The strict producer rejects skips, not a substitute
for a required hosted journey. No paid model call or fabricated speech proof.

## Failed checks and corrections (retained, not erased)

First native and macOS builds failed: the extracted child needed the existing
ScreenplayStudio typography import. Added it; corrected native7/0/0 and macOS
build passed, followed by the broader23-case focused pass above.

Five actual-app UI attempts failed before the final1/0/0:

1. navigator-ui.M3zZog and navigator-fixed.SYNJWk: initial restored-text wait
   requested a marker beyond the app's1000-character debug snapshot. Later
   actions after that failure were not evidence of working controls.
2. navigator-sequence.t33I4a stopped at the same first source-read failure.
   Shortened the synthetic fixture to under1000 characters, keeping65 action
   lines, title and Unicode byline; original exact-text assertions stayed.
   Native editor/server bytes, not the bounded snapshot, are required to prove
   larger documents. This also exposed the actual orphan-heading engine bug.
3. navigator-current.EePbED opened the default Companion inspector, not Draft.
   Routed explicitly through Draft → Pages and enabled stop-on-first-failure.
4. navigator-routed.py3CrC reached the real Pages UI but the root identifier
   overrode child identifiers. Added accessibility containment, not label-only
   test fallback. Its hierarchy also showed `TV ` inserted into source: the
   test's generic keyboard-dismiss swipe traced QuickPath letters. Removed that
   gesture from this read-only workflow and asserted exact restored bytes before
   any page action. The existing general helper remains a tracked harness risk.

Earlier commentary hypotheses about keyboard focus and later control execution
were incomplete; first-failure activities and recorded hierarchy above govern.
All failed bundles are in earlier-failures. No assertion weakening, blind retry
loop, production workaround or saved-word normalization was used to get green.

## Remaining gaps / next

No fresh full themTests, current-head writer/voice journey, physical microphone,
phone, shipping backend,120-page performance or general editor/PDF element-parity
claim. Selection behavior while live text grows and Dynamic Type still need
separate user-journey proof. The PDF/import contract has its own T-1097 evidence.

Actual app screenshots show old false HARD cue warnings for title/action lines.
Read existing original #597 (head7b120904) rather than reimplement/ignore it; its
context-aware linter repair is not yet integrated. Original #643 remains the
next product-stack boundary; read its follow-ups before preserving integration.

Fresh GitHub read: main78b8c94f unchanged; #9645faa43d6 has all three required
hosted checks successful but REVIEW_REQUIRED. No approval impersonation, main
merge, force push, replacement PR, branch deletion or deployment. Production
credential hold remains. All local source/evidence stays recoverable.
