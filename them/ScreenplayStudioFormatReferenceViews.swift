import SwiftUI

struct ScreenplayStudioLeadReferenceDisclosure: View {
    @Binding var isExpanded: Bool

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Clean sluglines, lean action, concise dialogue, hard final beat.")
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.72))
                Text("Normalize with Cmd-Shift-F when pasted or imported text drifts away from the house format.")
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.62))
            }
            .padding(.top, 4)
        } label: {
            HStack(spacing: 8) {
                Text("Lead Reference")
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .textCase(.uppercase)
                Text("A Cup of Coffee")
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.86))
                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.herShellPanel.opacity(0.72))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.22), lineWidth: 1)
        )
    }
}

struct ScreenplayStudioHollywoodFormatGuide: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                formatBadge("STRICT HOLLYWOOD FORMAT")
                formatBadge("Courier 12")
                formatBadge("1 page ~ 1 minute")
                Spacer(minLength: 0)
                Text("Normalize: Cmd-Shift-F")
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.60))
            }

            Text("From your PDF: use all-caps sluglines, keep action left-aligned and in present tense, center character names, place dialogue directly underneath, use parentheticals sparingly, and save transitions for moments like CUT TO: or FADE OUT.")
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.78))
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 7) {
                formatRuleRow(
                    title: "Slugline",
                    detail: "ALL CAPS. Use INT./EXT. + location + DAY or NIGHT."
                )
                formatRuleRow(
                    title: "Action",
                    detail: "Keep it on the left side of the page. Present tense. Tight visual lines."
                )
                formatRuleRow(
                    title: "Character",
                    detail: "Center the name and keep it in ALL CAPS."
                )
                formatRuleRow(
                    title: "Dialogue",
                    detail: "Place it directly under the character name, separated from action."
                )
                formatRuleRow(
                    title: "Parenthetical",
                    detail: "Use only when delivery would be unclear without it."
                )
                formatRuleRow(
                    title: "Transition",
                    detail: "Keep it in ALL CAPS on the right edge: CUT TO:, FADE OUT."
                )
                formatRuleRow(
                    title: "First appearance",
                    detail: "Introduce new characters in ALL CAPS inside action."
                )
            }

            screenplaySample

            HStack(spacing: 8) {
                structureChip(title: "Act 1", pages: "pp. 1-25")
                structureChip(title: "Act 2", pages: "pp. 25-90")
                structureChip(title: "Act 3", pages: "pp. 90-110")
                Spacer(minLength: 0)
                Text("Write visually. Enter late. Leave early.")
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.62))
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.herShellPanel.opacity(0.74))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.26), lineWidth: 1)
        )
    }

    private var screenplaySample: some View {
        let metrics = ScreenplayStackMetrics.guideSample

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 16) {
                Text("ACTION / SLUGLINE = LEFT")
                Spacer(minLength: 0)
                Text("CHARACTER = CENTER")
                Spacer(minLength: 0)
                Text("TRANSITION = RIGHT")
            }
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .foregroundStyle(Color.herText.opacity(0.54))

            VStack(alignment: .leading, spacing: 0) {
                Text("INT. DINER - NIGHT")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, metrics.sceneHeadingSpacingAfter)
                Text("SARAH waits at the counter, keys biting into her palm.")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, metrics.actionCueSpacingAfter)
                Text("SARAH")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, metrics.characterLeading)
                    .padding(.trailing, metrics.characterTrailing)
                    .multilineTextAlignment(.center)
                Text("(quietly)")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, metrics.parentheticalLeading)
                    .padding(.trailing, metrics.parentheticalTrailing)
                Text("I thought you said you were done waiting.")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, metrics.dialogueLeading)
                    .padding(.trailing, metrics.dialogueTrailing)
                Text("CUT TO:")
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.trailing, metrics.transitionTrailing)
                    .padding(.top, metrics.transitionSpacingBefore)
            }
            .font(.custom("Courier", size: 12))
            .foregroundStyle(Color.black.opacity(0.84))
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.herPaper)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.herPaperLine.opacity(0.74), lineWidth: 1)
            )
        }
    }

    private func formatBadge(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .foregroundStyle(Color.herText.opacity(0.82))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.herShellPanelSoft.opacity(0.88))
            .overlay(
                Capsule()
                    .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
            )
            .clipShape(Capsule())
    }

    private func formatRuleRow(title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color.herText.opacity(0.56))
                .frame(width: 120, alignment: .leading)
            Text(detail)
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.80))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func structureChip(title: String, pages: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.84))
            Text(pages)
                .font(.system(size: 10, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.62))
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.herShellPanelSoft.opacity(0.82))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
        )
    }
}
