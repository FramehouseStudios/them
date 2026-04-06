import SwiftUI

struct HerOrbMotionView: View {
    let presence: HerPresence
    let micLevel: Float
    let assistantLevel: Float
    let uiReflection: BackendTalkUIReflection

    @State private var idleBreathe = false
    @State private var shimmer = false
    @State private var speakingPulse = false

    @State private var smoothedUserLevel: CGFloat = 0
    @State private var smoothedAssistantLevel: CGFloat = 0

    var body: some View {
        ZStack {
            // Outer halo
            Circle()
                .stroke(Color.herOrbStroke.opacity(outerHaloOpacity), lineWidth: outerHaloLineWidth)
                .frame(width: 230, height: 230)
                .blur(radius: 28)
                .scaleEffect(outerHaloScale)
                .saturation(orbSaturationAmount)

            // Inner halo
            Circle()
                .stroke(Color.herOrbStroke.opacity(innerHaloOpacity), lineWidth: innerHaloLineWidth)
                .frame(width: 214, height: 214)
                .blur(radius: 18)
                .scaleEffect(innerHaloScale)
                .saturation(orbSaturationAmount)

            // Core orb ring
            Circle()
                .stroke(Color.herOrbStroke.opacity(ringOpacity), lineWidth: ringLineWidth)
                .frame(width: ringSize, height: ringSize)
                .blur(radius: 0.35)
                .saturation(orbSaturationAmount)

            // Subtle inner haze so silence still feels alive
            Circle()
                .fill(Color.white.opacity(0.035))
                .frame(width: ringSize * 0.92, height: ringSize * 0.92)
                .blur(radius: 12)
                .opacity(innerHazeOpacity)
                .saturation(orbSaturationAmount)
        }
        .scaleEffect(orbScale)
        .offset(y: orbOffsetY)
        .animation(
            .spring(
                response: 0.56 + (Double(orbSmoothingAmount) * 0.24),
                dampingFraction: min(0.99, 0.88 + (Double(orbSmoothingAmount) * 0.10))
            ),
            value: orbScale
        )
        .animation(
            .easeInOut(duration: 0.28 + (Double(orbSmoothingAmount) * 0.16)),
            value: orbOffsetY
        )
        .onAppear {
            startIdleBreathe()
            startShimmer()
            startSpeakingPulse()
        }
        .onChange(of: micLevel) { _, newValue in
            let target = CGFloat(max(0, min(0.12, newValue)))
            smoothedUserLevel = smooth(
                smoothedUserLevel,
                toward: target,
                attack: userAttack,
                release: userRelease
            )
        }
        .onChange(of: assistantLevel) { _, newValue in
            let target = CGFloat(max(0, min(1, newValue)))
            smoothedAssistantLevel = smooth(
                smoothedAssistantLevel,
                toward: target,
                attack: assistantAttack,
                release: assistantRelease
            )
        }
    }

    // MARK: - Energy model

    private var orbSaturationAmount: CGFloat {
        CGFloat(max(0.35, min(1.0, uiReflection.orbSaturation)))
    }

    private var orbReactivityAmount: CGFloat {
        CGFloat(max(0.20, min(1.0, uiReflection.orbReactivity)))
    }

    private var orbSmoothingAmount: CGFloat {
        CGFloat(max(0.10, min(1.0, uiReflection.orbSmoothing)))
    }

    private var userAttack: CGFloat {
        lerp(from: 0.24, to: 0.08, t: orbSmoothingAmount)
    }

    private var userRelease: CGFloat {
        lerp(from: 0.10, to: 0.035, t: orbSmoothingAmount)
    }

    private var assistantAttack: CGFloat {
        lerp(from: 0.28, to: 0.10, t: orbSmoothingAmount)
    }

    private var assistantRelease: CGFloat {
        lerp(from: 0.08, to: 0.03, t: orbSmoothingAmount)
    }

    private var userVoiceEnergy: CGFloat {
        guard presence == .listening else { return 0 }
        return min(max(smoothedUserLevel / 0.010, 0), 1)
    }

    private var assistantVoiceEnergy: CGFloat {
        guard presence == .speaking else { return 0 }
        let normalized = min(max(smoothedAssistantLevel / 0.30, 0), 1)
        let rhythm = speakingPulse ? 1.0 : 0.88
        return normalized * rhythm
    }

    private var voiceEnergy: CGFloat {
        max(userVoiceEnergy, assistantVoiceEnergy)
    }

    private var isVoiceActive: Bool {
        voiceEnergy > 0.03
    }

    // MARK: - Motion

    // Calm baseline life in silence.
    private var idleScale: CGFloat {
        idleBreathe ? 1.004 : 0.996
    }

    // Slight expansion while voice is active.
    private var voiceScale: CGFloat {
        let amplitude = 0.010 + (orbReactivityAmount * 0.018)
        return 1.0 + (voiceEnergy * amplitude)
    }

    private var orbScale: CGFloat {
        idleScale * voiceScale
    }

    private var orbOffsetY: CGFloat {
        guard isVoiceActive else { return 0 }
        let up = 0.18 + (orbReactivityAmount * 0.62)
        let down = 0.04 + (orbReactivityAmount * 0.16)
        return speakingPulse ? -up : down
    }

    // MARK: - Styling

    private var ringSize: CGFloat {
        let amplitude = 0.008 + (orbReactivityAmount * 0.010)
        return 200 * (1.0 + voiceEnergy * amplitude)
    }

    private var ringLineWidth: CGFloat {
        let amplitude = 0.14 + (orbReactivityAmount * 0.22)
        return 2.0 + voiceEnergy * amplitude
    }

    private var ringOpacity: CGFloat {
        min(1.0, 0.90 + voiceEnergy * 0.08)
    }

    private var outerHaloScale: CGFloat {
        let amplitude = 0.06 + (orbReactivityAmount * 0.14)
        return 1.0 + voiceEnergy * amplitude
    }

    private var outerHaloLineWidth: CGFloat {
        let amplitude = 0.60 + (orbReactivityAmount * 1.00)
        return 2.4 + voiceEnergy * amplitude
    }

    private var outerHaloOpacity: CGFloat {
        let shimmerBoost: CGFloat = shimmer ? 0.016 : 0
        let amplitude = 0.10 + (orbReactivityAmount * 0.12)
        return min(0.42, 0.18 + voiceEnergy * amplitude + shimmerBoost)
    }

    private var innerHaloScale: CGFloat {
        let amplitude = 0.05 + (orbReactivityAmount * 0.09)
        return 1.0 + voiceEnergy * amplitude
    }

    private var innerHaloLineWidth: CGFloat {
        let amplitude = 0.45 + (orbReactivityAmount * 0.65)
        return 2.0 + voiceEnergy * amplitude
    }

    private var innerHaloOpacity: CGFloat {
        let amplitude = 0.06 + (orbReactivityAmount * 0.08)
        return min(0.30, 0.10 + voiceEnergy * amplitude)
    }

    private var innerHazeOpacity: CGFloat {
        let amplitude = 0.03 + (orbReactivityAmount * 0.05)
        return min(0.22, 0.08 + voiceEnergy * amplitude)
    }

    // MARK: - Loops

    private func startIdleBreathe() {
        idleBreathe = false
        withAnimation(.easeInOut(duration: 4.8).repeatForever(autoreverses: true)) {
            idleBreathe.toggle()
        }
    }

    private func startShimmer() {
        shimmer = false
        withAnimation(.easeInOut(duration: 7.0).repeatForever(autoreverses: true)) {
            shimmer.toggle()
        }
    }

    private func startSpeakingPulse() {
        speakingPulse = false
        withAnimation(.easeInOut(duration: 0.82).repeatForever(autoreverses: true)) {
            speakingPulse.toggle()
        }
    }

    private func smooth(
        _ current: CGFloat,
        toward target: CGFloat,
        attack: CGFloat,
        release: CGFloat
    ) -> CGFloat {
        let clampedTarget = max(0, min(1, target))
        let coeff = clampedTarget > current ? attack : release
        return current + ((clampedTarget - current) * coeff)
    }

    private func lerp(from: CGFloat, to: CGFloat, t: CGFloat) -> CGFloat {
        from + ((to - from) * max(0, min(1, t)))
    }
}
