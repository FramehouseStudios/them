import SwiftUI
import Combine

@MainActor
final class OfflineTalkPageRecoveryController: ObservableObject {
    @Published var entries: [OfflineTalkOutboxEntry] = []
    @Published var scope: OfflineTalkRecoveryScope?
    private let vm: ScreenplayStudioViewModel
    private let bridge = ScreenplayLiveDraftBridge.shared
    private var applying = false

    init(vm: ScreenplayStudioViewModel) { self.vm = vm }

    func refresh() async {
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        let url = BackendAuthClient.resolvedBackendBaseURL()
        let expected = OfflineTalkRecoveryScope(identity: owner, backendURL: url)
        guard expected.isCurrent else { return }
        if scope != expected { scope = expected; entries = [] }
        do {
            let state = try await OfflineTalkOutbox.shared.recoveryState(initiatingIdentity: owner, backendURL: url)
            guard expected.isCurrent else { return }
            let received = state.entries.filter { $0.receivedReply == true }
            if entries != received { entries = received }
        } catch { if expected.isCurrent { entries = [] } }
    }

    func openOriginalProject(_ packet: OfflineTalkReceivedReply) async throws {
        guard !applying, let scope, scope.isCurrent else { throw OfflineTalkPreviousOwnerError() }
        applying = true; defer { applying = false }
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        guard let project = try await OfflineTalkOutbox.shared.receivedReplyProjectID(packet.entry.id,
            receiptID: packet.response.id, initiatingIdentity: owner, backendURL: scope.backendURL) else {
            throw BackendError.stage("offline_outbox", "This reply has no verified original project. It is kept for review and export.")
        }
        guard scope.isCurrent else { throw OfflineTalkPreviousOwnerError() }
        let blank = vm.selectedProjectID.isEmpty && vm.fountainDraft.isEmpty && bridge.draftText.isEmpty
        guard vm.isSelectedProjectDraftLoaded || blank else {
            throw BackendError.stage("offline_outbox", "Wait for the current screenplay to finish loading before switching projects. Your reply is kept.")
        }
        guard !vm.hasUnsavedDraftChanges, !vm.isSaving, !vm.isLoading, vm.conflictState == nil,
              vm.queuedDraftSaveCount == 0, !bridge.isStreamingDraftPreviewActive else {
            throw BackendError.stage("offline_outbox", "Save the current page and resolve any conflict before opening the original project. Your reply is kept.")
        }
        await vm.selectProject(project)
        guard scope.isCurrent else { throw OfflineTalkPreviousOwnerError() }
        guard vm.selectedProjectID == project, vm.isSelectedProjectDraftLoaded,
              bridge.preferredProjectID == project else {
            throw BackendError.stage("offline_outbox", "The original project could not be opened. The reply is still kept; try again when connected.")
        }
        await refresh()
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
                  bridge.preferredProjectID == project, vm.isSelectedProjectDraftLoaded,
                  document == nil || bridge.draftOrigin.documentID == document,
                  !vm.isLoading, vm.conflictState == nil, !bridge.isStreamingDraftPreviewActive else {
                throw BackendError.stage("offline_outbox", "Open the intended project and resolve any conflict before recovering this scene.")
            }
        }
        try requireTarget()
        guard let output = result.screenplayOutput, output.writesToPage,
              result.renderContract.authoritativePageTextAvailable else { throw BackendMemoryAPIError.invalidResponse }
        let sourceProject = result.screenplayTrace.projectId ?? ""
        guard sourceProject.isEmpty || sourceProject == project else {
            throw BackendError.stage("offline_outbox", "This reply belongs to another project. Open that project to recover it.")
        }
        guard bridge.draftText.utf8.elementsEqual(before.utf8) else {
            throw BackendError.stage("offline_outbox", "The editor is still synchronizing. Your reply is kept; try again after it finishes.")
        }
        let range = NSRange(location: (before as NSString).length, length: 0)
        let core = screenplayEditorPreparedInsertionCoreText(output.text, existing: before, insertionRange: range, replacementTarget: nil)
        let after = before + screenplayEditorInsertionText(for: core, existing: before, selection: range)
        let plan = try await OfflineTalkOutbox.shared.preparePageDelivery(packet.entry.id, receiptID: packet.response.id,
            projectID: project, documentID: document, beforeDraft: before, afterDraft: after,
            initiatingIdentity: owner, backendURL: scope.backendURL)
        try requireTarget()
        var inserted = false
        if plan.permitsInsertion(project: project, document: bridge.draftOrigin.documentID, draft: bridge.draftText),
           vm.fountainDraft.utf8.elementsEqual(plan.beforeDraft.utf8) {
            let start = plan.beforeDraft.components(separatedBy: "\n").count
            let write = ScreenplayCommittedWrite(id: plan.id, writeID: plan.id.uuidString.lowercased(),
                projectID: project, versionID: vm.latestVersionID, previousDraft: plan.beforeDraft,
                committedDraft: plan.afterDraft, insertedText: core, replacementApplied: false,
                replacedWriteID: nil, startLine: start, endLine: plan.afterDraft.components(separatedBy: "\n").count,
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
              saved.payload.project?.versions?.contains(where: { ($0.draft ?? "").utf8.elementsEqual(plan.afterDraft.utf8) }) == true else {
            throw BackendError.stage("offline_outbox", "The scene is kept locally, but its saved version is not confirmed. Finish recovery after saving; it will not append a second copy.")
        }
        try await OfflineTalkOutbox.shared.acknowledgeReceivedReply(packet.entry.id, receiptID: packet.response.id,
            initiatingIdentity: owner, backendURL: scope.backendURL, deliveryPlanID: plan.id)
        await refresh()
        return "Recovered scene saved."
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
            if !controller.entries.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Received replies").font(.headline)
                    Text("Review a reply and recover it to its screenplay. Existing words will stay intact.")
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
                destinationTitle: vm.selectedProject?.title,
                destinationProjectID: vm.isSelectedProjectDraftLoaded ? vm.selectedProjectID : nil,
                onOpenOriginalProject: { try await controller.openOriginalProject($0) },
                onAppend: { packet, result in try await controller.appendAndSave(packet, result: result) })
        }
    }
}
