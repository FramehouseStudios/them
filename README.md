Desktop `io.them/them` workspace layout

- Active macOS app source: `them/`
- Active Xcode project: `them.xcodeproj`
- Active backend and evals: `backend/`
- Active tests: `themTests/`

Archived on 2026-04-15:

- Root-level duplicate Swift files were moved to `archive/2026-04-15-legacy-root-slice/root_files/`
- Empty placeholder folders (`app`, `components`, `docs`, `lib`, `public`) were moved to `archive/2026-04-15-legacy-root-slice/empty_scaffolds/`

The prompt docs at the repo root are retained as planning/reference material. The live app builds from the nested `them/` directory, not from the archived root-level Swift files.
