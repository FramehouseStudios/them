import SwiftUI
import ScreenplayStudio
import os

/// Export lifetime and presentation belong to this control, not the Studio god
/// view. Keep the created file alive when the writer dismisses the share sheet.
struct ScreenplayStudioExportMenu: View {
    let items: [ScreenplayExportMenuItem]
    let onExport: (String, @escaping (URL) -> Void) async -> Void
    let onRefresh: () -> Void
    let onOpenGoogleDocs: () -> Void
    @State private var isExporting = false
    @State private var shareItem: ShareItem?
#if os(iOS)
    @State private var isChoosingFormat = false
    @State private var pendingAction: ExportAction?
#endif

    private enum ExportAction {
        case export(String)
        case refresh
        case openGoogleDocs
    }

    private struct ShareItem: Identifiable {
        let id = UUID()
        let url: URL
    }

    var body: some View {
#if os(iOS)
        Button { isChoosingFormat = true } label: { controlLabel }
        .buttonStyle(.bordered)
        .controlSize(.regular)
        .disabled(isExporting)
        .accessibilityIdentifier("studio.export.menu")
        .accessibilityHint("Choose a screenplay format, then save or share the exported file")
        .sheet(isPresented: $isChoosingFormat, onDismiss: finishSelection) {
            NavigationStack {
                List { actionButtons }
                    .navigationTitle("Export Copy")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { isChoosingFormat = false }
                                .accessibilityIdentifier("studio.export.cancel")
                        }
                    }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $shareItem) { item in
            SystemActivityView(items: [item.url])
        }
#else
        Menu { actionButtons } label: { controlLabel }
        .buttonStyle(.bordered)
        .controlSize(.regular)
        .disabled(isExporting)
        .accessibilityIdentifier("studio.export.menu")
        .accessibilityHint("Choose a screenplay format, then save or share the exported file")
#endif
    }

    private var controlLabel: some View {
        Label(isExporting ? "Preparing Export…" : "Export Copy",
              systemImage: isExporting ? "hourglass" : "square.and.arrow.up")
            .font(IOThemTypography.UI.calloutStrong)
            .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var actionButtons: some View {
        ForEach(items) { item in
            Button(item.title) { select(.export(item.format)) }
                .accessibilityIdentifier("studio.export.\(item.format.lowercased())")
                .disabled(!item.isEnabled)
        }
        Divider()
        Button("Refresh Export Formats") { select(.refresh) }
        Button("Open in Google Docs") { select(.openGoogleDocs) }
    }

    private func select(_ action: ExportAction) {
#if os(iOS)
        // Consume only after the selection sheet has finished dismissing.
        // The file share controller must not race a transient format picker.
        guard pendingAction == nil else { return }
        pendingAction = action
        isChoosingFormat = false
#else
        perform(action)
#endif
    }

#if os(iOS)
    private func finishSelection() {
        guard let action = pendingAction else { return }
        pendingAction = nil
        perform(action)
    }
#endif

    private func perform(_ action: ExportAction) {
        switch action {
        case .refresh: onRefresh()
        case .openGoogleDocs: onOpenGoogleDocs()
        case .export(let format):
            HerLog.ui.info("studio export action received")
            Task { @MainActor in
                guard !isExporting else { return }
                isExporting = true
                defer { isExporting = false }
                HerLog.ui.info("studio export task started")
                await onExport(format) { url in
                    HerLog.ui.info("studio export artifact prepared")
                    shareItem = ShareItem(url: url)
                }
            }
        }
    }
}
