# Foundation inspector edge-hit candidate — 2026-11-12

Base: original #964 `831de836e6becf76a97edf244188177d2a624619`.
Tests-first commit: `8c5e9bf0c80feb8030e5acb245ea6bdcaca5534a`.
Original source: `909f9e9075c5e074d45e93575b371a69f7e96ffb`, the existing
one-line `.contentShape(Rectangle())` fix in the inspector tab label owner.
No original head, PR base, main or history was changed.

## Evidence and scope

Hosted #964 run43260656345 failed two V1 cases. The rail event targeted Them
at x274.488586,y198, just inside its reported right edge274.5. Saved was selected
in the final native hierarchy and recording. This is not the older Saved-center
coordinate event and does not establish which handler or layout mechanism failed.
The same run's separate missing-h typing failure remains outside this change.

The dedicated `test_them_inspector_tab_right_edge_selects_its_panel` starts with
known Draft selection, obtains Them by its semantic identifier and verifies its
frame is contained in the drawer. It issues exactly one touch one point inside
the tab's right edge, then requires selected Them and the actual Them panel.
It uses existing readiness/selection helpers and budgets. All original cases and
helpers remain byte-exact; the ordinary rail tap test still exists unchanged.
This is a semantic edge contract, not an exact replay of the recorded fractional
coordinate. A baseline native pass would not establish a causal repair.

The product candidate copies only original909's content-shape line after the
full label frame. It deliberately retains the foundation's LazyVGrid. The earlier
original511 explicit-row layout is not imported here; whether contentShape alone
suffices is still a hypothesis until native before/after evidence is observed.

## Static proof and pending native work

Swift parser checks passed for the added test and edited view. D009 against the
verified actual fetched831 head passes with all five deltas0; diff checks pass.
Parser success is not iOS type-checking, a build, or executed UI proof. No native
test/build, backend/server/store, provider, paid call or GitHub mutation occurred.
Root owns the same-case native baseline/fixed comparison; do not retry to force
red/green or relax the selected-state/panel assertions.

Verified original native artifact SHA256:
`195b50e5edcc15f72982aa849abdeeea623a6f871bb78727b7cca3b33bae9e6b`.
Retained once at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1436-964-831-v1-red-20261112-luna`.
The former private/tmp path is an owned compatibility symlink to that archive.
This candidate does not clear #964, prove the physical-phone journey, or lift the
production hold. Keep the private branch frozen for root's native proof.
