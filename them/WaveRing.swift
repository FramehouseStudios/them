import SwiftUI

struct WaveRing: View {
    let samples: [CGFloat] // 0...1

    private let baseRadius: CGFloat = 72
    private let amp: CGFloat = 18
    private let lineWidth: CGFloat = 1.25

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let n = max(samples.count, 12)

            var path = Path()
            for i in 0..<n {
                let t = CGFloat(i) / CGFloat(n)
                let angle = t * .pi * 2

                let s = samples.isEmpty ? 0 : samples[i % samples.count]
                let r = baseRadius + s * amp

                let x = center.x + cos(angle) * r
                let y = center.y + sin(angle) * r
                let p = CGPoint(x: x, y: y)

                if i == 0 { path.move(to: p) }
                else { path.addLine(to: p) }
            }
            path.closeSubpath()

            // Soft ring stroke (premium, minimal)
            context.stroke(path, with: .color(.primary.opacity(0.22)), lineWidth: lineWidth)

            // Subtle second pass for depth
            context.stroke(path, with: .color(.primary.opacity(0.10)), lineWidth: lineWidth + 2.0)
        }
        .drawingGroup() // keeps it smooth
    }
}
