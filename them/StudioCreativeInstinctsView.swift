import Combine
import ScreenplayStudio
import SwiftUI

enum StudioStoryMovePreferencePresentation {
    static func scoped(
        _ preferences: [BackendStoryMovePreference],
        projectID: String,
        projectTitle: String
    ) -> [BackendStoryMovePreference] {
        let cleanProjectID = normalized(projectID)
        let cleanProjectTitle = normalized(projectTitle)

        return preferences
            .filter { preference in
                if !cleanProjectID.isEmpty {
                    return normalized(preference.projectId) == cleanProjectID
                }
                guard !cleanProjectTitle.isEmpty else { return false }
                return normalized(preference.projectTitle) == cleanProjectTitle
            }
            .sorted { left, right in
                if left.isExplicitlyCorrected != right.isExplicitlyCorrected {
                    return left.isExplicitlyCorrected
                }
                if abs(left.effectiveScore) != abs(right.effectiveScore) {
                    return abs(left.effectiveScore) > abs(right.effectiveScore)
                }
                return left.displayName.localizedCaseInsensitiveCompare(right.displayName) == .orderedAscending
            }
    }

    private static func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

@MainActor
final class StudioCreativeInstinctsModel: ObservableObject {
    @Published private(set) var preferences: [BackendStoryMovePreference] = []
    @Published private(set) var isLoading = false
    @Published private(set) var updatingFamily = ""
    @Published private(set) var errorText = ""

    private var activeProjectID = ""
    private var activeProjectTitle = ""
    private var loadingProjectID = ""
    private var loadingProjectTitle = ""
    private var lastLoadedAt: Date?
    private let minimumRefreshInterval: TimeInterval = 2

    func activate(projectID: String, projectTitle: String) {
        let cleanProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProjectTitle = projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanProjectID != activeProjectID || cleanProjectTitle != activeProjectTitle else {
            return
        }

        activeProjectID = cleanProjectID
        activeProjectTitle = cleanProjectTitle
        preferences = []
        errorText = ""
        lastLoadedAt = nil
    }

    func load(
        projectID: String,
        projectTitle: String,
        force: Bool = false,
        reportErrors: Bool = true
    ) async {
        activate(projectID: projectID, projectTitle: projectTitle)
        let requestedProjectID = activeProjectID
        let requestedProjectTitle = activeProjectTitle
        guard !requestedProjectID.isEmpty || !requestedProjectTitle.isEmpty else {
            preferences = []
            return
        }
        if !force,
           let lastLoadedAt,
           Date().timeIntervalSince(lastLoadedAt) < minimumRefreshInterval {
            return
        }
        if isLoading,
           loadingProjectID == requestedProjectID,
           loadingProjectTitle == requestedProjectTitle {
            return
        }

        loadingProjectID = requestedProjectID
        loadingProjectTitle = requestedProjectTitle
        isLoading = true
        if reportErrors {
            errorText = ""
        }
        defer {
            if loadingProjectID == requestedProjectID,
               loadingProjectTitle == requestedProjectTitle {
                loadingProjectID = ""
                loadingProjectTitle = ""
                isLoading = false
            }
        }

        do {
            let result = try await BackendMemoryAPI.shared.fetchMemories(
                limit: 1,
                force: true,
                storyPreferenceProjectID: requestedProjectID,
                storyPreferenceProjectTitle: requestedProjectTitle
            )
            guard requestedProjectID == activeProjectID,
                  requestedProjectTitle == activeProjectTitle else {
                return
            }
            preferences = StudioStoryMovePreferencePresentation.scoped(
                result.payload.storyMovePreferences ?? [],
                projectID: requestedProjectID,
                projectTitle: requestedProjectTitle
            )
            errorText = ""
            lastLoadedAt = Date()
        } catch {
            guard requestedProjectID == activeProjectID,
                  requestedProjectTitle == activeProjectTitle else {
                return
            }
            if reportErrors {
                errorText = error.localizedDescription
            }
        }
    }

    func update(_ preference: BackendStoryMovePreference, action: String) async {
        let family = preference.family.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !family.isEmpty, updatingFamily.isEmpty else { return }
        let requestedProjectID = activeProjectID
        let requestedProjectTitle = activeProjectTitle
        guard !requestedProjectID.isEmpty || !requestedProjectTitle.isEmpty else { return }

        updatingFamily = family
        errorText = ""
        defer { updatingFamily = "" }

        do {
            let result = try await BackendMemoryAPI.shared.updateStoryMovePreference(
                projectID: requestedProjectID,
                projectTitle: requestedProjectTitle,
                family: family,
                action: action
            )
            guard requestedProjectID == activeProjectID,
                  requestedProjectTitle == activeProjectTitle else {
                return
            }
            if let refreshed = result.payload.storyMovePreferences {
                preferences = StudioStoryMovePreferencePresentation.scoped(
                    refreshed,
                    projectID: requestedProjectID,
                    projectTitle: requestedProjectTitle
                )
                lastLoadedAt = Date()
            } else {
                await load(
                    projectID: requestedProjectID,
                    projectTitle: requestedProjectTitle,
                    force: true
                )
            }
        } catch {
            guard requestedProjectID == activeProjectID,
                  requestedProjectTitle == activeProjectTitle else {
                return
            }
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(
                    projectID: requestedProjectID,
                    projectTitle: requestedProjectTitle,
                    force: true,
                    reportErrors: false
                )
            }
            errorText = error.localizedDescription
        }
    }

    func resetAll() async {
        guard updatingFamily.isEmpty else { return }
        let requestedProjectID = activeProjectID
        let requestedProjectTitle = activeProjectTitle
        guard !requestedProjectID.isEmpty || !requestedProjectTitle.isEmpty else { return }

        updatingFamily = "reset_all"
        errorText = ""
        defer { updatingFamily = "" }

        do {
            let result = try await BackendMemoryAPI.shared.updateStoryMovePreference(
                projectID: requestedProjectID,
                projectTitle: requestedProjectTitle,
                family: "",
                action: "reset_all"
            )
            guard requestedProjectID == activeProjectID,
                  requestedProjectTitle == activeProjectTitle else {
                return
            }
            preferences = StudioStoryMovePreferencePresentation.scoped(
                result.payload.storyMovePreferences ?? [],
                projectID: requestedProjectID,
                projectTitle: requestedProjectTitle
            )
            lastLoadedAt = Date()
        } catch {
            guard requestedProjectID == activeProjectID,
                  requestedProjectTitle == activeProjectTitle else {
                return
            }
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(
                    projectID: requestedProjectID,
                    projectTitle: requestedProjectTitle,
                    force: true,
                    reportErrors: false
                )
            }
            errorText = error.localizedDescription
        }
    }
}

struct StudioCreativeInstinctsView: View {
    let projectTitle: String
    let hasSelectedProject: Bool
    let preferences: [BackendStoryMovePreference]
    let isLoading: Bool
    let updatingFamily: String
    let errorText: String
    let onRefresh: () -> Void
    let onUpdate: (BackendStoryMovePreference, String) -> Void
    let onResetAll: () -> Void

    @State private var showsResetConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text(projectName)
                    .font(IOThemTypography.UI.caption.weight(.medium))
                    .foregroundStyle(Color.herText.opacity(0.68))
                    .lineLimit(1)
                    .accessibilityIdentifier("studio.story-preferences")

                Spacer(minLength: 8)

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 26, height: 26)
                } else if hasSelectedProject {
                    Button(action: onRefresh) {
                        Image(systemName: "arrow.clockwise")
                            .font(IOThemTypography.UI.caption.weight(.semibold))
                            .frame(width: 26, height: 26)
                    }
                    .buttonStyle(.plain)
                    .help("Refresh creative instincts")
                    .accessibilityLabel("Refresh creative instincts")
                    .accessibilityIdentifier("studio.story-preferences.refresh")
                }

                if !preferences.isEmpty {
                    Button {
                        showsResetConfirmation = true
                    } label: {
                        Image(systemName: "arrow.counterclockwise")
                            .font(IOThemTypography.UI.caption.weight(.semibold))
                            .frame(width: 26, height: 26)
                    }
                    .buttonStyle(.plain)
                    .disabled(!updatingFamily.isEmpty)
                    .help("Reset creative preference learning")
                    .accessibilityLabel("Reset creative preference learning")
                    .accessibilityIdentifier("studio.story-preferences.reset-all")
                }
            }

            if preferences.isEmpty, !isLoading {
                Text(
                    hasSelectedProject
                        ? "No creative preference evidence yet."
                        : "Create or select a project to learn creative preferences."
                )
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("studio.story-preferences.empty")
            } else {
                ForEach(preferences.prefix(6)) { preference in
                    StudioCreativeInstinctRow(
                        preference: preference,
                        isUpdating: updatingFamily == preference.family,
                        isDisabled: !updatingFamily.isEmpty,
                        onUpdate: onUpdate
                    )
                }
            }

            if !errorText.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(errorText)
                        .font(IOThemTypography.UI.label.weight(.medium))
                        .foregroundStyle(Color.red.opacity(0.82))
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Try Again", action: onRefresh)
                        .font(IOThemTypography.UI.label)
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("studio.story-preferences.try-again")
                }
                .accessibilityIdentifier("studio.story-preferences.error")
            }
        }
        .confirmationDialog(
            "Reset creative preference learning for \(projectName)?",
            isPresented: $showsResetConfirmation,
            titleVisibility: .visible
        ) {
            Button("Reset Preferences", role: .destructive, action: onResetAll)
                .accessibilityIdentifier("studio.story-preferences.reset-confirm")
            Button("Cancel", role: .cancel) {}
                .accessibilityIdentifier("studio.story-preferences.reset-cancel")
        } message: {
            Text("Story facts and screenplay canon stay intact.")
        }
    }

    private var projectName: String {
        let cleanTitle = projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleanTitle.isEmpty ? "Current screenplay" : cleanTitle
    }
}

private struct StudioCreativeInstinctRow: View {
    let preference: BackendStoryMovePreference
    let isUpdating: Bool
    let isDisabled: Bool
    let onUpdate: (BackendStoryMovePreference, String) -> Void

    var body: some View {
        Group {
        #if os(macOS)
        VStack(alignment: .leading, spacing: 6) {
            preferenceCopy
            HStack(spacing: 4) {
                Spacer(minLength: 0)
                preferenceActions
            }
        }
        #else
        HStack(alignment: .top, spacing: 10) {
            preferenceCopy

            Spacer(minLength: 8)
            preferenceActions
        }
        #endif
        }
        .padding(.vertical, 2)
    }

    private var preferenceCopy: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(preference.displayName)
                    .font(IOThemTypography.UI.caption.weight(.semibold))
                    .foregroundStyle(Color.herText.opacity(0.88))
                if preference.isExplicitlyCorrected {
                    Text("Corrected")
                        .font(IOThemTypography.UI.micro)
                        .foregroundStyle(Color.herText.opacity(0.72))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Color.white.opacity(0.16))
                        .clipShape(Capsule())
                }
            }

            Text(preferenceSummary)
                .font(IOThemTypography.UI.label.weight(.regular))
                .foregroundStyle(Color.herText.opacity(0.65))
                .fixedSize(horizontal: false, vertical: true)

            Text(evidenceLine)
                .font(IOThemTypography.UI.micro.weight(.medium))
                .foregroundStyle(Color.herText.opacity(0.58))
                .fixedSize(horizontal: false, vertical: true)
        }
        .layoutPriority(1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(preference.displayName). \(preferenceSummary) \(evidenceLine)")
        .accessibilityIdentifier("studio.story-preference.\(preference.family)")
    }

    @ViewBuilder
    private var preferenceActions: some View {
        if isUpdating {
            ProgressView()
                .controlSize(.small)
                .frame(width: 44, height: 44)
        } else {
            Button {
                onUpdate(preference, "prefer")
            } label: {
                Image(systemName: "plus.circle")
                    .font(IOThemTypography.UI.body.weight(.medium))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isDisabled)
            .help("Suggest more like this")
            .accessibilityLabel("Suggest More Like This")
            .accessibilityIdentifier(
                "studio.story-preference.\(preference.family).prefer"
            )

            Menu {
                Button {
                    onUpdate(preference, "avoid")
                } label: {
                    Label("Suggest Less Like This", systemImage: "minus.circle")
                }
                .accessibilityIdentifier(
                    "studio.story-preference.\(preference.family).avoid"
                )
                Button(role: .destructive) {
                    onUpdate(preference, "reset")
                } label: {
                    Label("Forget This Preference", systemImage: "arrow.counterclockwise")
                }
                .accessibilityIdentifier(
                    "studio.story-preference.\(preference.family).reset"
                )
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(IOThemTypography.UI.body.weight(.medium))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isDisabled)
            .help("Adjust creative preference")
            .accessibilityLabel("Adjust \(preference.displayName)")
            .accessibilityIdentifier(
                "studio.story-preference.\(preference.family).menu"
            )
        }
    }

    private var preferenceSummary: String {
        preference.creativeGuidanceSummary
    }

    private var evidenceLine: String {
        preference.learningProvenanceSummary
    }
}
