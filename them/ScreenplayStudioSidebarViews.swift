import SwiftUI
import ScreenplayStudio
import UniformTypeIdentifiers

struct ScreenplayStudioSidebarModeTabs: View {
    @Binding var selection: ScreenplayStudioScreen.SidebarSection
    let secondaryTextColor: Color

    var body: some View {
        HStack(spacing: 10) {
            ForEach(ScreenplayStudioScreen.SidebarSection.allCases) { section in
                let isActive = selection == section
                Button {
                    selection = section
                } label: {
                    Text(section.title)
                        .font(IOThemTypography.UI.label)
                        .foregroundStyle(isActive ? Color.white : secondaryTextColor)
                        .padding(.horizontal, isActive ? 10 : 0)
                        .padding(.vertical, isActive ? 6 : 0)
                        .background(
                            Capsule()
                                .fill(isActive ? Color.accentColor.opacity(0.96) : Color.clear)
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(section.title)
                .accessibilityAddTraits(isActive ? .isSelected : [])
            }
        }
    }
}

struct ScreenplayStudioProjectsSidebar<FeatureSpine: View>: View {
    let projects: [BackendScreenplayProjectSummary]
    let selectedProjectID: String
    let hasSelectedProject: Bool
    @Binding var newProjectTitle: String
    let isSaving: Bool
    let isLoading: Bool
    let errorText: String
    let textColor: Color
    let secondaryTextColor: Color
    let tertiaryTextColor: Color
    let selectionFill: Color
    let onCreate: () -> Void
    let onSelect: (String) -> Void
    @ViewBuilder let featureSpine: () -> FeatureSpine

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Projects")
                .padding(.top, 2)

            HStack(spacing: 8) {
                TextField("New project title", text: $newProjectTitle)
                    .textFieldStyle(.plain)
                    .font(IOThemTypography.UI.captionMedium)
                    .foregroundStyle(Color.white.opacity(0.94))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Color.black.opacity(0.86))
                    )
                Button("Create", action: onCreate)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(newProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
            }

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(projects, id: \.id) { project in
                        projectButton(project)
                    }

                    if projects.isEmpty && !isLoading {
                        Text("No screenplay projects yet.")
                            .font(IOThemTypography.UI.caption)
                            .foregroundStyle(secondaryTextColor)
                            .padding(.top, 8)
                    }

                    if hasSelectedProject {
                        featureSpine()
                            .padding(.top, 4)
                    }
                }
                .padding(.vertical, 4)
            }

            Spacer(minLength: 0)

            if !errorText.isEmpty {
                Text(errorText)
                    .font(IOThemTypography.UI.microRegular)
                    .foregroundStyle(Color.red.opacity(0.74))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title.uppercased())
            .font(IOThemTypography.UI.micro)
            .tracking(0.7)
            .foregroundStyle(tertiaryTextColor)
    }

    private func projectButton(_ project: BackendScreenplayProjectSummary) -> some View {
        let isActive = selectedProjectID == project.id

        return Button {
            onSelect(project.id)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(project.title)
                    .font(isActive ? IOThemTypography.UI.calloutStrong : IOThemTypography.UI.calloutMedium)
                    .foregroundStyle(textColor.opacity(isActive ? 0.96 : 0.88))
                    .lineLimit(2)
                Text("Scenes \(project.sceneCount ?? 0) • Beats \(project.beatCount ?? 0)")
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(secondaryTextColor.opacity(isActive ? 0.92 : 0.82))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 6)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isActive ? selectionFill.opacity(0.82) : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }
}

struct ScreenplayStudioFilesSidebar: View {
    let breadcrumbs: [URL]
    let entries: [ScreenplayStudioScreen.StudioFileEntry]
    @Binding var showHidden: Bool
    @Binding var filterText: String
    @Binding var newFolderName: String
    @Binding var dropIsTargeted: Bool
    let canNavigateBack: Bool
    let canNavigateForward: Bool
    let canNavigateUp: Bool
    let tertiaryTextColor: Color
    let onOpenFolder: () -> Void
    let onNavigateBack: () -> Void
    let onNavigateForward: () -> Void
    let onNavigateUp: () -> Void
    let onNavigateTo: (URL) -> Void
    let onCreateFolder: () -> Void
    let onOpenEntry: (ScreenplayStudioScreen.StudioFileEntry) -> Void
    let onRenameEntry: (ScreenplayStudioScreen.StudioFileEntry) -> Void
    let onDeleteEntry: (ScreenplayStudioScreen.StudioFileEntry) -> Void
    let onDropFiles: ([NSItemProvider]) -> Bool
    let onSaveDraft: () -> Void
    let onRefresh: () -> Void
    let relativeTimestamp: (Date) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                sectionLabel("Local Files")
                Spacer()
                Button("Open Folder", action: onOpenFolder)
                    .buttonStyle(.bordered)
            }

            navigatorControls
            breadcrumbsRow

            TextField("Filter files", text: $filterText)
                .textFieldStyle(.roundedBorder)

            HStack(spacing: 8) {
                TextField("New folder name", text: $newFolderName)
                    .textFieldStyle(.roundedBorder)
                Button("Create", action: onCreateFolder)
                    .buttonStyle(.bordered)
            }

            entriesList

            HStack(spacing: 8) {
                Button("Save Draft As…", action: onSaveDraft)
                    .buttonStyle(.bordered)
                Button("Refresh Files", action: onRefresh)
                    .buttonStyle(.bordered)
            }
        }
    }

    private var navigatorControls: some View {
        HStack(spacing: 8) {
            Button(action: onNavigateBack) {
                Image(systemName: "chevron.left")
            }
            .buttonStyle(.bordered)
            .disabled(!canNavigateBack)

            Button(action: onNavigateForward) {
                Image(systemName: "chevron.right")
            }
            .buttonStyle(.bordered)
            .disabled(!canNavigateForward)

            Button(action: onNavigateUp) {
                Image(systemName: "arrow.up")
            }
            .buttonStyle(.bordered)
            .disabled(!canNavigateUp)

            Toggle("Hidden", isOn: $showHidden)
                .toggleStyle(.switch)
                .font(IOThemTypography.UI.caption)
        }
    }

    private var breadcrumbsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(breadcrumbs, id: \.path) { crumb in
                    Button(crumb.lastPathComponent.isEmpty ? "/" : crumb.lastPathComponent) {
                        onNavigateTo(crumb)
                    }
                    .buttonStyle(.plain)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(Color.herShellPanelSoft.opacity(0.55))
                    .clipShape(Capsule())
                }
            }
        }
    }

    private var entriesList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(entries) { entry in
                    entryRow(entry)
                }
                if entries.isEmpty {
                    Text("No files in this folder.")
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.64))
                        .padding(.top, 4)
                }
            }
            .padding(.vertical, 2)
        }
        .frame(minHeight: 130, maxHeight: 210)
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(
                    dropIsTargeted ? Color.white.opacity(0.65) : Color.white.opacity(0.12),
                    lineWidth: dropIsTargeted ? 2 : 1
                )
        )
        .onDrop(of: [UTType.fileURL], isTargeted: $dropIsTargeted, perform: onDropFiles)
    }

    private func entryRow(_ entry: ScreenplayStudioScreen.StudioFileEntry) -> some View {
        HStack(spacing: 6) {
            Button {
                onOpenEntry(entry)
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: entry.isDirectory ? "folder.fill" : "doc.text")
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(
                            entry.isDirectory
                            ? Color.yellow.opacity(0.9)
                            : Color.herText.opacity(0.78)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.name)
                            .font(IOThemTypography.UI.captionMedium)
                            .foregroundStyle(Color.herText.opacity(0.90))
                            .lineLimit(1)
                        if let modified = entry.modifiedAt {
                            Text(relativeTimestamp(modified))
                                .font(IOThemTypography.UI.nanoRegular)
                                .foregroundStyle(Color.herText.opacity(0.58))
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain)

            Button {
                onRenameEntry(entry)
            } label: {
                Image(systemName: "pencil")
                    .font(IOThemTypography.UI.label)
            }
            .buttonStyle(.bordered)

            Button {
                onDeleteEntry(entry)
            } label: {
                Image(systemName: "trash")
                    .font(IOThemTypography.UI.label)
            }
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Color.herShellPanelSoft.opacity(0.44))
        )
        .contextMenu {
            Button("Open") {
                onOpenEntry(entry)
            }
            Button("Rename") {
                onRenameEntry(entry)
            }
            Button(role: .destructive) {
                onDeleteEntry(entry)
            } label: {
                Text("Delete")
            }
        }
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title.uppercased())
            .font(IOThemTypography.UI.micro)
            .tracking(0.7)
            .foregroundStyle(tertiaryTextColor)
    }
}
