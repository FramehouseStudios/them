import SwiftUI
import Combine

@MainActor
final class OfflineTalkPageRecoveryController: ObservableObject {
    @Published var entries: [OfflineTalkOutboxEntry] = []
    @Published var scope: OfflineTalkRecoveryScope?
    @Published private(set) var hasLoadedCurrentScope = false
    @Published private(set) var loadError = ""
    private let vm: ScreenplayStudioViewModel
    private let bridge = ScreenplayLiveDraftBridge.shared
    private let outbox: OfflineTalkOutbox
    private var applying = false
    private var refreshGeneration = 0

    init(vm: ScreenplayStudioViewModel, outbox: OfflineTalkOutbox = .shared) { self.vm = vm; self.outbox = outbox }

    func refresh() async {
        refreshGeneration += 1
        let generation = refreshGeneration
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        let url = BackendAuthClient.resolvedBackendBaseURL()
        let expected = OfflineTalkRecoveryScope(identity: owner, backendURL: url)
        guard expected.isCurrent else { return }
        if scope != expected { scope = expected; entries = []; hasLoadedCurrentScope = false; loadError = "" }
        do {
            let state = try await outbox.recoveryState(initiatingIdentity: owner, backendURL: url)
            guard expected.isCurrent, generation == refreshGeneration else { return }
            let received = state.entries.filter { $0.receivedReply == true }
            if entries != received { entries = received }
            hasLoadedCurrentScope = true
            loadError = ""
        } catch {
            guard expected.isCurrent, generation == refreshGeneration else { return }
            loadError = "Your kept replies could not be opened. Try again, or review the recovery copies in Data Controls."
        }
    }

    func appendAndSave(_ packet: OfflineTalkReceivedReply, result: BackendTalkResult) async throws -> String {
        guard !applying, let scope, scope.isCurrent else { throw OfflineTalkPreviousOwnerError() }
        applying = true; defer { applying = false }
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        let project = vm.selectedProjectID
        let before = vm.fountainDraft
        let document = bridge.draftOrigin.documentID
        func requireTarget() throws {
            guard scope.isCurrent, !project.isEmpty, vm.selectedProjectID == project,
                  bridge.preferredProjectID == project, vm.selectedProject?.id == project,
                  document == nil || bridge.draftOrigin.documentID == document,
                  ScreenplayLiveDraftSyncService.shared.ownsEditor(vm),
                  !vm.isLoading, vm.conflictState == nil, !bridge.isStreamingDraftPreviewActive else {
                throw BackendError.stage("offline_outbox", "Open the intended project and resolve any conflict before recovering this scene.")
            }
        }
        try requireTarget()
        guard let output = result.screenplayOutput, output.writesToPage,
              result.renderContract.authoritativePageTextAvailable else { throw BackendMemoryAPIError.invalidResponse }
        let sourceProject = result.screenplayTrace.projectId ?? ""
        let livePlan = packet.pageDelivery.flatMap { $0.liveMutation == nil ? nil : $0 }
        let isLive = livePlan != nil
        guard isLive || sourceProject.isEmpty || sourceProject == project else {
            throw BackendError.stage("offline_outbox", "This reply belongs to another project. Open that project to recover it.")
        }
        guard bridge.draftText.utf8.elementsEqual(before.utf8) else {
            throw BackendError.stage("offline_outbox", "The editor is still synchronizing. Your reply is kept; try again after it finishes.")
        }
        let range = NSRange(location: (before as NSString).length, length: 0)
        let core = livePlan?.liveMutation?.insertion.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? screenplayEditorPreparedInsertionCoreText(output.text, existing: before, insertionRange: range, replacementTarget: nil)
        let after = livePlan?.afterDraft ?? before + screenplayEditorInsertionText(for: core, existing: before, selection: range)
        let plan = try await outbox.preparePageDelivery(packet.entry.id, receiptID: packet.response.id,
            projectID: project, documentID: document, beforeDraft: before, afterDraft: after,
            initiatingIdentity: owner, backendURL: scope.backendURL)
        try requireTarget()
        let fresh = try await outbox.receivedReply(packet.entry.id, initiatingIdentity: owner, backendURL: scope.backendURL)
        try requireTarget()
        guard (plan.liveMutation != nil) == isLive,
              fresh.pageDelivery?.id == plan.id,
              livePlan == nil || livePlan?.id == plan.id else {
            throw BackendError.stage("offline_outbox", "This reply's recovery action changed. Close and reopen its review before changing the page. Your copy is kept.")
        }
        guard bridge.draftText.utf8.elementsEqual(vm.fountainDraft.utf8) else {
            throw BackendError.stage("offline_outbox", "The editor is still synchronizing. Your reply is kept; try again after it finishes.")
        }
        let disposition = isLive ? try plan.liveRecoveryDisposition(project: project, document: bridge.draftOrigin.documentID,
            draft: vm.fountainDraft, saved: fresh.savedPage) : nil
        if disposition == .finishConfirmedSave {
            try await outbox.acknowledgeReceivedReply(packet.entry.id, receiptID: fresh.response.id,
                initiatingIdentity: owner, backendURL: scope.backendURL, deliveryPlanID: plan.id)
            await refresh()
            return "Original page change saved."
        }
        var inserted = false
        if disposition != .saveCurrentPage, plan.permitsInsertion(project: project, document: bridge.draftOrigin.documentID, draft: bridge.draftText),
           vm.fountainDraft.utf8.elementsEqual(plan.beforeDraft.utf8) {
            let start = plan.liveMutationLineRange?.start ?? plan.beforeDraft.components(separatedBy: "\n").count
            let end = plan.liveMutationLineRange?.end ?? plan.afterDraft.components(separatedBy: "\n").count
            let write = ScreenplayCommittedWrite(id: plan.id, writeID: plan.id.uuidString.lowercased(),
                projectID: project, versionID: vm.latestVersionID, previousDraft: plan.beforeDraft,
                committedDraft: plan.afterDraft, insertedText: core, replacementApplied: (plan.liveMutation?.length ?? 0) > 0,
                replacedWriteID: nil, startLine: start, endLine: end,
                committedAt: Date(), authContext: owner.ownerContext)
            bridge.cancelStream()
            bridge.draftText = plan.afterDraft
            bridge.lastCommittedWrite = write
            guard vm.adoptCommittedPageWriteIfNeeded(write) else {
                throw BackendError.stage("offline_outbox", "The recovered scene is kept locally. Reopen this project before finishing its save.")
            }
            inserted = true
        }
        // A prior attempt may already have appended. Never append to a newer
        // draft merely because its acknowledgement was interrupted.
        if !inserted, vm.fountainDraft.utf8.elementsEqual(plan.afterDraft.utf8),
           vm.hasUnsavedDraftChanges, !vm.isSaving {
            await vm.manualSaveDraft()
        }
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline, vm.isSaving || (inserted && vm.hasUnsavedDraftChanges && vm.errorText.isEmpty && vm.queuedDraftSaveCount == 0) {
            try await Task.sleep(nanoseconds: 50_000_000)
            try requireTarget()
        }
        try requireTarget()
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForResource = 12
        let api = BackendMemoryAPI(session: URLSession(configuration: config), baseURL: scope.backendURL)
        let saved = try await api.fetchScreenplayProject(projectId: project, includeDrafts: true, versionLimit: 32, initiatingIdentity: owner)
        try requireTarget()
        guard saved.payload.project?.id == project,
              let version = saved.payload.project?.versions?.first(where: { ($0.draft ?? "").utf8.elementsEqual(plan.afterDraft.utf8) }) else {
            throw BackendError.stage("offline_outbox", "The scene is kept locally, but its saved version is not confirmed. Finish recovery after saving; it will not append a second copy.")
        }
        if isLive {
            guard let proof = ScreenplayConfirmedDraftSave.readback(entry: recoverySaveEntry(plan, owner: owner, backendURL: scope.backendURL),
                version: version, projectID: project, responseURL: saved.responseURL, owner: owner.ownerContext,
                currentOwner: BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false).ownerContext) else {
                throw BackendError.stage("offline_outbox", "The original page change is kept, but its exact saved version could not be verified. Review it before finishing recovery.")
            }
            _ = try await outbox.recordConfirmedPageSave(proof)
            try requireTarget()
        }
        try await outbox.acknowledgeReceivedReply(packet.entry.id, receiptID: fresh.response.id,
            initiatingIdentity: owner, backendURL: scope.backendURL, deliveryPlanID: plan.id)
        await refresh()
        return isLive ? "Original page change saved." : "Recovered scene saved."
    }

    private func recoverySaveEntry(_ plan: OfflineTalkPageDeliveryPlan, owner: BackendAuthRequestIdentity,
                                   backendURL: URL) -> ScreenplayDraftSaveOutboxEntry {
        .init(id: plan.id.uuidString.lowercased(), projectId: plan.projectID, ownerUserId: owner.userID,
            draft: plan.afterDraft, title: "", phase: "scene_draft", notes: "", source: "studio_recovered_live_page",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "", createdAt: 0, updatedAt: 0,
            status: .parked, retries: 0, nextAttemptAt: 0, lastError: "",
            deliveryOrigin: plan.documentID.map { .init(documentID: $0, backendURL: backendURL) })
    }
}

struct OfflineTalkPageRecoveryPanel: View {
    @ObservedObject var vm: ScreenplayStudioViewModel
    let onStopTalk: () -> Void
    @StateObject private var controller: OfflineTalkPageRecoveryController
    @State private var review: OfflineTalkReplyReview?

    init(vm: ScreenplayStudioViewModel, onStopTalk: @escaping () -> Void) {
        self.vm = vm; self.onStopTalk = onStopTalk
        _controller = StateObject(wrappedValue: OfflineTalkPageRecoveryController(vm: vm))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            #if DEBUG
            if IOThemRuntime.isRunningUITests {
                Text(controller.hasLoadedCurrentScope && controller.loadError.isEmpty ? "\(controller.entries.count)" : "loading")
                    .font(.caption).accessibilityIdentifier("studio.recovery.received-count")
            }
            #endif
            if !controller.loadError.isEmpty {
                Text(controller.loadError).font(.caption).foregroundStyle(.secondary)
                Button("Try again") { Task { await controller.refresh() } }
                    .accessibilityIdentifier("studio.recovery.retry")
            }
            if !controller.entries.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Received replies").font(.headline)
                    Text("Review kept replies and finish their original page change or save.")
                        .font(.caption).foregroundStyle(.secondary)
                    ForEach(controller.entries) { entry in
                        Button("Review received reply") {
                            guard let scope = controller.scope, scope.isCurrent else { return }
                            onStopTalk()
                            review = .init(entryID: entry.id, owner: BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false), scope: scope)
                        }.buttonStyle(.bordered).accessibilityIdentifier("studio.recovery.reply.\(entry.id)")
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task(id: vm.selectedProjectID) {
            #if DEBUG
            await OfflineTalkPageRecoveryUITestFixture.install(projectID: vm.selectedProjectID)
            #endif
            await controller.refresh()
        }
        .onReceive(NotificationCenter.default.publisher(for: .themOfflineTalkOutboxUpdated)) { _ in Task { await controller.refresh() } }
        .onReceive(NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged)) { _ in review = nil; Task { await controller.refresh() } }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in
            if controller.scope?.isCurrent == false { review = nil; Task { await controller.refresh() } }
        }
        .sheet(item: $review) { item in
            OfflineTalkReplyReviewView(review: item, onDone: { review = nil },
                destinationTitle: vm.selectedProject?.title, onAppend: { packet, result in try await controller.appendAndSave(packet, result: result) })
        }
    }
}
