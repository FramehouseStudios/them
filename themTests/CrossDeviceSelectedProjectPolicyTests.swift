import XCTest
@testable import them

final class CrossDeviceSelectedProjectPolicyTests: XCTestCase {
    func testOwnSaveThatOnlyMovedTimestampsDoesNotReload() {
        let local = summary(lastVersionId: "v2", updatedAt: 100)
        let incoming = summary(lastVersionId: "v2", updatedAt: 200)
        XCTAssertFalse(CrossDeviceSelectedProjectPolicy.needsReload(local: local, incoming: incoming, localVersionID: "v2", localOutlineRevision: 3))
    }

    func testNilAndEmptyListsCountAsEqual() {
        let local = summary(lastVersionId: "v2", tags: nil)
        let incoming = summary(lastVersionId: "v2", tags: [])
        XCTAssertFalse(CrossDeviceSelectedProjectPolicy.needsReload(local: local, incoming: incoming, localVersionID: "v2", localOutlineRevision: 3))
    }

    func testNewVersionFromAnotherDeviceReloads() {
        XCTAssertTrue(CrossDeviceSelectedProjectPolicy.needsReload(
            local: summary(lastVersionId: "v2"),
            incoming: summary(lastVersionId: "v3"),
            localVersionID: "v2",
            localOutlineRevision: 3
        ))
    }

    func testOutlineRevisionChangeReloads() {
        XCTAssertTrue(CrossDeviceSelectedProjectPolicy.needsReload(
            local: summary(lastVersionId: "v2"),
            incoming: summary(lastVersionId: "v2", outlineRevision: 4),
            localVersionID: "v2",
            localOutlineRevision: 3
        ))
    }

    func testMetadataOrCommentChangesReload() {
        let local = summary(lastVersionId: "v2")
        XCTAssertTrue(CrossDeviceSelectedProjectPolicy.needsReload(local: local, incoming: summary(title: "Renamed", lastVersionId: "v2"), localVersionID: "v2", localOutlineRevision: 3))
        XCTAssertTrue(CrossDeviceSelectedProjectPolicy.needsReload(local: local, incoming: summary(lastVersionId: "v2", commentCount: 1), localVersionID: "v2", localOutlineRevision: 3))
    }

    func testMissingProjectReloads() {
        XCTAssertTrue(CrossDeviceSelectedProjectPolicy.needsReload(local: summary(lastVersionId: "v2"), incoming: nil, localVersionID: "v2", localOutlineRevision: 3))
        XCTAssertTrue(CrossDeviceSelectedProjectPolicy.needsReload(local: nil, incoming: summary(lastVersionId: "v2"), localVersionID: "v2", localOutlineRevision: 3))
    }

    private func summary(
        title: String = "Nora Scene",
        lastVersionId: String?,
        updatedAt: TimeInterval? = nil,
        tags: [String]? = nil,
        commentCount: Int? = nil,
        outlineRevision: Int? = nil
    ) -> BackendScreenplayProjectSummary {
        let id = "proj-nora"
        var project = BackendScreenplayProjectSummary(
            id: id,
            title: title,
            archived: nil,
            tags: tags,
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
            updatedAt: updatedAt,
            versionCount: nil,
            lastPhase: nil,
            activeVersionId: nil,
            lastVersionId: lastVersionId,
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
            commentCount: commentCount,
            lastCommentAt: nil,
            studioThreadViewState: nil,
            studioDiffAcknowledged: nil,
            studioAskNoteHistory: nil,
            collaborators: nil,
            comments: nil,
            versions: nil,
            outline: nil
        )
        project.outlineRevision = outlineRevision
        return project
    }
}
