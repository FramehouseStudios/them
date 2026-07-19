import SwiftUI
import ScreenplayStudio

struct CanonClarificationCard: View {
    let clarification: BackendCanonCorrectionAmbiguity
    let isResolving: Bool
    let errorMessage: String
    let onResolve: ([String]) -> Void
    let onDefer: () -> Void

    @State private var selectedFacts: Set<String> = []

    private var projectLabel: String {
        let title = clarification.projectTitle?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? "Story continuity" : title
    }

    private var candidateListHeight: CGFloat {
        let count = max(1, clarification.candidateFacts.count)
        return min(240, CGFloat(count * 68 + max(0, count - 1) * 8))
    }

    private var orderedSelection: [String] {
        clarification.candidateFacts.filter(selectedFacts.contains)
    }

    private var allSelected: Bool {
        !clarification.candidateFacts.isEmpty &&
            orderedSelection.count == clarification.candidateFacts.count
    }

    private var applyLabel: String {
        let count = orderedSelection.count
        if count == clarification.candidateFacts.count, count > 1 {
            return "Apply to all \(count) facts"
        }
        let noun = count == 1 ? "fact" : "facts"
        return "Apply to \(count) \(noun)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            correctionSummary

            Text("Which existing story facts should this correction replace?")
                .font(IOThemTypography.UI.callout)
                .foregroundStyle(Color.white.opacity(0.76))

            selectionControls
            candidateList
            applyButton
            errorSection
            laterButton
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.black.opacity(0.90))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.26), radius: 20, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("canon.clarification.card")
        .onChange(of: clarification.id) { _, _ in
            selectedFacts.removeAll()
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Clarify canon")
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.white)
                Text(projectLabel)
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.white.opacity(0.62))
            }
            Spacer(minLength: 12)
            Button(action: onDefer) {
                Image(systemName: "xmark")
                    .font(IOThemTypography.UI.label)
                    .foregroundStyle(Color.white.opacity(0.72))
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isResolving)
            .accessibilityLabel("Decide later")
            .accessibilityIdentifier("canon.clarification.defer")
        }
    }

    private var correctionSummary: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("You corrected")
                .font(IOThemTypography.UI.label)
                .foregroundStyle(Color.white.opacity(0.58))
                .textCase(.uppercase)
            Text(clarification.correctionText)
                .font(IOThemTypography.UI.body)
                .foregroundStyle(Color.white.opacity(0.94))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var candidateList: some View {
        ScrollView {
            VStack(spacing: 8) {
                ForEach(clarification.candidateFacts, id: \.self) { fact in
                    candidateButton(for: fact)
                }
            }
        }
        .frame(height: candidateListHeight)
    }

    private var selectionControls: some View {
        HStack(spacing: 12) {
            Button {
                if allSelected {
                    selectedFacts.removeAll()
                } else {
                    selectedFacts = Set(clarification.candidateFacts)
                }
            } label: {
                Label(
                    allSelected ? "Clear" : "Select all",
                    systemImage: allSelected ? "xmark.square" : "square"
                )
            }
            .buttonStyle(.plain)
            .font(IOThemTypography.UI.caption)
            .foregroundStyle(Color.white.opacity(0.76))
            .disabled(isResolving)
            .accessibilityIdentifier("canon.clarification.select-all")

            Spacer(minLength: 8)

            Text("\(orderedSelection.count) selected")
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.white.opacity(0.54))
        }
    }

    private func candidateButton(for fact: String) -> some View {
        Button {
            if selectedFacts.contains(fact) {
                selectedFacts.remove(fact)
            } else {
                selectedFacts.insert(fact)
            }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                candidateIcon(for: fact)
                Text(fact)
                    .font(IOThemTypography.UI.callout)
                    .foregroundStyle(Color.white.opacity(0.94))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08))
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(Color.white.opacity(0.16), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isResolving)
        .accessibilityIdentifier("canon.clarification.fact")
        .accessibilityValue(selectedFacts.contains(fact) ? "Selected" : "Not selected")
    }

    private func candidateIcon(for fact: String) -> some View {
        Image(systemName: selectedFacts.contains(fact) ? "checkmark.square.fill" : "square")
            .font(IOThemTypography.UI.sectionTitle)
            .foregroundStyle(Color.white.opacity(selectedFacts.contains(fact) ? 0.92 : 0.58))
            .frame(width: 18, height: 18)
    }

    private var applyButton: some View {
        Button {
            onResolve(orderedSelection)
        } label: {
            HStack(spacing: 9) {
                if isResolving {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.black)
                } else {
                    Image(systemName: "checkmark.seal.fill")
                }
                Text(isResolving ? "Updating canon" : applyLabel)
                Spacer(minLength: 0)
            }
            .font(IOThemTypography.UI.callout)
            .foregroundStyle(Color.black.opacity(0.88))
            .padding(.horizontal, 12)
            .frame(height: 42)
            .frame(maxWidth: .infinity)
            .background(Color.white.opacity(orderedSelection.isEmpty ? 0.38 : 0.94))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(orderedSelection.isEmpty || isResolving)
        .accessibilityIdentifier("canon.clarification.apply")
    }

    @ViewBuilder
    private var errorSection: some View {
        if !errorMessage.isEmpty {
            Text(errorMessage)
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.red.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("canon.clarification.error")
        }
    }

    private var laterButton: some View {
        Button("Decide later", action: onDefer)
            .buttonStyle(.plain)
            .font(IOThemTypography.UI.caption)
            .foregroundStyle(Color.white.opacity(0.62))
            .disabled(isResolving)
            .accessibilityIdentifier("canon.clarification.later")
    }
}
