import SwiftUI

struct OrbView: View {
    @ObservedObject var driver: OrbAudioDriver
    var userMicLevel: Float = 0
    var isUserSpeaking: Bool = false

    // Look tuning
    private let baseSize: CGFloat = 140
    private let maxScaleBoost: CGFloat = 0.082
    private let pulseBoost: CGFloat = 0.022
    private let glowMaxOpacity: CGFloat = 0.94
    private let outlineWidth: CGFloat = 2.55
    private let orbIdleOpacity: Double = 0.52
    private let orbActiveOpacity: Double = 0.62

    var body: some View {
        ZStack {
            // Wave ring appears when either side is actively speaking.
            WaveRing(samples: activeWaveform)
                .opacity(isActiveVoice ? 1 : 0)
                .animation(.easeInOut(duration: 0.28), value: isActiveVoice)

            Circle()
                .fill(
                    LinearGradient(
                        gradient: Gradient(colors: [
                            .herOrbBgTop,
                            .herOrbBgMid,
                            .herOrbBgBottom
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                // Keep orb bright/translucent so it feels integrated with the background.
                .opacity(isActiveVoice ? orbActiveOpacity : orbIdleOpacity)
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(isActiveVoice ? 0.92 : 0.82), lineWidth: outlineWidth + 0.55)
                )
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(isActiveVoice ? 0.34 : 0.24), lineWidth: outlineWidth + 4.6)
                        .blur(radius: 1.45)
                        .blendMode(.screen)
                )
                .scaleEffect(1 + activeLevel * maxScaleBoost)
                .animation(.easeOut(duration: 0.09), value: activeLevel)

                // Breathing pulse while either side is talking.
                .modifier(SpeakingPulse(isOn: isActiveVoice, boost: pulseBoost))

                .shadow(
                    color: Color.white.opacity(isActiveVoice ? glowOpacity : 0.30),
                    radius: isActiveVoice ? (12 + activeLevel * 22) : 9
                )
                .animation(.easeOut(duration: 0.12), value: activeLevel)
        }
        .frame(width: baseSize, height: baseSize)
    }

    private var glowOpacity: Double {
        let o = Double(driver.level) * glowMaxOpacity
        return min(max(o, 0.36), glowMaxOpacity)
    }

    private var normalizedUserLevel: CGFloat {
        // Typical mic RMS sits very low, so remap into a useful visual range.
        let x = (CGFloat(userMicLevel) - 0.0016) / 0.014
        return min(max(x, 0), 1)
    }

    private var isActiveVoice: Bool {
        driver.isSpeaking || isUserSpeaking
    }

    private var activeLevel: CGFloat {
        max(driver.level, normalizedUserLevel)
    }

    private var activeWaveform: [CGFloat] {
        if driver.isSpeaking { return driver.waveform }
        if isUserSpeaking {
            let v = max(0.02, min(1, normalizedUserLevel))
            return Array(repeating: v, count: driver.waveform.count)
        }
        return Array(repeating: 0, count: driver.waveform.count)
    }
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
