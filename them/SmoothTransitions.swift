// SmoothTransitions — spring page curl + haptics + skeleton (smooth amazing, not gated)
import SwiftUI

struct SmoothTransitions {
    static func pageCurlSpring(_ drag: CGFloat) -> CGFloat { drag * 0.85 }
}

struct SkeletonPageView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(0..<5) { _ in RoundedRectangle(cornerRadius: 4).fill(Color.gray.opacity(0.12)).frame(height: 14) }
        }.padding(12).redacted(reason: .placeholder)
    }
}

struct HapticPageTurn {
    static func light() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
    }
}
