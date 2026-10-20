import SwiftUI

struct RecoveredTalkReplyReview: View {
    let reply: RecoveredTalkReply
    var onDeleted: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var responseURL: URL?
    @State private var error = ""
    @State private var confirmingDelete = false

    var body: some View {
        NavigationStack {
            ScrollView {
              VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Saved on this device. Not applied to your screenplay.").font(.callout.weight(.semibold))
                    if let context = reply.originalWriteContext {
                        Text(context.projectID.isEmpty ? "No project was selected for the original request." : "Original project: \(context.projectID)")
                            .font(.caption).accessibilityIdentifier("recovery.reply.original-project")
                        if !context.documentRevisionID.isEmpty {
                            Text("Original revision: \(context.documentRevisionID)").font(.caption)
                        }
                        Text("Original request context is retained. Your draft may have changed since then.").font(.caption)
                    } else {
                        Text("Original project and revision context was not recorded for this older request. It cannot be inferred from the open screenplay.").font(.caption)
                    }
                    if !reply.projectID.isEmpty { Text("Project reported by service: \(reply.projectID)").font(.caption) }
                    if reply.hasOnlyPagePreview {
                        Text("Only a preview was returned here. Do not use it as the complete screenplay page.").font(.callout)
                    }
                    Text("Kept until you delete it here. Clearing server history does not remove this local recovery copy.").font(.caption)
                }
                .foregroundStyle(Color.herText)
                .frame(maxWidth: .infinity, alignment: .leading)
                ConversationThreadContent(thread: ConversationThread(id: reply.id, turn: 0, title: "Recovered reply",
                    lastUpdated: Date(timeIntervalSince1970: reply.receivedAt), preview: "",
                    userMessage: reply.transcript, assistantMessage: reply.reply))
                if let responseURL {
                    ShareLink(item: responseURL) {
                        Label("Share recovered response file", systemImage: "square.and.arrow.up")
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                        .buttonStyle(SoftPrimaryButtonStyle())
                        .foregroundStyle(Color.herText)
                        .accessibilityIdentifier("recovery.reply.share-file")
                }
                if !error.isEmpty { Text(error).font(.callout).foregroundStyle(Color.herText) }
              }
              .padding(24)
              .frame(maxWidth: 720, alignment: .leading)
            }
            .background(LinearGradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            .navigationTitle("Recovered reply")
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.accessibilityIdentifier("recovery.reply.done")
                }
                ToolbarItem(placement: .destructiveAction) {
                    Button("Delete", role: .destructive) { confirmingDelete = true }
                        .accessibilityIdentifier("recovery.reply.delete")
                }
            }
            .confirmationDialog("Delete this recovered reply and its original request from this device?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete recovered reply", role: .destructive) {
                    Task { @MainActor in
                        do {
                            try await OfflineTalkOutbox.shared.deleteRecoveredReply(id: reply.id, expectedOwnerID: reply.ownerID)
                            await onDeleted()
                            dismiss()
                        } catch { self.error = error.localizedDescription }
                    }
                }
            }
        }
        .task {
            do { responseURL = try await OfflineTalkOutbox.shared.recoveredResponseURL(id: reply.id, expectedOwnerID: reply.ownerID) }
            catch { self.error = error.localizedDescription }
        }
    }
}
