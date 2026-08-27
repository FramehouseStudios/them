# io.them

Canonical io.them workspace layout

## Product and agent operating system

- [`AGENTS.md`](AGENTS.md) — canonical execution doctrine, ownership, safety,
  verification, and continue behavior.
- [`DECISIONS.md`](DECISIONS.md) — accepted product and architecture decisions.
- [`TASKS.md`](TASKS.md) — active work and ownership.
- [`docs/v1-definition.md`](docs/v1-definition.md) — current product target.
- [`docs/io-them-master-document-system-prompt.md`](docs/io-them-master-document-system-prompt.md)
  — versioned prompt for generating the Founder Product Brief, Platform
  Proposal, and Technical Architecture Blueprint.

Generated strategy or architecture documents do not override accepted
decisions or current repository evidence.

## Workspace layout

- Active macOS app source: `them/`
- Active Xcode project: `them.xcodeproj`
- Active backend and evals: `backend/`
- Active tests: `themTests/`

Archived on 2026-04-15:

- Root-level duplicate Swift files were moved to `archive/2026-04-15-legacy-root-slice/root_files/`
- Empty placeholder folders (`app`, `components`, `docs`, `lib`, `public`) were moved to `archive/2026-04-15-legacy-root-slice/empty_scaffolds/`

The prompt docs at the repo root are retained as planning/reference material. The live app builds from the nested `them/` directory, not from the archived root-level Swift files.
