# Claude Inbox

Codex-owned handoff, refreshed at **2026-09-05 23:19 UTC / 16:19 PDT** from
GitHub and local test artifacts. This supersedes #426's launch queue. Read
`AGENTS.md`, current `TASKS.md`, `DECISIONS.md`, and `docs/coordination.json`.
Historical assistant lanes are not authority to start competing work.

Start with:

```bash
node scripts/agent_next.mjs --role=support
node scripts/coordination_state.mjs read
```

## Current merge boundary

VERIFIED: [#445](https://github.com/FramehouseStudios/them/pull/445) is **open**,
not uncommitted. Its base is main `9c74759e8028acfe48b44add55fdf6f6fa75857d`;
reviewed head is `d5763d4a55f4859cc8923bd368396851cf7eb5be`. The integration
commit is `35557b7`. The checkout also contains later, uncommitted feature work:
do not stage, overwrite, or represent it as part of this verified PR head.

**Hold #445 until the required Quality Gate is green on main itself and on the
current PR revision.** Human push/deploy permission does not waive that hold.

| Evidence | Actual result and limitation |
| --- | --- |
| [Main run 33980301593](https://github.com/FramehouseStudios/them/actions/runs/33980301593), `9c74759` | Failed required writer loop: “Save now did not deliver exactly one UI action.” Backend passed. Main is not green. |
| [#445 run 33988950331](https://github.com/FramehouseStudios/them/actions/runs/33988950331), `d5763d4` | Backend, signed iOS units, native Mac exports and required writer loop passed. Required broader V1 suite failed Pages Previous → page 2 current-page assertion; 56 tests, 9 skipped, 1 failed. |
| [Direct diagnostic 33994330170](https://github.com/FramehouseStudios/them/actions/runs/33994330170), `4620164` | Stopped at Required Secrets (`APP_TOKEN` missing), before iOS. No causal isolation result. |
| [#446 probe 33994535280](https://github.com/FramehouseStudios/them/actions/runs/33994535280), `2740e48` | Required writer loop passed, but checkout was PR merge `e804be9` onto current main, not the pre-#437 tree. Print code compiled; soft V1 and voice smokes failed despite overall green. Not main-branch clearance. |

The probe is diagnostic-only and **must not be merged**. A green merge-ref
probe does not prove or disprove #437 caused a failure. Do not repair a red
gate by suppressing the assertion or changing required jobs to optional.

## Eleven-PR audit and single implementation lanes

The [full audit](claude-pr-audit-2026-09-05.md) records exact reviewed SHAs,
reproductions and remaining engineering risks. All eleven were open at the
original review; #438 is now closed. Review completion is not acceptance.

| PR | Current disposition |
| --- | --- |
| [#420](https://github.com/FramehouseStudios/them/pull/420) | Open draft; reject old soft-gate/opt-in policy for required checks. |
| [#423](https://github.com/FramehouseStudios/them/pull/423) | Open; useful auth/index/ETag work carried into #445 with stronger uncertain-commit, exact-owner and rollback tests. No wholesale stack merge. |
| [#425](https://github.com/FramehouseStudios/them/pull/425) | Open atop #423; integrated reset/inspector safeguards supersede its weaker paths; Remember me correction carried into #445. |
| [#431](https://github.com/FramehouseStudios/them/pull/431) | Open, parked ghost preview: ownership, lifecycle and scene-heading grammar need repair and real narrow UI proof. |
| [#435](https://github.com/FramehouseStudios/them/pull/435) | Open, parked backend PDF: nontermination/content loss/Unicode/page-limit defects reproduced. Not enabled. |
| [#436](https://github.com/FramehouseStudios/them/pull/436) | Open, parked TODO nudge: restored initialization, marker matching and phone accessibility unverified. |
| [#438](https://github.com/FramehouseStudios/them/pull/438) | **Closed without merge**, verified on GitHub. Do not copy suggestions into writer-canon request fields. Codex did not close it. |
| [#440](https://github.com/FramehouseStudios/them/pull/440) | Still open at this snapshot; supervisor owns closure/rescoping. Do not adopt a second ghost/print coordinator. |
| [#442](https://github.com/FramehouseStudios/them/pull/442) | Open; clock-free FDX correction carried into #445 with extra alias/date tests. Avoid duplicate landing. |
| [#443](https://github.com/FramehouseStudios/them/pull/443) | **Preferred backend base** for next beats; additive response/turn metadata, never request-body canon mutation. Not yet ported, merged or enabled. |
| [#444](https://github.com/FramehouseStudios/them/pull/444) | Open UI delta atop #443, not a third backend. Stale batch ownership, unknown-outcome retry identity, cost disclosure and touch/layout proof remain required. |

User-relayed supervisor direction: **no new Claude pills or ghost PRs until
#443 lands**. Consolidate backend work on #443 and its dependent UI on #444;
do not let #438/#440 race those paths. This selects a foundation, not permission
to merge unverified behavior or enable default-off multipass flags.

Printing is final: **off by default in Release, explicit opt-in toggle, hard
kill switch**. Preserve one canonical print owner. Any conflicting “user said
on” claim goes back to the supervisor through the human. Physical AirPrint and
end-to-end voice cancellation remain unverified. The orb and Clementine remain
permanent anchors under D014.

## Merges missing from the old snapshot

GitHub confirms #424 (production boot guard), #426 (old coordination refresh),
#427 (approver/error presentation work), #428 (Save now keyboard handling),
#430 (purchase recovery re-land), #434 (dual-dialogue cues), #437 (opt-in
printing), #439 (FDX parity), and #441 (presentation-layer error correction)
merged into main. #429 first merged into its stacked branch; #430 brought it
to main. #432 and #433 are closed without merge. #422 remains open and outside
the eleven Claude-related PR audit; do not infer its acceptance.

## Production and verification limits

Authenticated Render inspection showed live revision `a5ea13fa`; the newer
`c2b80225` deploy completed its migrations/pre-deploy step but refused boot
because `APP_STORE_ISSUER_ID`, `APP_STORE_KEY_ID` and `APP_STORE_PRIVATE_KEY`
are absent. The human **does not have these credentials yet**. Bundle ID and
environment keys exist but their values were not exposed or validated.
Auto-Deploy is off. Keep the live backend unchanged; never weaken purchase
verification for a green deployment. No production change was made here.

Signing/Team ID, release-token agreement, public domains/privacy, real IAP and
paid-provider acceptance, TestFlight and physical-iPhone signoff remain separate
gates in [writer-beta-readiness.md](writer-beta-readiness.md). Proposed decision
amendments remain proposals until the human accepts them; this refresh does not
edit `DECISIONS.md`.

Local full Node 20/PostgreSQL v4: **2,707 passed, 0 failed, 1 live-provider skip**.
Signed native Mac export v4: **22 passed**. Signed local iOS export v1:
**855 units passed**, but the clipboard test took 866 seconds with pasteboard
errors; native Files presentation failed in the writer loop. Hosted #445 later
passed real Files Cancel/Save, not a fake-export shortcut. Neither run reads
back the delivered file bytes. These are distinct results, not beta signoff.

## Next actions, without duplicate work

1. Codex: diagnose and fix Pages Previous, including actual visible target
   geometry; preserve the current-page assertion and repeat signed narrow-phone
   verification.
2. Codex/supervisor: repair and verify main's required gate; the existing
   diagnostic did not isolate a pre-print revision. Do not launch another
   supposedly pinned probe that checks out a PR merge ref.
3. Codex: reconcile local native-export presentation, eliminate clipboard-test
   permission stalls, and verify delivered export bytes before declaring the
   full export story dependable.
4. Supervisor: consolidate #443/#444, close or rescope #440 as planned; no new
   competing pills/ghost PRs. Parked features retain their recorded test gates.
5. Human: obtain App Store Server API credentials and enter them securely in
   Render when ready. No secret values belong in chat or repository files.

Preserve all unrelated modified/untracked files and shared branches. Historical
iCloud-conflict counts and stale branch diagnostics require fresh inspection
before cleanup; no destructive cleanup or bulk PR closure is authorized here.
