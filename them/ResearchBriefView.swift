// ResearchBriefView — nightly research brief pill (D009 Swift, no ScreenplayStudioScreen 17438 growth)
// Consumes x-research-* headers via BackendClient parseResearchBriefHeaders (new) + BackendTalkResponseMetadata research fields.
// samantha is clementine.
import SwiftUI

struct ResearchBrief: Codable, Equatable {
    var strengths: [String] = []
    var weaknesses: [String] = []
    var exerciseTitle: String = ""
    var exercisePrompt: String = ""
    var exerciseLines: [String] = []
    var nextHint: String = ""
    var citations: [String] = []
}

struct ResearchBriefView: View {
    var brief: ResearchBrief?
    var onInsertExercise: (([String]) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let b = brief, (!b.strengths.isEmpty || !b.weaknesses.isEmpty) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        if !b.strengths.isEmpty {
                            Label("Strengths", systemImage: "star.fill").font(.caption).foregroundStyle(.green)
                            ForEach(b.strengths, id: \.self) { s in
                                Text("• \(s)").font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                            }
                        }
                        if !b.weaknesses.isEmpty {
                            Label("Gaps", systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange).padding(.top, 4)
                            ForEach(b.weaknesses, id: \.self) { w in
                                Text("• \(w)").font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                            }
                        }
                    }
                    Spacer()
                }
                .padding(10)
                .background(Color.green.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))

                if !b.exerciseTitle.isEmpty || !b.exercisePrompt.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(b.exerciseTitle.isEmpty ? "Exercise" : b.exerciseTitle).font(.caption).bold()
                        if !b.exercisePrompt.isEmpty { Text(b.exercisePrompt).font(.caption2).foregroundStyle(.secondary) }
                        if !b.exerciseLines.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(b.exerciseLines, id: \.self) { line in
                                    Text(line).font(.caption2).monospaced().lineLimit(1)
                                }
                            }
                            .padding(8)
                            .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
                        }
                        if let insert = onInsertExercise, !b.exerciseLines.isEmpty {
                            Button(action: { insert(b.exerciseLines) }) {
                                Label("Insert exercise to draft", systemImage: "square.and.pencil")
                            }
                            .font(.caption2).buttonStyle(.bordered).tint(.purple)
                        }
                        if !b.nextHint.isEmpty { Text(b.nextHint).font(.caption2).foregroundStyle(.purple) }
                        if !b.citations.isEmpty { Text("Cites: \(b.citations.joined(separator: " | "))").font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
                    }
                    .padding(10)
                    .background(Color.purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                }
            } else {
                Text("No research brief yet — upload a script, then nightly brief arrives at 02:00.").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .accessibilityLabel("Research brief")
    }
}

// Helper to parse research brief from BackendTalkResponseMetadata extension (wired in BackendClient parseResearchBriefHeaders)
extension ResearchBrief {
    static func from(metadata: BackendTalkResponseMetadata) -> ResearchBrief? {
        // metadata will carry research fields once BackendClient is wired; for now return nil if empty
        return nil
    }
}
