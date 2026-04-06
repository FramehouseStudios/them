import XCTest
@testable import them

@MainActor
final class StudioThreadViewStateSupportTests: XCTestCase {
    func testLegacyDecodeDefaultsMissingReopenedFields() throws {
        let payload = """
        {
          \"searchText\": \"legacy search\",
          \"selectedFilterRaw\": \"pageWrites\",
          \"selectedSceneKey\": \"scene:legacy\",
          \"scrollTargetKey\": \"thread:legacy\",
          \"collapsedSectionKeys\": [\"scene:legacy\"],
          \"focusedDiffKey\": \"thread:legacy\"
        }
        """

        let decoded = try XCTUnwrap(
            try? JSONDecoder().decode(
                StudioFullThreadBrowseState.self,
                from: Data(payload.utf8)
            )
        )

        XCTAssertEqual(decoded.searchText, "legacy search")
        XCTAssertEqual(decoded.selectedFilterRaw, "pageWrites")
        XCTAssertEqual(decoded.selectedSceneKey, "scene:legacy")
        XCTAssertEqual(decoded.scrollTargetKey, "thread:legacy")
        XCTAssertEqual(decoded.collapsedSectionKeys, ["scene:legacy"])
        XCTAssertEqual(decoded.focusedDiffKey, "thread:legacy")
        XCTAssertEqual(decoded.reopenedLineageKeys, [])
        XCTAssertEqual(decoded.latestReopenedWriteID, "")
    }

    func testResolvePrefersLocalMeaningfulValuesAndFallsBackToBackend() throws {
        let backend = StudioFullThreadBrowseState(
            searchText: "backend search",
            selectedFilterRaw: "voicePin",
            selectedSceneKey: "scene:backend",
            scrollTargetKey: "thread:backend",
            collapsedSectionKeys: ["scene:backend"],
            focusedDiffKey: "thread:backend",
            reopenedLineageKeys: ["lineage:backend"],
            latestReopenedWriteID: "write-backend"
        )
        let local = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: "pageWrites",
            selectedSceneKey: "",
            scrollTargetKey: "thread:local",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:local",
            reopenedLineageKeys: ["lineage:local"],
            latestReopenedWriteID: "write-local"
        )

        let result = StudioFullThreadBrowseStateRestoreResult.resolve(local: local, backend: backend)
        let record = try XCTUnwrap(result.record)

        XCTAssertEqual(record.searchText, "backend search")
        XCTAssertEqual(record.selectedFilterRaw, "pageWrites")
        XCTAssertEqual(record.selectedSceneKey, "scene:backend")
        XCTAssertEqual(record.scrollTargetKey, "thread:local")
        XCTAssertEqual(record.collapsedSectionKeys, ["scene:backend"])
        XCTAssertEqual(record.focusedDiffKey, "thread:local")
        XCTAssertEqual(record.reopenedLineageKeys, ["lineage:local"])
        XCTAssertEqual(record.latestReopenedWriteID, "write-local")
        XCTAssertEqual(result.source, .merged)
        XCTAssertEqual(result.focusedDiffSource, .local)
        XCTAssertEqual(result.reopenedSource, .local)
    }

    func testResolveReportsMergedReopenedSourceWhenLocalAndBackendSplitIt() throws {
        let backend = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: "",
            selectedSceneKey: "",
            scrollTargetKey: "",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:backend",
            reopenedLineageKeys: ["lineage:backend"],
            latestReopenedWriteID: "write-backend"
        )
        let local = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: "",
            selectedSceneKey: "",
            scrollTargetKey: "",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:local",
            reopenedLineageKeys: ["lineage:local"],
            latestReopenedWriteID: ""
        )

        let result = StudioFullThreadBrowseStateRestoreResult.resolve(local: local, backend: backend)
        let record = try XCTUnwrap(result.record)

        XCTAssertEqual(record.focusedDiffKey, "thread:local")
        XCTAssertEqual(record.reopenedLineageKeys, ["lineage:local"])
        XCTAssertEqual(record.latestReopenedWriteID, "write-backend")
        XCTAssertEqual(result.source, .merged)
        XCTAssertEqual(result.focusedDiffSource, .local)
        XCTAssertEqual(result.reopenedSource, .merged)
    }

    func testBackendPayloadNormalizesFocusedAndReopenedKeys() {
        let state = StudioFullThreadBrowseState(
            searchText: " note ",
            selectedFilterRaw: "voicePin",
            selectedSceneKey: " scene:key ",
            scrollTargetKey: " thread:key ",
            collapsedSectionKeys: ["scene:a"],
            focusedDiffKey: " Write:ABC ",
            reopenedLineageKeys: [" Lineage:A ", "", "lineage:b"],
            latestReopenedWriteID: " Write:XYZ "
        )

        let payload = state.backendPayload

        XCTAssertEqual(payload.searchText, " note ")
        XCTAssertEqual(payload.selectedSceneKey, "scene:key")
        XCTAssertEqual(payload.scrollTargetKey, "thread:key")
        XCTAssertEqual(payload.focusedDiffKey, "write:abc")
        XCTAssertEqual(payload.reopenedLineageKeys ?? [], ["lineage:a", "lineage:b"])
        XCTAssertEqual(payload.latestReopenedWriteID, "write:xyz")
    }
}
