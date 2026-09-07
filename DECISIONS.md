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

## D009 — God-file strangler rules (keep behavior, move seams)

- **Date:** 2026-09-01
- **Status:** accepted
- **Context:** Several production files (`backend/index.js`, `talk_handler`, `ScreenplayLiveDraftBridge`, `RootExperienceView`, `ScreenplayStudioScreen`, and peers) are too large to safely rewrite. Big-bang splits risk voice/auth/outbox regressions. The repo already has a partial backend extract pattern (`backend/lib` + `mountX(app, deps)`) that stalled mid-flight (e.g. `auth_routes` not wired).
- **Decision:**
  1. **No big-bang rewrites** of god files. Use the strangler pattern: keep a façade, extract one capability per PR, delete the old path in the same PR once tests pass (feature-flag at most one release).
  2. **Extract by capability, not by line range** (e.g. “auth HTTP mounts”, “page interrupt policy”), never “move lines 8k–12k.”
  3. **Characterization before move** — routes/status codes and critical iOS smokes must stay green; god-file line count must not grow on feature PRs.
  4. **Backend order of attack:** (B1) wire existing `auth_routes` and remove inline duplicates → (B2) keep talk edge / Clementine adapters owning HTTP → (B3) stage-split `talk_handler` → (B4) stop growing stores inside `index.js` → (B5) `index.js` is boot/wire-up only. New routes belong in `backend/lib/...`; PRs that grow `index.js` need an explicit justification.
  5. **iOS order of attack:** (I1) networking only via clients/services → (I2) split `ScreenplayLiveDraftBridge` into insert/outbox/reconcile/interrupt façades → (I3) feature ViewModels off Studio → (I4) compose god views from children last → (I5) eliminate duplicate shells (`AppShell` vs live root). New product `@State` does not land on Root/Studio god views.
  6. **Do not** start a parallel architecture rewrite (new app framework, wholesale Packages migration) as a substitute for strangling. Packages absorb code only after app-target façades are thin.
- **Consequences:** Refactors are sequenced behind ship/Clementine work when they share a seam (e.g. interrupt + page-cancel). Weekly cadence prefers one seam merged over many open extract branches. Details and PR checklist live in `docs/engineering/god-file-strangler.md`.

## D010 — Pluggable TTS + ElevenLabs BYOK (user-chosen voice)

- **Date:** 2026-09-01
- **Status:** accepted
- **Context:** Clementine’s spoken voice must be separable from the Muse/OpenAI brain so writers can use their own voice (including ElevenLabs clones). Hardcoding a single vendor voice or putting platform API keys on the client would fight D008 custody lessons and barge-in cancel architecture.
- **Decision:**
  1. **Brain ≠ mouth.** LLM providers (Muse Standard / OpenAI) and TTS providers are separate adapters. Spoken reply text feeds a `TtsRouter`; barge-in/cancel must abort TTS the same way Page cancel aborts generation.
  2. **v1 ElevenLabs = BYOK only.** The user supplies their ElevenLabs API key (Keychain / secure storage) and selects a `voice_id` from *their* `GET /v1/voices` list (library + clones). io.them does not pretend platform keys can speak private clones.
  3. **Default voice remains the current built-in path** until the user opts into ElevenLabs. Platform-paid ElevenLabs voice packs are explicitly **out of v1** (may be proposed later as a separate decision).
  4. **Custody:** never ship a shared ElevenLabs key in the client. Prefer native key storage; if a server proxy is used, it must use the *user’s* key per request (or a short-lived server session), not a long-lived copy of their secret in our DB by default.
  5. **Minimize PII to TTS** — send only the sentence being spoken, not memory dumps or full screenplays.
  6. **Latency:** prefer ElevenLabs streaming / flash-class models for companion turns; higher-quality models are a power-user setting.
  7. **Wallet:** ElevenLabs BYOK usage is billed to the user’s ElevenLabs account. Do not silently burn io.them wallet turns for third-party TTS BYOK. Platform TTS (default) may remain on our cost surface.
  8. **UI:** Voice settings expose provider + voice picker + connect/disconnect; disclose that audio is synthesized and which provider is active without trademark abuse.
- **Consequences:** Implementation follows `docs/product/clementine-tts-providers.md`. New work adds `TtsRouter` / ElevenLabs adapter + iOS voice settings; does not fork HerVoice playback into a second interrupt path. Eval coverage should include TTFT-ish speak latency and barge-in cancel for ElevenLabs streams.

## D011 — StoreKit IAP for Clementine turn packs (iPhone V1)

- **Date:** 2026-09-01
- **Status:** accepted
- **Context:** Josh needs monetization within ~1 month. Writers buy days/weeks of Clementine (Companion + Page turns), not TPM. Embedding Stripe Checkout inside the iOS app for turn unlocks conflicts with App Store IAP rules for digital goods. them.io DNS may still be parked while a live API host (Render) already serves verify+credit.
- **Decision:**
  1. **iPhone V1 digital Clementine packs are sold in-app via StoreKit / IAP** as consumable or non-consumable packs of Companion + Page turns.
  2. **Stripe is out of band for v1 in-app.** Stripe Checkout must not ship inside iOS for turn unlocks. Stripe remains allowed later for web/account surfaces only.
  3. **Purchase verification is server-side** (App Store Server API / verified transaction JWS) **before** `wallet.credit`. The client never credits itself.
  4. **Pack SKUs map to `companionTurns` + `pageTurns` only.** Never expose TPM, token rates, or supplier meters in product copy or API responses.
  5. **Fail closed** if verification fails or App Store verify secrets are missing in production — no optimistic credit.
  6. **Live API hosting is required** for verify+credit even if them.io DNS is still parked. Document and use the Render/API host (`api.them.io` or the current Render URL) as the credit endpoint base.
- **Consequences:** Implementation follows `docs/product/clementine-monetization.md` and extends the D008 wallet. New seams: `pack_catalog`, `iap_verify`, `POST /billing/iap/credit` (auth required, idempotent by `transactionId`). Wallet balances + IAP ledger persist via migration `012_wallet_iap_persistence.sql` when `DATABASE_URL` is set (unique `transaction_id` fail-closed); reservations remain process-local until a follow-up.

## D012 — Page multipass craft loop (F2), flag-gated

- **Date:** 2026-09-01
- **Status:** proposed
- **Context:** F1 page_craft eval measures craft; product still needed an intentional Plan→Draft→Critique→Revise loop on the Page lane without billing writers for scaffolding or enabling risky behavior on main by default.
- **Decision:**
  1. Ship multipass behind **`CLEMENTINE_PAGE_MULTIPASS`** (default off). Optional **`PAGE_MULTIPASS_REPAIR`** for one extra revise when F1 heuristic overall is below PASS floor 3.5.
  2. Stages: plan → draft → critique → revise (+ optional repair). Each stage honors Page AbortSignal / cancel.
  3. **Wallet:** meter **draft + revise (+ repair)** only; plan/critique are unmetered. When multipass is on, wallet reserve uses 2× `max_output_tokens` headroom.
  4. Wire via thin hooks in `page_lane_adapter` + `talk_generate` — do not grow `talk_handler.js` or rewrite ScreenplayStudioScreen for this MVP.
  5. Reuse F1 `scorePageHeuristic` as the acceptance seam.
- **Consequences:** See `docs/product/page-multipass.md`. F3 owns per-stage model routing. Do not enable multipass by default in production until validated.

## D013 — Page multipass per-stage model routing (F3)

- **Date:** 2026-09-02
- **Status:** proposed
- **Context:** F2 shipped Plan→Draft→Critique→Revise behind `CLEMENTINE_PAGE_MULTIPASS` (default off) but used one turn model/effort for every LLM stage. Plan/critique are unmetered scaffolding; draft/revise need owner-bar craft quality. Muse cutover wraps the whole Page lane unless given an escape hatch.
- **Decision:**
  1. Add optional env overrides `PAGE_MULTIPASS_{PLAN,CRITIQUE,DRAFT,REVISE,REPAIR}_{MODEL,EFFORT}` with cheap defaults for plan/critique (`CHAT_MODEL_FAST` / `low`) and craft defaults for draft/revise/repair (`CHAT_MODEL_STRUCTURAL` or `MUSE_MODEL` / `medium`).
  2. When Muse is enabled, plan/critique **prefer OpenAI cheap** via `preferProvider: "openai"`; draft/revise/repair stay on Muse Standard at elevated effort. Do **not** force Muse on globally or enable multipass by default.
  3. Wire through DI in `page_multipass_routing.js` + `runTalkGeneratePageMultipass`; tests inject fakes and assert per-stage model/effort (no live API).
- **Consequences:** See `docs/product/page-multipass.md`. F4 owns memory bible / calibration residuals. Production keeps `CLEMENTINE_PAGE_MULTIPASS=0` until validated.

## D016 — Beta short-film mode (voice → 5 of 15, flag-gated)

- **Date:** 2026-09-06
- **Status:** proposed
- **Context:** Beta testers want to speak a single short-film brief — "15 pages, horror, one location bedroom, three characters John Sally Sam, write first five pages" — and get 5 screenplay pages without babysitting a custom prompt. This must not regress V1 Page/Companion behavior or violate D009 god-file strangler.
- **Decision:**
  1. Ship behind **`CLEMENTINE_SHORT_FILM_BETA=0`** (default off). When on, voice utterance containing `short film` + `pages` + parseable `genre/setting/characters` classifies as `SHORT_FILM_BETA` (Page lane, `low` effort).
  2. M1 is PR1 only: flag (`short_film_beta.js`), pure parser (`short_film_intent.js` → `{totalPages,requestedPages,genre,setting,characters}`), 3-line gate in `intents.js:35` + `lanes.js` mapping to `Page`. No store/prompt/lane/wallet changes in M1.
  3. Follow-on PRs (prompt, lane/wallet, store/bridge, evals) stay additive under `backend/lib/clementine/`, never `backend/index.js`.
- **Consequences:** Flag off → same utterance → `UNKNOWN`/legacy (no side effects). Flag on → beta intent verified by parser tests + offline eval. See `docs/product/short-film-beta.md`. Strangler check: `git diff --stat backend/index.js` stays empty for M1.
