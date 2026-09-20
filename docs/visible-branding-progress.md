# THEM / Clementine visible branding

Local branch: codex/T-them-visible-branding, based on main 647e01fc.
Implements naming direction in #630. Draft review only; no merge or deployment.

- All app display-name settings and permission descriptions use THEM.
- Companion-facing Studio labels, writing status, voice permission guidance,
  notes and feedback use Clementine.
- Product voice settings, print dialog and diagnostic report title use THEM.
- Matching unit assertions and two UI helper tab selectors are updated.
- Bundle IDs, Keychain service, preference keys, persistence directories,
  accessibility IDs and diagnostic source fields remain compatible.
- Orb implementation is unchanged.

Five static branding contract tests pass; plist/project syntax and diff/D009
checks pass. Signed full iOS build/test is running at
/tmp/them-visible-branding-ios-full.log. Additional Studio-screen and microphone
copy was completed after this run started; rebuild and rerun before claiming
final verification. That initial run executed 618 tests with one failure: a
subtitle assertion still expected io.them. Updated that expectation to Clementine;
the rebuilt suite passed 618 tests, zero failures
(/tmp/them-visible-branding-ios-final.log). The subsequent audit updated the
preview-only shell and client persona introduction to the same naming direction.
This prompt-label change has no live provider quality proof yet.
Final snapshot passed 618 signed unit tests and one signed companion-rail UI
test, zero failures, exit 0: /tmp/them-visible-branding-signed-final.log.
UI test asserts the Clementine tab label and captures a screenshot for visual
review. Both exported screenshots were inspected in /tmp/them-branding-ui-review:
tab and card labels fit at phone width without vertical letter wrapping.
An Apple Intelligence notification partially obscures the first screenshot's
top region; the second shows the fixture's signed-out error, not live backend
readiness. No blanket visual or live-service pass is claimed.
The built simulator app's CFBundleDisplayName was read back as THEM.
Full backend passed: 2,739 passed, zero failures, two skipped (2,741 total),
48.09 seconds; /tmp/them-branding-backend-full.log.
Mac Scaffold Release remains pending at /tmp/them-branding-macos.log.

This is separate from #632's cancellation fix. No combined release candidate or
physical-phone speech → reply → saved screenplay proof is claimed.
