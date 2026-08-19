import SwiftUI

struct ScreenplayStudioFeatureSpineEditor: View {
    @Binding var logline: String
    @Binding var themeArgument: String
    @Binding var centralQuestion: String
    @Binding var protagonistWant: String
    @Binding var protagonistNeed: String
    @Binding var antagonisticForce: String
    @Binding var actPosition: String
    @Binding var endingImage: String
    @Binding var unresolvedSetupsText: String

    let guide: ScreenplayFeatureProgressionGuide
    let pendingAction: ScreenplayFeaturePlannerActionSnapshot?
    let pendingActionTimestampText: String
    let hasSelectedProject: Bool
    let isSaving: Bool
    let isSubmitting: Bool
    let textColor: Color
    let secondaryTextColor: Color
    let tertiaryTextColor: Color
    let onSave: () -> Void
    let onCommand: (ScreenplayFeatureActionCommand, ScreenplayFeatureProgressionGuide) -> Void
    let onRetry: (ScreenplayFeaturePlannerActionSnapshot) -> Void
    let onClear: (ScreenplayFeaturePlannerActionSnapshot) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            spineField("Logline", text: $logline)
            spineField("Theme", text: $themeArgument)
            spineField("Central question", text: $centralQuestion)
            spineField("Want", text: $protagonistWant)
            spineField("Need", text: $protagonistNeed)
            spineField("Pressure", text: $antagonisticForce)
            spineField("Act position", text: $actPosition)
            spineField("Ending image", text: $endingImage)
            unresolvedSetupsField
            progressionGuide
            saveButton
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.herShellPanelSoft.opacity(0.88))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
        )
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "point.topleft.down.curvedto.point.bottomright.up")
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(Color.accentColor.opacity(0.82))
            Text("Feature spine")
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(textColor.opacity(0.90))
            Spacer(minLength: 0)
            assistantPill("Act", value: actPosition.isEmpty ? "Unset" : actPosition)
        }
    }

    private var unresolvedSetupsField: some View {
        VStack(alignment: .leading, spacing: 5) {
            fieldLabel("Unresolved setups")
            TextEditor(text: $unresolvedSetupsText)
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(textColor.opacity(0.88))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 72)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(fieldBackground)
        }
    }

    private var progressionGuide: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
                .overlay(tertiaryTextColor.opacity(0.24))

            HStack(spacing: 8) {
                Image(systemName: "map")
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(Color.accentColor.opacity(0.78))
                Text("Current sequence")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .tracking(0.6)
                    .foregroundStyle(tertiaryTextColor)
                Spacer(minLength: 0)
                Text(guide.progressText)
                    .font(.system(size: 10, weight: .semibold, design: .default))
                    .foregroundStyle(secondaryTextColor)
            }

            Text("\(guide.currentAct) · \(guide.sequenceLabel) · \(guide.pageRangeText)")
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(textColor.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)

            Text(guide.dueNow)
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(secondaryTextColor)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 5) {
                fieldLabel("Next scene")
                Text(guide.nextScenePlan)
                    .font(.system(size: 11, weight: .medium, design: .default))
                    .foregroundStyle(textColor.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
            }

            ForEach(Array(guide.nextMoves.enumerated()), id: \.offset) { _, move in
                HStack(alignment: .top, spacing: 7) {
                    Image(systemName: "arrow.turn.down.right")
                        .font(.system(size: 9, weight: .semibold, design: .default))
                        .foregroundStyle(Color.accentColor.opacity(0.68))
                        .padding(.top, 2)
                    Text(move)
                        .font(.system(size: 10, weight: .regular, design: .default))
                        .foregroundStyle(secondaryTextColor)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            progressionActions

            if let pendingAction {
                recoveryCard(pendingAction)
            }
        }
    }

    private var progressionActions: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                progressionActionButton("Write scene", systemImage: "sparkles", command: .writeNextScene)
                progressionActionButton("Outline turns", systemImage: "list.number", command: .outlineNextThreeTurns)
            }
            progressionActionButton("Map feature", systemImage: "map.circle", command: .mapFeatureRoadmap)
        }
    }

    private var saveButton: some View {
        Button(action: onSave) {
            Label(isSaving ? "Saving…" : "Save spine", systemImage: isSaving ? "arrow.clockwise" : "square.and.arrow.down")
                .font(.system(size: 11, weight: .semibold, design: .default))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
        .disabled(!hasSelectedProject || isSaving)
    }

    private func spineField(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            fieldLabel(title)
            TextField(title, text: text, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(textColor.opacity(0.88))
                .lineLimit(1...3)
                .padding(.horizontal, 9)
                .padding(.vertical, 7)
                .background(fieldBackground)
        }
    }

    private func fieldLabel(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 9, weight: .semibold, design: .monospaced))
            .tracking(0.7)
            .foregroundStyle(tertiaryTextColor)
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(Color.herPaper.opacity(0.92))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
            )
    }

    private func assistantPill(_ label: String, value: String) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .foregroundStyle(tertiaryTextColor)
            Text(value)
                .font(.system(size: 10, weight: .medium, design: .default))
                .foregroundStyle(Color.accentColor.opacity(0.78))
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(Color.herShellPanelSoft.opacity(0.90))
        .overlay(Capsule().stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1))
        .clipShape(Capsule())
    }

    private func progressionActionButton(
        _ title: String,
        systemImage: String,
        command: ScreenplayFeatureActionCommand
    ) -> some View {
        Button {
            onCommand(command, guide)
        } label: {
            Label(title, systemImage: systemImage)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .lineLimit(1)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(!hasSelectedProject || isSubmitting)
    }

    private func recoveryCard(_ snapshot: ScreenplayFeaturePlannerActionSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 7) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.system(size: 10, weight: .semibold, design: .default))
                    .foregroundStyle(Color.accentColor.opacity(0.78))
                Text("Saved planner action")
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .tracking(0.6)
                    .foregroundStyle(tertiaryTextColor)
                Spacer(minLength: 0)
                Text(pendingActionTimestampText)
                    .font(.system(size: 9, weight: .medium, design: .default))
                    .foregroundStyle(tertiaryTextColor)
            }

            Text(snapshot.displayText)
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(textColor.opacity(0.92))
                .lineLimit(2)

            Text("\(snapshot.currentAct) · \(snapshot.sequenceLabel) · \(snapshot.pageRangeText)")
                .font(.system(size: 10, weight: .regular, design: .default))
                .foregroundStyle(secondaryTextColor)
                .lineLimit(2)

            HStack(spacing: 8) {
                recoveryButton("Retry", systemImage: "arrow.clockwise", prominent: true) {
                    onRetry(snapshot)
                }
                recoveryButton("Clear", systemImage: "xmark", prominent: false) {
                    onClear(snapshot)
                }
            }
        }
        .padding(9)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.herPaper.opacity(0.86))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func recoveryButton(
        _ title: String,
        systemImage: String,
        prominent: Bool,
        action: @escaping () -> Void
    ) -> some View {
        let button = Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .frame(maxWidth: .infinity)
        }
        .controlSize(.small)
        .disabled(isSubmitting)

        if prominent {
            button.buttonStyle(.borderedProminent)
        } else {
            button.buttonStyle(.bordered)
        }
    }
}
