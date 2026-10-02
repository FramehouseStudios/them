import SwiftUI
import ScreenplayStudio

/// Four tabs replace the thirteen-chip row on Home (founder, 2026-10-01).
/// Nothing was removed: every former chip is a row in Memories or Settings.
enum ThemTab: String, CaseIterable, Identifiable {
    case home, studio, memories, settings

    var id: String { rawValue }

    /// Survives the rebuild an appearance switch causes, so Settings stays
    /// open; in memory only, so a fresh launch opens on Home.
    static var lastSelected: ThemTab = .home

    var title: String {
        switch self {
        case .home: return "Home"
        case .studio: return "Studio"
        case .memories: return "Memories"
        case .settings: return "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .home: return "circle.circle"
        case .studio: return "doc.text"
        case .memories: return "sparkles"
        case .settings: return "gearshape"
        }
    }

    /// Studio keeps the identifier the old chip had (UI tests open it by it).
    var accessibilityIdentifier: String {
        self == .studio ? "home.open-studio" : "home.tab.\(rawValue)"
    }
}

/// Everything the old Home chips opened, now reached from a tab.
enum ThemHomeDestination: String, CaseIterable, Identifiable {
    case memories, history, notes, tasks, recap
    case account, voice, companion, trust, data, privacy, report

    var id: String { rawValue }

    static let memoriesTab: [ThemHomeDestination] = [.memories, .history, .notes, .tasks, .recap]
    static let settingsTab: [ThemHomeDestination] = [.account, .voice, .companion, .trust, .data, .privacy, .report]

    func title(signedIn: Bool) -> String {
        switch self {
        case .memories: return "Memories"
        case .history: return "History"
        case .notes: return "Notes"
        case .tasks: return "Tasks"
        case .recap: return "Recap"
        case .account: return signedIn ? "Account" : "Sign In"
        case .voice: return "Voice"
        case .companion: return "Companion"
        case .trust: return "Trust"
        case .data: return "Data"
        case .privacy: return "Privacy"
        case .report: return "Report"
        }
    }

    var subtitle: String {
        switch self {
        case .memories: return "Characters, story and what Clementine knows"
        case .history: return "Your conversations"
        case .notes: return "Notes from your sessions"
        case .tasks: return "What's next on your script"
        case .recap: return "What you wrote today"
        case .account: return "Your account and sign-in"
        case .voice: return "How Clementine sounds"
        case .companion: return "How Clementine works with you"
        case .trust: return "How your work is handled"
        case .data: return "Export or delete your data"
        case .privacy: return "Privacy policy"
        case .report: return "Report a problem"
        }
    }

    var systemImage: String {
        switch self {
        case .memories: return "sparkles"
        case .history: return "clock"
        case .notes: return "note.text"
        case .tasks: return "checklist"
        case .recap: return "calendar"
        case .account: return "person.crop.circle"
        case .voice: return "waveform"
        case .companion: return "heart.text.square"
        case .trust: return "checkmark.shield"
        case .data: return "externaldrive"
        case .privacy: return "hand.raised"
        case .report: return "exclamationmark.bubble"
        }
    }

    /// Identifiers the old chips had, where UI tests or automation use them.
    var accessibilityIdentifier: String {
        switch self {
        case .account: return "home.open-account"
        case .data: return "home.open-data-controls"
        default: return "home.open-\(rawValue)"
        }
    }
}

struct ThemTabBar: View {
    let selected: ThemTab
    let onSelect: (ThemTab) -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(ThemTab.allCases) { tab in
                let isSelected = tab == selected
                Button {
                    onSelect(tab)
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.systemImage)
                            .font(isSelected ? IOThemTypography.UI.compactTitle : IOThemTypography.UI.body)
                        Text(tab.title)
                            .font(isSelected ? IOThemTypography.UI.label : IOThemTypography.UI.labelMedium)
                    }
                    .foregroundColor(isSelected ? .herStudioAccent : .herText.opacity(0.62))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(isSelected ? Color.herStudioActiveFill.opacity(0.9) : Color.clear)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
                .accessibilityIdentifier(tab.accessibilityIdentifier)
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.herShellPanel.opacity(0.94))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.35), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.12), radius: 18, x: 0, y: 8)
        .frame(maxWidth: 520)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }
}

/// The Memories and Settings tabs: one row per former Home chip.
struct ThemHomeHubView: View {
    let tab: ThemTab
    let signedIn: Bool
    let onOpen: (ThemHomeDestination) -> Void

    @AppStorage(IOThemAppearance.storageKey) private var appearanceRaw = IOThemAppearance.peach.rawValue

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(tab.title)
                    .font(IOThemTypography.UI.largeTitle)
                    .foregroundColor(.herText)
                    .padding(.bottom, 6)

                if tab == .settings {
                    appearanceCard
                }

                ForEach(tab == .settings ? ThemHomeDestination.settingsTab : ThemHomeDestination.memoriesTab) { destination in
                    row(destination)
                }
            }
            .frame(maxWidth: 560, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 120)
            .frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("home.hub.\(tab.rawValue)")
    }

    private var appearanceCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Appearance", systemImage: "circle.lefthalf.filled")
                .font(IOThemTypography.UI.sectionTitle)
                .foregroundColor(.herText)
            Picker("Appearance", selection: $appearanceRaw) {
                ForEach(IOThemAppearance.allCases, id: \.rawValue) { appearance in
                    Text(appearance.title).tag(appearance.rawValue)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("settings-appearance")
        }
        .padding(IOThemSpacing.Scale.lg)
        .background(card)
    }

    private func row(_ destination: ThemHomeDestination) -> some View {
        Button {
            onOpen(destination)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: destination.systemImage)
                    .font(IOThemTypography.UI.compactTitle)
                    .foregroundColor(.herStudioAccent)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(destination.title(signedIn: signedIn))
                        .font(IOThemTypography.UI.sectionTitle)
                        .foregroundColor(.herText)
                    Text(destination.subtitle)
                        .font(IOThemTypography.UI.callout)
                        .foregroundColor(.herText.opacity(0.62))
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(IOThemTypography.UI.calloutStrong)
                    .foregroundColor(.herText.opacity(0.34))
            }
            .padding(IOThemSpacing.Scale.lg)
            .background(card)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(destination.accessibilityIdentifier)
    }

    private var card: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(Color.herShellPanel.opacity(0.78))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.herShellStroke.opacity(0.25), lineWidth: 1)
            )
    }
}
