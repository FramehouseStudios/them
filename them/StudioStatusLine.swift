import SwiftUI
import ScreenplayStudio

/// Studio status ("Page held back. Your draft is unchanged.", "Studio project
/// save failed: ...", "Saved correction for MAE.") was written to
/// `autoInsertStatusText` in a dozen places and shown nowhere, so a failure
/// explained nothing. Each new status now shows above the page for a moment;
/// a failure stays longer.
struct StudioStatusLine: View {
    @ObservedObject var bridge: ScreenplayLiveDraftBridge
    @State private var visibleText = ""
    @State private var hideTask: Task<Void, Never>?

    static func isProblem(_ text: String) -> Bool {
        let lower = text.lowercased()
        return ["failed", "held back", "couldn't", "could not", "unavailable", "offline", "error"].contains { lower.contains($0) }
    }

    static func displaySeconds(for text: String) -> Double {
        isProblem(text) ? 12 : 5
    }

    var body: some View {
        Group {
            if !visibleText.isEmpty {
                Label(visibleText, systemImage: Self.isProblem(visibleText) ? "exclamationmark.circle" : "checkmark.circle")
                    .font(IOThemTypography.UI.calloutMedium)
                    .foregroundStyle(Self.isProblem(visibleText) ? Color.red.opacity(0.86) : Color.herText.opacity(0.82))
                    .lineLimit(3)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .onAppear { show(bridge.autoInsertStatusText) } // set while the Studio was opening
        .onChange(of: bridge.autoInsertStatusText) { _, text in show(text) }
    }

    private func show(_ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        hideTask?.cancel()
        withAnimation(.easeInOut(duration: 0.18)) { visibleText = clean }
        guard !clean.isEmpty else { return }
        let seconds = Self.displaySeconds(for: clean)
        hideTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.22)) { visibleText = "" }
        }
    }
}
