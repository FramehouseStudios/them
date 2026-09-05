import SwiftUI

struct HerOrbView: View {
    /// 0...1 live VU from HerVoiceController.smoothedRMS (0.001 ... 0.02)
    var level: Double = 0
    @State private var breathe = false

    var body: some View {
        ZStack {
            // Diffused outer glow — breathes + VU
            Circle()
                .stroke(Color.herOrbStroke.opacity(0.4), lineWidth: 2)
                .frame(width: 220, height: 220)
                .blur(radius: 20)
                .scaleEffect(1 + CGFloat(level) * 0.22)

            // Primary ring — breathe + VU
            Circle()
                .stroke(Color.herOrbStroke, lineWidth: 2)
                .frame(width: 200, height: 200)
                .blur(radius: 0.3)
                .scaleEffect((breathe ? 1.03 : 1.0) + CGFloat(level) * 0.18)
                .animation(
                    .easeInOut(duration: 3.8)
                    .repeatForever(autoreverses: true)
                    .delay(0.2),
                    value: breathe
                )
                .animation(.easeOut(duration: 0.12), value: level)
        }
        .onAppear {
            breathe.toggle()
        }
    }
}
