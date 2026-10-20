# T-1062 — Stop at original #904's remaining typing failure

**VERIFIED:** latest parent3e96d43 Quality Gate run39439684023 fails V1
typing chunk2: expected `She counts`, editor/model `She ounts`. Actual V1
counts28 passed/1 failed/9 skipped; failed log
`/tmp/them-1061-parent-904-latest-failure.log`. Navigation/callback failure
is no longer the failure. Do not interpret this as billing/infrastructure,
retry unchanged tests, or merge the red parent using child-local results.

Actual parent updateUIView still assigns any differing binding value into
the native editor, with no historical-render or pending-publication guard.
Child #919ae88bff now owns the reused, proved correction; it is not yet in
this parent. The combined T1059 trace proves an actual delayed-echo overwrite
locally, not the precise event history of this untraced hosted failure.

**DECIDED implementation scope:** preserve parent3e96d43 in an owned local
branch. Port the existing canonical editor ownership/live-line owners from
the child, including their genuine rewrite/document-switch/deferred-request
contracts and characterization cases. Do not merge the entire child into
its parent or retarget it around the parent; preserve original histories
and separate viewport/lifecycle responsibilities. No replacement PR.

Use the existing package ownership seam to move the inline deferred gate
unchanged where necessary for D009; no new binding architecture, prefix
heuristic, focus lock, input retry, timer or disabled assertion. Full signed
units and exact typing/callback/recovery, Node20, macOS, actual-base D009
and diff proof precede normal original-parent publication. Then merge its
updated head back into the original child, preserving both. Hosted checks
and genuine independent approvals remain required. Main stays unchanged.

This branch is a plan checkpoint only: no runtime port or after-proof yet.
The two freshly published originals (#919ae88bff and #971f1533f1) retain
their local proof, but their checks/reviews do not clear this red parent.
No paid model, production/credential change or physical-phone success claim.
