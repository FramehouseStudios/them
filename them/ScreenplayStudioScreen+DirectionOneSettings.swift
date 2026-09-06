// D009 I4: moved verbatim out of ScreenplayStudioScreen.swift (no behaviour change); raw fonts predate the design-system guard, see its allowlist.
import SwiftUI
import ScreenplayStudio

extension ScreenplayStudioScreen {
    var directionOneSettingsPopover: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Studio Settings")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.92))

            Toggle("Auto-insert voice turns", isOn: $liveDraftBridge.autoInsertEnabled)
                .font(.system(size: 12, weight: .regular, design: .default))
                .toggleStyle(.switch)

            Toggle("Autosave draft", isOn: $vm.autosaveEnabled)
                .font(.system(size: 12, weight: .regular, design: .default))
                .toggleStyle(.switch)

            Divider()

            if vm.recoveryCandidate != nil {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Local draft recovery available")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(Color.orange.opacity(0.90))
                    HStack(spacing: 8) {
                        Button("Recover") {
                            vm.restoreDraftFromRecovery()
                        }
                        .buttonStyle(.borderedProminent)
                        Button("Discard") {
                            vm.discardLocalRecoveryCopy()
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(10)
                .background(Color.orange.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            if vm.conflictState != nil {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Save conflict — server changed this draft")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(Color.red.opacity(0.90))
                    HStack(spacing: 8) {
                        Button("Load Server") {
                            vm.applyServerVersionFromConflict()
                        }
                        .buttonStyle(.bordered)
                        Button("Keep Mine") {
                            Task { await vm.keepLocalDraftAfterConflict() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding(10)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Divider()

            Button("Reload Project") {
                if let id = vm.selectedProject?.id {
                    Task { await vm.selectProject(id) }
                }
                showingDirectionOneSettings = false
            }
            .font(.system(size: 12, weight: .regular, design: .default))

            Button("Clear Draft") {
                vm.clearDraft()
                liveDraftBridge.clearDraft()
                showingDirectionOneSettings = false
            }
            .font(.system(size: 12, weight: .regular, design: .default))
            .foregroundStyle(Color.red.opacity(0.76))
            .disabled(vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(16)
        .frame(width: 280)
    }
}
