---
id: T-ios-voice-reveal-save-truth
title: Keep synchronized voice-reveal prefixes recoverable without saving partial pages
owner: codex
status: review
branch: codex/T-ios-voice-reveal-save-truth
pillar: voice→scene
---

## Scope

Treat the progressively revealed iPhone voice response as a draft preview, not
as a sequence of screenplay versions. Keep its autosave status truthful, retain
a project-scoped local recovery snapshot during the reveal, and resume the
existing committed-write save path only after the full page is committed.

## Done when

- Voice reveal participates in the Studio streaming/autosave gate on iOS and
  macOS; cancellation ends the gate and restores the pre-insert draft.
- A process interruption during reveal leaves a project-scoped recovery copy;
  no partial preview is sent as a server draft version.
- Focused and full erased-simulator `themTests`, the relevant writer UI test,
  the god-file gate, and diff checks pass.
- Any remaining cross-device/reinstall guarantee is explicitly delegated to
  durable server-side Page request recovery, not claimed by this client change.
