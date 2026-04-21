import SwiftUI

struct OrbView: View {
    @ObservedObject var driver: OrbAudioDriver

    // Look tuning
    private let baseSize: CGFloat = 140
    private let maxScaleBoost: CGFloat = 0.14 // 14% max growth from amplitude
    private let pulseBoost: CGFloat = 0.04 // extra 4% "breathing" while speaking
    private let glowMaxOpacity: CGFloat = 0.96
    private var isActiveVoice: Bool { driver.isSpeaking || driver.isUserTalking || driver.isThinking }
    private var activeLevel: CGFloat {
        max(driver.level, driver.userLevel, driver.thinkingLevel * 0.70)
    }

    var body: some View {
        ZStack {
            // 3) Waveform ring
            WaveRing(samples: driver.waveform)
                .opacity(isActiveVoice ? 1 : 0)
                .animation(.easeInOut(duration: 0.35), value: isActiveVoice)

            // Heavier base halo (always visible)
            Circle()
                .stroke(haloColor.opacity(0.62), lineWidth: 16)
                .blur(radius: 4.6)
                .scaleEffect(1.10)

            // Dynamic bright halo (thicker/brighter while speaking)
            Circle()
                .stroke(
                    haloColor.opacity(isActiveVoice ? dynamicHaloOpacity : 0.56),
                    lineWidth: isActiveVoice ? (20 + activeLevel * 16) : 16
                )
                .blur(radius: isActiveVoice ? (6.2 + activeLevel * 3.8) : 4.6)
                .scaleEffect(1.14 + (isActiveVoice ? activeLevel * 0.10 : 0))
                .animation(.easeOut(duration: 0.10), value: activeLevel)
                .animation(.easeInOut(duration: 0.24), value: isActiveVoice)

            // Outer diffusion layer for a denser aura
            Circle()
                .stroke(
                    haloColor.opacity(isActiveVoice ? (dynamicHaloOpacity * 0.52) : 0.34),
                    lineWidth: isActiveVoice ? (30 + activeLevel * 18) : 24
                )
                .blur(radius: isActiveVoice ? (11 + activeLevel * 4.8) : 8.8)
                .scaleEffect(1.18 + (isActiveVoice ? activeLevel * 0.12 : 0))
                .animation(.easeOut(duration: 0.12), value: activeLevel)
                .animation(.easeInOut(duration: 0.24), value: isActiveVoice)

            // Orb
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            orbHighlight.opacity(0.62),
                            orbMid.opacity(0.96),
                            orbCore
                        ],
                        center: .topLeading,
                        startRadius: 2,
                        endRadius: baseSize * 0.56
                    )
                )
                .overlay(
                    Circle().stroke(orbEdge.opacity(0.90), lineWidth: 3.8)
                )
                .overlay(
                    Circle().stroke(orbEdgeDark.opacity(0.56), lineWidth: 1.4)
                )
                // 2) Real amplitude scaling
                .scaleEffect(1 + activeLevel * maxScaleBoost)
                .animation(.easeOut(duration: 0.08), value: activeLevel)

                // 1) Fake breathing pulse (only while speaking)
                .modifier(SpeakingPulse(isOn: isActiveVoice, boost: pulseBoost))

                // 3) Glow linked to amplitude
                .shadow(
                    color: haloColor.opacity(isActiveVoice ? glowOpacity : 0.40),
                    radius: isActiveVoice ? (42 + activeLevel * 42) : 34
                )
                .shadow(
                    color: haloColor.opacity(isActiveVoice ? (glowOpacity * 0.62) : 0.28),
                    radius: isActiveVoice ? (88 + activeLevel * 52) : 68
                )
                .shadow(
                    color: haloColor.opacity(isActiveVoice ? (glowOpacity * 0.38) : 0.16),
                    radius: isActiveVoice ? (138 + activeLevel * 64) : 102
                )
                .animation(.easeOut(duration: 0.10), value: activeLevel)
        }
        .frame(width: baseSize, height: baseSize)
    }

    private var glowOpacity: Double {
        // silence -> faint, loud -> brighter (still premium)
        let o = Double(activeLevel) * glowMaxOpacity
        return min(max(o, 0.34), glowMaxOpacity)
    }

    private var dynamicHaloOpacity: Double {
        let base = isActiveVoice ? 0.78 : 0.60
        let boost = Double(activeLevel) * 0.32
        return min(0.98, base + boost)
    }

    private var orbCore: Color { Color(.sRGB, red: 0.30, green: 0.19, blue: 0.10, opacity: 1.0) }
    private var orbMid: Color { Color(.sRGB, red: 0.52, green: 0.34, blue: 0.18, opacity: 1.0) }
    private var orbHighlight: Color { Color(.sRGB, red: 0.78, green: 0.54, blue: 0.31, opacity: 1.0) }
    private var orbEdge: Color { Color(.sRGB, red: 0.97, green: 0.76, blue: 0.48, opacity: 1.0) }
    private var orbEdgeDark: Color { Color(.sRGB, red: 0.24, green: 0.14, blue: 0.07, opacity: 1.0) }
    private var haloColor: Color { Color(.sRGB, red: 0.98, green: 0.72, blue: 0.43, opacity: 1.0) }
}

// MARK: - Fake pulse modifier

private struct SpeakingPulse: ViewModifier {
    let isOn: Bool
    let boost: CGFloat

    @State private var pulsing: Bool = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isOn ? (pulsing ? 1 + boost : 1) : 1)
            .onChange(of: isOn) { _, newValue in
                if newValue {
                    pulsing = false
                    withAnimation(.easeInOut(duration: 0.75).repeatForever(autoreverses: true)) {
                        pulsing = true
                    }
                } else {
                    pulsing = false
                }
            }
    }
}
