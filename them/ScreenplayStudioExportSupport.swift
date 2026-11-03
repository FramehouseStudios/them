import Foundation
import SwiftUI
import Combine
import UniformTypeIdentifiers
import OSLog
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
        var isRunningUITests: Bool
        var refreshFormatLint: (String) async -> Void
        var exportFromBackend: (String) async throws -> BackendScreenplayExportArtifact
        var setInfo: (String) -> Void
        var setError: (String) -> Void
        var clearInfoIfEqual: (String) -> Void
        var clearErrorIfEqual: (String) -> Void
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
#endif

#if os(macOS)
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

/// The system Files picker writes the exact backend artifact without re-encoding it.
nonisolated struct ScreenplayStudioExportDocument: FileDocument {
    static let markdownContentType = UTType(filenameExtension: "md") ?? .plainText
    static var readableContentTypes: [UTType] { writableContentTypes }
    static var writableContentTypes: [UTType] { [.data, .plainText, markdownContentType, .pdf, .xml] }

    let data: Data
    let filename: String
    let contentType: UTType

    init(artifact: BackendScreenplayExportArtifact) {
        data = artifact.data
        let basename = (artifact.filename.replacingOccurrences(of: "\\", with: "/") as NSString).lastPathComponent
        let safeName = basename.components(separatedBy: .controlCharacters).joined()
        filename = safeName.isEmpty || safeName == "." || safeName == ".." ? "screenplay" : safeName

        switch artifact.format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "md", "markdown": contentType = Self.markdownContentType
        case "pdf": contentType = .pdf
        case "fdx", "xml": contentType = .xml
        case "fountain", "txt", "text": contentType = .plainText
        default: contentType = .data
        }
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

private final class ScreenplayStudioLiveExportRegistry: @unchecked Sendable {
    nonisolated static let shared = ScreenplayStudioLiveExportRegistry()
    private let lock = NSLock()
    nonisolated(unsafe) private var requestIDs: Set<UUID> = []

    nonisolated init() {}

    nonisolated func register(_ requestID: UUID) {
        lock.lock()
        requestIDs.insert(requestID)
        lock.unlock()
    }

    nonisolated func unregister(_ requestID: UUID) {
        lock.lock()
        requestIDs.remove(requestID)
        lock.unlock()
    }

    nonisolated func snapshot() -> Set<UUID> {
        lock.lock()
        defer { lock.unlock() }
        return requestIDs
    }
}

final class ScreenplayStudioExportStagingLease: @unchecked Sendable {
    let requestID: UUID
    let stagedURL: URL
    private let lock = NSLock()
    nonisolated(unsafe) private var cleaned = false

    @MainActor init(requestID: UUID, stagedURL: URL) {
        self.requestID = requestID
        self.stagedURL = stagedURL
        ScreenplayStudioLiveExportRegistry.shared.register(requestID)
    }

    nonisolated func cleanup() {
        lock.lock()
        guard !cleaned else {
            lock.unlock()
            return
        }
        cleaned = true
        lock.unlock()
        do {
            try FileManager.default.removeItem(at: stagedURL.deletingLastPathComponent())
        } catch {
#if DEBUG
            let request = String(requestID.uuidString.prefix(8))
            Logger(subsystem: "io.them", category: "studio-export")
                .debug("event=staging-cleanup-failed request=\(request, privacy: .public)")
#endif
        }
        ScreenplayStudioLiveExportRegistry.shared.unregister(requestID)
    }

    deinit { cleanup() }
}

/// One export owns preparation and the Files picker until it succeeds, fails, or is cancelled.
@MainActor
final class ScreenplayStudioExportCoordinator: ObservableObject {
#if DEBUG
    private static let diagnosticLogger = Logger(subsystem: "io.them", category: "studio-export")
#endif
    private static let stagingDirectoryName = "io.them.screenplay-export"
    @Published var isPresented = false
    @Published private(set) var document: ScreenplayStudioExportDocument?
    @Published private(set) var stagedURL: URL?
    @Published private(set) var requestID: UUID?
    private(set) var stagingLease: ScreenplayStudioExportStagingLease?
    private var pendingDependencies: ScreenplayStudioExportSupport.Dependencies?
    private var ownedInfoText: String?
    private var ownedErrorText: String?

    func export(format: String, deps: ScreenplayStudioExportSupport.Dependencies) async {
        guard deps.isCurrentContext() else { return }
        invalidateIfContextChanged()
        // Files may dismiss before (or without) an outcome callback. Keep that
        // outcome authoritative until an explicit retry supersedes it. Never
        // retire a still-preparing request or a picker that remains presented.
        if requestID != nil, document != nil, !isPresented {
            invalidate(reason: "dismissed-retry", clearOwnedMessages: true)
        }
        guard requestID == nil else {
            deps.setError("Finish or cancel the current export before starting another.")
            return
        }

        let id = UUID()
        requestID = id
        pendingDependencies = deps
        diagnostic("request-started", requestID: id)
        var ownedDependencies = deps
        ownedDependencies.isCurrentContext = { [weak self] in
            self?.requestID == id && deps.isCurrentContext()
        }
        ownedDependencies.setInfo = { [weak self] text in
            self?.publishInfo(text, deps: deps, requestID: id)
        }
        ownedDependencies.setError = { [weak self] text in
            self?.publishError(text, deps: deps, requestID: id)
        }
        await ScreenplayStudioExportSupport.exportCurrentDraft(
            format: format,
            deps: ownedDependencies
        ) { [weak self] artifact in
            guard let self, self.requestID == id, deps.isCurrentContext() else { return }
            let document = ScreenplayStudioExportDocument(artifact: artifact)
            do {
                let lease = try self.stage(document, requestID: id)
                self.document = document
                self.stagingLease = lease
                self.stagedURL = lease.stagedURL
                self.publishInfo("Choose where to save \(document.filename).", deps: deps, requestID: id)
                self.isPresented = true
                self.diagnostic("picker-presented", requestID: id)
            } catch {
                self.publishInfo("", deps: deps, requestID: id)
                self.publishError("Could not prepare the export for Files: \(error.localizedDescription)", deps: deps, requestID: id)
                self.invalidate(reason: "staging-failed")
            }
        }
        if requestID == id, !isPresented {
            invalidate(reason: "preparation-ended-without-presentation", clearOwnedMessages: true)
        }
    }

    func complete(_ result: Result<URL, Error>, requestID completedID: UUID?) {
        guard let completedID, requestID == completedID, let deps = pendingDependencies else {
            diagnostic("completion-ignored-stale", requestID: completedID)
            return
        }
        diagnostic("completion-received", requestID: completedID)
        defer { invalidate(reason: "completion-settled") }
        guard deps.isCurrentContext() else {
            diagnostic("completion-ignored-context", requestID: completedID)
            clearOwnedMessagesIfCurrent(using: deps)
            return
        }
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
        guard let cancelledID, requestID == cancelledID, let deps = pendingDependencies else {
            diagnostic("cancellation-ignored-stale", requestID: cancelledID)
            return
        }
        diagnostic("cancellation-received", requestID: cancelledID)
        if deps.isCurrentContext() {
            deps.setError("")
            deps.setInfo("Export cancelled.")
        } else {
            clearOwnedMessagesIfCurrent(using: deps)
        }
        invalidate(reason: "cancellation-settled")
    }

    /// A control inside Studio cannot be activated while the native Files
    /// picker is still covering it. Treat a new physical export action as
    /// proof that a prepared picker left the screen, even on runtimes that
    /// deliver neither the cancellation callback nor the binding transition.
    /// Preparing requests have no picker and remain protected from replacement.
    func userReturnedFromNativePickerForRetry() {
        guard requestID != nil, document != nil else { return }
        invalidate(reason: "explicit-retry", clearOwnedMessages: true)
    }

    func presentationBinding(for presentedID: UUID) -> Binding<Bool> {
        Binding(
            get: { self.requestID == presentedID && self.isPresented },
            set: {
                guard self.requestID == presentedID else { return }
                if self.isPresented, !$0 {
                    self.diagnostic("presentation-dismissed", requestID: presentedID)
                }
                self.isPresented = $0
            }
        )
    }

    func invalidateIfContextChanged() {
        if let deps = pendingDependencies, !deps.isCurrentContext() {
            invalidate(reason: "context-changed", clearOwnedMessages: true)
        }
    }

    func studioDidDisappear() {
        // A sheet or picker navigation transition can make the underlying
        // SwiftUI content disappear transiently. Only preparation has no
        // picker-owned staging lease and is safe to retire here. Once staged,
        // the delegate retains the lease through the provider's terminal call.
        guard document == nil else { return }
        invalidate(reason: "owner-disappeared-during-preparation", clearOwnedMessages: true)
    }

    func invalidate(reason: String = "reset", clearOwnedMessages: Bool = false) {
        let invalidatedID = requestID
        if clearOwnedMessages, let deps = pendingDependencies {
            clearOwnedMessagesIfCurrent(using: deps)
        }
        isPresented = false
        document = nil
        stagingLease = nil
        stagedURL = nil
        requestID = nil
        pendingDependencies = nil
        ownedInfoText = nil
        ownedErrorText = nil
        diagnostic("invalidated-\(reason)", requestID: invalidatedID)
    }

    private func stage(
        _ document: ScreenplayStudioExportDocument,
        requestID: UUID
    ) throws -> ScreenplayStudioExportStagingLease {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(Self.stagingDirectoryName, isDirectory: true)
        try FileManager.default.createDirectory(
            at: root,
            withIntermediateDirectories: true,
            attributes: stagingProtectionAttributes
        )
        Self.cleanupCrashLeftovers(
            in: root,
            excluding: ScreenplayStudioLiveExportRegistry.shared.snapshot()
        )
        let directory = root
            .appendingPathComponent(requestID.uuidString, isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: false,
            attributes: stagingProtectionAttributes
        )
        let filename = document.filename
        guard !filename.isEmpty, filename != ".", filename != "..",
              !filename.contains("/"), !filename.contains("\\"),
              (filename as NSString).lastPathComponent == filename else {
            try? FileManager.default.removeItem(at: directory)
            throw CocoaError(.fileWriteInvalidFileName)
        }
        let url = directory.appendingPathComponent(filename, isDirectory: false)
        guard url.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL else {
            try? FileManager.default.removeItem(at: directory)
            throw CocoaError(.fileWriteInvalidFileName)
        }
        var options: Data.WritingOptions = .atomic
#if os(iOS)
        options.insert(.completeFileProtectionUntilFirstUserAuthentication)
#endif
        do {
            try document.data.write(to: url, options: options)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
        diagnostic("artifact-staged", requestID: requestID)
        return ScreenplayStudioExportStagingLease(requestID: requestID, stagedURL: url)
    }

    private var stagingProtectionAttributes: [FileAttributeKey: Any]? {
#if os(iOS)
        [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
#else
        nil
#endif
    }

    static func cleanupCrashLeftovers(
        in root: URL,
        excluding activeRequestIDs: Set<UUID>,
        now: Date = Date(),
        staleAfter: TimeInterval = 24 * 60 * 60
    ) {
        let fileManager = FileManager.default
        let root = root.standardizedFileURL
        let keys: Set<URLResourceKey> = [.isDirectoryKey, .isSymbolicLinkKey, .contentModificationDateKey]
        guard let children = try? fileManager.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles]
        ) else { return }
        let cutoff = now.addingTimeInterval(-max(0, staleAfter))
        for child in children {
            let child = child.standardizedFileURL
            guard child.deletingLastPathComponent() == root,
                  let requestID = UUID(uuidString: child.lastPathComponent),
                  !activeRequestIDs.contains(requestID),
                  let values = try? child.resourceValues(forKeys: keys),
                  values.isDirectory == true,
                  values.isSymbolicLink != true,
                  let modifiedAt = values.contentModificationDate,
                  modifiedAt <= cutoff else { continue }
            do {
                try fileManager.removeItem(at: child)
            } catch {
#if DEBUG
                let request = String(requestID.uuidString.prefix(8))
                Self.diagnosticLogger.debug("event=crash-cleanup-failed request=\(request, privacy: .public)")
#endif
            }
        }
    }

    private func publishInfo(
        _ text: String,
        deps: ScreenplayStudioExportSupport.Dependencies,
        requestID: UUID
    ) {
        guard self.requestID == requestID else { return }
        deps.setInfo(text)
        ownedInfoText = text.isEmpty ? nil : text
    }

    private func publishError(
        _ text: String,
        deps: ScreenplayStudioExportSupport.Dependencies,
        requestID: UUID
    ) {
        guard self.requestID == requestID else { return }
        deps.setError(text)
        ownedErrorText = text.isEmpty ? nil : text
    }

    private func clearOwnedMessagesIfCurrent(using deps: ScreenplayStudioExportSupport.Dependencies) {
        if let ownedInfoText { deps.clearInfoIfEqual(ownedInfoText) }
        if let ownedErrorText { deps.clearErrorIfEqual(ownedErrorText) }
    }

    private func diagnostic(_ event: String, requestID: UUID?) {
#if DEBUG
        let request = requestID.map { String($0.uuidString.prefix(8)) } ?? "none"
        Self.diagnosticLogger.debug("event=\(event, privacy: .public) request=\(request, privacy: .public)")
#endif
    }
}

struct ScreenplayStudioExportPresentation: ViewModifier {
    @ObservedObject var coordinator: ScreenplayStudioExportCoordinator

    func body(content: Content) -> some View {
        content
#if !os(macOS)
            .background {
                if let requestID = coordinator.requestID, let lease = coordinator.stagingLease {
                    ScreenplayStudioFileExporterHost(coordinator: coordinator, requestID: requestID, lease: lease)
                        .id(requestID)
                }
            }
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

#if !os(macOS)
/// Create the presenter only after its immutable request/artifact exist. The
/// reusable Studio modifier must not install callbacks with a nil/previous ID.
/// Its identity changes without recreating the editor or Studio's view state.
private struct ScreenplayStudioFileExporterHost: View {
    @ObservedObject var coordinator: ScreenplayStudioExportCoordinator
    let requestID: UUID
    let lease: ScreenplayStudioExportStagingLease

    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .sheet(isPresented: coordinator.presentationBinding(for: requestID)) {
                ScreenplayStudioDocumentPicker(
                    lease: lease,
                    requestID: requestID,
                    onCompletion: { [weak coordinator] in
                        coordinator?.complete($0, requestID: requestID)
                    },
                    onCancellation: { [weak coordinator] in
                        coordinator?.cancel(requestID: requestID)
                    }
                )
                .interactiveDismissDisabled()
            }
    }
}

@MainActor
final class ScreenplayStudioDocumentPickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let requestID: UUID
    private let lease: ScreenplayStudioExportStagingLease
    private let onCompletion: (Result<URL, Error>) -> Void
    private let onCancellation: () -> Void
    private var settled = false

    init(
        requestID: UUID,
        lease: ScreenplayStudioExportStagingLease,
        onCompletion: @escaping (Result<URL, Error>) -> Void,
        onCancellation: @escaping () -> Void
    ) {
        self.requestID = requestID
        self.lease = lease
        self.onCompletion = onCompletion
        self.onCancellation = onCancellation
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard !settled else { return }
        settled = true
        defer { lease.cleanup() }
        guard let url = urls.first else {
            onCompletion(.failure(CocoaError(.fileNoSuchFile)))
            return
        }
        onCompletion(.success(url))
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard !settled else { return }
        settled = true
        defer { lease.cleanup() }
        onCancellation()
    }
}

private struct ScreenplayStudioDocumentPicker: UIViewControllerRepresentable {
    let lease: ScreenplayStudioExportStagingLease
    let requestID: UUID
    let onCompletion: (Result<URL, Error>) -> Void
    let onCancellation: () -> Void

    func makeCoordinator() -> ScreenplayStudioDocumentPickerDelegate {
        ScreenplayStudioDocumentPickerDelegate(
            requestID: requestID,
            lease: lease,
            onCompletion: onCompletion,
            onCancellation: onCancellation
        )
    }

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forExporting: [lease.stagedURL], asCopy: true)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIDocumentPickerViewController, context: Context) {}
}
#endif
