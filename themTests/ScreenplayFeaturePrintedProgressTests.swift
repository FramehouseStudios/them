import XCTest
@testable import them

final class ScreenplayFeaturePrintedProgressTests: XCTestCase {
    @MainActor func testFeatureProgressUsesCurrentPrintedPagesNotStaleInspectorOrRawLines() throws {
        let suite = "them.printed-progress.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
        }
        let vm = ScreenplayStudioViewModel(
            localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: directory),
            connectsToLiveWorkspace: false)
        vm.autosaveEnabled = false
        vm.paginationPages = []
        let longAction = String(repeating: "A door opens into another empty room. ", count: 200)
        vm.fountainDraft = longAction
        let wrappedCount = ScreenplayPageLayout.pageCount(for: longAction)
        XCTAssertGreaterThan(wrappedCount, 1)
        XCTAssertEqual(vm.estimatedFeaturePageCount, wrappedCount,
                       "One source line may wrap across multiple printed pages")

        vm.paginationPages = [BackendScreenplayPaginationPage(page: 1, startLine: 1, endLine: 1,
            lineCount: 1, preview: nil, estMinutes: nil)]
        let fullLength = (1...6480).map { "Action line \($0)." }.joined(separator: "\n")
        XCTAssertEqual(ScreenplayPageLayout.pageCount(for: fullLength), 120,
                       "This is a measured layout fixture, not generated story quality")
        vm.fountainDraft = fullLength
        XCTAssertEqual(vm.estimatedFeaturePageCount, 120, "Old inspector pages cannot override new writer text")
        XCTAssertEqual(vm.estimatedFeaturePageCount, 120)
        vm.fountainDraft = "An action."
        XCTAssertEqual(vm.estimatedFeaturePageCount, 1)
        vm.fountainDraft = " \n\t "
        XCTAssertEqual(vm.estimatedFeaturePageCount, 0, "Deleting the script must clear the old page count")
    }
}
