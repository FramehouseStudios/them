import Foundation
#if os(macOS)
import AppKit
import UniformTypeIdentifiers
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
        var noteSavedDirectory: (URL) -> Void
        var openURL: (URL) -> Void
        var presentExportShareSheet: ((URL) -> Bool)? = nil
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

    /// On iPhone the export goes to the share sheet (Files, Mail, AirDrop,
    /// Final Draft), not to a folder the writer can see.
    nonisolated static func sharedInfoText(filename: String) -> String {
        "\(filename) is ready. Choose where to send it."
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
        return .success((clipboardText: clean, url: url))
    }

#if DEBUG && !os(macOS)
    nonisolated static func makeUITestArtifact(
        draft: String,
        title: String?,
        format: String
    ) throws -> BackendScreenplayExportArtifact {
        let cleanDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanDraft.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "Draft is empty.")
        }
        let cleanTitle = (title ?? "UITest Screenplay")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let safeTitle = cleanTitle.isEmpty ? "UITest-Screenplay" : cleanTitle
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        let normalizedFormat = format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedFormat == "fdx" {
            let xml = """
<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
    <Paragraph Type="Scene Heading"><Text>\(cleanDraft.components(separatedBy: .newlines).first ?? "INT. ROOM - DAY")</Text></Paragraph>
  </Content>
</FinalDraft>
"""
            return BackendScreenplayExportArtifact(
                format: "fdx",
                filename: "\(safeTitle).fdx",
                contentType: "application/xml",
                data: Data(xml.utf8)
            )
        }
        return BackendScreenplayExportArtifact(
            format: normalizedFormat == "markdown" ? "md" : normalizedFormat,
            filename: "\(safeTitle).md",
            contentType: "text/markdown; charset=utf-8",
            data: Data("# \(cleanTitle.isEmpty ? "UITest Screenplay" : cleanTitle)\n\n\(cleanDraft)\n".utf8)
        )
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

    @MainActor
    static func writeExportArtifact(
        _ artifact: BackendScreenplayExportArtifact,
        preferredDirectoryURL: URL?,
        noteSavedDirectory: (URL) -> Void
    ) throws -> URL? {
#if os(macOS)
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
#else
        _ = preferredDirectoryURL
        _ = noteSavedDirectory
        let invalidNameCharacters = CharacterSet.controlCharacters
            .union(CharacterSet(charactersIn: "/\\"))
        guard !artifact.filename.isEmpty, artifact.filename != ".", artifact.filename != "..",
              artifact.filename.rangeOfCharacter(from: invalidNameCharacters) == nil else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        // An activity may still be reading an earlier same-title export.
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("them-export-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        let tempURL = directory.appendingPathComponent(artifact.filename)
        guard tempURL.standardizedFileURL.deletingLastPathComponent() == directory.standardizedFileURL else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        try artifact.data.write(to: tempURL, options: .atomic)
        return tempURL
#endif
    }

    @MainActor
    static func exportCurrentDraft(format: String, deps: Dependencies) async {
        Task { await deps.refreshFormatLint("Export " + format.uppercased()) }
        do {
            let artifact: BackendScreenplayExportArtifact
#if os(macOS)
            artifact = try makeLocalArtifact(
                draft: deps.draft,
                title: deps.projectTitle,
                format: format
            )
#elseif DEBUG
            if deps.isRunningUITests {
                artifact = try makeUITestArtifact(
                    draft: deps.draft,
                    title: deps.projectTitle,
                    format: format
                )
            } else {
                artifact = try await deps.exportFromBackend(format)
            }
#else
            artifact = try await deps.exportFromBackend(format)
#endif
            let savedURL = try writeExportArtifact(
                artifact,
                preferredDirectoryURL: preferredExportDirectoryURL(
                    navigatorCurrentURL: deps.navigatorCurrentURL
                ),
                noteSavedDirectory: deps.noteSavedDirectory
            )
            if let savedURL {
#if os(macOS)
                deps.setInfo(savedInfoText(filename: artifact.filename, savedURL: savedURL))
#else
                // The file sat in the app's own temp folder: "Saved script.fdx
                // to tmp." and nothing the writer could open (2026-09-30).
                var shouldPresent = !deps.isRunningUITests
#if DEBUG
                if deps.isRunningUITests,
                   ProcessInfo.processInfo.environment["THEM_UITEST_EXPORT_SHARE_SHEET"] == "1" {
                    shouldPresent = true
                }
#endif
                if shouldPresent {
                    let presented: Bool
                    if let presenter = deps.presentExportShareSheet {
                        presented = presenter(savedURL)
                    } else {
                        presented = await presentShareSheet(for: savedURL)
                    }
                    guard presented else {
                        deps.setInfo("")
                        deps.setError("Couldn't open sharing. Return to a single Studio window and tap Export Copy again. Your draft is unchanged.")
                        return
                    }
                }
                deps.setError("")
                deps.setInfo(sharedInfoText(filename: artifact.filename))
#endif
            }
        } catch {
            deps.setError(ScreenplayExportFormatMenu.displayMessage(for: error, format: format))
        }
    }

#if !os(macOS)
    @MainActor
    static func presentShareSheet(for url: URL) async -> Bool {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
        // Never send a script into an arbitrary background/other window.
        guard scenes.count == 1, var top = scenes.first?.keyWindow?.rootViewController else { return false }
        while let presented = top.presentedViewController { top = presented }
        guard top.viewIfLoaded?.window != nil, !top.isBeingDismissed,
              !top.isBeingPresented, !(top is UIActivityViewController) else { return false }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = top.view
            popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        // The activity controller can present a remote/proxy controller.
        // Its immediate identity is not proof of acceptance; UIKit's completed
        // presentation is. Do not report a false error while sharing is open.
        return await withCheckedContinuation { continuation in
            top.present(sheet, animated: true) { continuation.resume(returning: true) }
        }
    }
#endif

    @MainActor
    static func openInGoogleDocs(deps: Dependencies) {
        switch googleDocsSharePayload(draft: deps.draft) {
        case .failure(let error):
            deps.setError(error.localizedDescription)
        case .success(let payload):
#if os(macOS)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(payload.clipboardText, forType: .string)
#endif
            deps.openURL(payload.url)
            deps.setInfo("Opened Google Docs. Draft copied to clipboard.")
        }
    }
}
