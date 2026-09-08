import Combine
import SwiftUI

nonisolated enum ScreenplayPreciseEditStudioTranscriptSource: Sendable {
    case turnBased
    case realtime
    case uiTest
}

nonisolated enum ScreenplayPreciseEditStudioCommitOutcome: Sendable {
    case localApplied
    case receipt(ScreenplayPreciseEditSaveReceipt)
    case failed(String)
}

@MainActor
final class ScreenplayPreciseEditStudioSession: ObservableObject {
    enum Presentation: Equatable {
        case idle
        case preparing(command: String)
        case preview(ScreenplayPreciseEditPreview)
        case applying(ScreenplayPreciseEditPreview)
        case applied(ScreenplayPreciseEditMutationReceipt)
        case queued(ScreenplayPreciseEditMutationReceipt, ScreenplayPreciseEditSaveReceipt)
        case saved(ScreenplayPreciseEditMutationReceipt, ScreenplayPreciseEditSaveReceipt)
        case failed(message: String)
        case undone(ScreenplayPreciseEditUndoReceipt)
    }

    static let shared = ScreenplayPreciseEditStudioSession()

    @Published private(set) var presentation: Presentation = .idle
    private static let transactions = ScreenplayPreciseEditTransactionCoordinator()
    private var preparationGeneration: UUID?
    private var activeTransactionID: UUID?
    private var suppressNextTurnBasedAudio = false
    private var turnBasedAudioSuppressionExpiresAt = Date.distantPast

    var isPresented: Bool { presentation != .idle }

    @discardableResult
    func interceptFinalTranscript(
        _ transcript: String,
        source: ScreenplayPreciseEditStudioTranscriptSource,
        bridge: ScreenplayLiveDraftBridge
    ) -> Bool {
        interceptFinalTranscript(
            transcript,
            source: source,
            snapshot: Self.snapshot(
                projectID: bridge.committedWriteProjectIDSnapshot(),
                baseVersionID: bridge.committedWriteVersionIDSnapshot(),
                draft: bridge.draftText
            )
        )
    }

    @discardableResult
    func interceptFinalTranscript(
        _ transcript: String,
        source: ScreenplayPreciseEditStudioTranscriptSource,
        snapshot: ScreenplayPreciseEditDocumentSnapshot
    ) -> Bool {
        let transactionID = UUID()
        let intent: ScreenplayPreciseEditIntent
        switch ScreenplayPreciseEditCommandParser.parse(transcript, transactionID: transactionID) {
        case let .success(parsed):
            intent = parsed
        case .failure:
            guard Self.looksLikePreciseEditCommand(transcript) else { return false }
            if source == .turnBased { armTurnBasedAudioSuppression() }
            presentation = .failed(message: "Clementine understood that as an edit request, but not as an exact page, character, and line address. No edit was applied.")
            return true
        }
        guard !isPresented else {
            if source == .turnBased { armTurnBasedAudioSuppression() }
            presentation = .failed(message: "Finish or cancel the current precise edit before starting another one.")
            return true
        }
        if source == .turnBased { armTurnBasedAudioSuppression() }
        let command = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        let generation = UUID()
        preparationGeneration = generation
        activeTransactionID = transactionID
        presentation = .preparing(command: command)
        Task { @MainActor [weak self] in
            guard let self else { return }
            await Self.transactions.protect(transactionID)
            let result = await Self.transactions.prepare(intent: intent, snapshot: snapshot)
            guard preparationGeneration == generation else {
                await Self.transactions.discard(transactionID)
                return
            }
            switch result {
            case let .success(preview):
                presentation = .preview(preview)
            case let .failure(error):
                activeTransactionID = nil
                await Self.transactions.discard(transactionID)
                presentation = .failed(message: Self.message(for: error))
            }
        }
        return true
    }

    func consumeTurnBasedAudioSuppression() -> Bool {
        guard suppressNextTurnBasedAudio, Date() <= turnBasedAudioSuppressionExpiresAt else {
            suppressNextTurnBasedAudio = false
            return false
        }
        suppressNextTurnBasedAudio = false
        return true
    }

    #if DEBUG
    func interceptUITestCommand(_ arguments: [String], bridge: ScreenplayLiveDraftBridge) {
        guard let index = arguments.firstIndex(of: "--ui-precise-edit-command") else { return }
        let valueIndex = arguments.index(after: index)
        guard arguments.indices.contains(valueIndex) else { return }
        _ = interceptFinalTranscript(arguments[valueIndex], source: .uiTest, bridge: bridge)
    }
    #endif

    func confirm(
        currentSnapshot: ScreenplayPreciseEditDocumentSnapshot,
        commit: @MainActor (ScreenplayPreciseEditMutationReceipt) async -> ScreenplayPreciseEditStudioCommitOutcome
    ) async {
        guard case let .preview(preview) = presentation else { return }
        presentation = .applying(preview)
        let applyResult = await Self.transactions.apply(
            confirmation: preview.confirmation,
            currentSnapshot: currentSnapshot
        )
        let mutation: ScreenplayPreciseEditMutationReceipt
        switch applyResult {
        case let .success(receipt):
            mutation = receipt
        case let .failure(error):
            presentation = .failed(message: Self.message(for: error))
            return
        }

        switch await commit(mutation) {
        case .localApplied:
            presentation = .applied(mutation)
        case let .failed(message):
            presentation = .failed(message: message)
        case let .receipt(receipt):
            let receiptResult = await Self.transactions.recordSaveReceipt(receipt)
            switch receiptResult {
            case let .success(state):
                adopt(state)
            case let .failure(error):
                presentation = .failed(message: Self.message(for: error))
            }
        }
    }

    func undo(
        currentSnapshot: ScreenplayPreciseEditDocumentSnapshot,
        commit: @MainActor (ScreenplayPreciseEditUndoReceipt) -> Bool
    ) async {
        guard case let .applied(mutation) = presentation, !mutation.saveRequested else { return }
        switch await Self.transactions.undo(
            transactionID: mutation.transactionID,
            currentSnapshot: currentSnapshot
        ) {
        case let .success(receipt):
            presentation = commit(receipt)
                ? .undone(receipt)
                : .failed(message: "The page changed before the undo could be applied.")
        case let .failure(error):
            presentation = .failed(message: Self.message(for: error))
        }
    }

    func cancel() {
        let transactionID = activeTransactionID
        preparationGeneration = nil
        activeTransactionID = nil
        suppressNextTurnBasedAudio = false
        turnBasedAudioSuppressionExpiresAt = .distantPast
        presentation = .idle
        if let transactionID { Task { await Self.transactions.discard(transactionID) } }
    }

    static func snapshot(projectID: String, baseVersionID: String, draft: String) -> ScreenplayPreciseEditDocumentSnapshot {
        let hashPrefix = String(ScreenplayPreciseEditHash.sha256(draft).prefix(16))
        return ScreenplayPreciseEditDocumentSnapshot(
            projectID: projectID,
            baseVersionID: baseVersionID,
            draft: draft,
            revision: UInt64(hashPrefix, radix: 16) ?? 0
        )
    }

    private func adopt(_ state: ScreenplayPreciseEditTransactionState) {
        switch state {
        case let .localApplied(mutation): presentation = .applied(mutation)
        case let .saveQueued(mutation, receipt): presentation = .queued(mutation, receipt)
        case let .saved(mutation, receipt): presentation = .saved(mutation, receipt)
        case let .failed(_, reason): presentation = .failed(message: reason)
        case let .undone(receipt): presentation = .undone(receipt)
        case .awaitingConfirmation: break
        }
    }

    private func armTurnBasedAudioSuppression() {
        suppressNextTurnBasedAudio = true
        turnBasedAudioSuppressionExpiresAt = Date().addingTimeInterval(5)
    }

    private static func looksLikePreciseEditCommand(_ transcript: String) -> Bool {
        let value = transcript.lowercased()
        return value.range(of: #"\bpage\s+\w+"#, options: .regularExpression) != nil &&
            value.range(of: #"\b(?:replace|change)\b"#, options: .regularExpression) != nil &&
            value.range(of: #"\b(?:line|dialogue)\b"#, options: .regularExpression) != nil
    }

    private static func message(for error: ScreenplayPreciseEditTransactionError) -> String {
        switch error {
        case .invalidProject: return "Open a saved Studio project before making a precise voice edit."
        case .invalidBaseVersion: return "Load a saved draft version before making a precise voice edit."
        case .targetNotFound: return "Clementine could not find that character line on the requested 55-line page."
        case .targetAmbiguous: return "That spoken address matches more than one line. Make the target more specific."
        case .projectChanged: return "The active project changed. No edit was applied."
        case .baseVersionChanged: return "The saved draft version changed. No edit was applied."
        case .draftChanged, .revisionChanged, .targetChanged: return "The page changed after the preview. Review the current page and try again."
        case .confirmationMismatch: return "That confirmation no longer matches the preview."
        case .saveNotRequested: return "This edit was not approved for saving."
        case .saveReceiptMismatch, .invalidQueueReceipt, .invalidServerReceipt, .invalidFailureReceipt:
            return "The save result could not be verified, so Clementine will not call it saved."
        case .transactionIDConflict, .transactionNotPrepared, .invalidReplacementRange:
            return "The precise edit transaction could not be verified. No edit was applied."
        case .undoUnavailable, .undoConflict: return "The page changed, so this edit cannot be safely undone."
        }
    }
}

struct ScreenplayPreciseEditConfirmationOverlay: View {
    @ObservedObject var session: ScreenplayPreciseEditStudioSession
    let snapshot: () -> ScreenplayPreciseEditDocumentSnapshot
    let commit: @MainActor (ScreenplayPreciseEditMutationReceipt) async -> ScreenplayPreciseEditStudioCommitOutcome
    let undo: @MainActor (ScreenplayPreciseEditUndoReceipt) -> Bool

    init(
        session: ScreenplayPreciseEditStudioSession,
        viewModel: ScreenplayStudioViewModel
    ) {
        self.session = session
        snapshot = {
            ScreenplayPreciseEditStudioSession.snapshot(
                projectID: viewModel.selectedProjectID,
                baseVersionID: viewModel.latestVersionID,
                draft: viewModel.fountainDraft
            )
        }
        commit = { await viewModel.commitPreciseVoiceEdit($0) }
        undo = { viewModel.commitPreciseVoiceEditUndo($0) }
    }

    var body: some View {
        if session.isPresented {
            ZStack {
                Color.black.opacity(0.34).ignoresSafeArea()
                content
                    .frame(maxWidth: 520)
                    .padding(20)
            }
            .transition(.opacity)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("studio.precise-edit.overlay")
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Confirm precise edit")
                .font(.title2.weight(.semibold))
                .accessibilityIdentifier("studio.precise-edit.title")
            switch session.presentation {
            case let .preparing(command):
                ProgressView("Finding the exact line…")
                Text(command).font(.caption).foregroundStyle(.secondary)
            case let .preview(preview), let .applying(preview):
                previewContent(preview)
            case let .applied(mutation):
                statusContent("Applied locally", detail: "The exact line changed on this device.")
                actionRow(showUndo: !mutation.saveRequested)
            case let .queued(_, receipt):
                statusContent("Queued safely", detail: queueDetail(receipt))
                actionRow(showUndo: false)
            case .saved:
                statusContent("Saved", detail: "The server confirmed this exact draft transaction.")
                actionRow(showUndo: false)
            case let .failed(message):
                statusContent("Edit needs attention", detail: message)
                actionRow(showUndo: false)
            case .undone:
                statusContent("Edit undone", detail: "The original line is back on the page.")
                actionRow(showUndo: false)
            case .idle:
                EmptyView()
            }
        }
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 24, y: 10)
    }

    private func previewContent(_ preview: ScreenplayPreciseEditPreview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Page \(preview.page) · \(ordinal(preview.dialogueOrdinal)) \(preview.character) line")
                .font(.subheadline.weight(.medium))
            comparison(label: "Current", text: preview.expectedOldText)
            comparison(label: "Replacement", text: preview.replacementText)
            Text(preview.saveRequested ? "Confirm applies this exact edit and secures it in the save queue." : "Confirm applies this exact edit locally. It will not be called saved.")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Button("Cancel", role: .cancel) { session.cancel() }
                    .accessibilityIdentifier("studio.precise-edit.cancel")
                Spacer()
                Button("Confirm edit") {
                    Task { await session.confirm(currentSnapshot: snapshot(), commit: commit) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isApplying)
                .accessibilityIdentifier("studio.precise-edit.confirm")
            }
        }
    }

    private func comparison(label: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(text).font(.system(.body, design: .monospaced)).textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }

    private func statusContent(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline).accessibilityIdentifier("studio.precise-edit.status")
            Text(detail).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private func actionRow(showUndo: Bool) -> some View {
        HStack {
            if showUndo {
                Button("Undo edit") {
                    Task { await session.undo(currentSnapshot: snapshot(), commit: undo) }
                }
                .accessibilityIdentifier("studio.precise-edit.undo")
            }
            Spacer()
            Button("Done") { session.cancel() }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("studio.precise-edit.done")
        }
    }

    private var isApplying: Bool {
        if case .applying = session.presentation { return true }
        return false
    }

    private func queueDetail(_ receipt: ScreenplayPreciseEditSaveReceipt) -> String {
        guard case let .queued(queueID) = receipt.outcome else { return "The edit is secured locally." }
        return "The edit is secured locally as \(queueID.prefix(8)). Clementine will not call it saved until the server confirms it."
    }

    private func ordinal(_ value: Int) -> String {
        let suffix: String
        if (11...13).contains(value % 100) { suffix = "th" }
        else { suffix = [1: "st", 2: "nd", 3: "rd"][value % 10] ?? "th" }
        return "\(value)\(suffix)"
    }
}
