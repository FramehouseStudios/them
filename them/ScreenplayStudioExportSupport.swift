import Foundation
#if os(macOS)
import AppKit
import UniformTypeIdentifiers
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
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(artifact.filename)
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
                deps.setInfo(savedInfoText(filename: artifact.filename, savedURL: savedURL))
            }
        } catch {
            deps.setError(ScreenplayExportFormatMenu.displayMessage(for: error, format: format))
        }
    }

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
