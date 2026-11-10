import Combine
import ScreenplayStudio
import SwiftUI

nonisolated enum ThemMagicMomentOnboardingPolicy {
    enum PendingIntent: Equatable {
        case page(name: String, sceneSeed: String)
        case voice(name: String)
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
    @State private var pendingIntent: ThemMagicMomentOnboardingPolicy.PendingIntent?
    @State private var isSubmitting = false
    @State private var isRestoringSession = false
    @State private var isShowingAccount = false
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

            VStack(spacing: 22) {
                VStack(spacing: 8) {
                    Text("Start your first page")
                        .font(IOThemTypography.UI.editorialTitle)
                        .foregroundStyle(IOThemColors.Text.primary)
                        .multilineTextAlignment(.center)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityFocused($headerAccessibilityFocused)

                    Text("Give io.them your name and, if you have one, the spark of a scene.")
                        .font(IOThemTypography.UI.callout)
                        .foregroundStyle(IOThemColors.Text.primary.opacity(0.82))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 16) {
                    fieldLabel("Your name")
                    TextField("How should io.them address you?", text: $name)
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
                        text: $sceneSeed,
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

                HStack(spacing: 10) {
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
        }
        .sheet(isPresented: accountPresentation, onDismiss: accountSheetDismissed) {
            ProfileAccountScreen(
                onSessionChanged: accountSessionChanged,
                onDone: cancelPendingAndDismiss
            )
        }
    }

    private var accountPresentation: Binding<Bool> {
        Binding(
            get: { isShowingAccount },
            set: { shouldPresent in
                if shouldPresent {
                    isShowingAccount = true
                } else {
                    cancelPendingAndDismiss()
                }
            }
        )
    }

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

    private func actionButton(
        title: String,
        filled: Bool,
        hint: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title).frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .font(IOThemTypography.UI.bodyStrong)
        .foregroundStyle(
            filled
                ? IOThemColors.Paper.surface.opacity(canStart ? 1 : 0.70)
                : IOThemColors.Accent.studio.opacity(canStart ? 1 : 0.44)
        )
        .padding(.vertical, 11)
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
        pendingIntent = intent
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
            resumePendingIntentIfAuthenticated()
        case .restorePersistedSession:
            restoreSessionThenResume()
        case .presentAccount:
            presentAccount()
        }
    }

    private func restoreSessionThenResume() {
        guard !isRestoringSession else { return }
        isRestoringSession = true
        Task { @MainActor in
            defer { isRestoringSession = false }
            do {
                let restored = try await BackendAuthClient.restorePersistedAuthSessionIfNeeded()
                guard restored.isAuthenticated, !restored.accessExpired else {
                    presentAccount()
                    return
                }
                ThemMagicMomentOnboardingPolicy.reconcileThenResume(
                    reconcileAccountSession: onAccountSessionChanged,
                    resumePendingIntent: resumePendingIntentIfAuthenticated
                )
            } catch {
                errorMessage = "Your saved session could not be refreshed. Sign in again when you’re ready."
                presentAccount()
            }
        }
    }

    private func presentAccount() {
        errorMessage = "Sign in to save this draft to your private workspace and sync it across your devices."
        isShowingAccount = true
    }

    private func accountSessionChanged() {
        ThemMagicMomentOnboardingPolicy.reconcileThenResume(
            reconcileAccountSession: onAccountSessionChanged,
            resumePendingIntent: resumePendingIntentIfAuthenticated
        )
    }

    private func resumePendingIntentIfAuthenticated() {
        let session = BackendAuthClient.currentAuthSessionState()
        guard IOThemRuntime.bypassesAuthenticationForUITests
                || (session.isAuthenticated && !session.accessExpired) else {
            presentAccount()
            return
        }
        guard let intent = ThemMagicMomentOnboardingPolicy.takePendingIntent(&pendingIntent) else { return }
        isShowingAccount = false
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

    private func accountSheetDismissed() {
        guard pendingIntent != nil else { return }
        cancelPendingAndDismiss()
    }

    private func cancelPendingAndDismiss() {
        let didCancelPendingIntent = pendingIntent != nil
        ThemMagicMomentOnboardingPolicy.cancelPendingIntent(&pendingIntent)
        isShowingAccount = false
        guard didCancelPendingIntent else { return }
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
