import ScreenplayStudio
import SwiftUI

struct ScreenplayFirstPageOnboardingView: View {
    @ObservedObject var model: ScreenplayFirstPageOnboardingModel
    var nameFocused: FocusState<Bool>.Binding
    var sceneFocused: FocusState<Bool>.Binding
    var onStartPage: () -> Void
    var onStartVoice: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.12)
                .ignoresSafeArea()

            VStack(spacing: IOThemSpacing.Scale.lg) {
                VStack(spacing: IOThemSpacing.Scale.xs) {
                    Text("Start your first page")
                        .font(IOThemTypography.UI.onboardingTitle)
                        .foregroundColor(IOThemColors.Text.primary.opacity(0.94))
                        .multilineTextAlignment(.center)

                    Text("Tell Clementine who you are and the scene you want to write first.")
                        .font(IOThemTypography.UI.callout)
                        .foregroundColor(IOThemColors.Text.primary.opacity(0.72))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 10) {
                    TextField("Your name", text: $model.name)
                        .font(IOThemTypography.UI.input)
                        .textFieldStyle(.roundedBorder)
                        .disabled(model.isSubmitting)
                        .focused(nameFocused)
                        .submitLabel(.next)
                        .onSubmit {
                            if canSubmitOnboarding {
                                sceneFocused.wrappedValue = true
                            }
                        }
                        .accessibilityIdentifier("onboarding.name.field")

                    TextField("A detective finds a letter under a motel door...", text: $model.sceneSeed, axis: .vertical)
                        .font(IOThemTypography.UI.inputCompact)
                        .textFieldStyle(.roundedBorder)
                        .disabled(model.isSubmitting)
                        .lineLimit(3...5)
                        .focused(sceneFocused)
                        .submitLabel(.go)
                        .onSubmit {
                            onStartPage()
                        }
                        .accessibilityIdentifier("onboarding.scene.field")
                }

                HStack(spacing: 10) {
                    Button {
                        onStartVoice()
                    } label: {
                        Text("Voice to Scene")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .font(IOThemTypography.UI.bodyStrong)
                    .foregroundColor(IOThemColors.Text.primary.opacity(canStartMagicMoment ? 0.90 : 0.45))
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: IOThemSpacing.Radius.md, style: .continuous)
                            .fill(Color.white.opacity(canStartMagicMoment ? 0.16 : 0.08))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: IOThemSpacing.Radius.md, style: .continuous)
                            .stroke(Color.white.opacity(0.18), lineWidth: 1)
                    )
                    .disabled(!canStartMagicMoment)
                    .accessibilityIdentifier("onboarding.voice-to-scene")

                    Button {
                        onStartPage()
                    } label: {
                        Text(model.isSubmitting ? (model.isWaitingForWorkspace ? "Opening Studio…" : "Writing…") : "Start Page")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .font(IOThemTypography.UI.bodyStrong)
                    .foregroundColor(IOThemColors.Text.primary.opacity(canStartMagicMoment ? 0.94 : 0.45))
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: IOThemSpacing.Radius.md, style: .continuous)
                            .fill(Color.white.opacity(canStartMagicMoment ? 0.26 : 0.12))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: IOThemSpacing.Radius.md, style: .continuous)
                            .stroke(Color.white.opacity(0.24), lineWidth: 1)
                    )
                    .disabled(!canStartMagicMoment)
                    .accessibilityIdentifier("onboarding.start-page")
                }

                if !model.error.isEmpty {
                    Text(model.error)
                        .font(IOThemTypography.UI.caption)
                        .foregroundColor(.red.opacity(0.86))
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                }
            }
            .padding(IOThemSpacing.Scale.xxl)
            .frame(maxWidth: 430)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.white.opacity(0.18))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color.white.opacity(0.22), lineWidth: 1)
            )
            .padding(.horizontal, IOThemSpacing.Scale.xl)
        }
    }

    private var canSubmitOnboarding: Bool {
        !model.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var canStartMagicMoment: Bool {
        canSubmitOnboarding && !model.isSubmitting
    }
}
