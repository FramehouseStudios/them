import XCTest
import UniformTypeIdentifiers
@testable import them

@MainActor
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

    func testGoogleDocsHandoffCopiesExactDraftBeforeOpening() {
        let recorder = ExportRecorder()
        let draft = "  INT. CAFÉ — NIGHT\n\nÉlodie waits.  \n"
        var dependencies = exportDependencies(recorder)
        dependencies.draft = draft
        dependencies.copyToClipboard = { copiedDraft in
            recorder.events.append("copy")
            recorder.copiedDrafts.append(copiedDraft)
            return true
        }
        dependencies.openURL = { url, completion in
            recorder.events.append("open")
            recorder.openedURLs.append(url)
            completion(true)
        }

        ScreenplayStudioExportSupport.openInGoogleDocs(deps: dependencies)

        XCTAssertEqual(recorder.events, ["copy", "open"])
        XCTAssertEqual(recorder.copiedDrafts, [draft])
        XCTAssertEqual(recorder.openedURLs.map(\.absoluteString), ["https://docs.new"])
        XCTAssertEqual(recorder.errors.last, "")
        XCTAssertEqual(recorder.info.last, "Draft copied to clipboard. Paste it into the new Google Doc.")
    }

    func testGoogleDocsHandoffDoesNotOpenWhenClipboardCopyFails() {
        let recorder = ExportRecorder()
        var dependencies = exportDependencies(recorder)
        dependencies.copyToClipboard = { _ in false }
        dependencies.openURL = { url, completion in
            recorder.openedURLs.append(url)
            completion(true)
        }

        ScreenplayStudioExportSupport.openInGoogleDocs(deps: dependencies)

        XCTAssertTrue(recorder.openedURLs.isEmpty)
        XCTAssertEqual(recorder.errors.last, "Could not copy the draft. Google Docs was not opened.")
    }

    func testGoogleDocsHandoffReportsOpenFailureWithoutClaimingDataLoss() {
        let recorder = ExportRecorder()
        var dependencies = exportDependencies(recorder)
        dependencies.copyToClipboard = { copiedDraft in
            recorder.copiedDrafts.append(copiedDraft)
            return true
        }
        dependencies.openURL = { url, completion in
            recorder.openedURLs.append(url)
            completion(false)
        }

        ScreenplayStudioExportSupport.openInGoogleDocs(deps: dependencies)

        XCTAssertEqual(recorder.copiedDrafts, [dependencies.draft])
        XCTAssertEqual(recorder.openedURLs.map(\.absoluteString), ["https://docs.new"])
        XCTAssertEqual(recorder.info.last, "Draft copied to clipboard. Paste it into Google Docs when you open it.")
        XCTAssertEqual(recorder.errors.last, "Could not open Google Docs. Your draft is still on the clipboard.")
    }

    func testExportDocumentPreservesBytesFilenameAndDeclaredContentType() {
        let fixtures = [
            BackendScreenplayExportArtifact(
                format: "md",
                filename: "complete-scene.md",
                contentType: "text/markdown; charset=utf-8",
                data: Data("# Scene\n\nÉLODIE 👩🏽‍🚀\n".utf8)
            ),
            BackendScreenplayExportArtifact(
                format: "pdf",
                filename: "complete-scene.pdf",
                contentType: "application/pdf",
                data: Data([0, 255, 10, 13, 128])
            ),
            BackendScreenplayExportArtifact(
                format: "fdx",
                filename: "complete-scene.fdx",
                contentType: "application/xml",
                data: Data("<FinalDraft/>".utf8)
            ),
            BackendScreenplayExportArtifact(
                format: "fountain",
                filename: "complete-scene.fountain",
                contentType: "text/plain",
                data: Data("INT. ROOM - DAY\n".utf8)
            ),
        ]

        for fixture in fixtures {
            let document = ScreenplayStudioExportDocument(artifact: fixture)
            XCTAssertEqual(document.makeFileWrapper().regularFileContents, fixture.data)
            XCTAssertEqual(document.filename, fixture.filename)
            XCTAssertTrue(
                ScreenplayStudioExportDocument.writableContentTypes.contains(document.contentType),
                "The Files exporter must declare \(document.contentType.identifier) writable."
            )
        }
    }

    func testExportDocumentStripsPathsWithoutChangingBytes() {
        let bytes = Data("INT. ROOM - DAY\n".utf8)
        let fixture = BackendScreenplayExportArtifact(
            format: "md",
            filename: "../../private\\scene\n.md",
            contentType: "text/markdown",
            data: bytes
        )
        let document = ScreenplayStudioExportDocument(artifact: fixture)
        XCTAssertEqual(document.filename, "scene.md")
        XCTAssertEqual(document.makeFileWrapper().regularFileContents, bytes)
    }

#if !os(macOS)
    func testIPhoneExportPresentsExactBackendArtifactBeforeClaimingSave() async throws {
        let recorder = ExportRecorder()
        let coordinator = ScreenplayStudioExportCoordinator()

        await coordinator.export(format: "md", deps: exportDependencies(recorder))

        XCTAssertEqual(recorder.requestedFormats, ["md"])
        XCTAssertTrue(coordinator.isPresented)
        XCTAssertEqual(try XCTUnwrap(coordinator.document).makeFileWrapper().regularFileContents, exportArtifact.data)
        XCTAssertEqual(recorder.info.last, "Choose where to save complete-scene.md.")
        XCTAssertFalse(recorder.info.contains { $0.hasPrefix("Saved ") })
    }

    func testIPhoneExportCancellationReleasesCoordinatorForRetry() async {
        let recorder = ExportRecorder()
        let coordinator = ScreenplayStudioExportCoordinator()

        await coordinator.export(format: "md", deps: exportDependencies(recorder))
        coordinator.cancel(requestID: coordinator.requestID)
        await coordinator.export(format: "fdx", deps: exportDependencies(recorder))

        XCTAssertEqual(recorder.requestedFormats, ["md", "fdx"])
        XCTAssertTrue(coordinator.isPresented)
        XCTAssertFalse(recorder.info.contains { $0.hasPrefix("Saved ") })
    }

    func testIPhoneExportIgnoresStalePickerCompletion() async throws {
        let recorder = ExportRecorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        await coordinator.export(format: "md", deps: exportDependencies(recorder))
        let firstID = try XCTUnwrap(coordinator.requestID)
        coordinator.cancel(requestID: firstID)
        await coordinator.export(format: "md", deps: exportDependencies(recorder))
        let secondID = try XCTUnwrap(coordinator.requestID)

        coordinator.complete(.success(URL(fileURLWithPath: "/old/old.md")), requestID: firstID)

        XCTAssertEqual(coordinator.requestID, secondID)
        XCTAssertTrue(coordinator.isPresented)
        XCTAssertFalse(recorder.info.contains { $0.hasPrefix("Saved ") })
    }
#endif

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

    private var exportArtifact: BackendScreenplayExportArtifact {
        BackendScreenplayExportArtifact(
            format: "md",
            filename: "complete-scene.md",
            contentType: "text/markdown; charset=utf-8",
            data: Data("# Complete Scene\n\nINT. ROOM — DAY\n\nLAST LINE\n".utf8)
        )
    }

    private final class ExportRecorder {
        var info: [String] = []
        var errors: [String] = []
        var requestedFormats: [String] = []
        var events: [String] = []
        var copiedDrafts: [String] = []
        var openedURLs: [URL] = []
        var isCurrent = true
    }

    private func exportDependencies(_ recorder: ExportRecorder) -> ScreenplayStudioExportSupport.Dependencies {
        let artifact = exportArtifact
        return ScreenplayStudioExportSupport.Dependencies(
            draft: "INT. ROOM — DAY\n\nLAST LINE\n",
            projectTitle: "Complete Scene",
            navigatorCurrentURL: nil,
            isRunningUITests: true,
            refreshFormatLint: { _ in },
            exportFromBackend: { format in
                recorder.requestedFormats.append(format)
                return artifact
            },
            setInfo: { recorder.info.append($0) },
            setError: { recorder.errors.append($0) },
            noteSavedDirectory: { _ in },
            isCurrentContext: { recorder.isCurrent },
            copyToClipboard: { _ in true },
            openURL: { _, completion in completion(true) }
        )
    }
}
