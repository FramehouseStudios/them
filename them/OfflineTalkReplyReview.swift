import SwiftUI

struct OfflineTalkReplyReview: Identifiable {
    let entryID: String
    let owner: BackendAuthRequestIdentity
    let scope: OfflineTalkRecoveryScope
    var id: String { entryID }
}

/// A transient presentation of the existing durable outbox, not a second
/// conversation store. Reading/closing never acknowledges page/audio delivery.
struct OfflineTalkReplyReviewView: View {
    let review: OfflineTalkReplyReview
    var onDone: () -> Void
    @State private var result: BackendTalkResult?
    @State private var error = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("This reply is kept on this device. Reviewing it does not add it to your screenplay or mark it delivered.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    if let result {
                        if let transcript = result.transcript, !transcript.isEmpty {
                            Text("You said").font(.headline)
                            Text(transcript).textSelection(.enabled)
                        }
                        Text("Clementine’s reply").font(.headline)
                        Text(result.screenplayOutput?.text ?? result.reply ?? "No reply text was included.")
                            .font(result.screenplayOutput?.writesToPage == true ? .system(.body, design: .monospaced) : .body)
                            .textSelection(.enabled)
                            .accessibilityIdentifier("talk.recovery.reply.text")
                    } else if !error.isEmpty {
                        Text(error).foregroundStyle(.secondary)
                            .accessibilityIdentifier("talk.recovery.reply.error")
                    } else {
                        ProgressView("Opening saved reply…")
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding()
            }
            .navigationTitle("Received reply")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close", action: onDone) } }
        }
        .task(id: review.id) {
            do {
                guard review.scope.isCurrent else { throw OfflineTalkPreviousOwnerError() }
                let packet = try await OfflineTalkOutbox.shared.receivedReply(review.entryID,
                    initiatingIdentity: review.owner, backendURL: review.scope.backendURL)
                let api = BackendClient()
                let decoded: BackendTalkResult
                do {
                    decoded = try await api.decodeReceivedTalkReply(packet,
                        initiatingIdentity: review.owner, backendURL: review.scope.backendURL)
                } catch {
                    let enriched = try await OfflineTalkOutbox.shared.captureReceivedTurnMetadata(review.entryID,
                        initiatingIdentity: review.owner, backendURL: review.scope.backendURL, client: api)
                    decoded = try await api.decodeReceivedTalkReply(enriched,
                        initiatingIdentity: review.owner, backendURL: review.scope.backendURL)
                }
                guard !Task.isCancelled, review.scope.isCurrent else {
                    try? FileManager.default.removeItem(at: decoded.audioURL)
                    throw OfflineTalkPreviousOwnerError()
                }
                result = decoded
            } catch { self.error = error.localizedDescription }
        }
        .onReceive(NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged)) { _ in
            discardPreview(); onDone()
        }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in
            if !review.scope.isCurrent { discardPreview(); onDone() }
        }
        .onDisappear { discardPreview() }
    }

    private func discardPreview() {
        if let result { try? FileManager.default.removeItem(at: result.audioURL) }
        result = nil
    }
}
