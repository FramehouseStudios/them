import SwiftUI

struct HerOrbView: View {
    @State private var breathe = false

    var body: some View {
        ZStack {

            // Diffused outer glow
            Circle()
                .stroke(Color.herOrbStroke.opacity(0.4), lineWidth: 2)
                .frame(width: 220, height: 220)
                .blur(radius: 20)

            // Primary ring
            Circle()
                .stroke(Color.herOrbStroke, lineWidth: 2)
                .frame(width: 200, height: 200)
                .blur(radius: 0.3)
                .scaleEffect(breathe ? 1.03 : 1.0)
                .animation(
                    .easeInOut(duration: 3.8)
                    .repeatForever(autoreverses: true)
                    .delay(0.2),
                    value: breathe
                )
        }
        .onAppear {
            breathe.toggle()
        }
    }
}
