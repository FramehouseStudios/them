# OpenDraft engineering intake

## Decision

io.them uses OpenDraft as a bounded interoperability reference, not as a codebase
or architectural dependency. The useful lesson is that a writer-owned screenplay
must survive movement between tools without silently changing element meaning.
That principle fits io.them's native SwiftUI client, Node backend, and existing
Fountain/FDX surface; OpenDraft's alternate application stack does not.

Review snapshot:

- Source: <https://github.com/FramehouseStudios/OpenDraft>
- Commit: `cfeb1c0fe82361dc14fbc2b081774fa2474629da`
- Reviewed: 2026-08-30
- Source license: MIT, copyright 2026 Proteus Technologies

No OpenDraft runtime, dependency, UI, source file, or substantial source excerpt
is vendored here. The implementation in this repository was written against the
public Fountain/FDX formats and pinned with io.them-owned regression tests.

## Adopted now

The current compatibility pass closes silent screenplay-shape corruption at the
existing import/export boundary:

- Centered Fountain text (`> THE END <`) remains centered instead of becoming a
  transition.
- Forced transitions (`> BURN TO WHITE`) retain their exact transition text;
  exporters do not invent a `TO:` suffix.
- Forced character cues (`@McCLANE`) and ambiguous cues (`@CUT TO:`) remain
  character elements.
- Dual-dialogue markers (`^`) survive Fountain import/export as the additive
  `dualDialogue` field.
- Lyrics (`~text`) remain lyrics in Fountain and use the FDX `Lyrics` paragraph
  type.
- Clipboard input normalizes CRLF, CR, Unicode line/paragraph separators, next
  line, and an initial byte-order mark before parsing.
- The edge cases are checked as both individual serializers and an
  import → export → import round trip.

These are additive document fields. Existing action, character, dialogue,
transition, section, synopsis, title-page, and endpoint envelope behavior remains
compatible.

## Already present in io.them

io.them already had the valuable product foundations that motivated the review:

- Fountain import and export
- FDX export
- autosave, revision history, and screenplay snapshots
- native scene navigation and screenplay editing
- authenticated, per-user project ownership
- local draft continuity with explicit server-side ownership boundaries

Those systems remain canonical. A second editor, persistence layer, or service
topology would make recovery and correctness harder, not better.

## Parked behind product triggers

The following ideas are useful, but they should enter io.them only through a
separate design, threat-model, and acceptance-test pass:

| Idea | Trigger before implementation |
| --- | --- |
| User-selected portable backup folder | Device-level product requirement plus restore and retention UX |
| Open/save Fountain or FDX in place | Security-scoped file-access design, conflict policy, and explicit write-failure UX |
| One-screenplay-per-window overwrite guard | Multi-window editor becomes a supported release surface |
| FDX import | A measured workflow need and a loss-budget fixture corpus |
| OSF/Fade In, DOCX, or PDF interchange | Real user demand plus format-specific fidelity tests |
| Dual-dialogue FDX grouping | A validated Final Draft fixture and importer/exporter round trip |

## Explicitly not imported

- React/Tiptap, FastAPI, Tauri/Rust, Hocuspocus, and Yjs: duplicate the native
  product and backend architecture.
- A plugin system: expands the trust boundary before the core V1 surface needs it.
- A collaboration server: premature until collaborative editing is an accepted
  product requirement with an ownership and privacy model.
- A no-account product model: conflicts with io.them's intentional authenticated
  project, family, and personal-memory boundaries.
- Marketing claims as engineering evidence: only executable tests and observed
  io.them behavior are accepted as proof.

## Known degradation

Fountain preserves the `dualDialogue` marker. The current FDX exporter emits the
same character/dialogue content but does not yet create Final Draft's paired
dual-dialogue grouping. That limitation is explicit rather than guessed at; the
format-specific work stays parked until it can be validated against a real FDX
round-trip corpus.
