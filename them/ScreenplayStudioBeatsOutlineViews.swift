import SwiftUI

struct ScreenplayStudioBeatsInspectorLayout<BeatMap: View, Composer: View>: View {
    let beatCount: Int
    let linkedSceneCount: Int
    let linkedActCount: Int
    let hasBeats: Bool
    @ViewBuilder let beatMap: () -> BeatMap
    @ViewBuilder let composer: () -> Composer

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Shape the story in bigger moves.")
                    .font(.system(size: 13, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.78))
                Text("Keep the next turn of the script visible. Beats can stay loose while you ideate, or link directly to scenes and acts as the outline locks in.")
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.64))
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                directionOneMiniStat("Beats", value: "\(beatCount)")
                directionOneMiniStat("Scenes linked", value: "\(linkedSceneCount)")
                directionOneMiniStat("Acts linked", value: "\(linkedActCount)")
            }

            inspectorSubsectionLabel("Beat map")

            if hasBeats {
                beatMap()
            } else {
                emptyState
            }

            Divider().overlay(Color.herShellStroke.opacity(0.24))
            inspectorSubsectionLabel("Add beat")
            composer()
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "flag.slash")
                    .font(.system(size: 16, weight: .semibold, design: .default))
                    .foregroundStyle(Color.black.opacity(0.74).opacity(0.86))
                    .frame(width: 36, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white.opacity(0.82))
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text("No beats yet")
                        .font(.system(size: 16, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.92))
                    Text("Start with a turning point, reveal, reversal, or emotional shift. You can connect it to a scene now or let it stay free until the draft settles.")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Good first beats")
                    .font(.system(size: 10, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.46))
                    .textCase(.uppercase)
                Text("Inciting incident")
                    .font(.system(size: 12, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.80))
                Text("False victory")
                    .font(.system(size: 12, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.80))
                Text("The choice that changes everything")
                    .font(.system(size: 12, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.80))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(0.42))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
        )
    }
}

struct ScreenplayStudioOutlineInspectorLayout<Compass: View, StorySpine: View, FocusedScene: View>: View {
    let actCount: Int
    let sceneCount: Int
    let beatCount: Int
    let hasOutline: Bool
    let hasFocusedScene: Bool
    @ViewBuilder let compass: () -> Compass
    @ViewBuilder let storySpine: () -> StorySpine
    @ViewBuilder let focusedScene: () -> FocusedScene

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            inspectorPanelLead(
                title: "Track the spine of the movie.",
                detail: "Keep acts, scenes, and loose structure visible while the page evolves. The rail should tell you what the story is doing at a glance."
            )

            HStack(spacing: 10) {
                directionOneMiniStat("Acts", value: "\(actCount)")
                directionOneMiniStat("Scenes", value: "\(sceneCount)")
                directionOneMiniStat("Beats", value: "\(beatCount)")
            }

            compass()
            inspectorSubsectionLabel("Story spine")

            if hasOutline {
                storySpine()
            } else {
                inspectorMessageCard(
                    icon: "list.bullet.rectangle",
                    title: "No outline yet",
                    detail: "Add scenes from the page or capture beats first. Acts and grouped scenes will start filling in here as the draft takes shape."
                )
            }

            if hasFocusedScene {
                inspectorSubsectionLabel("Focused scene")
                focusedScene()
            }
        }
    }
}

struct ScreenplayStudioBeatComposer<QuickCapture: View, QuickLinks: View, ScenePicker: View, ActPicker: View>: View {
    @Binding var label: String
    @Binding var summary: String
    let isEditing: Bool
    let isSaving: Bool
    let hasQuickCapture: Bool
    let quickCaptureDetail: String
    let hasQuickLinks: Bool
    @ViewBuilder let quickCapture: () -> QuickCapture
    @ViewBuilder let quickLinks: () -> QuickLinks
    @ViewBuilder let scenePicker: () -> ScenePicker
    @ViewBuilder let actPicker: () -> ActPicker
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            fieldSection(
                title: "Beat label",
                detail: "A short, memorable story turn."
            ) {
                textField("Ex: The lie gets exposed", text: $label)
            }

            if hasQuickCapture {
                fieldSection(title: "Quick capture", detail: quickCaptureDetail) {
                    quickCapture()
                }
            }

            if hasQuickLinks {
                fieldSection(title: "Quick links", detail: "Use the page or outline context already in front of you.") {
                    quickLinks()
                }
            }

            fieldSection(
                title: "Beat summary",
                detail: "What changes here, and why does it matter?"
            ) {
                multilineField("Summarize the shift, reveal, or conflict.", text: $summary)
            }

            HStack(alignment: .top, spacing: 10) {
                fieldSection(title: "Scene link", detail: "Optional") {
                    scenePicker()
                }
                fieldSection(title: "Act link", detail: "Optional") {
                    actPicker()
                }
            }

            saveRow
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white.opacity(0.50))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
        )
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 10) {
                Text(isEditing ? "Refine the beat" : "Capture the next move")
                    .font(.system(size: 16, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.92))

                Spacer(minLength: 0)

                if isEditing {
                    Button("Cancel", action: onCancel)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }

            if isEditing {
                Text("You’re editing an existing beat. Save will update it in place.")
                    .font(.system(size: 11, weight: .medium, design: .default))
                    .foregroundStyle(Color.herStudioActiveFill.opacity(0.88))
            }

            Text(
                isEditing
                    ? "Adjust the label, sharpen the summary, or reconnect the beat to a different scene or act."
                    : "Name the beat, describe the turn, then link it to a scene or act if you already know where it belongs."
            )
            .font(.system(size: 12, weight: .regular, design: .default))
            .foregroundStyle(Color.herText.opacity(0.64))
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var saveRow: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("You can save this loose now and connect it more precisely later.")
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.56))
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            Button(action: onSave) {
                Label(
                    isEditing ? "Update Beat" : "Save Beat",
                    systemImage: isEditing ? "checkmark.circle.fill" : "plus.circle.fill"
                )
                .font(.system(size: 14, weight: .semibold, design: .default))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .disabled((label.cleanStudioField.isEmpty && summary.cleanStudioField.isEmpty) || isSaving)
        }
    }

    private func fieldSection<Content: View>(
        title: String,
        detail: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            fieldLabel(title, detail: detail)
            content()
        }
    }

    private func fieldLabel(_ title: String, detail: String) -> some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.74))
                .textCase(.uppercase)
            Text(detail)
                .font(.system(size: 11, weight: .medium, design: .default))
                .foregroundStyle(Color.herText.opacity(0.42))
        }
    }

    private func textField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .textFieldStyle(.plain)
            .font(.system(size: 15, weight: .medium, design: .default))
            .foregroundStyle(Color.herText.opacity(0.92))
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(fieldBackground)
    }

    private func multilineField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text, axis: .vertical)
            .textFieldStyle(.plain)
            .lineLimit(4...7)
            .font(.system(size: 15, weight: .regular, design: .default))
            .foregroundStyle(Color.herText.opacity(0.92))
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(minHeight: 108, alignment: .topLeading)
            .background(fieldBackground)
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color.white.opacity(0.94))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.herShellStroke.opacity(0.16), lineWidth: 1)
            )
    }
}

private extension String {
    var cleanStudioField: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
