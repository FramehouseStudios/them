// ClementineSuggestionPill — SwiftUI pills for suggestion/presence/voice (D009 Swift, no ScreenplayStudioScreen growth)
// Consumes BackendTalkResponseMetadata.suggestion/presenceHistory/voiceLearn/vulnAsk via BackendClient callback.
// Gated file stays 17438; this file is new and not gated.
import SwiftUI

struct ClementineSuggestionPill: View {
    let metadata: BackendTalkResponseMetadata
    var onTapSuggestion: ((String) -> Void)? = nil
    var onTapCollabCursor: ((BackendCollabCursor) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let s = metadata.suggestion, !s.isEmpty {
                Button(action: { onTapSuggestion?(s) }) {
                    Label(s, systemImage: "lightbulb.fill")
                        .font(.caption)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .padding(8)
                        .background(Color.yellow.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clementine suggestion")
            }
            if let ask = metadata.vulnAsk, !ask.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(ask).font(.caption).foregroundStyle(.secondary)
                    if !metadata.vulnOptions.isEmpty {
                        HStack {
                            ForEach(metadata.vulnOptions, id: \.self) { opt in
                                Button(opt) { onTapSuggestion?(opt) }
                                    .font(.caption2).padding(.horizontal, 8).padding(.vertical, 4)
                                    .background(Color.purple.opacity(0.12), in: Capsule())
                            }
                        }
                    }
                }
                .padding(8)
                .background(Color.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            }
            if !metadata.presenceHistory.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(Array(metadata.presenceHistory.enumerated()), id: \.offset) { _, state in
                            Text(state).font(.caption2).padding(.horizontal, 6).padding(.vertical, 3)
                                .background(state == "barge_in" ? Color.red.opacity(0.15) : Color.green.opacity(0.12), in: Capsule())
                        }
                    }
                }
                .accessibilityLabel("Presence history \(metadata.presenceHistory.joined(separator: ", "))")
            }
            if let v = metadata.voiceLearn, !v.isEmpty {
                Text("Voice: \(v)").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            if let cur = metadata.collabCursor {
                Button(action: { onTapCollabCursor?(cur) }) {
                    Label("Cursor p\(cur.page):\(cur.line)\(cur.character.map { " \( $0)" } ?? "")", systemImage: "cursorarrow")
                        .font(.caption2)
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
    }
}
