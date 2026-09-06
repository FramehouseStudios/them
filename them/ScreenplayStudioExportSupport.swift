import Foundation
import SwiftUI
import Combine
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Studio export *actions* (artifact build, save, Google Docs handoff).
/// Menu format *policy* stays in `ScreenplayExportFormatMenu`.
enum ScreenplayStudioExportSupport {
    struct GoogleDocsShareError: Error, Equatable, LocalizedError {
        let message: String

        var errorDescription: String? { message }
    }

    struct Dependencies {
        var draft: String
        var projectTitle: String?
        var navigatorCurrentURL: URL?
        var refreshFormatLint: (String) async -> Void
        var exportFromBackend: (String) async throws -> BackendScreenplayExportArtifact
        var setInfo: (String) -> Void
        var setError: (String) -> Void
        var noteSavedDirectory: (URL) -> Void
        var isCurrentContext: () -> Bool
        var copyToClipboard: (String) -> Bool
        var openURL: (URL, @escaping (Bool) -> Void) -> Void
    }

    nonisolated static func preferredExportDirectoryURL(navigatorCurrentURL: URL?) -> URL? {
        if let navigatorCurrentURL {
            return navigatorCurrentURL
        }
        let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first
        if let desktop {
            return desktop
        }
        return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    }

    nonisolated static func savedInfoText(filename: String, savedURL: URL) -> String {
        let folderName = savedURL.deletingLastPathComponent().lastPathComponent
        if folderName.isEmpty {
            return "\(filename) saved."
        }
        return "Saved \(filename) to \(folderName)."
    }

    nonisolated static func googleDocsSharePayload(
        draft: String
    ) -> Result<(clipboardText: String, url: URL), GoogleDocsShareError> {
        let clean = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            return .failure(GoogleDocsShareError(message: "Draft is empty."))
        }
        guard let url = URL(string: "https://docs.new") else {
            return .failure(GoogleDocsShareError(message: "Could not open Google Docs."))
        }
        // Validate whitespace without discarding any of the writer's text.
        return .success((clipboardText: draft, url: url))
    }

    @MainActor
    static func copyDraftToClipboard(_ draft: String) -> Bool {
#if os(macOS)
        NSPasteboard.general.clearContents()
        return NSPasteboard.general.setString(draft, forType: .string)
#else
        return copyDraftToClipboard(draft, to: .general)
#endif
    }

#if !os(macOS)
    @MainActor
    static func copyDraftToClipboard(_ draft: String, to pasteboard: UIPasteboard) -> Bool {
        // This is a deliberate copy action, not an upload or a cross-device handoff.
        // A supplied app pasteboard lets tests exercise UIKit without reading or
        // replacing the writer's unrelated system clipboard contents.
        pasteboard.setObjects([draft as NSString], localOnly: true, expirationDate: nil)
        return true
    }
#endif

#if os(macOS)
    nonisolated static func makeLocalArtifact(
        draft: String,
        title: String?,
        format: String
    ) throws -> BackendScreenplayExportArtifact {
        let resolvedTitle = (title ?? "screenplay")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return try ScreenplayLocalExport.makeArtifact(
            draft: draft,
            title: resolvedTitle,
            format: format
        )
    }
    @MainActor
    static func writeExportArtifact(
        _ artifact: BackendScreenplayExportArtifact,
        preferredDirectoryURL: URL?,
        noteSavedDirectory: (URL) -> Void
    ) throws -> URL? {
        let savePanel = NSSavePanel()
        savePanel.title = "Save Screenplay Export"
        savePanel.nameFieldStringValue = artifact.filename
        savePanel.canCreateDirectories = true
        savePanel.isExtensionHidden = false
        savePanel.directoryURL = preferredDirectoryURL
        savePanel.allowedContentTypes = [ScreenplayLocalExport.allowedContentType(for: artifact)]
        let accepted = savePanel.runModal()
        guard accepted == .OK, let destinationURL = savePanel.url else { return nil }
        try artifact.data.write(to: destinationURL, options: .atomic)
        noteSavedDirectory(destinationURL.deletingLastPathComponent())
        return destinationURL
    }
#endif

    @MainActor
    static func exportCurrentDraft(
        format: String,
        deps: Dependencies,
        presentArtifact: (BackendScreenplayExportArtifact) -> Void
    ) async {
        guard deps.isCurrentContext(), !Task.isCancelled else { return }
        Task { await deps.refreshFormatLint("Export " + format.uppercased()) }
        deps.setError("")
        deps.setInfo("Preparing export…")
        do {
            let artifact: BackendScreenplayExportArtifact
#if os(macOS)
            artifact = try makeLocalArtifact(
                draft: deps.draft,
                title: deps.projectTitle,
                format: format
            )
#else
            // UI tests use the same backend path. Tests can inject an artifact provider.
            artifact = try await deps.exportFromBackend(format)
#endif
            guard deps.isCurrentContext(), !Task.isCancelled else { return }
#if os(macOS)
            let savedURL = try writeExportArtifact(
                artifact,
                preferredDirectoryURL: preferredExportDirectoryURL(
                    navigatorCurrentURL: deps.navigatorCurrentURL
                ),
                noteSavedDirectory: deps.noteSavedDirectory
            )
            if let savedURL {
                deps.setInfo(savedInfoText(filename: savedURL.lastPathComponent, savedURL: savedURL))
            } else {
                deps.setInfo("Export cancelled.")
            }
#else
            presentArtifact(artifact)
#endif
        } catch {
            guard deps.isCurrentContext(), !Task.isCancelled else { return }
            deps.setInfo("")
            deps.setError(ScreenplayExportFormatMenu.displayMessage(for: error, format: format))
        }
    }

    @MainActor
    static func openInGoogleDocs(deps: Dependencies) {
        guard deps.isCurrentContext() else { return }
        switch googleDocsSharePayload(draft: deps.draft) {
        case .failure(let error):
            deps.setError(error.localizedDescription)
        case .success(let payload):
            guard deps.copyToClipboard(payload.clipboardText) else {
                deps.setError("Could not copy the draft. Google Docs was not opened.")
                return
            }
            deps.setError("")
            deps.setInfo("Draft copied to clipboard. Opening Google Docs…")
            deps.openURL(payload.url) { accepted in
                guard deps.isCurrentContext() else { return }
                if accepted {
                    deps.setInfo("Draft copied to clipboard. Paste it into the new Google Doc.")
                } else {
                    deps.setInfo("Draft copied to clipboard. Paste it into Google Docs when you open it.")
                    deps.setError("Could not open Google Docs. Your draft is still on the clipboard.")
                }
            }
        }
    }
}

/// The system Files picker writes the exact backend artifact, without re-encoding its contents.
nonisolated struct ScreenplayStudioExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.data] }
    let data: Data
    let filename: String
    let contentType: UTType

    init(artifact: BackendScreenplayExportArtifact) {
        data = artifact.data
        let basename = (artifact.filename.replacingOccurrences(of: "\\", with: "/") as NSString).lastPathComponent
        let safeName = basename.components(separatedBy: .controlCharacters).joined()
        filename = safeName.isEmpty || safeName == "." || safeName == ".." ? "screenplay" : safeName
        contentType = UTType(filenameExtension: (filename as NSString).pathExtension, conformingTo: .data)
            ?? UTType(mimeType: artifact.contentType.components(separatedBy: ";")[0], conformingTo: .data)
            ?? .data
    }

    init(configuration: ReadConfiguration) throws {
        guard let bytes = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        data = bytes
        filename = configuration.file.preferredFilename ?? "screenplay"
        contentType = configuration.contentType
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        makeFileWrapper()
    }

    func makeFileWrapper() -> FileWrapper {
        let wrapper = FileWrapper(regularFileWithContents: data)
        wrapper.preferredFilename = filename
        return wrapper
    }
}

/// One export owns preparation and the Files picker until it succeeds, fails, or is cancelled.
@MainActor
final class ScreenplayStudioExportCoordinator: ObservableObject {
    @Published var isPresented = false
    @Published private(set) var document: ScreenplayStudioExportDocument?
    @Published private(set) var requestID: UUID?
    private var pendingDependencies: ScreenplayStudioExportSupport.Dependencies?

    func export(format: String, deps: ScreenplayStudioExportSupport.Dependencies) async {
        guard deps.isCurrentContext() else { return }
        invalidateIfContextChanged()
        guard requestID == nil else {
            deps.setError("Finish or cancel the current export before starting another.")
            return
        }
        let id = UUID()
        requestID = id
        pendingDependencies = deps
        var ownedDependencies = deps
        ownedDependencies.isCurrentContext = { [weak self] in
            self?.requestID == id && deps.isCurrentContext()
        }
        await ScreenplayStudioExportSupport.exportCurrentDraft(format: format, deps: ownedDependencies) { [weak self] artifact in
            guard let self, self.requestID == id, deps.isCurrentContext() else { return }
            let document = ScreenplayStudioExportDocument(artifact: artifact)
            self.document = document
            deps.setInfo("Choose where to save \(document.filename).")
            self.isPresented = true
        }
        if requestID == id, !isPresented { invalidate() }
    }

    func complete(_ result: Result<URL, Error>, requestID completedID: UUID?) {
        guard let completedID, requestID == completedID, let deps = pendingDependencies else { return }
        defer { invalidate() }
        guard deps.isCurrentContext() else { return }
        switch result {
        case .success(let url):
            deps.setError("")
            deps.setInfo(ScreenplayStudioExportSupport.savedInfoText(filename: url.lastPathComponent, savedURL: url))
        case .failure(let error):
            deps.setInfo("")
            deps.setError("Could not save the export: \(error.localizedDescription)")
        }
    }

    func cancel(requestID cancelledID: UUID?) {
        guard let cancelledID, requestID == cancelledID, let deps = pendingDependencies else { return }
        if deps.isCurrentContext() {
            deps.setError("")
            deps.setInfo("Export cancelled.")
        }
        invalidate()
    }

    func invalidateIfContextChanged() {
        if let deps = pendingDependencies, !deps.isCurrentContext() { invalidate() }
    }

    func studioDidDisappear() {
        // Presenting the system Files picker can hide Studio. Keep that deliberate
        // handoff alive, but never open a late picker after the writer leaves Studio.
        guard !isPresented else { return }
        cancel(requestID: requestID)
    }

    func invalidate() {
        isPresented = false
        document = nil
        requestID = nil
        pendingDependencies = nil
    }
}

struct ScreenplayStudioExportPresentation: ViewModifier {
    @ObservedObject var coordinator: ScreenplayStudioExportCoordinator

    func body(content: Content) -> some View {
        let requestID = coordinator.requestID
        content
#if !os(macOS)
            .fileExporter(
                isPresented: $coordinator.isPresented,
                document: coordinator.document,
                contentTypes: [coordinator.document?.contentType ?? .data],
                defaultFilename: coordinator.document?.filename,
                onCompletion: { coordinator.complete($0, requestID: requestID) },
                onCancellation: { coordinator.cancel(requestID: requestID) }
            )
#endif
            .onDisappear { coordinator.studioDidDisappear() }
            .onReceive(NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged).receive(on: RunLoop.main)) { _ in
                coordinator.invalidateIfContextChanged()
            }
            .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification).receive(on: RunLoop.main)) { _ in
                coordinator.invalidateIfContextChanged()
            }
    }
}
