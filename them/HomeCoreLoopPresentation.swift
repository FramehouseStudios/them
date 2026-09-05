import SwiftUI

enum HomePrimaryDestination: String, CaseIterable, Identifiable {
    case write
    case memories
    case account
    case more

    var id: String { rawValue }
}

struct HomePrimaryDestinationPresentation: Equatable {
    let destination: HomePrimaryDestination
    let title: String
    let systemImage: String
    let accessibilityIdentifier: String
    let accessibilityLabel: String
    let accessibilityHint: String
}

struct HomeCoreLoopPresentation {
    static func primaryDestinations(accountTitle: String) -> [HomePrimaryDestinationPresentation] {
        [
            HomePrimaryDestinationPresentation(
                destination: .write,
                title: "Write",
                systemImage: "square.and.pencil",
                accessibilityIdentifier: "home.open-studio",
                accessibilityLabel: "Write in Studio",
                accessibilityHint: "Opens your screenplay workspace."
            ),
            HomePrimaryDestinationPresentation(
                destination: .memories,
                title: "Memories",
                systemImage: "brain.head.profile",
                accessibilityIdentifier: "home.open-memories",
                accessibilityLabel: "Memories",
                accessibilityHint: "Opens memories shared with Clementine."
            ),
            HomePrimaryDestinationPresentation(
                destination: .account,
                title: accountTitle,
                systemImage: "person.crop.circle",
                accessibilityIdentifier: "home.open-account",
                accessibilityLabel: accountTitle,
                accessibilityHint: "Opens account and sign-in controls."
            ),
            HomePrimaryDestinationPresentation(
                destination: .more,
                title: "More",
                systemImage: "ellipsis.circle",
                accessibilityIdentifier: "home.open-more",
                accessibilityLabel: "More",
                accessibilityHint: "Opens voice, companion, organization, privacy, and support tools."
            ),
        ]
    }

    static func talkActionTitle(usesRealtimePreviewTransport: Bool) -> String {
        usesRealtimePreviewTransport ? "Talk live with Clementine" : "Talk with Clementine"
    }
}

enum HomeMoreDestination: String, CaseIterable, Identifiable {
    case voiceSettings
    case companion
    case history
    case notes
    case tasks
    case recap
    case trust
    case data
    case privacy
    case report

    var id: String { rawValue }

    var title: String {
        switch self {
        case .voiceSettings: "Voice settings"
        case .companion: "Companion"
        case .history: "Conversation history"
        case .notes: "Notes"
        case .tasks: "Tasks"
        case .recap: "Recap"
        case .trust: "Trust center"
        case .data: "Data controls"
        case .privacy: "Privacy policy"
        case .report: "Report a problem"
        }
    }

    var subtitle: String {
        switch self {
        case .voiceSettings: "Adjust listening, response, and Studio voice controls."
        case .companion: "Choose how Clementine supports your creative work."
        case .history: "Return to earlier conversations."
        case .notes: "Capture ideas you want to keep nearby."
        case .tasks: "Track the next things you want to do."
        case .recap: "Review recent work and conversation context."
        case .trust: "Understand safety, privacy, and reliability."
        case .data: "Manage local and synced information."
        case .privacy: "Read the io.them privacy policy."
        case .report: "Share a problem with the io.them team."
        }
    }

    var systemImage: String {
        switch self {
        case .voiceSettings: "waveform"
        case .companion: "sparkles"
        case .history: "clock.arrow.circlepath"
        case .notes: "note.text"
        case .tasks: "checklist"
        case .recap: "text.book.closed"
        case .trust: "checkmark.shield"
        case .data: "externaldrive"
        case .privacy: "hand.raised"
        case .report: "exclamationmark.bubble"
        }
    }

    var accessibilityIdentifier: String {
        "home.more.\(rawValue)"
    }
}

struct HomePrimaryNavigation: View {
    let accountTitle: String
    let onSelect: (HomePrimaryDestination) -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(HomeCoreLoopPresentation.primaryDestinations(accountTitle: accountTitle), id: \.destination) { item in
                Button {
                    onSelect(item.destination)
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: item.systemImage)
                            .font(.system(size: 18, weight: .medium))
                            .frame(height: 20)

                        Text(item.title)
                            .font(.system(size: 11, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .foregroundStyle(Color.white.opacity(0.94))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(item.accessibilityIdentifier)
                .accessibilityLabel(item.accessibilityLabel)
                .accessibilityHint(item.accessibilityHint)
            }
        }
        .padding(7)
        .frame(maxWidth: 560)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color.black.opacity(0.24))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.18), radius: 18, x: 0, y: 10)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.primary-navigation")
    }
}

struct HomeMorePanel: View {
    let personaTitle: String
    let onSelect: (HomeMoreDestination) -> Void
    let onDone: () -> Void

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.035, green: 0.039, blue: 0.051),
                    Color(red: 0.071, green: 0.078, blue: 0.102),
                    Color(red: 0.098, green: 0.086, blue: 0.102),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(alignment: .top, spacing: 16) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("More")
                                .font(.system(size: 30, weight: .semibold))
                                .foregroundStyle(.white)
                            Text("Clementine's conversation, organization, privacy, and support tools.")
                                .font(.system(size: 14))
                                .foregroundStyle(.white.opacity(0.62))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 8)

                        Button("Done") {
                            onDone()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.white.opacity(0.20))
                        .foregroundStyle(.white.opacity(0.94))
                        .accessibilityIdentifier("home.more.done")
                        .accessibilityHint("Returns to Clementine without starting a conversation.")
                    }

                    HStack(spacing: 10) {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                            .font(.system(size: 16, weight: .medium))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Clementine persona")
                                .font(.system(size: 13, weight: .semibold))
                            Text(personaTitle)
                                .font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer(minLength: 8)
                        Text("Current")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.66))
                    }
                    .foregroundStyle(.white.opacity(0.90))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Color.white.opacity(0.075))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color.white.opacity(0.11), lineWidth: 1)
                    )
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("home.more.persona-status")
                    .accessibilityLabel("Current persona: \(personaTitle)")

                    moreSection(
                        title: "Clementine",
                        destinations: [.voiceSettings, .companion, .history]
                    )
                    moreSection(
                        title: "Organize",
                        destinations: [.notes, .tasks, .recap]
                    )
                    moreSection(
                        title: "Privacy & support",
                        destinations: [.trust, .data, .privacy, .report]
                    )
                }
                .padding(.horizontal, 18)
                .padding(.top, 22)
                .padding(.bottom, 36)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.more.surface")
    }

    private func moreSection(
        title: String,
        destinations: [HomeMoreDestination]
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.66))
                .textCase(.uppercase)

            VStack(spacing: 1) {
                ForEach(destinations) { destination in
                    Button {
                        onSelect(destination)
                    } label: {
                        HStack(spacing: 13) {
                            Image(systemName: destination.systemImage)
                                .font(.system(size: 17, weight: .medium))
                                .foregroundStyle(.white.opacity(0.84))
                                .frame(width: 28, height: 28)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(destination.title)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.94))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.82)

                                Text(destination.subtitle)
                                    .font(.system(size: 12))
                                    .foregroundStyle(.white.opacity(0.58))
                                    .multilineTextAlignment(.leading)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            Spacer(minLength: 8)

                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.42))
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier(destination.accessibilityIdentifier)
                    .accessibilityLabel(destination.title)
                    .accessibilityHint(destination.subtitle)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white.opacity(0.075))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.white.opacity(0.11), lineWidth: 1)
            )
        }
    }
}
