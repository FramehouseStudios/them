import Combine
import ScreenplayStudio
import SwiftUI

nonisolated enum ThemMagicMomentOnboardingPolicy {
    enum PendingIntent: Equatable {
        case page(name: String, sceneSeed: String)
        case voice(name: String)
    }

    struct PendingAction: Equatable, Identifiable {
        let id = UUID()
        var intent: PendingIntent?

        init(intent: PendingIntent) {
            self.intent = intent
        }
    }

    enum StartDecision: Equatable {
        case proceed
        case restorePersistedSession
        case presentAccount
    }

    static func startDecision(
        workspaceAccessDecision: ThemWorkspaceAuthenticationPolicy.AccessDecision
    ) -> StartDecision {
        switch workspaceAccessDecision {
        case .openWorkspace:
            return .proceed
        case .refreshPersistedSession:
            return .restorePersistedSession
        case .requireAccount:
            return .presentAccount
        }
    }

    static func takePendingIntent(_ pendingIntent: inout PendingIntent?) -> PendingIntent? {
        defer { pendingIntent = nil }
        return pendingIntent
    }

    static func cancelPendingIntent(_ pendingIntent: inout PendingIntent?) {
        pendingIntent = nil
    }

    static func ownsPendingAction(_ pendingAction: PendingAction?, actionID: UUID) -> Bool {
        pendingAction?.id == actionID && pendingAction?.intent != nil
    }

    static func takePendingAction(_ pendingAction: inout PendingAction?, actionID: UUID) -> PendingIntent? {
        guard var action = pendingAction, ownsPendingAction(action, actionID: actionID) else { return nil }
        let intent = takePendingIntent(&action.intent)
        pendingAction = nil
        return intent
    }

    @discardableResult
    static func cancelPendingAction(_ pendingAction: inout PendingAction?, actionID: UUID) -> Bool {
        guard var action = pendingAction, ownsPendingAction(action, actionID: actionID) else { return false }
        cancelPendingIntent(&action.intent)
        pendingAction = nil
        return true
    }

    static func reconcileThenResume(
        actionID: UUID,
        currentAction: () -> PendingAction?,
        reconcileAccountSession: () -> Void,
        resumePendingIntent: () -> Void
    ) {
        reconcileThenResume(reconcileAccountSession: reconcileAccountSession) {
            guard ownsPendingAction(currentAction(), actionID: actionID) else { return }
            resumePendingIntent()
        }
    }

    static func completeSessionRestore(
        actionID: UUID,
        currentAction: () -> PendingAction?,
        isAuthenticated: Bool,
        reconcileAccountSession: () -> Void,
        resumePendingIntent: () -> Void,
        presentAccount: () -> Void
    ) {
        if isAuthenticated {
            reconcileThenResume(actionID: actionID, currentAction: currentAction,
                reconcileAccountSession: reconcileAccountSession, resumePendingIntent: resumePendingIntent)
        } else if ownsPendingAction(currentAction(), actionID: actionID) {
            presentAccount()
        }
    }

    static func reconcileThenResume(
        reconcileAccountSession: () -> Void,
        resumePendingIntent: () -> Void
    ) {
        reconcileAccountSession()
        resumePendingIntent()
    }
}

#if DEBUG
@MainActor
final class MagicMomentAuthResumeProofStore: ObservableObject {
    static let shared = MagicMomentAuthResumeProofStore()

    @Published private(set) var pageStartCount = 0
    @Published private(set) var voiceStartCount = 0

    private init() {}

    func recordPageStart() {
        pageStartCount += 1
    }

    func recordVoiceStart() {
        voiceStartCount += 1
    }
}

@MainActor
struct MagicMomentAuthResumeProofView: View {
    @ObservedObject private var proof = MagicMomentAuthResumeProofStore.shared

    var body: some View {
        Text("Magic moment submissions \(proof.pageStartCount). Voice starts \(proof.voiceStartCount).")
            .font(IOThemTypography.UI.caption)
            .foregroundStyle(Color.clear)
            .frame(width: 1, height: 1)
            .allowsHitTesting(false)
            .accessibilityIdentifier("onboarding.auth-resume.proof")
            .accessibilityLabel(
                "Magic moment submissions \(proof.pageStartCount). Voice starts \(proof.voiceStartCount)."
            )
    }
}
#endif

@MainActor
struct MagicMomentOnboardingFlow: View {
    let initialName: String
    let onAccountSessionChanged: () -> Void
    let onStartPage: (_ name: String, _ sceneSeed: String) async -> String?
    let onStartVoice: (_ name: String) -> String?

    @State private var name: String
    @State private var sceneSeed = ""
    @State private var errorMessage = ""
    @State private var pendingAction: ThemMagicMomentOnboardingPolicy.PendingAction?
    @State private var isSubmitting = false
    @State private var restoringActionID: UUID?
    @State private var accountActionID: UUID?
    @FocusState private var nameFocused: Bool
    @FocusState private var sceneFocused: Bool
    @AccessibilityFocusState private var headerAccessibilityFocused: Bool
    @AccessibilityFocusState private var statusAccessibilityFocused: Bool

    init(
        initialName: String,
        onAccountSessionChanged: @escaping () -> Void,
        onStartPage: @escaping (_ name: String, _ sceneSeed: String) async -> String?,
        onStartVoice: @escaping (_ name: String) -> String?
    ) {
        self.initialName = initialName
        self.onAccountSessionChanged = onAccountSessionChanged
        self.onStartPage = onStartPage
        self.onStartVoice = onStartVoice
        _name = State(initialValue: initialName)
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.08)
                .ignoresSafeArea()

            GeometryReader { viewport in
                ScrollView {
                    VStack(spacing: 22) {
                        VStack(spacing: 8) {
                            Text("Start your first page")
                                .font(IOThemTypography.UI.editorialTitle)
                                .foregroundStyle(IOThemColors.Text.primary)
                                .multilineTextAlignment(.center)
                                .accessibilityAddTraits(.isHeader)
                                .accessibilityFocused($headerAccessibilityFocused)

                            Text("Give Clementine your name and, if you have one, the spark of a scene.")
                                .font(IOThemTypography.UI.callout)
                                .foregroundStyle(IOThemColors.Text.primary.opacity(0.82))
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        OnboardingInputRecoveryScope(name: $name, premise: $sceneSeed) { nameInput, premiseInput in
                            VStack(alignment: .leading, spacing: 16) {
                                fieldLabel("Your name")
                                TextField("How should Clementine address you?", text: nameInput)
                                    .font(IOThemTypography.UI.body)
                                    .foregroundStyle(IOThemColors.Text.primary)
                                    .textFieldStyle(.plain)
                                    .onboardingFieldChrome()
                                    .focused($nameFocused)
                                    .submitLabel(.next)
                                    .onSubmit {
                                        if canStart { sceneFocused = true }
                                    }
                                    .accessibilityLabel("Your name")
                                    .accessibilityHint("Required. Used to personalize your private writing workspace.")
                                    .accessibilityIdentifier("onboarding.name.field")

                                fieldLabel("Scene idea (optional)")
                                TextField(
                                    "A detective finds a letter under a motel door…",
                                    text: premiseInput,
                                    axis: .vertical
                                )
                                    .font(IOThemTypography.UI.body)
                                    .foregroundStyle(IOThemColors.Text.primary)
                                    .textFieldStyle(.plain)
                                    .lineLimit(3...5)
                                    .onboardingFieldChrome()
                                    .focused($sceneFocused)
                                    .submitLabel(.go)
                                    .onSubmit { requestPage() }
                                    .accessibilityLabel("Scene idea, optional")
                                    .accessibilityHint("Describe a scene spark, or leave this empty for a guided first page.")
                                    .accessibilityIdentifier("onboarding.scene.field")
                            }
                        }

                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 10) { onboardingActions }
                                .fixedSize(horizontal: true, vertical: false)
                            VStack(spacing: 10) { onboardingActions }
                        }

                        Text(
                            errorMessage.isEmpty
                                ? "Your draft stays connected to your private account and syncs across your devices."
                                : errorMessage
                        )
                            .font(IOThemTypography.UI.caption)
                            .foregroundStyle(
                                errorMessage.isEmpty
                                    ? IOThemColors.Text.primary.opacity(0.76)
                                    : Color.red.opacity(0.92)
                            )
                            .multilineTextAlignment(.center)
                            .lineLimit(3)
                            .frame(minHeight: 34)
                            .accessibilityFocused($statusAccessibilityFocused)

                    }
                    .padding(28)
                    .frame(maxWidth: 430)
                    .background(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(IOThemColors.Paper.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(IOThemColors.Shell.stroke.opacity(0.56), lineWidth: 1)
                    )
                    .shadow(color: IOThemColors.Paper.shadow, radius: 28, x: 0, y: 18)
                    .padding(.horizontal, 20)
                    .accessibilityElement(children: .contain)
                    .accessibilityAddTraits(.isModal)
                    .onAppear {
                        headerAccessibilityFocused = true
                        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            nameFocused = true
                        }
                    }
                    .onChange(of: errorMessage) { _, value in
                        if !value.isEmpty { statusAccessibilityFocused = true }
                    }
                    .frame(maxWidth: .infinity, minHeight: viewport.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .background {
            if let accountActionID {
                accountSheet(for: accountActionID).id(accountActionID)
            }
        }
    }

    private func accountSheet(for actionID: UUID) -> some View {
        // Each presenter keeps its captured owner through dismissal. An old
        // sheet's callbacks must never read a replacement action's identity.
        Color.clear.frame(width: 0, height: 0)
            .sheet(isPresented: Binding(
                get: { accountActionID == actionID },
                set: { if !$0 { cancelPendingAndDismiss(actionID: actionID) } }
            ), onDismiss: { cancelPendingAndDismiss(actionID: actionID) }) {
                ProfileAccountScreen(
                    onSessionChanged: { accountSessionChanged(actionID: actionID) },
                    onDone: { cancelPendingAndDismiss(actionID: actionID) }
                )
            }
    }

    private var isRestoringSession: Bool { restoringActionID != nil }
    private var isShowingAccount: Bool { accountActionID != nil }

    private var canStart: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !isSubmitting
            && !isRestoringSession
    }

    private var requiresSignIn: Bool {
        if IOThemRuntime.bypassesAuthenticationForUITests { return false }
        let session = BackendAuthClient.currentAuthSessionState()
        return !session.isAuthenticated || session.accessExpired
    }

    private var voiceButtonTitle: String {
        requiresSignIn ? "Sign in & Use Voice" : "Voice to Scene"
    }

    private var pageButtonTitle: String {
        if isRestoringSession { return "Restoring sign-in…" }
        if isSubmitting { return isShowingAccount ? "Waiting for sign-in…" : "Writing…" }
        return requiresSignIn ? "Sign in & Start Page" : "Start Page"
    }

    private func fieldLabel(_ title: String) -> some View {
        Text(title)
            .font(IOThemTypography.UI.captionStrong)
            .foregroundStyle(IOThemColors.Text.primary.opacity(0.88))
    }

    @ViewBuilder
    private var onboardingActions: some View {
        actionButton(
            title: voiceButtonTitle,
            filled: false,
            hint: "Opens your private workspace and starts listening for a scene.",
            identifier: "onboarding.voice-to-scene",
            action: requestVoice
        )
        actionButton(
            title: pageButtonTitle,
            filled: true,
            hint: "Creates a private project and writes a first screenplay page from your scene idea.",
            identifier: "onboarding.start-page",
            action: requestPage
        )
    }

    private func actionButton(
        title: String,
        filled: Bool,
        hint: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .font(IOThemTypography.UI.bodyStrong)
        .foregroundStyle(
            filled
                ? IOThemColors.Paper.surface.opacity(canStart ? 1 : 0.70)
                : IOThemColors.Accent.studio.opacity(canStart ? 1 : 0.44)
        )
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(filled ? IOThemColors.Accent.studio.opacity(canStart ? 1 : 0.42) : IOThemColors.Paper.surface)
        )
        .overlay {
            if !filled {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(IOThemColors.Accent.studio.opacity(canStart ? 0.70 : 0.30), lineWidth: 1)
            }
        }
        .disabled(!canStart)
        .accessibilityHint(hint)
        .accessibilityIdentifier(identifier)
    }

    private func requestPage() {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty, canStart else {
            nameFocused = true
            return
        }
        begin(.page(name: cleanName, sceneSeed: sceneSeed))
    }

    private func requestVoice() {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty, canStart else {
            nameFocused = true
            return
        }
        begin(.voice(name: cleanName))
    }

    private func begin(_ intent: ThemMagicMomentOnboardingPolicy.PendingIntent) {
        let action = ThemMagicMomentOnboardingPolicy.PendingAction(intent: intent)
        pendingAction = action
        errorMessage = ""
        let session = BackendAuthClient.currentAuthSessionState()
        let accessDecision = ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: session.isAuthenticated,
            accessTokenExpired: session.accessExpired,
            refreshTokenPresent: session.refreshTokenPresent,
            isRunningUITests: IOThemRuntime.bypassesAuthenticationForUITests
        )

        switch ThemMagicMomentOnboardingPolicy.startDecision(workspaceAccessDecision: accessDecision) {
        case .proceed:
            resumePendingIntentIfAuthenticated(actionID: action.id)
        case .restorePersistedSession:
            restoreSessionThenResume(actionID: action.id)
        case .presentAccount:
            presentAccount(actionID: action.id)
        }
    }

    private func restoreSessionThenResume(actionID: UUID) {
        guard !isRestoringSession,
              ThemMagicMomentOnboardingPolicy.ownsPendingAction(pendingAction, actionID: actionID) else { return }
        restoringActionID = actionID
        Task { @MainActor in
            defer {
                if restoringActionID == actionID { restoringActionID = nil }
            }
            do {
                let restored = try await BackendAuthClient.restorePersistedAuthSessionIfNeeded()
                ThemMagicMomentOnboardingPolicy.completeSessionRestore(
                    actionID: actionID, currentAction: { pendingAction },
                    isAuthenticated: restored.isAuthenticated && !restored.accessExpired,
                    reconcileAccountSession: onAccountSessionChanged,
                    resumePendingIntent: { resumePendingIntentIfAuthenticated(actionID: actionID) },
                    presentAccount: { presentAccount(actionID: actionID) }
                )
            } catch {
                ThemMagicMomentOnboardingPolicy.completeSessionRestore(
                    actionID: actionID, currentAction: { pendingAction }, isAuthenticated: false,
                    reconcileAccountSession: onAccountSessionChanged,
                    resumePendingIntent: { resumePendingIntentIfAuthenticated(actionID: actionID) },
                    presentAccount: {
                        errorMessage = "Your saved session could not be refreshed. Sign in again when you’re ready."
                        presentAccount(actionID: actionID)
                    }
                )
            }
        }
    }

    private func presentAccount(actionID: UUID) {
        guard ThemMagicMomentOnboardingPolicy.ownsPendingAction(pendingAction, actionID: actionID) else { return }
        errorMessage = "Sign in to save this draft to your private workspace and sync it across your devices."
        accountActionID = actionID
    }

    private func accountSessionChanged(actionID: UUID) {
        ThemMagicMomentOnboardingPolicy.reconcileThenResume(
            actionID: actionID, currentAction: { pendingAction },
            reconcileAccountSession: onAccountSessionChanged,
            resumePendingIntent: { resumePendingIntentIfAuthenticated(actionID: actionID) }
        )
    }

    private func resumePendingIntentIfAuthenticated(actionID: UUID) {
        guard ThemMagicMomentOnboardingPolicy.ownsPendingAction(pendingAction, actionID: actionID) else { return }
        let session = BackendAuthClient.currentAuthSessionState()
        guard IOThemRuntime.bypassesAuthenticationForUITests
                || (session.isAuthenticated && !session.accessExpired) else {
            presentAccount(actionID: actionID)
            return
        }
        guard let intent = ThemMagicMomentOnboardingPolicy.takePendingAction(&pendingAction, actionID: actionID) else { return }
        if accountActionID == actionID { accountActionID = nil }
        if restoringActionID == actionID { restoringActionID = nil }
        errorMessage = ""

        switch intent {
        case .page(let capturedName, let capturedSceneSeed):
            isSubmitting = true
            #if DEBUG
            if IOThemRuntime.allowsUITestAuthenticationResumeFixture {
                MagicMomentAuthResumeProofStore.shared.recordPageStart()
            }
            #endif
            Task { @MainActor in
                let error = await onStartPage(capturedName, capturedSceneSeed)
                isSubmitting = false
                if let error = error?.trimmingCharacters(in: .whitespacesAndNewlines), !error.isEmpty {
                    errorMessage = error
                } else {
                    sceneSeed = ""
                }
            }
        case .voice(let capturedName):
            #if DEBUG
            if IOThemRuntime.allowsUITestAuthenticationResumeFixture {
                MagicMomentAuthResumeProofStore.shared.recordVoiceStart()
            }
            #endif
            if let error = onStartVoice(capturedName) {
                errorMessage = error
            }
        }
    }

    private func cancelPendingAndDismiss(actionID: UUID) {
        guard ThemMagicMomentOnboardingPolicy.cancelPendingAction(&pendingAction, actionID: actionID) else { return }
        if accountActionID == actionID { accountActionID = nil }
        if restoringActionID == actionID { restoringActionID = nil }
        errorMessage = "Sign in when you’re ready. Your name and scene idea are still here."
        nameFocused = true
    }
}

private extension View {
    func onboardingFieldChrome() -> some View {
        self
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(IOThemColors.Shell.panelSoft)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(IOThemColors.Shell.stroke.opacity(0.64), lineWidth: 1)
            )
            .tint(IOThemColors.Accent.studio)
    }
}
