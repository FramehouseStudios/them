import Foundation
import Combine

enum ClementineLatencyTransport: String, Codable, CaseIterable {
    case realtimeVoice = "realtime_voice"
    case studioTypedSpeech = "studio_typed_speech"
    case turnBasedVoice = "turn_based_voice"
}

enum ClementineSpeechNetworkClass: String, Codable, CaseIterable {
    case fast
    case balanced
    case constrained
}

struct ClementineLatencySample: Codable, Equatable, Identifiable {
    let id: String
    let transport: ClementineLatencyTransport
    let startedAt: TimeInterval
    var firstTextMs: Double?
    var firstAudioMs: Double?
    var bargeInAckMs: Double?
    var speechNetworkClass: ClementineSpeechNetworkClass?
    var speechTargetCharacters: Int?
}

struct ClementineLatencySummary: Equatable {
    let sampleCount: Int
    let latestFirstTextMs: Double?
    let latestFirstAudioMs: Double?
    let latestBargeInAckMs: Double?
    let medianFirstTextMs: Double?
    let p95FirstTextMs: Double?
    let medianFirstAudioMs: Double?
    let p95FirstAudioMs: Double?
    let latestNetworkClass: ClementineSpeechNetworkClass?
    let latestSpeechTargetCharacters: Int?

    static let empty = ClementineLatencySummary(
        sampleCount: 0,
        latestFirstTextMs: nil,
        latestFirstAudioMs: nil,
        latestBargeInAckMs: nil,
        medianFirstTextMs: nil,
        p95FirstTextMs: nil,
        medianFirstAudioMs: nil,
        p95FirstAudioMs: nil,
        latestNetworkClass: nil,
        latestSpeechTargetCharacters: nil
    )

    var diagnosticsSummary: String {
        guard sampleCount > 0 else { return "No client latency samples yet" }
        let text = Self.millisecondsText(medianFirstTextMs)
        let audio = Self.millisecondsText(medianFirstAudioMs)
        return "\(sampleCount) turns · median text \(text) · median audio \(audio)"
    }

    static func millisecondsText(_ value: Double?) -> String {
        guard let value else { return "n/a" }
        return "\(Int(value.rounded())) ms"
    }
}

@MainActor
final class ClementineLatencyTelemetryStore: ObservableObject {
    static let shared = ClementineLatencyTelemetryStore()

    @Published private(set) var samples: [ClementineLatencySample]

    private let defaults: UserDefaults
    private let storageKey: String
    private let maxSamples: Int
    private var bargeInStartedAtByTurnID: [String: Date] = [:]

    init(
        defaults: UserDefaults = .standard,
        storageKey: String = "clementine.client_latency.v1",
        maxSamples: Int = 40
    ) {
        self.defaults = defaults
        self.storageKey = storageKey
        self.maxSamples = max(1, maxSamples)
        if let data = defaults.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode([ClementineLatencySample].self, from: data) {
            samples = Array(decoded.suffix(self.maxSamples))
        } else {
            samples = []
        }
    }

    nonisolated deinit {}

    var summary: ClementineLatencySummary {
        guard let latest = samples.last else { return .empty }
        let textValues = samples.compactMap(\.firstTextMs)
        let audioValues = samples.compactMap(\.firstAudioMs)
        return ClementineLatencySummary(
            sampleCount: samples.count,
            latestFirstTextMs: samples.reversed().compactMap(\.firstTextMs).first,
            latestFirstAudioMs: samples.reversed().compactMap(\.firstAudioMs).first,
            latestBargeInAckMs: samples.reversed().compactMap(\.bargeInAckMs).first,
            medianFirstTextMs: Self.percentile(textValues, fraction: 0.50),
            p95FirstTextMs: Self.percentile(textValues, fraction: 0.95),
            medianFirstAudioMs: Self.percentile(audioValues, fraction: 0.50),
            p95FirstAudioMs: Self.percentile(audioValues, fraction: 0.95),
            latestNetworkClass: latest.speechNetworkClass,
            latestSpeechTargetCharacters: latest.speechTargetCharacters
        )
    }

    func beginTurn(
        id: String,
        transport: ClementineLatencyTransport,
        at startedAt: Date = Date()
    ) {
        let cleanID = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanID.isEmpty else { return }
        samples.removeAll { $0.id == cleanID }
        samples.append(
            ClementineLatencySample(
                id: cleanID,
                transport: transport,
                startedAt: startedAt.timeIntervalSince1970,
                firstTextMs: nil,
                firstAudioMs: nil,
                bargeInAckMs: nil,
                speechNetworkClass: nil,
                speechTargetCharacters: nil
            )
        )
        trimAndPersist()
    }

    func recordFirstText(turnID: String, at date: Date = Date()) {
        updateFirstMetric(turnID: turnID, at: date, keyPath: \.firstTextMs)
    }

    func recordFirstAudio(
        turnID: String,
        at date: Date = Date(),
        networkClass: ClementineSpeechNetworkClass? = nil,
        targetCharacters: Int? = nil
    ) {
        guard let index = samples.lastIndex(where: { $0.id == turnID }) else { return }
        if samples[index].firstAudioMs == nil {
            samples[index].firstAudioMs = elapsedMilliseconds(from: samples[index].startedAt, to: date)
        }
        if let networkClass {
            samples[index].speechNetworkClass = networkClass
        }
        if let targetCharacters {
            samples[index].speechTargetCharacters = targetCharacters
        }
        trimAndPersist()
    }

    func recordNetworkProfile(
        turnID: String,
        networkClass: ClementineSpeechNetworkClass,
        targetCharacters: Int? = nil
    ) {
        guard let index = samples.lastIndex(where: { $0.id == turnID }) else { return }
        if samples[index].speechNetworkClass == networkClass,
           targetCharacters == nil || samples[index].speechTargetCharacters == targetCharacters {
            return
        }
        samples[index].speechNetworkClass = networkClass
        if let targetCharacters {
            samples[index].speechTargetCharacters = targetCharacters
        }
        trimAndPersist()
    }

    func beginBargeIn(turnID: String, at date: Date = Date()) {
        guard samples.contains(where: { $0.id == turnID }) else { return }
        bargeInStartedAtByTurnID[turnID] = date
    }

    func recordBargeInAcknowledged(turnID: String, at date: Date = Date()) {
        guard let index = samples.lastIndex(where: { $0.id == turnID }),
              let startedAt = bargeInStartedAtByTurnID.removeValue(forKey: turnID) else { return }
        samples[index].bargeInAckMs = max(0, date.timeIntervalSince(startedAt) * 1_000)
        trimAndPersist()
    }

    func recordBargeInAcknowledged(turnID: String, elapsedMilliseconds: Double) {
        guard let index = samples.lastIndex(where: { $0.id == turnID }) else { return }
        samples[index].bargeInAckMs = max(0, elapsedMilliseconds)
        bargeInStartedAtByTurnID.removeValue(forKey: turnID)
        trimAndPersist()
    }

    func recordFirstText(turnID: String, elapsedMilliseconds: Double) {
        updateFirstMetric(turnID: turnID, elapsedMilliseconds: elapsedMilliseconds, keyPath: \.firstTextMs)
    }

    func recordFirstAudio(turnID: String, elapsedMilliseconds: Double) {
        updateFirstMetric(turnID: turnID, elapsedMilliseconds: elapsedMilliseconds, keyPath: \.firstAudioMs)
    }

    private func updateFirstMetric(
        turnID: String,
        at date: Date,
        keyPath: WritableKeyPath<ClementineLatencySample, Double?>
    ) {
        guard let index = samples.lastIndex(where: { $0.id == turnID }),
              samples[index][keyPath: keyPath] == nil else { return }
        samples[index][keyPath: keyPath] = elapsedMilliseconds(from: samples[index].startedAt, to: date)
        trimAndPersist()
    }

    private func updateFirstMetric(
        turnID: String,
        elapsedMilliseconds: Double,
        keyPath: WritableKeyPath<ClementineLatencySample, Double?>
    ) {
        guard let index = samples.lastIndex(where: { $0.id == turnID }),
              samples[index][keyPath: keyPath] == nil else { return }
        samples[index][keyPath: keyPath] = max(0, elapsedMilliseconds)
        trimAndPersist()
    }

    private func elapsedMilliseconds(from startedAt: TimeInterval, to date: Date) -> Double {
        max(0, (date.timeIntervalSince1970 - startedAt) * 1_000)
    }

    private func trimAndPersist() {
        if samples.count > maxSamples {
            let removedIDs = Set(samples.prefix(samples.count - maxSamples).map(\.id))
            samples = Array(samples.suffix(maxSamples))
            bargeInStartedAtByTurnID = bargeInStartedAtByTurnID.filter { !removedIDs.contains($0.key) }
        }
        guard let data = try? JSONEncoder().encode(samples) else { return }
        defaults.set(data, forKey: storageKey)
    }

    private static func percentile(_ values: [Double], fraction: Double) -> Double? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        let clamped = min(max(fraction, 0), 1)
        let position = clamped * Double(sorted.count - 1)
        let lower = Int(position.rounded(.down))
        let upper = Int(position.rounded(.up))
        guard lower != upper else { return sorted[lower] }
        let weight = position - Double(lower)
        return sorted[lower] + ((sorted[upper] - sorted[lower]) * weight)
    }
}
