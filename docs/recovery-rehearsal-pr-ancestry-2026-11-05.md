# Recovery rehearsal: exact open-PR ancestry — 2026-11-05

Rehearsal `8ef7643e7b45e2953dee7d41e49f35be343428a1`; GitHub main `78b8c94f43b4a11f18c2e61df556b9cd7370e735`. Read-only GitHub open-PR snapshot: 380 PRs; 27 current exact head commits are ancestors of the rehearsal. These counts are a snapshot, not a readiness or quality verdict.

A current PR head being an ancestor proves only Git reachability. It does not prove the PR was reviewed, that later edits did not alter its behavior, that its checks pass, or that merging it is safe. A head not listed may be historical, rebased, superseded, represented by another commit, or outside this rehearsal; it is not classified as irrelevant. Closed PRs and all other branches require their own audit.

| Open PR | Exact current head | Head branch | Current base branch |
| --- | --- | --- | --- |
| [#597](https://github.com/FramehouseStudios/them/pull/597) | `7b120904665cacde23933b1d4cb5971a2ce0307f` | `codex/T-linter-cue-production` | `main` |
| [#613](https://github.com/FramehouseStudios/them/pull/613) | `4143d9c3a6196528a4d654b59addfb09cfdff62c` | `codex/T-fountain-title-page-codec` | `main` |
| [#638](https://github.com/FramehouseStudios/them/pull/638) | `0b5686134b46079a6115ab8221bfe36f98bd0180` | `claude/mentor-core-port` | `main` |
| [#639](https://github.com/FramehouseStudios/them/pull/639) | `965a507b5930a27c083394a49155b923a7583696` | `claude/mentor-golden-port` | `claude/mentor-core-port` |
| [#640](https://github.com/FramehouseStudios/them/pull/640) | `15c5868f5305dbe0db1166a83fd44cd529de57e9` | `claude/three-act-port` | `claude/mentor-golden-port` |
| [#641](https://github.com/FramehouseStudios/them/pull/641) | `a45d904dfeee99251502dda31dd011302eb2bfda` | `claude/filmmaker-dialogue-port` | `claude/three-act-port` |
| [#642](https://github.com/FramehouseStudios/them/pull/642) | `84659a6ac1f0eb58ba5a8e4cfd7cd54449e56a50` | `claude/pages-port` | `claude/filmmaker-dialogue-port` |
| [#643](https://github.com/FramehouseStudios/them/pull/643) | `cdd463f5f8d69b10426482b0418b06ae0a0ede08` | `claude/studio-actions-port` | `claude/pages-port` |
| [#644](https://github.com/FramehouseStudios/them/pull/644) | `5759e5af9e370fe4ab28fa9bb07aafb006b481c4` | `claude/coverage-port` | `claude/studio-actions-port` |
| [#645](https://github.com/FramehouseStudios/them/pull/645) | `92b55f73df8c2529f81458ec06ea03e1723874ab` | `claude/mentor-structure-map` | `claude/coverage-port` |
| [#646](https://github.com/FramehouseStudios/them/pull/646) | `acfe2d8f58df4871eb226baee67890b188b60dec` | `claude/coverage-follows-draft` | `claude/mentor-structure-map` |
| [#647](https://github.com/FramehouseStudios/them/pull/647) | `848e59d040dc935d082beaeb7dc21c51faee4222` | `claude/project-auto-title` | `claude/coverage-follows-draft` |
| [#881](https://github.com/FramehouseStudios/them/pull/881) | `b7a0ea528fcc2163a0d79b2bec0336a46a408e65` | `codex/T-coverage-context` | `codex/T-coverage-gate` |
| [#904](https://github.com/FramehouseStudios/them/pull/904) | `909f9e9075c5e074d45e93575b371a69f7e96ffb` | `codex/T-truthful-required-ios-smokes` | `codex/T-984-main-simulator-proof` |
| [#919](https://github.com/FramehouseStudios/them/pull/919) | `39ca7c3b16af04a7c5590f60cd1576df94676931` | `codex/T-editor-stale-echo-recovery` | `codex/T-truthful-required-ios-smokes` |
| [#964](https://github.com/FramehouseStudios/them/pull/964) | `5faa43d6c087813be926246be14f3425ad651880` | `codex/T-984-main-simulator-proof` | `main` |
| [#972](https://github.com/FramehouseStudios/them/pull/972) | `571592e8b51a2edc59f2932b300d0ff3b0636499` | `codex/T-1050-client-deinit-compatibility` | `main` |
| [#976](https://github.com/FramehouseStudios/them/pull/976) | `36f07bef00d7af00f64ea38c81fe656428ce2ca3` | `codex/T-1187-studio-publication-owner` | `codex/T-1185-render-custody` |
| [#977](https://github.com/FramehouseStudios/them/pull/977) | `fb6ff5b414e593184c00e1543c729e514922d15b` | `codex/T-1199-integrity-banner-integration` | `codex/T-1187-studio-publication-owner` |
| [#978](https://github.com/FramehouseStudios/them/pull/978) | `ee1b311a272ca59b4257dc2e045dbd905fb3f40a` | `codex/T-1211-save-handoff-boundary` | `codex/T-1187-studio-publication-owner` |
| [#979](https://github.com/FramehouseStudios/them/pull/979) | `02a403e07592454dc05b87b689b8fc0bbf321c17` | `dependabot/npm_and_yarn/backend/multer-2.5.0` | `main` |
| [#981](https://github.com/FramehouseStudios/them/pull/981) | `ef29a7e866e06729943f43fedef65224ce76fea1` | `codex/T-1240-ordinary-save-receipt` | `codex/T-1238-conflict-runtime-proof` |
| [#982](https://github.com/FramehouseStudios/them/pull/982) | `94b9d0adda8117fa1dce68bf77d9026b738db0de` | `codex/T-1241-committed-write-byte-guard` | `codex/T-1240-ordinary-save-receipt` |
| [#983](https://github.com/FramehouseStudios/them/pull/983) | `0e2a9485ceb9b81cfae61bdf270c92d187dfdfa6` | `codex/T-1243-empty-draft-recovery` | `codex/T-1241-committed-write-byte-guard` |
| [#984](https://github.com/FramehouseStudios/them/pull/984) | `a7ad352a95a16a9747b4588bb141bf12b2b06cd1` | `codex/T-1245-hermetic-draft-insights` | `codex/T-1243-empty-draft-recovery` |
| [#985](https://github.com/FramehouseStudios/them/pull/985) | `e8e8778561629f2649753a61a222a8adb3a888e9` | `codex/T-1260-empty-version-contract` | `codex/T-1241-committed-write-byte-guard` |
| [#986](https://github.com/FramehouseStudios/them/pull/986) | `6453169ea9b80fb363e253b386c7a4cf3c964f1e` | `codex/T-1262-recovery-slot-validation` | `codex/T-1260-empty-version-contract` |

Method: retrieve all open PR pages from GitHub; compare each current `head.sha` to the exact set returned by `git rev-list` for the verified rehearsal commit. Both local refs were checked against GitHub. Recheck heads and bases before any action. The rehearsal parent of #987 has no matching open or closed PR by its branch name; a separate landing plan is required without skipping original work, creating replacement PRs, or bypassing protection.

## Recovery base chains checked on 2026-11-05

- `#919 → #904 → #964 → main`. #964 head `5faa43d6c087813be926246be14f3425ad651880` reported all three required checks successful and `REVIEW_REQUIRED`; #904 was draft and reported `CLEAN`; #919 was draft and reported `DIRTY` against its current base. `DIRTY` is a GitHub mergeability signal, not a diagnosis of the conflicting files. Recheck all heads, reviews and checks when acted upon.
- `#982 → #981 → codex/T-1238-conflict-runtime-proof`; `#983 → #982` and `#984 → #983`; `#985 → #982` and `#986 → #985`. GitHub returned no PR by the `codex/T-1238-conflict-runtime-proof` head branch when querying all states. These are parallel descendants and must not be assumed to be a single linear chain.
- `#988 → #987 → codex/T-1267-recovery-multicopy-rehearsal`, whose parent branch likewise had no PR by head name when queried. The prepared confirmation fix is separately preserved in `codex/T-1271-recovery-confirmation`; it does not replace #988.

These are base relationships and current GitHub mergeability observations, not approval to merge, not evidence that any unlisted PR is irrelevant, and not proof that a rehearsal branch can be retargeted without review. Inspect original diffs and retained commits, reconcile missing boundaries, and stop at the first failing required check.
