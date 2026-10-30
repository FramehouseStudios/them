import SwiftUI

extension View {
    func screenplayRecoveryOverlay(topInset: CGFloat) -> some View {
        frame(maxWidth: 560)
            .padding(.horizontal, 20)
            .padding(.top, 70 + topInset)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// A narrow recovery surface for an exact outbox row deliberately held by
/// Load Server. It never saves or retires the row without another explicit
/// conflict choice.
struct ScreenplayHeldDraftRecoveryOverlay: View {
    @ObservedObject var viewModel: ScreenplayStudioViewModel
    @ObservedObject private var bridge = ScreenplayLiveDraftBridge.shared
    let topInset: CGFloat
    @State private var reviewedToken: ScreenplayStudioViewModel.HeldDraftRecoveryReviewToken?

    var body: some View {
        Group {
            if viewModel.isHeldDraftRecoveryDeferred {
                Button {
                    viewModel.reopenHeldDraftRecovery()
                } label: {
                    Label("Review held local copy", systemImage: "tray.full.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("studio.held-draft-recovery.reopen")
                .padding(.top, 70 + topInset)
                .padding(.trailing, 20)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            } else {
                ZStack(alignment: .top) {
                    Color.black.opacity(0.08).ignoresSafeArea()
                    banner.screenplayRecoveryOverlay(topInset: topInset)
                }
            }
        }
        .sheet(item: $reviewedToken) { token in
            ScreenplayHeldDraftRecoveryReview(viewModel: viewModel, token: token)
        }
        .onChange(of: viewModel.selectedProjectID) { _, _ in reviewedToken = nil }
        .onChange(of: bridge.draftOrigin.documentID) { _, _ in reviewedToken = nil }
        .onReceive(NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged)) { _ in
            reviewedToken = nil
        }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in
            guard let token = reviewedToken else { return }
            if viewModel.heldDraftRecoveryForReview(token) == nil {
                reviewedToken = nil
            }
        }
    }

    private var banner: some View {
        let tint = Color.orange.opacity(0.88)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(tint)
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: 3) {
                    Text(bannerTitle)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.herText.opacity(0.88))
                    Text(presentationMessage)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.herText.opacity(0.74))
                    NumberedChoiceHintText(message: choiceHint)
                }
                Spacer(minLength: 0)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { actionButtons }
                VStack(alignment: .leading, spacing: 8) { actionButtons }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.herShellPanel)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(tint.opacity(0.48), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.held-draft-recovery.banner")
    }

    private var bannerTitle: String {
        if viewModel.heldDraftRecoveryIsLoadServerCopy { return "Newer unsent words are held" }
        if viewModel.heldDraftRecoveryIsCurrentContextCopy { return "A local conflict is held" }
        return "A copy from another document is held"
    }

    private var choiceHint: String {
        if viewModel.heldDraftRecoveryIsLoadServerCopy {
            return "Recover it, preview its exact words, or leave it safely held for later."
        }
        if viewModel.heldDraftRecoveryIsCurrentContextCopy {
            return "Preview the exact held words or leave them safely held while their server match is unresolved."
        }
        return "Preview the exact held words. Reopen their original document and backend to resolve them."
    }

    @ViewBuilder
    private var actionButtons: some View {
                if viewModel.heldDraftRecoveryIsLoadServerCopy {
                    NumberedChoiceActionButton(
                        number: "1", title: "Recover Local", prominence: .prominent,
                        tint: Color.herStudioAccent
                    ) {
                        Task { await viewModel.recoverHeldDraftSave() }
                    }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("studio.held-draft-recovery.primary-action")
                }
                NumberedChoiceActionButton(
                    number: viewModel.heldDraftRecoveryIsLoadServerCopy ? "2" : "1",
                    title: "Preview Exact Copy",
                    prominence: viewModel.heldDraftRecoveryIsLoadServerCopy ? .regular : .prominent,
                    tint: Color.herStudioAccent
                ) {
                    Task { reviewedToken = await viewModel.confirmedHeldDraftRecoveryForReview() }
                }
                .frame(minHeight: 44)
                .accessibilityIdentifier("studio.held-draft-recovery.preview")
                NumberedChoiceActionButton(
                    number: viewModel.heldDraftRecoveryIsLoadServerCopy ? "3" : "2",
                    title: "Not Now",
                    tint: Color.herStudioAccent
                ) {
                    viewModel.leaveHeldDraftRecoveryForLater()
                }
                .frame(minHeight: 44)
                .accessibilityIdentifier("studio.held-draft-recovery.secondary-action")
    }

    private var presentationMessage: String {
        if viewModel.heldDraftRecoveryIsLoadServerCopy {
            return viewModel.heldDraftRecoveryServerIsOnPage
                ? "The verified server draft is on the page. A newer local save is held separately and will not save automatically."
                : "A newer local save is held separately and will not save automatically. This message has not verified that the current page matches the server."
        }
        if viewModel.heldDraftRecoveryIsCurrentContextCopy {
            return "This exact local conflict belongs to the current document, but its server or recovery match could not be verified. The current page has not been replaced."
        }
        return "This exact copy belongs to another local document or backend. The current page has not been replaced."
    }
}

private struct ScreenplayHeldDraftRecoveryReview: View {
    @ObservedObject var viewModel: ScreenplayStudioViewModel
    let token: ScreenplayStudioViewModel.HeldDraftRecoveryReviewToken
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let entry = viewModel.heldDraftRecoveryForReview(token) {
                    ScrollView {
                        Text(entry.draft)
                            .font(.system(.body, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    }
                } else {
                    ContentUnavailableView(
                        "Preview Closed",
                        systemImage: "lock.fill",
                        description: Text("The account, project, document, or backend context changed."))
                }
            }
            .navigationTitle("Exact Held Copy")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                #if DEBUG
                if IOThemRuntime.isRunningUITests,
                   ProcessInfo.processInfo.arguments.contains("--ui-held-draft-recovery-fixture") {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Simulate Identity Change") {
                            NotificationCenter.default.post(
                                name: .themBackendIdentityPartitionChanged,
                                object: nil
                            )
                        }
                        .accessibilityIdentifier("studio.held-draft-recovery.simulate-identity-change")
                    }
                }
                #endif
            }
        }
        .accessibilityIdentifier("studio.held-draft-recovery.review")
    }
}
