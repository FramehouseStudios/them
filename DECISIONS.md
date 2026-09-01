# DECISIONS.md — io.them

Product and architecture decisions. The human owns this file. Codex may propose changes, but accepted decisions require explicit human direction.

Each entry follows the ADR pattern:

- **ID** — `D###`, monotonically increasing.
- **Date** — ISO date of acceptance or proposal.
- **Status** — `proposed` | `accepted` | `superseded by D###` | `rejected`.
- **Context** — what forced the decision.
- **Decision** — the choice.
- **Consequences** — what changes because of it.

---

## D001 — `io.them` is the canonical product name

- **Date:** 2026-05-09
- **Status:** accepted
- **Context:** The codebase had several parallel identities: `Framehouse` for parent collateral, `them` for the app folder, `io.them` for the product, `Clementine` for the companion, and legacy internal names in older Swift files. User-facing identity was undeclared.
- **Decision:** The canonical product name is **`io.them`**. Internal code identifiers may remain where rename cost exceeds benefit, but no user-visible surface should introduce a competing product name.
- **Consequences:** README, app display name, App Store metadata, marketing copy, onboarding, and launch proof should use `io.them`.

## D002 — North-star statement

- **Date:** 2026-05-09
- **Status:** accepted
- **Context:** Without a one-sentence north star, feature scope drifted across generic chat, backend tooling, and screenplay-specific product work.
- **Decision:** The official north star is: *"io.them is a mobile-first AI screenplay studio built around a living creative companion. It helps writers turn voice, fragments, and emotional impulses into properly formatted scenes — fast — while learning their style, characters, tone, and creative habits over time."*
- **Consequences:** The four pillars are **mobile-first**, **voice→scene**, **living creative companion**, and **longitudinal learning**. Features that do not serve at least one pillar should be cut, parked, or justified as launch infrastructure.

## D003 — Codex-primary project execution

- **Date:** 2026-05-09
- **Status:** superseded by D007
- **Context:** Earlier multi-helper work created a large uncoordinated snapshot and too many stale branches.
- **Decision:** Use `AGENTS.md`, `TASKS.md`, and `DECISIONS.md` as the project operating system. Codex leads implementation; the human leads product direction.
- **Consequences:** The task ledger and decision log remain useful, but D007 supersedes any requirement to maintain a separate named helper lane.

## D004 — `archive/` is the canonical legacy archive casing

- **Date:** 2026-05-09
- **Status:** proposed
- **Context:** Git tracked the legacy root slice under lowercase `archive/...`, while macOS had materialized a conflicting `Archive/` directory. Mixed casing is risky on case-insensitive filesystems.
- **Decision:** Keep lowercase `archive/` as the only repository casing for tracked legacy archive contents. Do not introduce a tracked `Archive/` directory.
- **Consequences:** Current README references to `archive/...` remain correct; future migration and modularization work can assume no case collision.

## D005 — Codex has guarded supervisor merge authority

- **Date:** 2026-05-11
- **Status:** accepted
- **Context:** The human promoted Codex from review-only supervisor to guarded execution owner so verified work would not stall waiting for repeated manual copy/paste.
- **Decision:** Codex may merge Codex-owned PRs after the branch is current with `main`, required checks are green, no blocking label is present, verification is recorded, and the merge reason names the human-approved authority. Codex still never pushes directly to `main` during normal work.
- **Consequences:** Routine verified Codex work can move without unnecessary waiting. Human-owned blockers, release credentials, privacy decisions, risky auth changes, and destructive GitHub actions remain explicitly gated.

## D006 — Throughput protocol for task execution

- **Date:** 2026-05-12
- **Status:** superseded by D007
- **Context:** The project needed a way to reduce stale PR queues, repeated coordination refreshes, and broad “what next?” loops.
- **Decision:** Use a lightweight next-action protocol: prioritize blockers, prefer small PRs, batch low-risk coordination refreshes, and make app-facing backend contracts explicit.
- **Consequences:** The useful parts remain in `AGENTS.md`; the old multi-lane structure is no longer required for future work.

## D007 — Project-owned cleanup and single live workflow

- **Date:** 2026-08-30
- **Status:** accepted
- **Context:** The human asked to remove assistant-branded workflow surfaces from GitHub and the project while preserving useful shipped work and preparing a cleaner public repository face.
- **Decision:** New work is project-owned and Codex-led unless the human explicitly assigns otherwise. Old helper-lane branches, docs, and task metadata may be mined for useful implementation ideas, but they should not be merged wholesale or preserved as active workflow requirements. Public GitHub presentation starts with a current, professional README.
- **Consequences:** Assistant-specific config and redirect files are removed. New branches should use the `codex/` namespace. Stale remote branch deletion and any public-history rewrite require exact target lists and human clearance before execution. Useful security/backend work already merged into `main` stays intact; unmerged hardening ideas must be ported into fresh project-owned PRs and reverified before merge.

## D008 — Clementine Muse runtime (intent-first + Page lane)

- **Date:** 2026-09-01
- **Status:** accepted
- **Context:** Connecting Clementine to Muse Spark must not mean “persona + tool loop on every turn,” and voice↔typing races must not burn endless tokens. Muse Code is Meta’s coding agent; Clementine is our product companion. Compatibility is Meta Model API + skills packaging + cache/router policy — not embedding Muse Code in the app. Contributor tier is a data-for-discount contract, not a companion pricing tier.
- **Decision:**
  1. **Clementine is a router + memory + taste + wallet layer** that uses Muse Spark as the expensive brain. She is not “a Muse Code agent.”
  2. **Product-facing classification is intent-first** (`comfort`, `recall`, `advise`, `tease`, `silence`, `page_edit`, `plan`, …). Intents then map to cost lanes.
  3. **Cost lanes under the hood:** `Reflex` (tiny local / templates; no Spark) · `Companion` (Spark `minimal`→`low`; spoken reply) · `Page` (own lane for voice→scene / page proposes; own cancel + own wallet meter) · `Deep` (Spark `medium`; `high` only on explicit user ask or failed first pass, and as a visible mode).
  4. **Page never shares a bill with chit-chat.** Voice↔typing barge-in cancels in-flight Page work and drops the reservation; the page stays sacred; never finish the paragraph after the writer took the page back.
  5. **Split spoken voice from machine state.** One streamed free-text reply. Memory / mood / next-action use a hidden second structured call when needed — never one generation that is poetry + DB write + screenplay insert.
  6. **Runtime defaults:** Meta Model API `https://api.meta.ai/v1`, model `muse-spark-1.2` **Standard** (not Contributor), Responses API, cache-stable persona+voice-spec prefix with app-level `prompt_cache_key` (e.g. `them-clementine-vN`), dynamic junk at end of input, companion chat `store: false`, ASR via `muse-voice-transcribe-1.0`, TTS third-party. Wallet meters **days/weeks of Clementine**, caps `max_output_tokens` from reservation; never show TPM to users.
  7. **Glimmer:** Reflex may use on-device tiny classifiers/templates first. Server-hosted Muse Glimmer (30B open weights on *our* hardware) is allowed as a cheap nervous system later. Do **not** treat Glimmer 30B as an on-device iPhone V1 dependency.
  8. **Skills:** Clementine capabilities live as Markdown skills (Muse Code–importable packaging). Rare tools stay behind `tool_search` / defer_loading so the cached prefix stays intact.
  9. **Eval before knob-tuning:** ship a ~50-scene companion golden set (comfort, tease, boundary, memory recall, “I don’t want advice,” page propose, barge-in cancel) and choose effort policy from numbers.
- **Consequences:** Implementation work follows docs in `docs/product/clementine-muse-runtime.md` and `docs/product/clementine-voice-spec.md`. Existing OpenAI/provider adapters remain behind the same product lanes until cutover. Disclose “powered by Muse Spark” once in settings/first run; do not skin Clementine as Meta AI. Legal ToS/geo review and CORS probe for web BYOK remain launch gates; native BYOK is the power-user path first. Contributor is never the default for companion traffic.
