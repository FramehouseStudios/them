// InspectorProvenanceTimeline — tap provenance history to revert (P2 polish, not gated)
import SwiftUI

struct InspectorProvenanceTimeline: View {
    let history: [String]
    var onRevert: ((String) -> Void)? = nil
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(history.enumerated()), id: \.offset) { _, p in
                    Button(action: { onRevert?(p) }) {
                        Text(p).font(.caption2).padding(.horizontal, 7).padding(.vertical, 4)
                            .background(Color.blue.opacity(0.12), in: Capsule())
                    }.buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 12)
    }
}
