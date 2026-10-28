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
    var destinationTitle: String? = nil
    var onAppend: ((OfflineTalkReceivedReply, BackendTalkResult) async throws -> String)? = nil
    @State private var result: BackendTalkResult?
    @State private var packet: OfflineTalkReceivedReply?
    @StateObject private var player = AudioPlayer()
    @State private var playing = false
    @State private var applying = false
    @State private var delivered = false
    @State private var status = ""
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
                        Text(offlineTalkReplyDisplayText(outputText: result.screenplayOutput?.text, reply: result.reply))
                            .font(result.screenplayOutput?.writesToPage == true ? .system(.body, design: .monospaced) : .body)
                            .textSelection(.enabled)
                            .accessibilityIdentifier("talk.recovery.reply.text")
                        Button(playing ? "Stop playback" : "Play reply") {
                            if playing { player.stop(); playing = false }
                            else {
                                do { try player.play(url: result.audioURL, onFinish: { playing = false }); playing = true }
                                catch { self.error = error.localizedDescription }
                            }
                        }.buttonStyle(.bordered).disabled(applying).accessibilityIdentifier("talk.recovery.reply.play")
                        if let onAppend, let packet, result.screenplayOutput?.writesToPage == true, !delivered {
                            Text(packet.pageDelivery?.liveMutation != nil
                                ? (packet.savedPage != nil ? "The original change has a confirmed saved version. Finish recovery without inserting it again."
                                    : "Recover the recorded page change in its original project. Newer edits need review before a replacement can be applied.")
                                : "Append this scene to \(destinationTitle ?? "the selected project"). Existing text will not be replaced.")
                                .font(.caption).foregroundStyle(.secondary)
                            Button(packet.savedPage != nil ? "Finish saved recovery" : packet.pageDelivery?.liveMutation != nil
                                ? "Recover original page change" : packet.pageDelivery == nil ? "Append & save scene" : "Finish saved recovery") {
                                player.stop(); playing = false; applying = true; error = ""; status = "Confirming the page change and saved version…"
                                Task { @MainActor in
                                    defer { applying = false }
                                    do { status = try await onAppend(packet, result); delivered = true }
                                    catch { self.error = error.localizedDescription; status = "Recovery needs review. Refresh received replies to continue." }
                                }
                            }.buttonStyle(.borderedProminent).disabled(applying)
                                .accessibilityIdentifier("talk.recovery.reply.append")
                        }
                        if applying { ProgressView() }
                        if !status.isEmpty { Text(status).font(.caption).accessibilityIdentifier("talk.recovery.reply.status") }
                        if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.secondary) }
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
            markRecoveryTiming("opened")
            do {
                guard review.scope.isCurrent else { throw OfflineTalkPreviousOwnerError() }
                var received = try await OfflineTalkOutbox.shared.receivedReply(review.entryID,
                    initiatingIdentity: review.owner, backendURL: review.scope.backendURL)
                markRecoveryTiming("received")
                let api = BackendClient()
                let decoded: BackendTalkResult
                do {
                    decoded = try await api.decodeReceivedTalkReply(received,
                        initiatingIdentity: review.owner, backendURL: review.scope.backendURL)
                } catch {
                    let enriched = try await OfflineTalkOutbox.shared.captureReceivedTurnMetadata(review.entryID,
                        initiatingIdentity: review.owner, backendURL: review.scope.backendURL, client: api)
                    decoded = try await api.decodeReceivedTalkReply(enriched,
                        initiatingIdentity: review.owner, backendURL: review.scope.backendURL)
                    received = enriched
                }
                guard !Task.isCancelled, review.scope.isCurrent else {
                    try? FileManager.default.removeItem(at: decoded.audioURL)
                    throw OfflineTalkPreviousOwnerError()
                }
                result = decoded
                packet = received
                markRecoveryTiming("ready")
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
        player.stop(); playing = false
        if let result { try? FileManager.default.removeItem(at: result.audioURL) }
        result = nil
    }

    private func markRecoveryTiming(_ stage: String) {
        #if DEBUG
        if IOThemRuntime.isRunningUITests, ProcessInfo.processInfo.arguments.contains("--ui-talk-page-recovery-fixture") {
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "ui-talk-recovery-timing-\(stage)")
        }
        #endif
    }
}

nonisolated func offlineTalkReplyDisplayText(outputText: String?, reply: String?) -> String {
    [outputText, reply].compactMap { $0 }.first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        ?? "No reply text was included."
}
