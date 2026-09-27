import XCTest
@testable import them

final class StudioProjectRowSubtitleTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func testWrittenPagesWithNoOutlineShowTheirOpeningWords() {
        let project = summary(lastVersionAt: (now.timeIntervalSince1970 - 300) * 1000, excerpt: "INT. PIER - NIGHT\n\nFog rolls over the water.")
        let text = StudioProjectRowSubtitle.text(for: project, now: now)
        XCTAssertTrue(text.hasPrefix("Saved "), text)
        XCTAssertTrue(text.hasSuffix("INT. PIER - NIGHT Fog rolls over the water."), text)
        XCTAssertFalse(text.contains("Scenes 0"))
    }

    func testOutlineShapeWinsWhenPresent() {
        let project = summary(lastVersionAt: nil, excerpt: "INT. PIER - NIGHT", scenes: 3, beats: 1)
        XCTAssertEqual(StudioProjectRowSubtitle.text(for: project, now: now), "3 scenes · 1 beat")
    }

    func testNeverSavedEmptyProjectReadsBlankPage() {
        XCTAssertEqual(StudioProjectRowSubtitle.text(for: summary(lastVersionAt: nil, excerpt: nil), now: now), "Blank page")
    }

    func testLongExcerptIsShortenedWithAnEllipsis() {
        let long = String(repeating: "Fog rolls over the water. ", count: 6)
        let text = StudioProjectRowSubtitle.text(for: summary(lastVersionAt: nil, excerpt: long), now: now)
        XCTAssertTrue(text.hasSuffix("…"))
        XCTAssertLessThanOrEqual(text.count, StudioProjectRowSubtitle.excerptLimit + 1)
    }

    func testJustSavedReadsJustNow() {
        let project = summary(lastVersionAt: now.timeIntervalSince1970 * 1000 + 200, excerpt: "INT. PIER - NIGHT")
        XCTAssertEqual(StudioProjectRowSubtitle.text(for: project, now: now), "Saved just now · INT. PIER - NIGHT")
    }

    private func summary(
        lastVersionAt: TimeInterval?,
        excerpt: String?,
        scenes: Int? = nil,
        beats: Int? = nil
    ) -> BackendScreenplayProjectSummary {
        let id = "proj-row"
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
            lastVersionAt: lastVersionAt,
            formatScore: nil,
            storyScore: nil,
            confidenceClass: nil,
            latestExcerpt: excerpt,
            actCount: nil,
            sceneCount: scenes,
            beatCount: beats,
            outlineUpdatedAt: nil,
            collaboratorCount: nil,
            approvedEmails: nil,
            commentCount: nil,
            lastCommentAt: nil,
            studioThreadViewState: nil,
            studioDiffAcknowledged: nil,
            studioAskNoteHistory: nil,
            collaborators: nil,
            comments: nil,
            versions: nil,
            outline: nil
        )
    }
}
