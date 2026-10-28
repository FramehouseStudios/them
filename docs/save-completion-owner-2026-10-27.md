# T1183 — A save acknowledgement cannot take ownership of another page

Base: `18d27c37142daf1ef95e4616257e722b1e8fd547`.
Branch: `codex/T-1183-save-completion-owner`.
Worktree: `/Users/halfmutantfilms/io.them-worktrees/codex-save-completion-owner`.

## Finding and repair

VERIFIED by source inspection: `performDraftSave` checked account ownership
after the version request, then adopted its response project and used the
current editor text for recovery. Selecting B while A's save was outstanding
could therefore rebind B to A or put B's words into A's recovery slot. The
coalescer also rebased pending work onto global `latestVersionID`.

The private completion now returns its acknowledged version plus permission
to continue the current editor. The original account/project's queue receipt
is processed independently of UI ownership. Publication additionally requires
the active editor, original selected/loaded project and document token. Newer
edits within that same document remain dirty on the acknowledged base.

Late failures/conflicts retain A's exact queued request without publishing
status, conflict or recovery changes into B. Existing A recovery may advance
its matching base after acknowledgement, without reading B's editor or changing
B's recovery presentation. Pending work is rebased only within the same owner
and project using the returned acknowledgement; another project's base is kept.
Pending work behind a failed save remains durable or runs in its own project.

The initializer's additive `draftSaveAPI` defaults to the existing canonical
shared API. It permits actual URLSession interception in the new tests. Save
revision follow-up publication uses the same completion lease and injected API.
No wire format, backend route, live-reply acknowledgement or new store was added.

The private completion's `versionID` is the acknowledgement used for subsequent
queued saves. It is not itself an exact-text live-delivery receipt: the existing
response can omit its draft. An echoed draft, when present, must match exact
UTF8; T1182 settlement must additionally bind its existing delivery evidence to
the actual acknowledged request/version or verified server readback. Do not
acknowledge a paid live reply merely because this method returned a version ID.

## Verification boundaries

- Native tests **UNRUN**: this helper was explicitly denied Xcode/simulator
  resources; no compile or runtime pass is claimed.
- Six new tests exercise the real VM -> BackendMemoryAPI -> URLSession ->
  draft-outbox path with a held version response: A success/conflict/failure
  after B selection, same-A newer exact edits, pending A base and pending B base.
- Recovery assertions compare writer bytes, base and dirty facts; a natural
  autosave timestamp is not treated as different writer content.
- VERIFIED `git diff --check`: pass. Canonical
  `GIT_NO_LAZY_FETCH=1 node scripts/check_god_files.mjs --json`: exit 0,
  all five files pass versus existing `origin/main`.
- VERIFIED exact-base byte comparison: all five god files unchanged from
  `18d27c37142daf1ef95e4616257e722b1e8fd547` (zero growth).
  An initial attempt to select `origin/codex/T-1182-live-reply-custody` as
  comparison failed because that local remote-tracking ref is absent. No
  fetch or invented ref was used; the explicit base comparison is independent.
- These static results do not substitute for Jarvis's native execution.

## Not covered / next action

No native proof, microphone, provider quality, physical phone, production or
integrated-main claim. Account-switch completion still uses canonical API
ownership handling; this task's new held tests concern same-account project
and document publication. Accepted live-response custody/receipt settlement
remains T1182 work, not wired by this patch.
The pre-existing admission await before `isDraftSaveInFlight` is set is not
changed by this completion repair; simultaneous admission remains a separate
boundary rather than a proven claim here.

Jarvis should integrate the scoped commit, run
`ScreenplaySaveCompletionOwnershipTests` on the assigned signed simulator,
then the appropriate full checkpoint. No GitHub push/PR/merge or deployment
was authorized for this helper.
