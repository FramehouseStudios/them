# T-1171 — Owned received replies through confirmed screenplay saves

October 26, 2026. Branch `codex/T-1171-received-scene-delivery`.
Parent `615a88a1656c63ff7e58369ff1561606e65d5aa7`.
Owner normalization red7785b61; complete boundary red390e47d; policy44c98d5;
initial combined runtime0c9247b; project-routing redca5f78a;
final runtime `c5b686b69608e40dbca54456fd0e3b5664e83ee7`.
Overall goal active and incomplete. Original647, main and production held.

## 1. Completed

Reuse preserved6b2d83d to make authenticated owner identity decisive for owned
turn metadata. Store/read its canonical ID without adding repeated `user:`
prefixes. Session/IP compatibility remains only for genuinely ownerless legacy
turns; a different authenticated user cannot inherit an owned reply through a
prior client token, local dev bypass or claimed owner header. Existing error
envelopes/statuses remain; no parallel auth policy or new endpoint.

Reuse f8db1d7 to retain complete canonical turn metadata with the already-kept
audio/request receipt, dropping credentials/unknown fields. Validate turn ID,
scope and integrity before/after lookup; never regenerate to repair metadata.
Relaunch decoding uses retained bytes rather than volatile server state.

Reuse3784636: Studio's Document card discovers received replies. Review stops
active Talk; existing AudioPlayer provides Play/Stop. Authoritative page output
offers **Append & save scene** in the selected loaded project. Before insertion,
atomically journal stable receipt/project/document and exact before/after text
in that same protected record. Reuse native editor separators and the existing
committed-write/save path. Confirm an exact matching version through the
authenticated origin-pinned project client before settling the receipt.
Uncertain retry keeps the original plan and cannot append to newer text.
Closing, reading, playing or exporting alone never settles it. Empty output
no longer hides a nonempty reply. No automatic new-project or rewrite behavior
is invented by this manual append recovery capability.

Reuse b2d95df after reproducing its missing-trace failure on the combined tree:
check the integrity-validated original multipart request's project before any
delivery plan. A wrong project is refused without rebinding/consuming the
receipt. Bounded part/header parsing ignores binary audio as field text;
ambiguous declared multipart blocks insertion but leaves review/export usable.
Legacy unknown-origin explicit manual recovery remains; it is not authorization
for future automatic delivery.

## 2. Exact files changed

- `TASKS.md`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `backend/index.js`
- `backend/lib/talk_turn_read_policy.js`
- `backend/tests/talk_turn_owner_isolation.test.mjs`
- `backend/tests/talk_turn_read_policy.test.mjs`
- `them/BackendClient.swift`
- `them/DataControlsScreen.swift`
- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkPageDelivery.swift`
- `them/OfflineTalkPageRecoveryPanel.swift`
- `them/OfflineTalkPageRecoveryUITestFixture.swift`
- `them/OfflineTalkRecovery.swift`
- `them/OfflineTalkReplyReview.swift`
- `them/ScreenplayLiveDraftBridge.swift`
- `them/ScreenplayStudioDraftToolsViews.swift`
- `them/ScreenplayStudioScreen.swift`
- `themTests/OfflineTalkMetadataCustodyTests.swift`
- `themTests/OfflineTalkPageDeliveryTests.swift`
- `themTests/OfflineTalkReplyDecodingTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `docs/received-scene-delivery-2026-10-26.md`

Seven canonical runtime files are byte-checked: policy6b2d83d; outbox/delivery
b2d95df; record/review/panel/DEBUG fixture3784636. Preserve all original history.
Keep current authenticated picker tests and newer owner/redirect/first-save
guards. Improve the handler regression to collect every access outcome before
the first assertion; strengthen journal bytes with decomposed Unicode/CRLF and
add the late-metadata-vs-delivery race. No framework or duplicate store.

## 3. Root failures and adversarial disposition

VERIFIED real Node20 handler red0/1/0 at390e47d, providers intercepted:
owner200; other403; other login with prior owner's client token200;
claimed owner+prior token200; signed-out401; owner without token403;
canonicalOwner=false. The earlier7785b61 run stopped at repeated owner prefixes
before exercising the remaining assertions; it is not bypass proof by itself.

After repair: owner200; other/prior-token/claimed-owner403; signed-out401;
owner without token200; canonicalOwner=true. No forbidden response exposes
reply text. Policy cases also cover ownerless compatibility and empty scope.

VERIFIED signed project-routing red0/1/0 atca5f78a: an original projectA request
with no response trace accepted a recovery plan in projectB. This is native
outbox storage evidence, not an observed physical-phone incident. Fixed cases
refuse B without a wrong plan or consumed receipt, then permit A after relaunch.

Answered locally: full metadata after relaunch with server unavailable; unknown
and session fields excluded; wrong turn/failed lookup keeps receipt; deletion
or page plan created during outstanding metadata GET cannot be overwritten;
stale receipt cannot acknowledge enriched metadata; immutable plan/UTF8 prefix;
wrong document/project refusal; malformed/duplicate multipart refusal; missing/
tampered plan digest; generic acknowledgement cannot consume a page plan;
one reviewed scene, one matching saved version, exact full editor restoration.

Partial/not covered: server crash between acceptance and client receipt/full
metadata capture; server restart durability/settlement; Postgres/collaborator
isolation; physical crash at individual writes; file-protection/large-record IO
measurement; complete disk failure/fsync; automatic original-document/unbound
delivery; precise queued rewrite recovery; real microphone/model/audible quality.
Matching server GET is not proof of crash-durable server storage. Do not call
the application globally secure or complete from this checkpoint.

Compatibility: current reader accepts version1/2/3 records. Old readers do not
understand version3 delivery plans. Finish/export held results before downgrade,
preserve their files and use a current reader; no downgrade conversion/import.
Each journal draft is bounded to2MiB and retained audio to32MiB, with explicit
refusal/omission rather than truncating a screenplay. Saved confirmation checks
the newest32 returned versions; older uncertain deliveries remain held. Unknown
legacy project scope stays explicit manual recovery, never automatic permission.

## 4. Verification and evidence

Normal signing; one native proof at a time; frozen code; erase task-owned
`91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A` only, iPhone17Pro/iOS26.2 (23C54).

- Real owner handler red0/1/0 twice, with complete observations at390e47d;
  fixed focused Node20 **3/0/0**.
- Initial combined signed units0c9247b **882/0/0**; original-project red
  ca5f78a **0/1/0**; final full signed c5b686b **884/0/0**.
- Full isolated Node20.20.2 at0c9247b **2887 passed /0 failed /2 skipped**,
  47suites. Backend/script/test sources are byte-unchanged through final runtime;
  do not claim a second run. Skips: real Postgres prefix test (DATABASE_URL
  absent), and existing live-page-sync-gated talk integration case. No provider
  network or environment secrets forwarded to the container.
- Actual queued HTTP -> metadata -> review Play/Stop -> full-scene append ->
  exact original prefix -> one matching saved version -> receipt removal ->
  full native-editor relaunch UI **1/0/0** at0c9247b and again **1/0/0** at
  finalc5b686b. Intercepted STT/chat/TTS **1/2/23** each. The request carries
  the real confirmed generation-intent field; no non-page reply is forced into
  a page. Playback control assertions do not establish human-heard quality.
- Unchanged raw-audio Home -> page/save/one-project/restore UI **1/0/0** and
  authenticated read/relaunch/native Files Cancel/Save UI **1/0/0** at0c9247b,
  providers **1/2/1** and **0/0/0**. No new export/read/raw path change in the
  final original-project-only patch; do not invent another run.
- Independent actual742byte recovery JSON at0c9247b, hash
  `88cb5a7865034d9b080cab97e80a3ed218a8d787c7a4fffa84dd0a06f9e86c7c`:
  exact27byte request and25byte reply, no credential headers, owned received
  record and29/28byte foreign/unassigned bodies/hashes intact. Opened the exact
  file in task-owned iOS Files Quick Look about11:59 local, before later erases.
  Copied artifact retained. This is recovery JSON, not screenplay export.
- macOS scaffold at0c9247b and finalc5b686b: **BUILD SUCCEEDED**, exit0.
  Existing concurrency/deprecation warnings remain; no Mac UI/Swift6 claim.
- Final D009 vs actual fetched615a88a: index33538->33513 (**-25**),
  bridge12852->12788 (**-64**); Studio17345, Root14933, MemoryAPI10463 unchanged.
  Syntax/diff checks pass. No padding, suppressions or unrelated refactor.

Permanent local evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1171-20261026.3E9iEq/`.
Retain distinct red, initial combined and final bundles/logs plus public-source
snapshots, canonical comparisons and the actual copied export. No paid calls,
private environment reads, production changes or human-data cleanup.

## 5. GitHub status

Scoped normal backup push only. No replacement PR, force push, original647 head
advance, main merge or protection bypass. Original647 remains held; current648
is open/draft210c5ef, based on original647. Its historical live golden numbers
are not current proof. Authoritative remote refs and publication receipt are
retained after pushing. Green local prerequisites are not integrated main.

## 6. Next active task

Close server response/replay durability before advancing original647. Review
preserved a6a3204 (T1121 owner-scoped durable talk integration), 31bd768 (T1122
settlement) and their prerequisites/tests from actual branch history; reproduce
the current restart window before porting. No new conversation/persistence
framework, paid calls or blind wholesale merge of old snapshots.

Original-context/unbound recovery, raw-talk authoritative routing (T1119),
retained initial setup, overlap retention e31f351 and real native screenplay
export remain required. Existing screenplay-export UI assertions use a DEBUG
artifact shortcut and do not prove backend/native Files export. Only after
these boundaries and refreshed original heads are proved should original648
be integrated by actual bases. Keep Clementine/orb, aesthetic and flexible
120-page recommendation; no padding, forced length or name/persona override.

Production remains held under the human's App Store-credentials decision.
Integrated-main required checks/review and the real-phone journey against an
explicitly identified intended backend remain separate unproven requirements.

## 7. Continue status

**READY FOR CONTINUE.** Goal active and incomplete. Continue safe local fixes;
no new human action is needed to work on the durability gap. Human review,
shipping hold and actual phone/model proof remain their own gates.
