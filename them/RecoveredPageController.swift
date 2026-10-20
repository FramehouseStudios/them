import SwiftUI
import Combine
import ScreenplayStudio

/// Review owns presentation; Studio remains the sole editor/save owner.
@MainActor
final class RecoveredPageController: ObservableObject {
    @Published var isPresented = false
    @Published private(set) var reply: RecoveredTalkReply?
    @Published private(set) var plan: RecoveredPagePlan?
    @Published private(set) var message = ""
    @Published private(set) var busy = false
    private weak var studio: ScreenplayStudioViewModel?
    private let outbox: OfflineTalkOutbox
    private var auth: ScreenplayStudioAuthContext?

    init(studio: ScreenplayStudioViewModel, outbox: OfflineTalkOutbox = .shared) {
        self.studio = studio
        self.outbox = outbox
    }

    func review(id: String, ownerID: String) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        reply = nil; plan = nil; message = ""; isPresented = true
        let expected = ScreenplayStudioAuthContext.current()
        auth = expected
        do {
            let retained = try await outbox.recoveredReply(id: id, expectedOwnerID: ownerID)
            guard ScreenplayStudioAuthContextPolicy.matches(expected: expected, current: .current()),
                  ownerID == expected.userID, let studio else { throw RecoveredPagePlan.failure("Account changed. No page was changed.") }
            reply = retained
            if let application = retained.pageApplication {
                if application.savedVersionID != nil {
                    message = "This recovered page was already saved. It will not be inserted again."
                    return
                }
                if let version = studio.confirmedRecoveredPageVersion(application) {
                    try await outbox.acknowledgeRecoveredPage(id: id, expectedOwnerID: ownerID,
                        application: application, savedVersionID: version)
                    message = "The server already confirmed this exact recovered draft. Nothing was inserted again."
                    return
                }
                if application.proposedDraftIdentity.matches(studio.fountainDraft) {
                    message = "This page is already on the screenplay. Use Save now or resolve its pending save; it will not be inserted twice."
                    return
                }
            }
            plan = try RecoveredPagePlan.make(reply: retained, draft: studio.fountainDraft,
                projectID: studio.selectedProjectID, versionID: studio.latestVersionID)
            message = "Review the resulting screenplay below. Apply and save uses the original placement, not today's cursor."
        } catch { message = error.localizedDescription }
    }

    func apply() async {
        guard !busy, let reply, let plan, let auth, let studio else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await outbox.prepareRecoveredPage(id: reply.id, expectedOwnerID: reply.ownerID,
                application: plan.application)
            let version = try await studio.enqueueRecoveredPage(plan, requestID: "recovered-page-\(reply.id)", expectedAuth: auth)
            self.plan = nil // Subsequent attempts go through a fresh review, never an old proposal.
            if let version {
                try await outbox.acknowledgeRecoveredPage(id: reply.id, expectedOwnerID: reply.ownerID,
                    application: plan.application, savedVersionID: version)
                message = "Recovered page saved and confirmed by the server."
            } else {
                message = "Not yet confirmed by the server. Your recovered reply and local save are retained. Check Studio's save status."
            }
        } catch { self.plan = nil; message = error.localizedDescription }
    }
}

struct StudioPresentationModifier<Thread: View, Pages: View, Focus: View>: ViewModifier {
    @Binding var fullThreadPresented: Bool
    @Binding var pagesPresented: Bool
    @ViewBuilder var thread: () -> Thread
    @ViewBuilder var pages: () -> Pages
    @ViewBuilder var focus: () -> Focus
    @ObservedObject var recovery: RecoveredPageController

    func body(content: Content) -> some View {
        content.sheet(isPresented: $fullThreadPresented, content: thread)
            .sheet(isPresented: $pagesPresented, content: pages)
            .sheet(isPresented: $recovery.isPresented) { RecoveredPagePreview(controller: recovery) }
            .background(focus())
    }
}

private struct RecoveredPagePreview: View {
    @ObservedObject var controller: RecoveredPageController
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xl) {
                    Text(controller.message).font(IOThemTypography.UI.body).accessibilityIdentifier("recovery.page.status")
                    if let plan = controller.plan {
                        Button { Task { await controller.apply() } } label: {
                            Label("Apply and save recovered page", systemImage: "doc.badge.arrow.up")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(SoftPrimaryButtonStyle()).disabled(controller.busy)
                        .accessibilityIdentifier("recovery.page.apply")
                        Text(plan.draft).font(IOThemTypography.Screenplay.font(for: .action)).textSelection(.enabled)
                            .accessibilityIdentifier("recovery.page.preview")
                    }
                    if controller.busy { ProgressView("Saving locally, then confirming with the server…") }
                }.padding(IOThemSpacing.Scale.xxl).frame(maxWidth: 720, alignment: .leading)
            }
            .foregroundStyle(Color.herText)
            .background(LinearGradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom],
                startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            .navigationTitle("Review recovered page").toolbarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
