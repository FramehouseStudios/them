import XCTest
@testable import them

final class StudioProjectSidecarSyncPolicyTests: XCTestCase {
    func testEmptyLocalStateMatchesAProjectWithNoStoredState() {
        let project = summary()
        XCTAssertTrue(StudioProjectSidecarSyncPolicy.threadViewMatchesServer(
            project,
            threadView: .empty,
            acknowledgedKeys: [],
            acknowledgedEntries: []
        ))
        XCTAssertTrue(StudioProjectSidecarSyncPolicy.askNoteHistoryMatchesServer(project, history: []))
    }

    func testStoredStateSpelledWithNilsMatchesTheSameStateWithEmpties() throws {
        let stored = try JSONDecoder().decode(
            BackendScreenplayThreadViewState.self,
            from: Data(#"{"searchText":"pier","collapsedSectionKeys":["act-1"]}"#.utf8)
        )
        let local = BackendScreenplayThreadViewState(
            searchText: "pier",
            selectedFilterRaw: "",
            selectedSceneKey: "",
            scrollTargetKey: "",
            collapsedSectionKeys: ["act-1"],
            focusedDiffKey: "",
            reopenedLineageKeys: [],
            latestReopenedWriteID: ""
        )
        XCTAssertTrue(StudioProjectSidecarSyncPolicy.threadViewMatchesServer(
            summary(threadView: stored),
            threadView: local,
            acknowledgedKeys: [],
            acknowledgedEntries: []
        ))
    }

    func testChangedBrowseStateStillWrites() {
        let local = BackendScreenplayThreadViewState(
            searchText: "harbor",
            selectedFilterRaw: "",
            selectedSceneKey: "",
            scrollTargetKey: "",
            collapsedSectionKeys: [],
            focusedDiffKey: "",
            reopenedLineageKeys: [],
            latestReopenedWriteID: ""
        )
        XCTAssertFalse(StudioProjectSidecarSyncPolicy.threadViewMatchesServer(
            summary(threadView: .empty),
            threadView: local,
            acknowledgedKeys: [],
            acknowledgedEntries: []
        ))
    }

    func testNewAcknowledgementStillWrites() {
        XCTAssertFalse(StudioProjectSidecarSyncPolicy.threadViewMatchesServer(
            summary(),
            threadView: .empty,
            acknowledgedKeys: ["diff-1"],
            acknowledgedEntries: []
        ))
    }

    func testAskNoteHistoryComparesEntries() throws {
        let entry = try JSONDecoder().decode(
            BackendScreenplayStudioExchange.self,
            from: Data(#"{"id":"a1","prompt":"Tighten the pier scene"}"#.utf8)
        )
        let project = summary(history: [entry])
        XCTAssertTrue(StudioProjectSidecarSyncPolicy.askNoteHistoryMatchesServer(project, history: [entry]))
        XCTAssertFalse(StudioProjectSidecarSyncPolicy.askNoteHistoryMatchesServer(project, history: []))
    }

    private func summary(
        threadView: BackendScreenplayThreadViewState? = nil,
        acknowledged: BackendScreenplayDiffAcknowledgementState? = nil,
        history: [BackendScreenplayStudioExchange]? = nil
    ) -> BackendScreenplayProjectSummary {
        let id = "proj-sidecar"
        return BackendScreenplayProjectSummary(
            id: id,
            title: id,
            archived: nil,
            tags: nil,
            characters: nil,
            setting: nil,
            tone: nil,
            promptSeed: nil,
            logline: nil,
            themeArgument: nil,
            centralQuestion: nil,
            protagonistWant: nil,
            protagonistNeed: nil,
            antagonisticForce: nil,
            actPosition: nil,
            endingImage: nil,
            unresolvedSetups: nil,
            createdAt: nil,
            updatedAt: nil,
            versionCount: nil,
            lastPhase: nil,
            activeVersionId: nil,
            lastVersionId: nil,
            lastVersionAt: nil,
            formatScore: nil,
            storyScore: nil,
            confidenceClass: nil,
            latestExcerpt: nil,
            actCount: nil,
            sceneCount: nil,
            beatCount: nil,
            outlineUpdatedAt: nil,
            collaboratorCount: nil,
            approvedEmails: nil,
            commentCount: nil,
            lastCommentAt: nil,
            studioThreadViewState: threadView,
            studioDiffAcknowledged: acknowledged,
            studioAskNoteHistory: history,
            collaborators: nil,
            comments: nil,
            versions: nil,
            outline: nil
        )
    }
}
