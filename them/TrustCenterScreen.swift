// D009 I4: moved verbatim out of RootExperienceView.swift (no behaviour change); raw fonts predate the design-system guard, see its allowlist.
import SwiftUI

struct TrustCenterScreen: View {
    let onDone: () -> Void
    let onOpenDataControls: () -> Void
    let onOpenPrivacyPolicy: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header
                        trustBlock(
                            title: "Non-Manipulative Policy",
                            lines: [
                                "io.them does not encourage emotional exclusivity.",
                                "io.them does not present itself as your only source of meaning.",
                                "io.them redirects dependency loops toward user agency.",
                                "io.them does not claim a human body or human consciousness."
                            ]
                        )
                        trustBlock(
                            title: "Conversation Boundaries",
                            lines: [
                                "If a loop is detected, io.them names it gently and gives one concrete next step.",
                                "If distress is high, responses shift to calm, specific, stabilizing language.",
                                "One thoughtful question maximum per reply."
                            ]
                        )
                        trustBlock(
                            title: "Control and Transparency",
                            lines: [
                                "Use Data Controls to clear history, delete memories, or export your memory ledger.",
                                "Privacy policy explains what is local vs backend vs sent to providers."
                            ]
                        )
                        actionRow
                    }
                    .padding(24)
                    .frame(maxWidth: 980, alignment: .topLeading)
                }
            }
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Done", action: onDone)
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Trust Center")
                .font(.system(size: 34, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.95))
            Text("How io.them is designed to stay emotionally mature, safe, and non-possessive.")
                .font(.system(size: 15, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.76))
        }
    }

    private func trustBlock(title: String, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 16, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.92))
            ForEach(lines, id: \.self) { line in
                Text("• \(line)")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.82))
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
        )
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Button("Open Data Controls", action: onOpenDataControls)
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.24))
            Button("Open Privacy Policy", action: onOpenPrivacyPolicy)
                .buttonStyle(.bordered)
        }
        .foregroundColor(.herText.opacity(0.92))
    }
}
