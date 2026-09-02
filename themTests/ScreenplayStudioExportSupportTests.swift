import XCTest
@testable import them

final class ScreenplayStudioExportSupportTests: XCTestCase {
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
