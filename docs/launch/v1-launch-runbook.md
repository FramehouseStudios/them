# V1 Launch Runbook

Checklist to take io.them from release candidate to TestFlight beta and App
Store production. Code fixes ship on branch `chief/launch-fixes`; everything
under "Human-owned" needs the product lead, not an agent.

## Shipped in `chief/launch-fixes` (agent-done, needs review + merge)

- [ ] **multer 1.4.5-lts.1 → 2.3.0** — applied the Dependabot
  (`dependabot/npm_and_yarn/backend/multer-2.3.0`) package.json + lockfile
  diff. Usage (`memoryStorage`, `limits.fileSize`, `upload.fields`) is stable
  across the major bump; engines allow Node ≥ 10. Merge only after the
  quality gate (`npm test`) is green on the branch.
- [ ] **iOS CI (`.github/workflows/ios-ci.yml`)** — NEW. Runs `themTests` on
  the newest available iPhone simulator via `macos-15`, gating PRs that touch
  `them/`, `Packages/`, `themTests/`, or the Xcode project. Watch the first
  runs: tune `timeout-minutes` if the 140K-line Swift build exceeds 60 min,
  and pin a simulator name if `OS=latest` discovery ever picks wrong.
- [ ] **Node version pinned** — `backend/Dockerfile` comment corrected
  (Node 20, not 22) and `engines.node = 20.x` added to
  `backend/package.json`, matching every `node-version: "20"` in CI.
- [ ] **LICENSE** — proprietary draft added at repo root. **Have counsel
  review** before relying on it (employee/contractor IP assignment,
  any future open-sourcing of subsets like the Swift packages).
- [ ] **README accuracy** — backend test count 100 → 270+, eval runners
  70+ → 100+, matching the repo as of 2026-09-10.

## Human-owned (cannot be delegated)

- [ ] **Production signing** — human-owned Apple signing config; nothing
  about certs/profiles goes in source control.
- [ ] **Backend production config** — `DATABASE_URL`, `JWT_SECRET`,
  provider keys, `APP_TOKEN`, Apple/App Store secrets in the deployment
  platform (Render), never in the repo. `assertProductionEnv` is the
  checklist enforcer — run the release preflight and believe it.
- [ ] **Physical-device smoke** — real iPhone, real voice sessions:
  background the app mid-dictation, take a call mid-stream, kill and
  relaunch mid-generation, airplane-mode the realtime session. Simulators
  do not interrupt like phones do; this is where V1 bugs live.
- [ ] **Privacy answers sign-off** — `them/APP_STORE_PRIVACY_MAPPING.md`
  and `them/PRIVACY_POLICY.md` are accurate as of the last review; re-read
  before submission, especially the AI/companion data disclosures.
- [ ] **App Store submission** — first-review budget: 1–2 weeks including
  one rejection cycle. Most likely friction: AI-generated-content and
  privacy-nutrition-label scrutiny.

## Beta (first 25 writers)

- [ ] Recruit personally: r/Screenwriting, film Twitter/X, screenwriting
  Discords. Founder-led, unscalable, correct.
- [ ] Instrument before inviting: week-1 and week-4 retention, sessions
  per writer, voice-to-page completions, edit-loss incidents (should be
  zero — alert if not).
- [ ] Decide free-tier generation/realtime limits BEFORE beta (open product
  decision in the founder brief) — beta users will ask on day one.

## Explicitly deferred (do not block V1)

- God-file strangler (`backend/index.js`, `ScreenplayStudioScreen.swift`,
  `RootExperienceView.swift`) — keep the "must not grow" gate, extract
  behind beta feedback.
- Single-instance → distributed sessions — needed for scale, not for 25
  beta writers.
- Branch/task pruning (182 branches, 116 active task files) — monthly
  hygiene, not launch-blocking.

## Rollback

- Backend: Render deploy is a single Docker image — previous image tag is
  the rollback. Keep the last green image tagged per release.
- Client: TestFlight build numbers only move forward; a bad build is
  superseded, not recalled — keep the release-candidate evidence
  (`scripts/run_release_preflight.sh`) green so every build is shippable.
