import XCTest
import UniformTypeIdentifiers
#if !os(macOS)
import UIKit
#endif
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

    func testExportDocumentPreservesEveryByteAndOriginalFormat() throws {
        for fixture in [
            artifact,
            BackendScreenplayExportArtifact(format: "pdf", filename: "scene.pdf", contentType: "application/pdf", data: Data([0, 255, 10, 13, 128])),
            BackendScreenplayExportArtifact(format: "fdx", filename: "scene.fdx", contentType: "application/xml", data: Data("<Text>FIRST &amp; é\nLAST 👩🏽‍🚀</Text>".utf8)),
        ] {
            let document = ScreenplayStudioExportDocument(artifact: fixture)
            let wrapper = document.makeFileWrapper()
            XCTAssertEqual(wrapper.regularFileContents, fixture.data)
            XCTAssertEqual(wrapper.preferredFilename, fixture.filename)
            XCTAssertEqual(document.filename, fixture.filename)
            XCTAssertTrue(document.contentType.conforms(to: .data))
        }
    }

    func testExportDocumentStripsPathsButDoesNotChangeArtifactBytes() {
        let fixture = BackendScreenplayExportArtifact(
            format: "md", filename: "../../private\\scene\n.md", contentType: "text/markdown", data: artifact.data
        )
        let document = ScreenplayStudioExportDocument(artifact: fixture)
        XCTAssertEqual(document.filename, "scene.md")
        XCTAssertEqual(document.makeFileWrapper().regularFileContents, fixture.data)
    }

    func testFileWrapperWritesCompleteArtifactToChosenLocation() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("studio-export-test-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let destination = directory.appendingPathComponent(artifact.filename)
        try ScreenplayStudioExportDocument(artifact: artifact).makeFileWrapper().write(to: destination, options: .atomic, originalContentsURL: nil)
        XCTAssertEqual(try Data(contentsOf: destination), artifact.data)
    }

    func testGoogleDocsCopiesCompleteDraftBeforeOpeningAndDoesNotClaimUpload() {
        let recorder = Recorder()
        let draft = "\n  INT. ROOM — DAY\n\nÉLODIE\nHello 👩🏽‍🚀.\n\nTHE END\n"
        var deps = dependencies(recorder)
        deps.draft = draft
        var events: [String] = []
        deps.copyToClipboard = { text in
            XCTAssertEqual(text, draft)
            events.append("copy")
            return true
        }
        deps.openURL = { url, completion in
            XCTAssertEqual(url.absoluteString, "https://docs.new")
            events.append("open")
            completion(true)
        }
        ScreenplayStudioExportSupport.openInGoogleDocs(deps: deps)
        XCTAssertEqual(events, ["copy", "open"])
        XCTAssertEqual(recorder.info.last, "Draft copied to clipboard. Paste it into the new Google Doc.")
        XCTAssertEqual(recorder.errors.last, "")
    }

    func testGoogleDocsFailedOpenStillTruthfullyReportsSuccessfulCopy() {
        let recorder = Recorder()
        var deps = dependencies(recorder)
        deps.openURL = { _, completion in completion(false) }
        ScreenplayStudioExportSupport.openInGoogleDocs(deps: deps)
        XCTAssertEqual(recorder.errors.last, "Could not open Google Docs. Your draft is still on the clipboard.")
        XCTAssertEqual(recorder.info.last, "Draft copied to clipboard. Paste it into Google Docs when you open it.")
    }

    func testGoogleDocsFailedCopyDoesNotOpenBrowser() {
        let recorder = Recorder()
        var deps = dependencies(recorder)
        deps.copyToClipboard = { _ in false }
        deps.openURL = { _, _ in XCTFail("Do not open a blank document after failed copy") }
        ScreenplayStudioExportSupport.openInGoogleDocs(deps: deps)
        XCTAssertEqual(recorder.errors.last, "Could not copy the draft. Google Docs was not opened.")
        XCTAssertTrue(recorder.info.isEmpty)
    }

    func testGoogleDocsEmptyDraftDoesNotTouchClipboardOrOpenBrowser() {
        let recorder = Recorder()
        var deps = dependencies(recorder)
        deps.draft = " \n "
        deps.copyToClipboard = { _ in XCTFail("Must preserve clipboard for an empty draft"); return false }
        deps.openURL = { _, _ in XCTFail("Must not open browser for an empty draft") }
        ScreenplayStudioExportSupport.openInGoogleDocs(deps: deps)
        XCTAssertEqual(recorder.errors.last, "Draft is empty.")
    }

    func testGoogleDocsLateOpenCallbackCannotPublishIntoAnotherContext() {
        let recorder = Recorder()
        var deps = dependencies(recorder)
        var callback: ((Bool) -> Void)?
        deps.openURL = { _, completion in callback = completion }
        ScreenplayStudioExportSupport.openInGoogleDocs(deps: deps)
        let previousInfo = recorder.info
        recorder.isCurrent = false
        callback?(true)
        XCTAssertEqual(recorder.info, previousInfo)
    }

#if !os(macOS)
    func testIPhoneClipboardReceivesTheEntireDraft() throws {
        // Own this real UIKit pasteboard; never request paste permission for, or
        // overwrite, clipboard contents placed there by another app or the user.
        let pasteboard = UIPasteboard.withUniqueName()
        defer { UIPasteboard.remove(withName: pasteboard.name) }
        let draft = "\n  INT. ROOM — DAY\r\n\nÉLODIE\nHello 👩🏽‍🚀. Cafe\u{301}.\n\nLAST LINE\n"
        XCTAssertTrue(ScreenplayStudioExportSupport.copyDraftToClipboard(draft, to: pasteboard))
        let copiedDraft = try XCTUnwrap(pasteboard.string)
        XCTAssertEqual(copiedDraft, draft)
        // Swift String equality permits Unicode normalization; the bytes must
        // also preserve the writer's original combining characters and spacing.
        XCTAssertEqual(Data(copiedDraft.utf8), Data(draft.utf8))
    }

    func testIPhoneClipboardCopyReplacesOnlyTheChosenPasteboard() throws {
        let pasteboard = UIPasteboard.withUniqueName()
        let otherPasteboard = UIPasteboard.withUniqueName()
        defer {
            UIPasteboard.remove(withName: pasteboard.name)
            UIPasteboard.remove(withName: otherPasteboard.name)
        }
        pasteboard.string = "Previous copy from this test"
        otherPasteboard.string = "Unrelated test-owned clipboard"
        let draft = "FIRST LINE\n\nLAST LINE\n"

        XCTAssertTrue(ScreenplayStudioExportSupport.copyDraftToClipboard(draft, to: pasteboard))

        XCTAssertEqual(pasteboard.numberOfItems, 1)
        XCTAssertEqual(Data(try XCTUnwrap(pasteboard.string).utf8), Data(draft.utf8))
        XCTAssertEqual(otherPasteboard.string, "Unrelated test-owned clipboard")
    }

    func testExportUsesBackendBytesWithoutPrematureSavedMessage() async throws {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        await coordinator.export(format: "md", deps: dependencies(recorder))
        XCTAssertEqual(recorder.requestedFormats, ["md"])
        XCTAssertTrue(coordinator.isPresented)
        XCTAssertEqual(try XCTUnwrap(coordinator.document).makeFileWrapper().regularFileContents, artifact.data)
        XCTAssertEqual(recorder.info.last, "Choose where to save complete-scene.md.")
        XCTAssertFalse(recorder.info.contains { $0.hasPrefix("Saved ") })
    }

    func testExportSuccessUsesActualChosenFilenameAndFolder() async {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        await coordinator.export(format: "md", deps: dependencies(recorder))
        // SwiftUI dismisses the picker binding before delivering its result.
        coordinator.isPresented = false
        coordinator.complete(.success(URL(fileURLWithPath: "/chosen/My Scripts/renamed.md")), requestID: coordinator.requestID)
        XCTAssertEqual(recorder.info.last, "Saved renamed.md to My Scripts.")
        XCTAssertNil(coordinator.document)
        XCTAssertNil(coordinator.requestID)
    }

    func testExportCancellationIsNotSuccessAndAllowsAnotherExport() async {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        await coordinator.export(format: "md", deps: dependencies(recorder))
        coordinator.isPresented = false
        coordinator.cancel(requestID: coordinator.requestID)
        XCTAssertEqual(recorder.info.last, "Export cancelled.")
        XCTAssertNil(coordinator.document)
        await coordinator.export(format: "fdx", deps: dependencies(recorder))
        XCTAssertEqual(recorder.requestedFormats, ["md", "fdx"])
        XCTAssertTrue(coordinator.isPresented)
        XCTAssertFalse(recorder.info.contains { $0.hasPrefix("Saved ") })
    }

    func testSaveFailureIsNotSuccessAndReleasesArtifact() async {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        await coordinator.export(format: "md", deps: dependencies(recorder))
        coordinator.complete(.failure(CocoaError(.fileWriteNoPermission)), requestID: coordinator.requestID)
        XCTAssertTrue(recorder.errors.last?.hasPrefix("Could not save the export: ") == true)
        XCTAssertEqual(recorder.info.last, "")
        XCTAssertNil(coordinator.document)
        XCTAssertNil(coordinator.requestID)
    }

    func testBackendFailureDoesNotOpenFilesOrReportSaved() async {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        var deps = dependencies(recorder)
        deps.exportFromBackend = { _ in throw URLError(.cannotConnectToHost) }
        await coordinator.export(format: "md", deps: deps)
        XCTAssertFalse(coordinator.isPresented)
        XCTAssertNil(coordinator.document)
        XCTAssertFalse(recorder.errors.last?.isEmpty ?? true)
        XCTAssertFalse(recorder.info.contains { $0.hasPrefix("Saved ") })
    }

    func testLateArtifactCannotOpenFilesAfterOwnerOrProjectChanges() async throws {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        let started = expectation(description: "Backend request started")
        var continuation: CheckedContinuation<BackendScreenplayExportArtifact, Error>?
        var deps = dependencies(recorder)
        deps.exportFromBackend = { _ in
            try await withCheckedThrowingContinuation {
                continuation = $0
                started.fulfill()
            }
        }
        let operation = Task { await coordinator.export(format: "md", deps: deps) }
        await fulfillment(of: [started], timeout: 2)
        recorder.isCurrent = false
        coordinator.invalidateIfContextChanged()
        try XCTUnwrap(continuation).resume(returning: artifact)
        await operation.value
        XCTAssertFalse(coordinator.isPresented)
        XCTAssertNil(coordinator.document)
        XCTAssertNil(coordinator.requestID)
        XCTAssertFalse(recorder.info.contains { $0.hasPrefix("Choose ") || $0.hasPrefix("Saved ") })
    }

    func testDuplicateExportAndStalePickerCallbacksCannotReplaceCurrentArtifact() async throws {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        await coordinator.export(format: "md", deps: dependencies(recorder))
        let firstID = try XCTUnwrap(coordinator.requestID)
        await coordinator.export(format: "fdx", deps: dependencies(recorder))
        XCTAssertEqual(recorder.requestedFormats, ["md"])
        XCTAssertEqual(coordinator.requestID, firstID)
        coordinator.cancel(requestID: firstID)
        await coordinator.export(format: "md", deps: dependencies(recorder))
        let secondID = try XCTUnwrap(coordinator.requestID)
        XCTAssertNotEqual(firstID, secondID)
        coordinator.complete(.success(URL(fileURLWithPath: "/old/old.md")), requestID: firstID)
        coordinator.cancel(requestID: firstID)
        XCTAssertEqual(coordinator.requestID, secondID)
        XCTAssertTrue(coordinator.isPresented)
        XCTAssertFalse(recorder.info.contains { $0.hasPrefix("Saved ") })
    }

    func testLeavingStudioDuringPreparationPreventsLatePicker() async throws {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        let started = expectation(description: "Backend request started")
        var continuation: CheckedContinuation<BackendScreenplayExportArtifact, Error>?
        var deps = dependencies(recorder)
        deps.exportFromBackend = { _ in
            try await withCheckedThrowingContinuation {
                continuation = $0
                started.fulfill()
            }
        }
        let operation = Task { await coordinator.export(format: "md", deps: deps) }
        await fulfillment(of: [started], timeout: 2)
        coordinator.studioDidDisappear()
        try XCTUnwrap(continuation).resume(returning: artifact)
        await operation.value
        XCTAssertEqual(recorder.info.last, "Export cancelled.")
        XCTAssertFalse(coordinator.isPresented)
        XCTAssertNil(coordinator.document)
        XCTAssertNil(coordinator.requestID)
    }

    func testFilesPresentationMayHideStudioWithoutCancellingTheExport() async throws {
        let recorder = Recorder()
        let coordinator = ScreenplayStudioExportCoordinator()
        await coordinator.export(format: "md", deps: dependencies(recorder))
        let requestID = try XCTUnwrap(coordinator.requestID)
        coordinator.studioDidDisappear()
        XCTAssertEqual(coordinator.requestID, requestID)
        XCTAssertTrue(coordinator.isPresented)
        XCTAssertEqual(coordinator.document?.data, artifact.data)
        XCTAssertFalse(recorder.info.contains("Export cancelled."))
    }
#endif

    private var artifact: BackendScreenplayExportArtifact {
        BackendScreenplayExportArtifact(
            format: "md", filename: "complete-scene.md", contentType: "text/markdown; charset=utf-8",
            data: Data("# Complete Scene\n\nINT. ROOM — DAY\n\nÉLODIE\nHello 👩🏽‍🚀.\n\nLAST LINE\n".utf8)
        )
    }

    private final class Recorder {
        var info: [String] = []
        var errors: [String] = []
        var requestedFormats: [String] = []
        var isCurrent = true
    }

    private func dependencies(_ recorder: Recorder) -> ScreenplayStudioExportSupport.Dependencies {
        let fixture = artifact
        return ScreenplayStudioExportSupport.Dependencies(
            draft: "INT. ROOM — DAY\n\nÉLODIE\nHello 👩🏽‍🚀.\n\nLAST LINE\n",
            projectTitle: "Complete Scene", navigatorCurrentURL: nil,
            refreshFormatLint: { _ in },
            exportFromBackend: { format in recorder.requestedFormats.append(format); return fixture },
            setInfo: { recorder.info.append($0) },
            setError: { recorder.errors.append($0) },
            noteSavedDirectory: { _ in XCTFail("The iPhone export must use the Files picker, not a silent directory write") },
            isCurrentContext: { recorder.isCurrent },
            copyToClipboard: { _ in true },
            openURL: { _, completion in completion(true) }
        )
    }
}
