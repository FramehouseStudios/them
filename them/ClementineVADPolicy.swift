import Foundation

/// Pure voice-activity policy shared by the live controller and its tests.
///
/// Speech can rise gradually. A noise estimator that follows every sample below
/// the current speech threshold will therefore learn the speaker as "noise" and
/// move the threshold out of reach. This policy only lets the floor rise slowly
/// when a sample remains close to the floor; clear foreground energy is never
/// folded into the ambient estimate.
struct ClementineVADPolicy {
    static let minimumNoiseFloorRMS: Float = 0.00005
    static let maximumNoiseFloorRMS: Float = 0.0048
    static let minimumStartThreshold: Float = 0.0038
    static let maximumStartThreshold: Float = 0.016

    static func updatedNoiseFloor(current: Float, observedRMS: Float) -> Float {
        let floor = min(max(current, minimumNoiseFloorRMS), maximumNoiseFloorRMS)
        let observed = min(max(observedRMS, minimumNoiseFloorRMS), 0.05)

        if observed <= floor {
            return boundedNoiseFloor((floor * 0.88) + (observed * 0.12))
        }

        // Permit slow adaptation to a genuinely changing room floor, but do not
        // chase gradual speech, playback, keyboard strikes, or handling noise.
        let upwardLearningCeiling = min(floor * 1.45, floor + 0.0008)
        guard observed <= upwardLearningCeiling else { return floor }
        return boundedNoiseFloor((floor * 0.99) + (observed * 0.01))
    }

    static func startThreshold(
        noiseFloorRMS: Float,
        baseThreshold: Float,
        sensitivity: Double
    ) -> Float {
        let normalizedSensitivity = min(max(sensitivity, 0), 1)
        // Preserve the existing default around 62%, while making the visible
        // setting meaningful: higher sensitivity needs less foreground energy.
        let baseScale = Float(1.28 - (0.45 * normalizedSensitivity))
        let floorMultiplier = Float(3.25 - (0.56 * normalizedSensitivity))
        let floor = min(max(noiseFloorRMS, minimumNoiseFloorRMS), maximumNoiseFloorRMS)
        let candidate = max(baseThreshold * baseScale, floor * floorMultiplier)
        return min(max(candidate, minimumStartThreshold), maximumStartThreshold)
    }

    static func playbackBaseline(
        current: Float,
        observedRMS: Float,
        isCalibrating: Bool
    ) -> Float {
        guard isCalibrating else { return current }
        // A peak envelope during the short grace window represents speaker
        // leakage better than a lagging average and avoids treating the rising
        // edge of Clementine's own voice as an interruption.
        return max(current, observedRMS)
    }

    static func bargeInThreshold(
        dynamicStartThreshold: Float,
        noiseFloorRMS: Float,
        playbackBaselineRMS: Float
    ) -> Float {
        max(
            dynamicStartThreshold * 0.92,
            noiseFloorRMS * 1.65,
            0.0028,
            playbackBaselineRMS + 0.003
        )
    }

    static func shouldInterruptPlayback(
        elapsedSincePlaybackStart: TimeInterval,
        graceSeconds: TimeInterval,
        candidateHoldSeconds: TimeInterval,
        requiredHoldSeconds: TimeInterval,
        consecutiveLoudFrames: Int,
        rms: Float,
        threshold: Float,
        playbackBaselineRMS: Float
    ) -> Bool {
        guard elapsedSincePlaybackStart >= graceSeconds else { return false }
        let immediateCut = rms >= max(0.016, playbackBaselineRMS + 0.010) &&
            consecutiveLoudFrames >= 2
        let heldCut = candidateHoldSeconds >= requiredHoldSeconds &&
            consecutiveLoudFrames >= 2 &&
            rms >= threshold
        return immediateCut || heldCut
    }

    private static func boundedNoiseFloor(_ value: Float) -> Float {
        min(max(value, minimumNoiseFloorRMS), maximumNoiseFloorRMS)
    }
}
