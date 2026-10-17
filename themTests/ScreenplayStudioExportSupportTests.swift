import XCTest
@testable import them

final class ScreenplayStudioExportSupportTests: XCTestCase {
    func testLiveUITestModesNeverSynthesizeAnExportArtifact() {
        for mode in ["live", "backend", "live-backend", "live-submit", " LIVE "] {
            XCTAssertFalse(ScreenplayStudioExportSupport.shouldUseUITestArtifact(
                arguments: ["--ui-testing", "-studio_debug_submit_transport_mode", mode]))
        }
    }

    func testStubUITestsRemainIsolatedUnlessLiveModeIsExplicit() {
        for mode in ["stub", "structural-quality-stub", "unknown", ""] {
            XCTAssertTrue(ScreenplayStudioExportSupport.shouldUseUITestArtifact(
                arguments: ["--ui-testing", "-studio_debug_submit_transport_mode", mode]))
        }
        XCTAssertTrue(ScreenplayStudioExportSupport.shouldUseUITestArtifact(arguments: ["--ui-testing"]))
        XCTAssertFalse(ScreenplayStudioExportSupport.shouldUseUITestArtifact(arguments: []))
    }

#if DEBUG && !os(macOS)
    @MainActor func testLiveExportCallsBackendAndWritesItsActualBytes() async throws {
        let filename = "Backend Room \(UUID().uuidString).fdx"
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        defer { try? FileManager.default.removeItem(at: destination) }
        let bytes = Data("<FinalDraft><Content>Real encoder output</Content></FinalDraft>".utf8)
        var calledFormats: [String] = [], info = "", error = ""
        var sharedURLs: [URL] = []
        let deps = ScreenplayStudioExportSupport.Dependencies(
            draft: "INT. ROOM - NIGHT\n\nThe actual page.", projectTitle: "Room",
            navigatorCurrentURL: nil, usesUITestArtifact: false,
            refreshFormatLint: { _ in }, exportFromBackend: { format in
                calledFormats.append(format)
                return BackendScreenplayExportArtifact(format: format, filename: filename,
                    contentType: "application/xml", data: bytes)
            }, setInfo: { info = $0 }, setError: { error = $0 },
            noteSavedDirectory: { _ in }, openURL: { _ in },
            presentArtifact: { sharedURLs.append($0) })
        await ScreenplayStudioExportSupport.exportCurrentDraft(format: "fdx", deps: deps)
        XCTAssertEqual(calledFormats, ["fdx"])
        XCTAssertEqual(try Data(contentsOf: destination), bytes)
        XCTAssertEqual(sharedURLs, [destination])
        XCTAssertTrue(info.contains(filename))
        XCTAssertTrue(info.contains("Choose Save to Files"))
        XCTAssertFalse(info.contains("Saved "), "Preparing a temporary file is not a completed external save")
        XCTAssertEqual(error, "")
    }

    @MainActor func testFailedExportNeverPresentsAShareOrReportsSuccess() async {
        var info = "", error = "", sharedURLs: [URL] = []
        let deps = ScreenplayStudioExportSupport.Dependencies(
            draft: "INT. ROOM - NIGHT\n\nWords remain on the page.", projectTitle: "Room",
            navigatorCurrentURL: nil, usesUITestArtifact: false,
            refreshFormatLint: { _ in }, exportFromBackend: { _ in
                throw BackendMemoryAPIError.server(status: 503, message: "Export unavailable")
            }, setInfo: { info = $0 }, setError: { error = $0 },
            noteSavedDirectory: { _ in }, openURL: { _ in },
            presentArtifact: { sharedURLs.append($0) })
        await ScreenplayStudioExportSupport.exportCurrentDraft(format: "fdx", deps: deps)
        XCTAssertTrue(sharedURLs.isEmpty)
        XCTAssertTrue(info.isEmpty)
        XCTAssertFalse(error.isEmpty)
    }
#endif

    func testPreferredExportDirectoryPrefersNavigatorURL() throws {
        let navigator = URL(fileURLWithPath: "/tmp/studio-nav", isDirectory: true)
        let preferred = ScreenplayStudioExportSupport.preferredExportDirectoryURL(
            navigatorCurrentURL: navigator
        )
        XCTAssertEqual(preferred, navigator)
    }

    func testPreferredExportDirectoryFallsBackWithoutNavigator() {
        let preferred = ScreenplayStudioExportSupport.preferredExportDirectoryURL(
            navigatorCurrentURL: nil
        )
        XCTAssertNotNil(preferred)
        let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        XCTAssertTrue(preferred == desktop || preferred == documents)
    }

    func testSavedInfoTextIncludesFolderNameWhenPresent() {
        let url = URL(fileURLWithPath: "/Users/writer/Desktop/script.fdx")
        XCTAssertEqual(
            ScreenplayStudioExportSupport.savedInfoText(filename: "script.fdx", savedURL: url),
            "Saved script.fdx to Desktop."
        )
    }

    func testGoogleDocsShareRejectsEmptyDraft() {
        switch ScreenplayStudioExportSupport.googleDocsSharePayload(draft: "   \n") {
        case .failure(let error):
            XCTAssertEqual(error.message, "Draft is empty.")
        case .success:
            XCTFail("Expected empty draft to fail")
        }
    }

    func testGoogleDocsShareReturnsDocsNewURLAndClipboardText() throws {
        let payload = try ScreenplayStudioExportSupport.googleDocsSharePayload(
            draft: "INT. ROOM - DAY\n\nHello."
        ).get()
        XCTAssertEqual(payload.url.absoluteString, "https://docs.new")
        XCTAssertEqual(payload.clipboardText, "INT. ROOM - DAY\n\nHello.")
    }

#if DEBUG && !os(macOS)
    func testUITestFDXArtifactUsesFirstSceneHeading() throws {
        let artifact = try ScreenplayStudioExportSupport.makeUITestArtifact(
            draft: "INT. KITCHEN - NIGHT\n\nMaya waits.",
            title: "Kitchen Scene!",
            format: "fdx"
        )
        XCTAssertEqual(artifact.format, "fdx")
        XCTAssertEqual(artifact.filename, "Kitchen-Scene.fdx")
        let xml = try XCTUnwrap(String(data: artifact.data, encoding: .utf8))
        XCTAssertTrue(xml.contains("INT. KITCHEN - NIGHT"))
    }

    func testUITestArtifactRejectsEmptyDraft() {
        XCTAssertThrowsError(
            try ScreenplayStudioExportSupport.makeUITestArtifact(
                draft: " ",
                title: "Empty",
                format: "md"
            )
        )
    }
#endif
}
