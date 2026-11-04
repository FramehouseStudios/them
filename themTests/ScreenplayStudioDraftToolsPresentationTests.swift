import XCTest
import ScreenplayStudio
import SwiftUI
@testable import them

@MainActor
final class ScreenplayStudioDraftToolsPresentationTests: XCTestCase {
#if os(iOS)
    func testEntireNavigatorRendersAt230PointInspectorWidth() throws {
        let rows = (1...2).map { number in
            ScreenplayStudioPaginationPagePresentation(page: BackendScreenplayPaginationPage(page: number, startLine: number == 1 ? 4 : 58, endLine: number == 1 ? 57 : 70, lineCount: number == 1 ? 54 : 13, preview: nil, estMinutes: nil), thumbnailLines: ["INT. OBSERVATORY - NIGHT", "Mara counts the stars twice before she notices that one of them is a nail.", "MARA", "Who has been answering Houston?"], isActive: number == 1)
        }
        let presentation = ScreenplayStudioDraftPagesPresentation(isRefreshing: false, isDraftEmpty: false, errorText: "", pages: rows)
        let view = ScreenplayStudioDraftPageTools(linesPerPage: .constant(54), presentation: presentation, onRefresh: {}, onJumpToPage: { _ in })
            .frame(width: 230).fixedSize(horizontal: false, vertical: true)
            .padding(12).background(Color.white).environment(\.colorScheme, .light)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.uiImage)
        XCTAssertGreaterThan(image.size.height, 600, "The complete navigator, not a clipped viewport, must render")
        let sample = XCTAttachment(image: image)
        sample.name = "Complete Pages navigator at 230pt"
        sample.lifetime = .keepAlways
        add(sample)
    }
#endif

    func testNavigatorUsesCurrentSourcePageAndBoundsPreviousNext() {
        let pages = (1...3).map { number in
            ScreenplayStudioPaginationPagePresentation(page: BackendScreenplayPaginationPage(page: number, startLine: number * 10, endLine: number * 10 + 9, lineCount: 54, preview: "Page \(number) text", estMinutes: nil), thumbnailLines: ["Page \(number) text"], isActive: number == 2)
        }
        let presentation = ScreenplayStudioDraftPagesPresentation(isRefreshing: false, isDraftEmpty: false, errorText: "", pages: pages)
        XCTAssertEqual(presentation.summary(selection: nil), "Page 2 of 3")
        XCTAssertEqual(presentation.adjacentPage(to: nil, offset: -1)?.id, 1)
        XCTAssertEqual(presentation.adjacentPage(to: nil, offset: 1)?.id, 3)
        XCTAssertNil(presentation.adjacentPage(to: 1, offset: -1))
        XCTAssertNil(presentation.adjacentPage(to: 3, offset: 1))
        XCTAssertEqual(presentation.selectedPage(99)?.id, 2, "An expired preview selection falls back to current source")
        XCTAssertEqual(presentation.runtimeText, "Estimated screenplay time: about 3 min")
    }

    func testNavigatorCanSelectPreviewWhenOneSourceLineSpansSeveralPages() {
        let rows = (1...3).map { number in
            ScreenplayStudioPaginationPagePresentation(page: BackendScreenplayPaginationPage(page: number, startLine: 2, endLine: 3, lineCount: 24, preview: "Speech continuation", estMinutes: nil), thumbnailLines: ["", "Speech continuation", "  "], isActive: true)
        }
        let presentation = ScreenplayStudioDraftPagesPresentation(isRefreshing: false, isDraftEmpty: false, errorText: "", pages: rows)
        XCTAssertEqual(presentation.activePageCount, 3)
        XCTAssertEqual(presentation.cursorPageID, 1)
        XCTAssertEqual(presentation.selectedPage(2)?.id, 2)
        XCTAssertEqual(presentation.adjacentPage(to: 2, offset: 1)?.id, 3)
        XCTAssertEqual(rows[0].visiblePreviewLines, ["Speech continuation"])
        XCTAssertEqual(ScreenplayStudioDraftPagesPresentation.durationText(lineCount: 54), "about 1 min")
        XCTAssertEqual(ScreenplayStudioDraftPagesPresentation.durationText(lineCount: 0), "not available")
    }

    func testReadablePreviewKeepsWordsInsteadOfMiniatureClippingAndPadding() {
        let line = "Mara counts the stars twice before she notices that one of them is a nail."
        let page = BackendScreenplayPaginationPage(page: 1, startLine: 2, endLine: 3, lineCount: 2, preview: line + "\r\n\r\nThe paint is wet.", estMinutes: nil)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.paginationPreviewLines(for: page, draft: "Wrong source"), [line, "The paint is wet."])
        let fallback = BackendScreenplayPaginationPage(page: 1, startLine: 3, endLine: 5, lineCount: 3, preview: nil, estMinutes: nil)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.paginationPreviewLines(for: fallback, draft: "Title: ASHES\r\n\r\nINT. A - DAY\r\n\r\nZoë waits."), ["INT. A - DAY", "Zoë waits."])
        let empty = ScreenplayStudioDraftPagesPresentation(isRefreshing: false, isDraftEmpty: true, errorText: "", pages: [])
        XCTAssertEqual(empty.summary(selection: nil), "No screenplay pages yet")
        XCTAssertNil(empty.adjacentPage(to: nil, offset: 1))
        XCTAssertTrue(empty.refreshDisabled)
    }

    func testPaginationProjectionPreservesPreviewPrecedenceClippingPaddingAndActiveBounds() {
        let longPreviewLine = String(repeating: "x", count: 45)
        let page = BackendScreenplayPaginationPage(
            page: 2,
            startLine: 8,
            endLine: 14,
            lineCount: 7,
            preview: "  First beat  \r\n\r\n\(longPreviewLine)\rThird beat",
            estMinutes: 1.2
        )

        let lines = ScreenplayStudioDraftToolsPresentationPlanner.paginationThumbnailLines(
            for: page,
            draft: "This fallback must not render.",
            maxLines: 4
        )

        XCTAssertEqual(lines, ["First beat", String(repeating: "x", count: 36), "Third beat", ""])
        XCTAssertFalse(
            ScreenplayStudioDraftToolsPresentationPlanner.isPaginationPageActive(page, cursorLine: 7)
        )
        XCTAssertTrue(
            ScreenplayStudioDraftToolsPresentationPlanner.isPaginationPageActive(page, cursorLine: 8)
        )
        XCTAssertTrue(
            ScreenplayStudioDraftToolsPresentationPlanner.isPaginationPageActive(page, cursorLine: 14)
        )
        XCTAssertFalse(
            ScreenplayStudioDraftToolsPresentationPlanner.isPaginationPageActive(page, cursorLine: 15)
        )
    }

    func testPaginationProjectionFallsBackToDraftAndClampsLineBounds() {
        let longDraftLine = String(repeating: "y", count: 48)
        let page = BackendScreenplayPaginationPage(
            page: 1,
            startLine: 2,
            endLine: 99,
            lineCount: 3,
            preview: "  \r\n",
            estMinutes: nil
        )
        let draft = "FIRST\r\n\(longDraftLine)\r\n\r\nLAST"

        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.paginationThumbnailLines(
                for: page,
                draft: draft,
                maxLines: 5
            ),
            [String(repeating: "y", count: 40), "", "LAST", "", ""]
        )

        let outOfRangePage = BackendScreenplayPaginationPage(
            page: 3,
            startLine: 99,
            endLine: 100,
            lineCount: 0,
            preview: nil,
            estMinutes: nil
        )
        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.paginationThumbnailLines(
                for: outOfRangePage,
                draft: draft,
                maxLines: 3
            ),
            ["", "", ""]
        )
    }

    func testSnapshotProjectionOrdersCapsAndPreservesRestoreRules() throws {
        var versions = (1...12).map { index in
            makeVersion(
                id: "version-\(index)",
                phase: index == 12 ? "studio_snapshot" : nil,
                createdAt: TimeInterval(index),
                updatedAt: nil,
                notes: nil,
                draft: "Draft \(index)"
            )
        }
        versions[0] = makeVersion(
            id: "updated-latest",
            phase: nil,
            createdAt: 1,
            updatedAt: 100,
            notes: "  keeper note  ",
            draft: "Saved draft"
        )

        let ordered = ScreenplayStudioDraftToolsPresentationPlanner.orderedSnapshotVersions(versions)

        XCTAssertEqual(ordered.count, 10)
        XCTAssertEqual(ordered.first?.id, "updated-latest")
        XCTAssertEqual(ordered.dropFirst().first?.id, "version-12")
        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.snapshotPhaseTitle(try XCTUnwrap(ordered.first)),
            "Draft"
        )
        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.snapshotPhaseTitle(versions[11]),
            "Studio Snapshot"
        )
        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.snapshotNotes(try XCTUnwrap(ordered.first)),
            "  keeper note  "
        )
        XCTAssertTrue(
            ScreenplayStudioDraftToolsPresentationPlanner.snapshotCanRestore(try XCTUnwrap(ordered.first))
        )

        let blank = makeVersion(
            id: "blank",
            phase: "draft",
            createdAt: 0,
            updatedAt: nil,
            notes: "   ",
            draft: " \n "
        )
        XCTAssertNil(ScreenplayStudioDraftToolsPresentationPlanner.snapshotNotes(blank))
        XCTAssertFalse(ScreenplayStudioDraftToolsPresentationPlanner.snapshotCanRestore(blank))
    }

    func testWarningIntegrityRefreshAndRevisionPresentationRulesRemainExact() {
        let lintCard = ScreenplayFormatLintCard(
            id: "lint-1",
            rule: "scene_heading",
            severity: "medium",
            message: "Heading needs a location.",
            suggestion: nil,
            excerpt: nil,
            line: 4,
            page: 1,
            rangeStart: nil,
            rangeEnd: nil
        )
        XCTAssertFalse(
            ScreenplayStudioDraftFormatPresentation(
                cards: [],
                isLoading: false,
                errorText: "   ",
                sourceText: "Document"
            ).shouldShow
        )
        XCTAssertTrue(
            ScreenplayStudioDraftFormatPresentation(
                cards: [],
                isLoading: true,
                errorText: "",
                sourceText: ""
            ).shouldShow
        )
        XCTAssertTrue(
            ScreenplayStudioDraftFormatPresentation(
                cards: [lintCard],
                isLoading: false,
                errorText: "",
                sourceText: ""
            ).shouldShow
        )

        let document = ScreenplayStudioDraftDocumentPresentation(
            isSaving: false,
            exportItems: [],
            autosaveStatusText: "",
            exportFormatsErrorText: "Format service unavailable.",
            pdfUnavailableText: "PDF unavailable."
        )
        XCTAssertEqual(document.statusText, ScreenplayStudioDraftDocumentPresentation.fallbackStatusText)
        XCTAssertEqual(document.statusSystemImage, "icloud")
        XCTAssertFalse(document.statusIsConfirmed)
        XCTAssertEqual(document.notice, .warning("Format service unavailable."))

        let savedDocument = ScreenplayStudioDraftDocumentPresentation(
            isSaving: false,
            exportItems: [],
            autosaveStatusText: "Autosaved",
            exportFormatsErrorText: "",
            pdfUnavailableText: ""
        )
        XCTAssertEqual(savedDocument.statusSystemImage, "checkmark.circle.fill")
        XCTAssertTrue(savedDocument.statusIsConfirmed)

        let pendingDocument = ScreenplayStudioDraftDocumentPresentation(
            isSaving: false,
            exportItems: [],
            autosaveStatusText: "Sync pending",
            exportFormatsErrorText: "",
            pdfUnavailableText: ""
        )
        XCTAssertEqual(pendingDocument.statusSystemImage, "clock.badge.exclamationmark")
        XCTAssertFalse(pendingDocument.statusIsConfirmed)

        let savingDocument = ScreenplayStudioDraftDocumentPresentation(
            isSaving: true,
            exportItems: [],
            autosaveStatusText: "Autosaved",
            exportFormatsErrorText: "",
            pdfUnavailableText: ""
        )
        XCTAssertEqual(savingDocument.statusSystemImage, "arrow.triangle.2.circlepath")
        XCTAssertFalse(savingDocument.statusIsConfirmed)

        let questions = (1...5).map { "Can you help with block \($0)?" }.joined(separator: "\n\n")
        let issues = FountainFormatter.screenplayIntegrityIssues(in: questions)
        XCTAssertEqual(issues.count, 5)
        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.visibleIntegrityIssues(issues).count,
            4
        )
        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.integrityTitle(issueCount: 1),
            "1 non-screenplay block detected"
        )
        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.integrityTitle(issueCount: 5),
            "5 non-screenplay blocks detected"
        )

        XCTAssertFalse(
            ScreenplayStudioDraftPagesPresentation(
                isRefreshing: false,
                isDraftEmpty: false,
                errorText: "",
                pages: []
            ).refreshDisabled
        )
        XCTAssertTrue(
            ScreenplayStudioDraftRevisionPresentation(
                isRefreshing: false,
                isDraftEmpty: true,
                errorText: "",
                summary: nil,
                ranges: []
            ).refreshDisabled
        )

        let ranges = (1...8).map { index in
            BackendScreenplayRevisionRange(
                startLine: index,
                endLine: index,
                status: "revised",
                color: "blue"
            )
        }
        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.visibleRevisionRanges(ranges).map(\.startLine),
            [1, 2, 3, 4, 5, 6]
        )
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "blue"), .blue)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "pink"), .pink)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "yellow"), .yellow)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "green"), .green)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "goldenrod"), .orange)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "salmon"), .red)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "cherry"), .red)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "buff"), .brown)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "tan"), .brown)
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: "unknown"), .neutral)
    }

    private func makeVersion(
        id: String,
        phase: String?,
        createdAt: TimeInterval?,
        updatedAt: TimeInterval?,
        notes: String?,
        draft: String?
    ) -> BackendScreenplayVersion {
        BackendScreenplayVersion(
            id: id,
            projectId: "project-1",
            phase: phase,
            source: nil,
            clientRequestId: nil,
            createdAt: createdAt,
            updatedAt: updatedAt,
            prompt: nil,
            notes: notes,
            formatScore: nil,
            storyScore: nil,
            confidenceClass: nil,
            warnings: nil,
            draft: draft,
            draftExcerpt: nil,
            studioWriteAnchors: nil,
            screenplayBindings: nil
        )
    }
}
