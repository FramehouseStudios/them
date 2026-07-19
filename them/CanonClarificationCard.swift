import SwiftUI
import ScreenplayStudio

struct CanonClarificationCard: View {
    let clarification: BackendCanonCorrectionAmbiguity
    let resolvingFact: String?
    let errorMessage: String
    let onSelectFact: (String) -> Void
    let onDefer: () -> Void

    private var projectLabel: String {
        let title = clarification.projectTitle?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? "Story continuity" : title
    }

    private var candidateListHeight: CGFloat {
        let count = max(1, clarification.candidateFacts.count)
        return min(240, CGFloat(count * 68 + max(0, count - 1) * 8))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            correctionSummary

            Text("Which existing story fact should this replace?")
                .font(IOThemTypography.UI.callout)
                .foregroundStyle(Color.white.opacity(0.76))

            candidateList
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
            .disabled(resolvingFact != nil)
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

    private func candidateButton(for fact: String) -> some View {
        Button {
            onSelectFact(fact)
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
        .disabled(resolvingFact != nil)
        .accessibilityIdentifier("canon.clarification.fact")
    }

    @ViewBuilder
    private func candidateIcon(for fact: String) -> some View {
        if resolvingFact == fact {
            ProgressView()
                .controlSize(.small)
                .tint(.white)
                .frame(width: 18, height: 18)
        } else {
            Image(systemName: "checkmark.circle")
                .font(IOThemTypography.UI.sectionTitle)
                .foregroundStyle(Color.white.opacity(0.72))
                .frame(width: 18, height: 18)
        }
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
            .disabled(resolvingFact != nil)
            .accessibilityIdentifier("canon.clarification.later")
    }
}
