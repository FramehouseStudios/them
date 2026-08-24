import SwiftUI
import ScreenplayStudio

enum ScreenplayStudioCharacterMemoryContent: Equatable {
    case hidden
    case loading
    case failure(message: String)
    case empty
    case cards([BackendCharacterTraitCardState])
}

struct ScreenplayStudioCharacterMemoryPresentation: Equatable {
    let content: ScreenplayStudioCharacterMemoryContent
}

struct ScreenplayStudioCharacterMemoryActions {
    let onRefresh: () -> Void
}

enum ScreenplayStudioCharacterMemoryPresentationPlanner {
    static func make(
        isLoading: Bool,
        errorText: String,
        hasResponse: Bool,
        cards: [BackendCharacterTraitCardState]
    ) -> ScreenplayStudioCharacterMemoryPresentation {
        guard isLoading || hasVisibleError(errorText) || hasResponse else {
            return ScreenplayStudioCharacterMemoryPresentation(content: .hidden)
        }

        if isLoading {
            return ScreenplayStudioCharacterMemoryPresentation(content: .loading)
        }

        if hasVisibleError(errorText) {
            return ScreenplayStudioCharacterMemoryPresentation(content: .failure(message: errorText))
        }

        if cards.isEmpty {
            return ScreenplayStudioCharacterMemoryPresentation(content: .empty)
        }

        return ScreenplayStudioCharacterMemoryPresentation(content: .cards(cards))
    }

    private static func hasVisibleError(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

enum ScreenplayStudioReversalCardsAcceptedNotice: Equatable {
    case hidden
    case failure(message: String)
    case count(message: String)
}

enum ScreenplayStudioReversalSeverityPresentation: Equatable {
    case high
    case medium
    case neutral
}

struct ScreenplayStudioReversalCardPresentation: Identifiable, Equatable {
    var id: String { card.id }

    let card: ScreenplayCraftTwistCardState
    let severity: ScreenplayStudioReversalSeverityPresentation
    let keepLabel: String
    let keepSystemImage: String
    let isKeepEnabled: Bool
    let isDismissEnabled: Bool
    let showsMutationProgress: Bool
}

enum ScreenplayStudioReversalCardsContent: Equatable {
    case hidden
    case loading
    case failure(message: String)
    case empty
    case cards([ScreenplayStudioReversalCardPresentation])
}

struct ScreenplayStudioReversalCardsPresentation: Equatable {
    let beatLabel: String
    let acceptedNotice: ScreenplayStudioReversalCardsAcceptedNotice
    let content: ScreenplayStudioReversalCardsContent
}

struct ScreenplayStudioReversalCardsActions {
    let onRefresh: () -> Void
    let onKeep: (ScreenplayCraftTwistCardState) -> Void
    let onDismiss: (ScreenplayCraftTwistCardState) -> Void
}

enum ScreenplayStudioReversalCardsPresentationPlanner {
    static func make(
        beatLabel: String,
        acceptedErrorText: String,
        acceptedCount: Int,
        isLoading: Bool,
        errorText: String,
        hasResponse: Bool,
        cards: [ScreenplayCraftTwistCardState],
        isMutating: Bool,
        hasSelectedProject: Bool
    ) -> ScreenplayStudioReversalCardsPresentation {
        let displayBeatLabel = beatLabel.isEmpty ? "Beat-aware twist pass" : beatLabel
        let acceptedNotice = acceptedNotice(
            errorText: acceptedErrorText,
            count: acceptedCount
        )

        guard isLoading || hasVisibleError(errorText) || hasResponse else {
            return ScreenplayStudioReversalCardsPresentation(
                beatLabel: displayBeatLabel,
                acceptedNotice: acceptedNotice,
                content: .hidden
            )
        }

        if isLoading {
            return ScreenplayStudioReversalCardsPresentation(
                beatLabel: displayBeatLabel,
                acceptedNotice: acceptedNotice,
                content: .loading
            )
        }

        if hasVisibleError(errorText) {
            return ScreenplayStudioReversalCardsPresentation(
                beatLabel: displayBeatLabel,
                acceptedNotice: acceptedNotice,
                content: .failure(message: errorText)
            )
        }

        if cards.isEmpty {
            return ScreenplayStudioReversalCardsPresentation(
                beatLabel: displayBeatLabel,
                acceptedNotice: acceptedNotice,
                content: .empty
            )
        }

        return ScreenplayStudioReversalCardsPresentation(
            beatLabel: displayBeatLabel,
            acceptedNotice: acceptedNotice,
            content: .cards(cards.map { card in
                ScreenplayStudioReversalCardPresentation(
                    card: card,
                    severity: severity(from: card.severity),
                    keepLabel: card.isAccepted ? "Kept" : "Keep",
                    keepSystemImage: card.isAccepted ? "checkmark.circle.fill" : "pin",
                    isKeepEnabled: hasSelectedProject && !isMutating && !card.isAccepted,
                    isDismissEnabled: hasSelectedProject && !isMutating,
                    showsMutationProgress: isMutating
                )
            })
        )
    }

    private static func acceptedNotice(
        errorText: String,
        count: Int
    ) -> ScreenplayStudioReversalCardsAcceptedNotice {
        if hasVisibleError(errorText) {
            return .failure(message: errorText)
        }
        if count > 0 {
            return .count(
                message: "\(count) kept reversal\(count == 1 ? "" : "s") linked to this project."
            )
        }
        return .hidden
    }

    private static func severity(
        from value: String
    ) -> ScreenplayStudioReversalSeverityPresentation {
        switch value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "high": return .high
        case "medium": return .medium
        default: return .neutral
        }
    }

    private static func hasVisibleError(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct ScreenplayStudioCharacterMemoryView: View {
    let presentation: ScreenplayStudioCharacterMemoryPresentation
    let actions: ScreenplayStudioCharacterMemoryActions

    @ViewBuilder
    var body: some View {
        switch presentation.content {
        case .hidden:
            EmptyView()
        case .loading, .failure, .empty, .cards:
            intelligenceCollectionCard(title: "Character Memory", icon: "person.2") {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Text("Voice inventory")
                            .font(IOThemTypography.UI.captionStrong)
                            .foregroundStyle(Color.herText.opacity(0.78))
                        Spacer(minLength: 0)
                        Button(action: actions.onRefresh) {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help("Refresh character memory")
                        .accessibilityLabel("Refresh character memory")
                        .accessibilityIdentifier("studio.them.character-memory.refresh")
                    }

                    characterMemoryContent
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("studio.them.character-memory")
        }
    }

    @ViewBuilder
    private var characterMemoryContent: some View {
        switch presentation.content {
        case .hidden:
            EmptyView()
        case .loading:
            HStack(spacing: 10) {
                ProgressView()
                    .controlSize(.small)
                Text("Reading the character voice library.")
                    .font(IOThemTypography.UI.captionMedium)
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .failure(let message):
            Text(message)
                .font(IOThemTypography.UI.captionMedium)
                .foregroundStyle(Color.herText.opacity(0.70))
                .fixedSize(horizontal: false, vertical: true)
        case .empty:
            Text("No character traits saved yet. Dialogue and rendered character cues will teach io.them who belongs in the draft.")
                .font(IOThemTypography.UI.captionMedium)
                .foregroundStyle(Color.herText.opacity(0.66))
                .fixedSize(horizontal: false, vertical: true)
        case .cards(let cards):
            ForEach(cards) { card in
                characterCard(card)
            }
        }
    }

    private func characterCard(
        _ card: BackendCharacterTraitCardState
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Text(card.name)
                    .font(IOThemTypography.UI.editorialCallout)
                    .foregroundStyle(Color.herText.opacity(0.88))
                if card.hasTraits {
                    characterBadge(
                        "learned",
                        foreground: Color.herText.opacity(0.54),
                        background: Color.white.opacity(0.14)
                    )
                }
                if card.hasArchetype {
                    characterBadge(
                        card.archetypeLabel,
                        foreground: Color.herStudioActiveFill.opacity(0.86),
                        background: Color.herStudioActiveFill.opacity(0.14)
                    )
                }
                Spacer(minLength: 0)
            }

            Text(card.summary)
                .font(IOThemTypography.UI.captionMedium)
                .foregroundStyle(Color.herText.opacity(0.72))
                .fixedSize(horizontal: false, vertical: true)

            if !card.fieldProvenance.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(card.fieldProvenance.prefix(4).enumerated()), id: \.offset) { index, row in
                        if index > 0 {
                            Divider().overlay(Color.herText.opacity(0.10))
                        }
                        ScreenplayStudioLearnedFieldRowView(
                            row: row,
                            characterKey: card.accessibilityKey
                        )
                    }
                }
            }

            if card.hasArchetype && !card.archetypeSummary.isEmpty {
                Text(
                    card.archetypeScoreLabel.isEmpty
                        ? card.archetypeSummary
                        : "\(card.archetypeSummary) - \(card.archetypeScoreLabel)"
                )
                .font(IOThemTypography.UI.label)
                .foregroundStyle(Color.herText.opacity(0.62))
                .fixedSize(horizontal: false, vertical: true)
            }

            if !card.chips.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(card.chips, id: \.self) { chip in
                        Text(chip)
                            .font(IOThemTypography.UI.micro)
                            .foregroundStyle(Color.herText.opacity(0.62))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.herStudioActiveFill.opacity(0.14))
                            .clipShape(Capsule())
                    }
                }
            }

            Text(card.detail)
                .font(IOThemTypography.UI.microMedium)
                .foregroundStyle(Color.herText.opacity(0.46))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(Color.white.opacity(0.18))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.them.character-memory.card.\(card.id)")
    }

    private func characterBadge(
        _ text: String,
        foreground: Color,
        background: Color
    ) -> some View {
        Text(text)
            .font(IOThemTypography.UI.nano)
            .foregroundStyle(foreground)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(background)
            .clipShape(Capsule())
    }
}

struct ScreenplayStudioLearnedFieldRowView: View {
    let row: BackendLearnedFieldProvenance
    let characterKey: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(row.fieldLabel)
                    .font(IOThemTypography.UI.micro)
                    .foregroundStyle(Color.herText.opacity(0.58))
                Spacer(minLength: 6)
                HStack(spacing: 4) {
                    Image(
                        systemName: row.isCorrected
                            ? "arrow.triangle.2.circlepath"
                            : "checkmark.circle"
                    )
                    .accessibilityHidden(true)
                    Text(row.statusLabel)
                        .accessibilityIdentifier(
                            "studio.learned-field.\(characterKey).\(row.accessibilityKey).status"
                        )
                }
                .font(IOThemTypography.UI.nano)
                .foregroundStyle(Color.herText.opacity(0.62))
            }

            Text(row.value)
                .font(IOThemTypography.UI.labelMedium)
                .foregroundStyle(Color.herText.opacity(0.82))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(
                    "studio.learned-field.\(characterKey).\(row.accessibilityKey).value"
                )

            Text(row.sourceLabel)
                .font(IOThemTypography.UI.nanoMedium)
                .foregroundStyle(Color.herText.opacity(0.48))
                .accessibilityIdentifier(
                    "studio.learned-field.\(characterKey).\(row.accessibilityKey).source"
                )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(
            "studio.learned-field.\(characterKey).\(row.accessibilityKey)"
        )
    }
}

struct ScreenplayStudioReversalCardsView: View {
    let presentation: ScreenplayStudioReversalCardsPresentation
    let actions: ScreenplayStudioReversalCardsActions

    @ViewBuilder
    var body: some View {
        switch presentation.content {
        case .hidden:
            EmptyView()
        case .loading, .failure, .empty, .cards:
            intelligenceCollectionCard(title: "Reversal Cards", icon: "sparkles") {
                VStack(alignment: .leading, spacing: 10) {
                    reversalHeader
                    acceptedNotice
                    reversalContent
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("studio.them.reversal-cards")
        }
    }

    private var reversalHeader: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(presentation.beatLabel)
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(Color.herText.opacity(0.78))
                Text("Derived from the current craft framework.")
                    .font(IOThemTypography.UI.microMedium)
                    .foregroundStyle(Color.herText.opacity(0.48))
            }
            Spacer(minLength: 0)
            Button(action: actions.onRefresh) {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .help("Refresh reversal cards")
            .accessibilityLabel("Refresh reversal cards")
            .accessibilityIdentifier("studio.them.reversal-cards.refresh")
        }
    }

    @ViewBuilder
    private var acceptedNotice: some View {
        switch presentation.acceptedNotice {
        case .hidden:
            EmptyView()
        case .failure(let message):
            Text(message)
                .font(IOThemTypography.UI.microMedium)
                .foregroundStyle(Color.herText.opacity(0.56))
                .fixedSize(horizontal: false, vertical: true)
        case .count(let message):
            Text(message)
                .font(IOThemTypography.UI.micro)
                .foregroundStyle(Color.herText.opacity(0.56))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var reversalContent: some View {
        switch presentation.content {
        case .hidden:
            EmptyView()
        case .loading:
            HStack(spacing: 10) {
                ProgressView()
                    .controlSize(.small)
                Text("Asking the twist engine for reversible pressure.")
                    .font(IOThemTypography.UI.captionMedium)
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .failure(let message):
            Text(message)
                .font(IOThemTypography.UI.captionMedium)
                .foregroundStyle(Color.herText.opacity(0.70))
                .fixedSize(horizontal: false, vertical: true)
        case .empty:
            Text("No reversal cards yet. Run craft analysis or refresh once the draft has a major turn to pressure-test.")
                .font(IOThemTypography.UI.captionMedium)
                .foregroundStyle(Color.herText.opacity(0.66))
                .fixedSize(horizontal: false, vertical: true)
        case .cards(let cards):
            ForEach(cards) { card in
                reversalCard(card)
            }
        }
    }

    private func reversalCard(
        _ presentation: ScreenplayStudioReversalCardPresentation
    ) -> some View {
        let card = presentation.card
        let tint = severityTint(presentation.severity)

        return VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Text(card.label)
                    .font(IOThemTypography.UI.editorialCallout)
                    .foregroundStyle(Color.herText.opacity(0.88))
                Text(card.severityLabel)
                    .font(IOThemTypography.UI.nano)
                    .foregroundStyle(tint)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(tint.opacity(0.12))
                    .clipShape(Capsule())
                if card.isAccepted {
                    Text("Kept")
                        .font(IOThemTypography.UI.nano)
                        .foregroundStyle(Color.herText.opacity(0.78))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.white.opacity(0.16))
                        .clipShape(Capsule())
                }
                Spacer(minLength: 0)
            }

            Text(card.hook)
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(Color.herText.opacity(0.76))
                .fixedSize(horizontal: false, vertical: true)

            if !card.rationale.isEmpty {
                Text(card.rationale)
                    .font(IOThemTypography.UI.microMedium)
                    .foregroundStyle(Color.herText.opacity(0.48))
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                Button {
                    actions.onKeep(card)
                } label: {
                    Label(presentation.keepLabel, systemImage: presentation.keepSystemImage)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!presentation.isKeepEnabled)
                .accessibilityIdentifier("studio.them.reversal-card.\(card.id).keep")

                Button {
                    actions.onDismiss(card)
                } label: {
                    Label("Dismiss", systemImage: "xmark.circle")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!presentation.isDismissEnabled)
                .accessibilityIdentifier("studio.them.reversal-card.\(card.id).dismiss")

                if presentation.showsMutationProgress {
                    ProgressView()
                        .controlSize(.small)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.18))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.them.reversal-card.\(card.id)")
    }

    private func severityTint(
        _ severity: ScreenplayStudioReversalSeverityPresentation
    ) -> Color {
        switch severity {
        case .high: return Color.red.opacity(0.76)
        case .medium: return Color.orange.opacity(0.76)
        case .neutral: return Color.herText.opacity(0.58)
        }
    }
}
