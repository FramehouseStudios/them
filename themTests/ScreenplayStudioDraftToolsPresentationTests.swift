import XCTest
import ScreenplayStudio
@testable import them

@MainActor
final class ScreenplayStudioDraftToolsPresentationTests: XCTestCase {
    func testPaginationProjectionFallsBackToFullPreviewLinesAndPreservesActiveBounds() {
        let longPreviewLine = String(repeating: "x", count: 45)
        let page = BackendScreenplayPaginationPage(
            page: 2,
            startLine: 8,
            endLine: 14,
            lineCount: 7,
            preview: "  First beat  \r\n\r\n\(longPreviewLine)\rThird beat",
            estMinutes: 1.2
        )

        let lines = ScreenplayStudioDraftToolsPresentationPlanner.paginationPreviewLines(
            for: page,
            draft: "",
            maxLines: 4
        )

        XCTAssertEqual(lines, ["First beat", longPreviewLine, "Third beat"])
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

        let presentation = ScreenplayStudioPaginationPagePresentation(
            page: page,
            previewLines: ["", "  First beat  ", "   ", "Second beat"],
            isActive: true
        )
        XCTAssertEqual(presentation.visiblePreviewLines, ["First beat", "Second beat"])
    }

    func testPaginationProjectionPrefersActualDraftLinesAndClampsLineBounds() {
        let longDraftLine = String(repeating: "y", count: 48)
        let page = BackendScreenplayPaginationPage(
            page: 1,
            startLine: 2,
            endLine: 99,
            lineCount: 3,
            preview: "Flattened server excerpt must not replace the page lines.",
            estMinutes: nil
        )
        let draft = "FIRST\r\n\(longDraftLine)\r\n\r\nLAST"

        XCTAssertEqual(
            ScreenplayStudioDraftToolsPresentationPlanner.paginationPreviewLines(
                for: page,
                draft: draft,
                maxLines: 5
            ),
            [longDraftLine, "LAST"]
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
            ScreenplayStudioDraftToolsPresentationPlanner.paginationPreviewLines(
                for: outOfRangePage,
                draft: draft,
                maxLines: 3
            ),
            []
        )
        XCTAssertTrue(ScreenplayStudioDraftToolsPresentationPlanner.paginationPreviewLines(
            for: page, draft: draft, maxLines: 0
        ).isEmpty)
    }

    func testPaginationPresentationProvidesCurrentPreviousNextAndRuntimeContext() throws {
        var rows: [ScreenplayStudioPaginationPagePresentation] = []
        for pageNumber in 1...3 {
            let startLine = ((pageNumber - 1) * 10) + 1
            let page = BackendScreenplayPaginationPage(
                page: pageNumber,
                startLine: startLine,
                endLine: pageNumber * 10,
                lineCount: 10,
                preview: "Page \(pageNumber)",
                estMinutes: Double(pageNumber) * 0.5
            )
            rows.append(ScreenplayStudioPaginationPagePresentation(
                page: page,
                previewLines: ["Page \(pageNumber)"],
                isActive: pageNumber == 2
            ))
        }
        let presentation = ScreenplayStudioDraftPagesPresentation(
            isRefreshing: false,
            isDraftEmpty: false,
            errorText: "",
            pages: rows
        )

        XCTAssertEqual(presentation.activePageIndex, 1)
        XCTAssertEqual(presentation.activePage?.page.page, 2)
        XCTAssertEqual(presentation.previousPage?.page, 1)
        XCTAssertEqual(presentation.nextPage?.page, 3)
        XCTAssertEqual(try XCTUnwrap(presentation.estimatedMinutes), 3.0, accuracy: 0.001)

        let noActivePage = ScreenplayStudioDraftPagesPresentation(
            isRefreshing: false,
            isDraftEmpty: false,
            errorText: "",
            pages: rows.map {
                ScreenplayStudioPaginationPagePresentation(
                    page: $0.page,
                    previewLines: $0.previewLines,
                    isActive: false
                )
            }
        )
        XCTAssertNil(noActivePage.activePage)
        XCTAssertNil(noActivePage.previousPage)
        XCTAssertNil(noActivePage.nextPage)

        let rowsWithMissingRuntime = rows.enumerated().map { index, row in
            ScreenplayStudioPaginationPagePresentation(
                page: BackendScreenplayPaginationPage(
                    page: row.page.page,
                    startLine: row.page.startLine,
                    endLine: row.page.endLine,
                    lineCount: row.page.lineCount,
                    preview: row.page.preview,
                    estMinutes: index == 1 ? nil : row.page.estMinutes
                ),
                previewLines: row.previewLines,
                isActive: row.isActive
            )
        }
        let missingRuntimePresentation = ScreenplayStudioDraftPagesPresentation(
            isRefreshing: false,
            isDraftEmpty: false,
            errorText: "",
            pages: rowsWithMissingRuntime
        )
        XCTAssertEqual(
            try XCTUnwrap(missingRuntimePresentation.estimatedMinutes),
            2.0 + (10.0 / 55.0),
            accuracy: 0.001
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
