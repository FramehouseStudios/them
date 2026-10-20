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
    @Published var newProjectTitle = ""
    @Published private(set) var offersNewProject = false
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
        reply = nil; plan = nil; message = ""; newProjectTitle = ""; offersNewProject = false; isPresented = true
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
                    if retained.projectCreation != nil {
                        offersNewProject = true
                        newProjectTitle = retained.projectCreation?.title ?? ""
                        message = "This recovered project's setup is retained. Continue its original creation; no second project will be requested."
                        return
                    }
                    message = "This page is already on the screenplay. Use Save now or resolve its pending save; it will not be inserted twice."
                    return
                }
            }
            if retained.projectCreation != nil || (retained.originalWriteContext?.projectID == "" &&
                retained.originalWriteContext?.target == "page" && retained.screenplay?.writesToPage == true) {
                offersNewProject = true
                newProjectTitle = retained.projectCreation?.title ?? ""
                message = "What is this screenplay called? Create a new project from the recovered text, with its own title page. Other scripts will not be replaced."
                return
            }
            plan = try RecoveredPagePlan.make(reply: retained, draft: studio.fountainDraft,
                projectID: studio.selectedProjectID, versionID: studio.latestVersionID)
            message = "Review the resulting screenplay below. Apply and save uses the original placement, not today's cursor."
        } catch { message = error.localizedDescription }
    }

    func createProject() async {
        guard !busy, offersNewProject, let reply, let auth, let studio else { return }
        busy = true
        defer { busy = false }
        do {
            let creation = try reply.projectCreation ?? RecoveredPageCreation.make(reply: reply, title: newProjectTitle)
            let retained = try await outbox.prepareRecoveredProject(id: reply.id, expectedOwnerID: reply.ownerID, creation: creation)
            self.reply = retained
            newProjectTitle = creation.title
            if let version = try await studio.createRecoveredProject(creation, replyID: reply.id, expectedAuth: auth) {
                try await outbox.acknowledgeRecoveredPage(id: reply.id, expectedOwnerID: reply.ownerID,
                    application: creation.application, savedVersionID: version)
                offersNewProject = false
                message = "New screenplay saved and confirmed by the server. Your recovered reply remains retained."
            } else {
                message = "Not yet confirmed by the server. The title, project identity and complete story are kept locally. Continue this same setup or use Studio's save controls."
            }
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
                    if controller.offersNewProject {
                        TextField("Screenplay title", text: $controller.newProjectTitle)
                            .font(IOThemTypography.UI.body).textFieldStyle(.roundedBorder)
                            .disabled(controller.busy || controller.reply?.projectCreation != nil)
                            .accessibilityIdentifier("recovery.page.title")
                        Button { Task { await controller.createProject() } } label: {
                            Label(controller.reply?.projectCreation == nil ? "Create and save screenplay" : "Continue saved project setup", systemImage: "doc.badge.plus")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(SoftPrimaryButtonStyle()).disabled(controller.busy || controller.newProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("recovery.page.create")
                        if let text = controller.reply?.projectCreation?.draft ?? controller.reply?.screenplay?.text {
                            Text(text).font(IOThemTypography.Screenplay.font(for: .action)).textSelection(.enabled)
                                .accessibilityIdentifier("recovery.page.preview")
                        }
                    }
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
