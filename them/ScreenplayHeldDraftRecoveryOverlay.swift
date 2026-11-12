import SwiftUI
import ScreenplayStudio

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
    @State private var hasCustodyCopies = false

    var body: some View {
        Group {
            if viewModel.isHeldDraftRecoveryDeferred {
                Button {
                    viewModel.reopenHeldDraftRecovery()
                } label: {
                    Label("Review held local copy", systemImage: "tray.full.fill")
                        .font(IOThemTypography.UI.captionStrong)
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
        .task(id: viewModel.heldDraftRecovery?.id) {
            hasCustodyCopies = !(await viewModel.custodyRowsForReview()).isEmpty
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
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(tint)
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: 3) {
                    Text(bannerTitle)
                        .font(IOThemTypography.UI.captionStrong)
                        .foregroundStyle(Color.herText.opacity(0.88))
                    Text(presentationMessage)
                        .font(IOThemTypography.UI.caption)
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
        if viewModel.heldDraftRecovery?.deliveryOrigin == nil {
            return "Preview and copy the exact held words. Their original document and backend were not recorded."
        }
        return "Preview the exact held words. Reopen their original document and backend to resolve them."
    }

    @ViewBuilder
    private var actionButtons: some View {
                if hasCustodyCopies {
                    ScreenplayConflictCustodyButton(viewModel: viewModel)
                }
                if viewModel.heldDraftRecoveryIsLoadServerCopy {
                    NumberedChoiceActionButton(
                        number: "1", title: "Recover Local", prominence: .prominent,
                        tint: Color.herStudioAccent, minimumLabelHeight: 44
                    ) {
                        Task { await viewModel.recoverHeldDraftSave() }
                    }
                    .accessibilityIdentifier("studio.held-draft-recovery.primary-action")
                }
                NumberedChoiceActionButton(
                    number: viewModel.heldDraftRecoveryIsLoadServerCopy ? "2" : "1",
                    title: "Preview Exact Copy",
                    prominence: viewModel.heldDraftRecoveryIsLoadServerCopy ? .regular : .prominent,
                    tint: Color.herStudioAccent, minimumLabelHeight: 44
                ) {
                    Task { reviewedToken = await viewModel.confirmedHeldDraftRecoveryForReview() }
                }
                .accessibilityIdentifier("studio.held-draft-recovery.preview")
                NumberedChoiceActionButton(
                    number: viewModel.heldDraftRecoveryIsLoadServerCopy ? "3" : "2",
                    title: "Not Now",
                    tint: Color.herStudioAccent, minimumLabelHeight: 44
                ) {
                    viewModel.leaveHeldDraftRecoveryForLater()
                }
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
        if viewModel.heldDraftRecovery?.deliveryOrigin == nil {
            return "This older copy has no recorded document or backend. The current page has not been replaced."
        }
        return "This exact copy belongs to another local document or backend. The current page has not been replaced."
    }
}

/// Conflict decisions use the existing resolution owner; custody copies require review.
struct ScreenplayConflictActionButtons: View {
    @ObservedObject var viewModel: ScreenplayStudioViewModel
    let requiresCustodyReview: Bool

    var body: some View {
        if requiresCustodyReview {
            ScreenplayConflictCustodyButton(viewModel: viewModel)
        } else {
            Button {
                Task { await viewModel.applyServerVersionFromConflict() }
            } label: {
                Text("1 Load Server")
            }
            .buttonStyle(.bordered)
            .tint(Color.white.opacity(0.24))
            .keyboardShortcut("1", modifiers: [])
            .accessibilityIdentifier("studio.conflict.load-server")
            .disabled(viewModel.isPreparingConflictResolution)

            Button {
                Task { await viewModel.keepLocalDraftAfterConflict() }
            } label: {
                Text("2 Keep Mine")
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.white.opacity(0.24))
            .keyboardShortcut("2", modifiers: [])
            .accessibilityIdentifier("studio.conflict.keep-mine")
            .disabled(viewModel.isPreparingConflictResolution)
        }
    }
}

/// Opens only verified, read-only copies; selecting a row never resolves a conflict.
struct ScreenplayConflictCustodyButton: View {
    @ObservedObject var viewModel: ScreenplayStudioViewModel
    @State private var showingCopies = false

    var body: some View {
        Button("Review Local Copies") { showingCopies = true }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("studio.conflict.review-local-copies")
            .sheet(isPresented: $showingCopies) {
                ScreenplayConflictCustodyReview(viewModel: viewModel)
            }
    }
}

private struct ScreenplayConflictCustodyReview: View {
    @ObservedObject var viewModel: ScreenplayStudioViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [ScreenplayDraftSaveOutboxEntry] = []
    @State private var reviewedToken: ScreenplayStudioViewModel.HeldDraftRecoveryReviewToken?
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            List {
                Text("These copies are held separately. Reviewing them does not save or remove either copy.")
                if loaded && rows.isEmpty {
                    Text("The copies could not be confirmed for this document. Check the account and try again.")
                }
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    Button("Preview local copy \(index + 1)") {
                        Task { reviewedToken = await viewModel.selectCustodyRowForReview(id: row.id) }
                    }
                }
            }
            .navigationTitle("Held Local Copies")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .task { rows = await viewModel.custodyRowsForReview(); loaded = true }
            .sheet(item: $reviewedToken) { token in
                ScreenplayHeldDraftRecoveryReview(viewModel: viewModel, token: token, allowsCustodySelection: true)
            }
            .onChange(of: viewModel.selectedProjectID) { _, _ in dismiss() }
            .onReceive(NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged)) { _ in dismiss() }
        }
    }
}

private struct ScreenplayHeldDraftRecoveryReview: View {
    @ObservedObject var viewModel: ScreenplayStudioViewModel
    let token: ScreenplayStudioViewModel.HeldDraftRecoveryReviewToken
    var allowsCustodySelection = false
    @Environment(\.dismiss) private var dismiss
    @State private var selecting = false
    @State private var selectionRecorded = false
    @State private var selectionFailed = false
    @State private var supersededNotice = false

    var body: some View {
        NavigationStack {
            Group {
                if let entry = viewModel.heldDraftRecoveryForReview(token) {
                    ScrollView {
                        if selectionRecorded {
                            Text(viewModel.custodyReviewRetryRequired
                                 ? "The earlier save may already have reached the server. Retry the original save; if it was not saved before, this can save it now. Your copies stay held."
                                 : "Selected on this device. Tap Save Copy to save it; the other copies stay held.")
                                .font(.footnote)
                                .padding(.horizontal)
                        }
                        Text(entry.draft)
                            .font(.body.monospaced())
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
            .alert("Saved, then superseded", isPresented: $supersededNotice) {
                Button("Review Copies") { dismiss() }
            } message: {
                Text("This copy was saved, then a newer server version appeared. Your local copies remain held. Review them before choosing what to save next.")
            }
            .alert("Action not confirmed", isPresented: $selectionFailed) {
                Button("OK", role: .cancel) { }
            } message: {
                Text("The action could not be confirmed. Reopen the review to check your copies and save status.")
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                if allowsCustodySelection {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(selecting ? "Working…" : (selectionRecorded ? (viewModel.custodyReviewRetryRequired ? "Retry Original Save" : "Save Copy") : "Select Copy")) {
                            selecting = true
                            Task {
                                if selectionRecorded {
                                    if await viewModel.saveSelectedCustodyCopy(token) {
                                        if viewModel.custodySupersededConfirmed { supersededNotice = true }
                                        else { dismiss() }
                                    } else { selectionFailed = true }
                                } else if await viewModel.recordCustodySelection(token) {
                                    selectionRecorded = true
                                } else {
                                    selectionFailed = true
                                }
                                selecting = false
                            }
                        }
                        .disabled(selecting || viewModel.heldDraftRecoveryForReview(token) == nil)
                        .accessibilityHint(selectionRecorded ? (viewModel.custodyReviewRetryRequired ? "Retries the original save. If it was not saved before, this can save it now." : "Saves this selected copy after checking the server; other copies remain held.") : "Records this choice locally. It does not save to the server.")
                    }
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
