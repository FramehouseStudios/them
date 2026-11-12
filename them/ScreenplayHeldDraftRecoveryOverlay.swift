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
    @State private var confirmBlockRequest = false
    @State private var requestBlocked = false
    @State private var requestBlockFailed = false
    @State private var supersededNotice = false
    @State private var confirmRecoveryCopy = false
    @State private var recoveryCopyTitle: String?
    @State private var recoveryCopyFailureTitle: String?
    @State private var recoveryCopyFailed = false

    private var recoveryCopyButton: some View {
        Button("Save as Separate Project") { confirmRecoveryCopy = true }
            .disabled(selecting || viewModel.heldDraftRecoveryForReview(token) == nil)
            .accessibilityHint("Creates a separate project containing this text only; it does not remove the original copies.")
    }

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
                        if selectionRecorded && viewModel.custodyReviewRetryRequired {
                            Button("Block Original Request") { confirmBlockRequest = true }
                                .buttonStyle(.bordered)
                                .disabled(selecting)
                                .accessibilityIdentifier("studio.custody.block-original-request")
                                .accessibilityHint("Asks the server to prevent future delivery of the original request before you choose a new save. It does not remove your copies.")
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
            .confirmationDialog("Block the original save request?", isPresented: $confirmBlockRequest, titleVisibility: .visible) {
                Button("Block Original Request") {
                    selecting = true
                    Task {
                        do {
                            try await ScreenplayHeldRequestFence.block(viewModel: viewModel, token: token)
                            // Recording a fresh selection resets the retry presentation;
                            // Save Copy remains a separate explicit action with a fresh server read.
                            selectionRecorded = await viewModel.recordCustodySelection(token)
                            requestBlocked = selectionRecorded
                            requestBlockFailed = !selectionRecorded
                        } catch { requestBlockFailed = true }
                        selecting = false
                    }
                }
            } message: {
                Text("This request may already have saved. Blocking prevents it arriving later. Your original copies stay available. After confirmation, review and explicitly save the copy you want.")
            }
            .alert("Original request blocked", isPresented: $requestBlocked) {
                Button("Review Copy") { }
            } message: {
                Text("The server confirmed this request cannot arrive later. Nothing was removed. Review the copy and tap Save Copy to save it against the current server draft.")
            }
            .alert("Request block not confirmed", isPresented: $requestBlockFailed) {
                Button("OK") { }
            } message: {
                Text("The server or local receipt could not confirm the block. Your copies are still available. Retry the original save or save its text as a separate project.")
            }
            .confirmationDialog("Create a separate recovery project?", isPresented: $confirmRecoveryCopy, titleVisibility: .visible) {
                Button("Save Text as Recovery Copy") {
                    selecting = true
                    Task {
                        do { recoveryCopyTitle = try await ScreenplayHeldCopyFork.save(viewModel: viewModel, token: token) }
                        catch {
                            if let selected = viewModel.heldDraftRecoveryForReview(token),
                               let origin = selected.deliveryOrigin,
                               let intent = try? await ScreenplayDraftSaveOutbox.shared.recoveryForkIntent(selected: selected, origin: origin) {
                                recoveryCopyFailureTitle = intent.title
                            }
                            recoveryCopyFailed = true
                        }
                        selecting = false
                    }
                }
            } message: {
                Text("Only the text is copied. Characters, project notes, and other project context are not copied. This action does not remove or replace the original copies.")
            }
            .alert("Recovery copy saved", isPresented: Binding(get: { recoveryCopyTitle != nil }, set: { if !$0 { recoveryCopyTitle = nil } })) {
                Button("OK") { recoveryCopyTitle = nil }
            } message: {
                Text("Find \(recoveryCopyTitle ?? "Recovery Copy") in your projects. Only text was copied. This action did not remove or replace the original copies.")
            }
            .alert("Recovery copy not confirmed", isPresented: $recoveryCopyFailed) {
                Button("OK") { recoveryCopyFailureTitle = nil }
            } message: {
                if let title = recoveryCopyFailureTitle {
                    Text("This action did not remove or replace your original copies. If a previous attempt finished, look for \(title) in Projects. You can retry safely.")
                } else {
                    Text("This action did not remove or replace your original copies. Reopen its review to try again.")
                }
            }
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
                    #if os(macOS)
                    ToolbarItem(placement: .automatic) { recoveryCopyButton }
                    #else
                    ToolbarItem(placement: .bottomBar) { recoveryCopyButton }
                    #endif
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

/// Saves one explicitly selected held copy without mutating the source journal,
/// changing the active project, or adopting the result into the editor.
@MainActor
private enum ScreenplayHeldCopyFork {
    static func save(viewModel: ScreenplayStudioViewModel,
                     token: ScreenplayStudioViewModel.HeldDraftRecoveryReviewToken) async throws -> String {
        guard let selected = viewModel.heldDraftRecoveryForReview(token),
              let document = token.presentationDocumentID,
              ScreenplayLiveDraftSyncService.shared.ownsEditor(viewModel),
              let backend = try? ScreenplayInitialProjectMetadata.origin(token.backendURL),
              selected.deliveryOrigin == .init(documentID: document, backendURL: backend) else {
            throw BackendMemoryAPIError.invalidResponse
        }
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        guard ScreenplayStudioAuthContextPolicy.matches(expected: token.owner, current: owner.ownerContext) else {
            throw BackendMemoryAPIError.invalidResponse
        }
        let outbox = ScreenplayDraftSaveOutbox.shared
        let origin = ScreenplayDraftSaveOrigin(documentID: document, backendURL: backend)
        let fork = try await outbox.recoveryForkIntent(selected: selected, origin: origin)
        let maySend: @Sendable () async -> Bool = { [weak viewModel] in
            let stillCurrent = await MainActor.run(body: {
                guard let viewModel, ScreenplayLiveDraftSyncService.shared.ownsEditor(viewModel) else { return false }
                return viewModel.heldDraftRecoveryForReview(token) == selected
            })
            guard stillCurrent else { return false }
            guard let check = try? await outbox.recoveryForkIntent(selected: selected, origin: origin) else { return false }
            return check.id == fork.id && check.projectId == fork.projectId && check.draft.utf8.elementsEqual(fork.draft.utf8)
        }
        let result = try await BackendMemoryAPI.shared.upsertScreenplayProject(projectId: fork.projectId,
            title: fork.title, phase: fork.phase, initialDraft: fork, activateInitialProject: false,
            maySend: maySend, initiatingIdentity: owner)
        guard await maySend(), viewModel.heldDraftRecoveryForReview(token) == selected,
              ScreenplayLiveDraftSyncService.shared.ownsEditor(viewModel),
              ScreenplayStudioAuthContextPolicy.matches(expected: token.owner, current: .current()),
              let version = result.payload.version,
              let project = result.payload.project, project.id == fork.projectId, project.title == fork.title,
              project.activeVersionId == version.id,
              version.phase == fork.phase, version.source == fork.source, version.notes == fork.notes,
              (result.httpStatusCode == 201 && result.payload.status == "created" && result.payload.created == true) ||
                (result.httpStatusCode == 200 && result.payload.status == "replayed" && result.payload.created == false),
              ScreenplayConfirmedDraftSave.initial(entry: fork, version: version,
                versionID: result.payload.versionId, projectID: result.payload.projectId, responseURL: result.responseURL,
                owner: owner.ownerContext, currentOwner: .current()) != nil else {
            throw BackendMemoryAPIError.invalidResponse
        }
        // The confirmed project becomes discoverable without replacing the
        // currently selected project or the writer's visible page.
        if !viewModel.projects.contains(where: { $0.id == project.id }) {
            viewModel.projects.insert(project, at: 0)
        }
        return fork.title
    }
}
