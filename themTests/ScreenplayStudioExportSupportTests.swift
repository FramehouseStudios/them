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

    func testIPhoneExportSaysWhereTheFileGoesNext() {
        // 2026-09-30: "Saved script.fdx to tmp." with no way to reach the file.
        let text = ScreenplayStudioExportSupport.sharedInfoText(filename: "Sine_Die.fdx")
        XCTAssertTrue(text.contains("Sine_Die.fdx"), "the writer-loop UI test looks for the filename")
        XCTAssertFalse(text.lowercased().contains("tmp"))
    }

#if !os(macOS)
    @MainActor
    func testRepeatedSameNameExportsKeepEarlierBytes() throws {
        let filename = "Export-Proof-\(UUID().uuidString).md"
        func artifact(_ text: String) -> BackendScreenplayExportArtifact {
            .init(format: "md", filename: filename,
                  contentType: "text/markdown", data: Data(text.utf8))
        }
        let first = try XCTUnwrap(ScreenplayStudioExportSupport.writeExportArtifact(
            artifact("First draft — exact words\n"), preferredDirectoryURL: nil,
            noteSavedDirectory: { _ in }))
        let second = try XCTUnwrap(ScreenplayStudioExportSupport.writeExportArtifact(
            artifact("Second draft — changed words\n"), preferredDirectoryURL: nil,
            noteSavedDirectory: { _ in }))
        defer {
            for url in Set([first, second]) { try? FileManager.default.removeItem(at: url) }
        }
        XCTAssertNotEqual(first, second, "A pending share must keep its own immutable artifact.")
        XCTAssertEqual(try Data(contentsOf: first), Data("First draft — exact words\n".utf8))
        XCTAssertEqual(try Data(contentsOf: second), Data("Second draft — changed words\n".utf8))
        XCTAssertEqual(first.lastPathComponent, filename)
        XCTAssertEqual(second.lastPathComponent, filename)
    }

    @MainActor
    func testExportStatusRequiresAcceptedPresentationAndExactFileBytes() async throws {
        let bytes = Data("INT. ROOM - DAY\n\nMAYA\nMy exact words.\n".utf8)
        for accepts in [false, true] {
            var info = ""
            var error = ""
            var sharedURL: URL?
            let deps = ScreenplayStudioExportSupport.Dependencies(
                draft: "unchanged writer page", projectTitle: "Share Proof",
                navigatorCurrentURL: nil, isRunningUITests: false,
                refreshFormatLint: { _ in },
                exportFromBackend: { format in
                    XCTAssertEqual(format, "md")
                    return .init(format: "md", filename: "Share-Proof.md",
                                 contentType: "text/markdown", data: bytes)
                },
                setInfo: { info = $0 }, setError: { error = $0 },
                noteSavedDirectory: { _ in }, openURL: { _ in },
                presentExportShareSheet: { url in sharedURL = url; return accepts })
            await ScreenplayStudioExportSupport.exportCurrentDraft(format: "md", deps: deps)
            let url = try XCTUnwrap(sharedURL)
            defer { try? FileManager.default.removeItem(at: url) }
            XCTAssertEqual(try Data(contentsOf: url), bytes)
            XCTAssertEqual(url.lastPathComponent, "Share-Proof.md")
            if accepts {
                XCTAssertEqual(info, ScreenplayStudioExportSupport.sharedInfoText(filename: "Share-Proof.md"))
                XCTAssertTrue(error.isEmpty)
            } else {
                XCTAssertTrue(info.isEmpty, "A refused sheet must not report ready-to-share.")
                XCTAssertTrue(error.contains("tap Export Copy again"))
                XCTAssertTrue(error.contains("draft is unchanged"))
            }
        }
    }

    @MainActor
    func testExportRejectsNonLeafAndControlCharacterFilenames() throws {
        let leaf = "Escape-Proof-\(UUID().uuidString).md"
        let escaped = FileManager.default.temporaryDirectory.appendingPathComponent(leaf)
        let unsafeNames = ["", ".", "..", "../" + leaf, "/" + leaf,
                           "folder/" + leaf, "folder\\" + leaf, "line\n" + leaf, "\0" + leaf]
        for name in unsafeNames {
            let artifact = BackendScreenplayExportArtifact(
                format: "md", filename: name, contentType: "text/markdown", data: Data("unsafe".utf8))
            XCTAssertThrowsError(try ScreenplayStudioExportSupport.writeExportArtifact(
                artifact, preferredDirectoryURL: nil, noteSavedDirectory: { _ in }), name)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: escaped.path))
    }
#endif
}
