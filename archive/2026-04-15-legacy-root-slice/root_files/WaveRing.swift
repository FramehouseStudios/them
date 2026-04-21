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

            // Warm peach-gold ring (matches orb glow palette)
            context.stroke(
                path,
                with: .color(ringBright.opacity(0.66)),
                lineWidth: lineWidth + 0.35
            )
            context.stroke(
                path,
                with: .color(ringWarm.opacity(0.36)),
                lineWidth: lineWidth + 2.8
            )
            context.stroke(
                path,
                with: .color(ringBright.opacity(0.18)),
                lineWidth: lineWidth + 6.2
            )
        }
        .drawingGroup() // keeps it smooth
    }

    private var ringBright: Color {
        Color(.sRGB, red: 0.98, green: 0.72, blue: 0.43, opacity: 1.0)
    }

    private var ringWarm: Color {
        Color(.sRGB, red: 0.74, green: 0.49, blue: 0.26, opacity: 1.0)
    }
}
