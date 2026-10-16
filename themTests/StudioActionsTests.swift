import XCTest
@testable import them

final class StudioActionsTests: XCTestCase {
    func test_actions_match_only_the_original_authenticated_document_bytes() {
        let auth = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 7)
        let expected = StudioActionDocumentContext(auth: auth, projectID: "project-a", draft: "Café", isAuthenticated: true)
        XCTAssertTrue(expected.matches(expected))
        for changed in [
            StudioActionDocumentContext(auth: .init(userID: "writer-b", sessionIntentGeneration: 7), projectID: "project-a", draft: "Café", isAuthenticated: true),
            StudioActionDocumentContext(auth: .init(userID: "writer-a", sessionIntentGeneration: 8), projectID: "project-a", draft: "Café", isAuthenticated: true),
            StudioActionDocumentContext(auth: auth, projectID: "project-b", draft: "Café", isAuthenticated: true),
            StudioActionDocumentContext(auth: auth, projectID: "project-a", draft: "Café\nA new line.", isAuthenticated: true),
            StudioActionDocumentContext(auth: auth, projectID: "project-a", draft: "Cafe\u{0301}", isAuthenticated: true),
            StudioActionDocumentContext(auth: auth, projectID: "project-a", draft: "Café", isAuthenticated: false),
        ] { XCTAssertFalse(expected.matches(changed)) }
        let anonymous = StudioActionDocumentContext(auth: .init(userID: "", sessionIntentGeneration: 0), projectID: "", draft: "", isAuthenticated: true)
        XCTAssertFalse(anonymous.matches(anonymous))
    }

    func test_dispatch_rejects_stale_context_before_trying_to_open_studio() {
        var opened = false
        XCTAssertEqual(StudioActionDispatcher.dispatch([.init(type: "save_draft")], studioOpen: false, openStudio: { opened = true }, isCurrent: { false }), 0)
        XCTAssertFalse(opened)
    }

    func test_delayed_dispatch_rechecks_context_and_mount_readiness() {
        for stale in [false, true] {
            let center = NotificationCenter()
            var delivered = 0
            var current = true
            let token = center.addObserver(forName: .themStudioActionRequested, object: nil, queue: nil) { _ in delivered += 1 }
            defer { center.removeObserver(token) }
            StudioActionDispatcher.dispatch([.init(type: "save_draft")], studioOpen: false, openStudio: { if stale { current = false } }, center: center, mountDelay: 0.01, isCurrent: { current }, isReady: { stale })
            let settled = expectation(description: "delayed action settled")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { settled.fulfill() }
            wait(for: [settled], timeout: 2)
            XCTAssertEqual(delivered, 0, stale ? "Context changed during mount" : "Studio refused to open")
        }
    }

    func test_dispatch_deduplicates_across_sources_and_rechecks_between_actions() {
        let center = NotificationCenter()
        var received: [String] = []
        var current = true
        let token = center.addObserver(forName: .themStudioActionRequested, object: nil, queue: nil) { note in
            received.append(StudioActionDispatcher.action(from: note)?.type ?? "missing")
            current = false
        }
        defer { center.removeObserver(token) }
        let queued = StudioActionDispatcher.dispatch([
            .init(type: "save_draft", source: "tag"), .init(type: "save_draft", source: "spoken"),
            .init(type: "open_tab", tab: "beats")
        ], studioOpen: true, openStudio: {}, center: center, isCurrent: { current })
        XCTAssertEqual(queued, 2, "Count describes accepted actions, not a success receipt")
        XCTAssertEqual(received, ["save_draft"], "Second action must not run after the document changes")
    }

    func test_dispatch_caps_untrusted_response_actions_at_four() {
        let center = NotificationCenter()
        var received = 0
        let token = center.addObserver(forName: .themStudioActionRequested, object: nil, queue: nil) { _ in received += 1 }
        defer { center.removeObserver(token) }
        let actions = ["draft", "beats", "craft", "outline", "them", "saved"].map { BackendStudioAction(type: "open_tab", tab: $0) }
        XCTAssertEqual(StudioActionDispatcher.dispatch(actions, studioOpen: true, openStudio: {}, center: center), 4)
        XCTAssertEqual(received, 4)
    }

    func test_missing_studio_metadata_does_not_build_or_attach_capabilities() {
        var snapshotCalls = 0
        func makeSnapshot() -> StudioCapabilitiesSnapshot {
            snapshotCalls += 1
            return StudioCapabilitiesSnapshot()
        }
        XCTAssertNil(StudioCapabilitiesSnapshot.attaching(to: nil, snapshot: makeSnapshot()))
        XCTAssertEqual(snapshotCalls, 0)
    }

    func test_attaching_capabilities_preserves_existing_turn_metadata() {
        let metadata = BackendStudioThreadCommitMetadata(
            screenplayProjectId: "project-one", screenplayDocumentRevisionId: "revision-one",
            screenplayTarget: "page", screenplayPromptSource: "voice", screenplayWriteId: "write-one",
            screenplayAnchorLine: 12, screenplayAnchorEndLine: 14, screenplayInsertionMode: "replace_selection",
            screenplayAnchorSceneLabel: "INT. ROOM - NIGHT", screenplayAnchorDraftSceneId: "scene-one",
            screenplayAnchorOutlineSceneId: "outline-one", screenplayAnchorOutlineBeatIds: ["beat-one"],
            screenplayAnchorScriptNodeId: "node-one", screenplayNoteTitle: "Note", screenplayNoteBody: "Keep the silence.",
            screenplayInsertedText: "She waits.", screenplayReplacementApplied: true,
            screenplayReplacedWriteId: "old-write", screenplayRevisedBlockText: "She listens.",
            screenplayResolvedAnchorExcerpt: "A door closes.", screenplayDraftExcerpt: "FADE IN:",
            screenplayAct: "Act II", screenplayPageCount: 25, screenplayTargetPages: 90
        )
        var snapshot = StudioCapabilitiesSnapshot()
        snapshot.hasProject = true
        snapshot.sceneLabels = ["INT. ROOM - NIGHT"]
        var expected = metadata
        expected.studioCapabilitiesJSON = snapshot.json()
        XCTAssertEqual(StudioCapabilitiesSnapshot.attaching(to: metadata, snapshot: snapshot), expected)
        XCTAssertEqual(metadata.studioCapabilitiesJSON, "", "The original value must remain unchanged.")
    }

    func test_response_handler_reads_current_visibility_and_dispatches_before_forwarding() {
        let center = NotificationCenter()
        var events: [String] = []
        var studioOpen = false
        let token = center.addObserver(forName: .themStudioActionRequested, object: nil, queue: nil) { note in
            events.append(StudioActionDispatcher.action(from: note)?.type ?? "missing")
        }
        defer { center.removeObserver(token) }
        let handler = StudioActionDispatcher.handlingResponse(
            studioOpen: { studioOpen }, openStudio: { events.append("opened") }, center: center
        ) { metadata in
            XCTAssertEqual(metadata.reply, "I'll save that revision.")
            XCTAssertEqual(metadata.studioActions.map(\.type), ["save_revision", "unsupported"])
            events.append("response")
        }
        // The writer opened Studio while the response was in flight.
        studioOpen = true
        let metadata = BackendTalkResponseMetadata(
            audioDurationMs: nil, renderContract: .default, timingSource: nil,
            screenplayOutput: nil, screenplayQuality: nil, screenplayCues: [], dialogueTimeline: nil,
            creativeMemoryTrace: .empty, screenplayTrace: .empty, reply: "I'll save that revision.",
            suggestion: nil, uncertainty: nil, collabCursor: nil, samanthaPresence: nil,
            presenceHistory: [], presenceBargeAt: nil, presenceBargeReason: nil, voiceLearn: nil,
            vulnAsk: nil, vulnOptions: [],
            studioActions: [BackendStudioAction(type: "save_revision", color: "pink"), BackendStudioAction(type: "unsupported")]
        )
        handler(metadata)
        XCTAssertEqual(events, ["save_revision", "response"])
        handler(metadata)
        XCTAssertEqual(events, ["save_revision", "response", "response"], "Repeated transport metadata must not repeat a save or rewrite action.")
    }

    func test_header_parses_percent_encoded_actions_and_drops_unknown_types() {
        let json = #"[{"type":"save_revision","color":"pink","source":"tag"},{"type":"open_tab","tab":"beats","source":"spoken"},{"type":"teleport"}]"#
        let encoded = json.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!
        let actions = StudioActionParser.parse(headerValue: encoded)
        XCTAssertEqual(actions.count, 2)
        XCTAssertEqual(actions[0], BackendStudioAction(type: "save_revision", color: "pink", source: "tag"))
        XCTAssertEqual(actions[1].tab, "beats")
        XCTAssertEqual(StudioActionParser.parse(headerValue: nil), [])
        XCTAssertEqual(StudioActionParser.parse(headerValue: "%7Bnot-an-array%7D"), [])
        XCTAssertEqual(StudioActionParser.parse(headerValue: ""), [])
    }

    func test_capabilities_json_names_the_tabs_sections_and_colors_the_app_actually_has() throws {
        var snapshot = StudioCapabilitiesSnapshot()
        snapshot.sceneLabels = ["INT. KITCHEN - NIGHT"]
        snapshot.currentTab = "them"
        snapshot.hasProject = true
        snapshot.hasDraft = true
        snapshot.studioOpen = true
        let data = try XCTUnwrap(snapshot.json().data(using: .utf8))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["tabs"] as? [String], ["draft", "beats", "craft", "outline", "them", "saved"])
        XCTAssertEqual(object["draft_tools_sections"] as? [String], ScreenplayStudioScreen.DraftToolsSection.allCases.map(\.rawValue))
        XCTAssertEqual(object["sidebar_sections"] as? [String], ["projects", "files"])
        XCTAssertEqual((object["revision_colors"] as? [String])?.first, "white")
        XCTAssertEqual(object["scene_labels"] as? [String], ["INT. KITCHEN - NIGHT"])
        XCTAssertEqual(object["current_tab"] as? String, "them")
        XCTAssertEqual(object["has_draft"] as? Bool, true)
        XCTAssertEqual(object["studio_open"] as? Bool, true)
    }

    func test_dispatcher_posts_one_notification_per_supported_action_when_the_studio_is_open() {
        let center = NotificationCenter()
        var received: [BackendStudioAction] = []
        let token = center.addObserver(forName: .themStudioActionRequested, object: nil, queue: nil) { note in
            if let action = StudioActionDispatcher.action(from: note) { received.append(action) }
        }
        defer { center.removeObserver(token) }
        var opened = 0
        let count = StudioActionDispatcher.dispatch(
            [BackendStudioAction(type: "open_tab", tab: "beats"), BackendStudioAction(type: "bogus"), BackendStudioAction(type: "save_draft")],
            studioOpen: true,
            openStudio: { opened += 1 },
            center: center
        )
        XCTAssertEqual(count, 2)
        XCTAssertEqual(opened, 0)
        XCTAssertEqual(received.map(\.type), ["open_tab", "save_draft"])
    }

    func test_dispatcher_opens_the_studio_first_and_delivers_after_it_mounts() {
        let center = NotificationCenter()
        let delivered = expectation(description: "action delivered after the studio mounts")
        let token = center.addObserver(forName: .themStudioActionRequested, object: nil, queue: .main) { _ in delivered.fulfill() }
        defer { center.removeObserver(token) }
        var opened = 0
        StudioActionDispatcher.dispatch(
            [BackendStudioAction(type: "choose_beat")],
            studioOpen: false,
            openStudio: { opened += 1 },
            center: center,
            mountDelay: 0.05
        )
        XCTAssertEqual(opened, 1)
        wait(for: [delivered], timeout: 2)
    }

    func test_nothing_is_dispatched_for_empty_or_unsupported_lists() {
        let center = NotificationCenter()
        var opened = 0
        XCTAssertEqual(StudioActionDispatcher.dispatch([], studioOpen: false, openStudio: { opened += 1 }, center: center), 0)
        XCTAssertEqual(StudioActionDispatcher.dispatch([BackendStudioAction(type: "nope")], studioOpen: false, openStudio: { opened += 1 }, center: center), 0)
        XCTAssertEqual(opened, 0)
    }

    func test_capabilities_json_carries_outline_beat_labels_and_actions_decode_a_beat() throws {
        var snapshot = StudioCapabilitiesSnapshot()
        snapshot.beatLabels = ["Opening image", "Midpoint"]
        let data = try XCTUnwrap(snapshot.json().data(using: .utf8))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["beat_labels"] as? [String], ["Opening image", "Midpoint"])

        let json = #"[{"type":"choose_beat","beat":"Midpoint","source":"tag"},{"type":"undo_last_page_write","source":"spoken"}]"#
        let encoded = json.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!
        let actions = StudioActionParser.parse(headerValue: encoded)
        XCTAssertEqual(actions.map(\.type), ["choose_beat", "undo_last_page_write"])
        XCTAssertEqual(actions.first?.beat, "Midpoint")
    }

    @MainActor
    func test_outline_registry_keeps_trimmed_nonempty_beat_labels() throws {
        let json = #"[{"id":"b1","label":"  Opening image "},{"id":"b2","label":"   "},{"id":"b3","label":"Midpoint"}]"#
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let beats = try decoder.decode([BackendScreenplayBeat].self, from: Data(json.utf8))
        let registry = StudioOutlineRegistry.shared
        registry.update(beats: beats)
        XCTAssertEqual(registry.beatLabels, ["Opening image", "Midpoint"])
        registry.update(beats: [])
        XCTAssertEqual(registry.beatLabels, [])
    }
}
