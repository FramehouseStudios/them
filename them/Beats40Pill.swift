// Beats40Pill — 40-beat Save-The-Cat pill for feature 60p+ (D009 Swift, not gated)
// Consumes x-live-paper-beats40 / x-live-paper-beat-count via BackendClient.
import SwiftUI

struct Beats40Pill: View {
    let beats40: [[String: Any]]? // decoded from x-live-paper-beats40
    let beatCount: Int

    init(beats40: [[String: Any]]? = nil, beatCount: Int = 0) {
        self.beats40 = beats40
        self.beatCount = beatCount
    }

    var body: some View {
        if let beats = beats40, !beats.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(beats.enumerated()), id: \.offset) { idx, beat in
                        let title = (beat["title"] as? String) ?? "Beat \(idx+1)"
                        let page = (beat["page"] as? Int) ?? 0
                        Text("\(idx+1). \(title) p\(page)")
                            .font(.caption2).lineLimit(1)
                            .padding(.horizontal, 7).padding(.vertical, 4)
                            .background(Color.blue.opacity(0.10), in: Capsule())
                    }
                }
            }
            .padding(.horizontal, 12)
        } else if beatCount > 0 {
            Text("\(beatCount) beats").font(.caption2).foregroundStyle(.secondary)
        }
    }
}
