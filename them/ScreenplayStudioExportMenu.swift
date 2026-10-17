import SwiftUI
import ScreenplayStudio

/// Export lifetime and presentation belong to this control, not the Studio god
/// view. Keep the created file alive when the writer dismisses the share sheet.
struct ScreenplayStudioExportMenu: View {
    let items: [ScreenplayExportMenuItem]
    let onExport: (String, @escaping (URL) -> Void) async -> Void
    let onRefresh: () -> Void
    let onOpenGoogleDocs: () -> Void
    @State private var isExporting = false
    @State private var shareItem: ShareItem?

    private struct ShareItem: Identifiable {
        let id = UUID()
        let url: URL
    }

    var body: some View {
        Menu {
            ForEach(items) { item in
                Button(item.title) {
                    Task { @MainActor in
                        guard !isExporting else { return }
                        isExporting = true
                        defer { isExporting = false }
                        await onExport(item.format) { url in
                            shareItem = ShareItem(url: url)
                        }
                    }
                }
                .accessibilityIdentifier("studio.export.\(item.format.lowercased())")
                .disabled(!item.isEnabled)
            }
            Divider()
            Button("Refresh Export Formats", action: onRefresh)
            Button("Open in Google Docs", action: onOpenGoogleDocs)
        } label: {
            Label(isExporting ? "Preparing Export…" : "Export Copy",
                  systemImage: isExporting ? "hourglass" : "square.and.arrow.up")
                .font(IOThemTypography.UI.calloutStrong)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.regular)
        .disabled(isExporting)
        .accessibilityIdentifier("studio.export.menu")
        .accessibilityHint("Choose a screenplay format, then save or share the exported file")
#if os(iOS)
        .sheet(item: $shareItem) { item in
            SystemActivityView(items: [item.url])
        }
#endif
    }
}
