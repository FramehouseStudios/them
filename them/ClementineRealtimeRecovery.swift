import Foundation

enum ClementineRealtimeFaultStage: String, CaseIterable, Equatable {
    case speech
    case transcription
    case thinking
    case playback
}

enum ClementineRealtimeRecoveryOutcome: String, Equatable {
    case repairedResponse = "repaired_response"
    case standardVoiceFallback = "standard_voice_fallback"
}

struct ClementineRealtimeRecoveryOutcomeGate: Equatable {
    private(set) var turnKey = ""
    private(set) var outcome: ClementineRealtimeRecoveryOutcome?
    private(set) var acceptedCount = 0
    private(set) var suppressedCount = 0

    var isResolved: Bool { outcome != nil }

    mutating func begin(turnID: String, transcript: String = "") {
        let cleanTurnID = turnID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTranscript = transcript
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let nextKey = cleanTurnID.isEmpty ? cleanTranscript : cleanTurnID
        guard !nextKey.isEmpty else { return }
        guard turnKey != nextKey else { return }
        turnKey = nextKey
        outcome = nil
        acceptedCount = 0
        suppressedCount = 0
    }

    @discardableResult
    mutating func accept(_ candidate: ClementineRealtimeRecoveryOutcome) -> Bool {
        guard outcome == nil else {
            suppressedCount += 1
            return false
        }
        outcome = candidate
        acceptedCount = 1
        return true
    }

    mutating func reset() {
        turnKey = ""
        outcome = nil
        acceptedCount = 0
        suppressedCount = 0
    }
}

struct ClementineRealtimeConnectionLoss: Equatable {
    enum Cause: String, Equatable {
        case peerConnectionFailed = "peer_connection_failed"
        case peerConnectionDisconnected = "peer_connection_disconnected"
        case dataChannelClosed = "data_channel_closed"
        case dataChannelError = "data_channel_error"
        case negotiationFailed = "negotiation_failed"
        case microphonePermissionDenied = "microphone_permission_denied"
        case providerError = "provider_error"
        case invalidConfiguration = "invalid_configuration"
        case bridgeNavigationFailed = "bridge_navigation_failed"
        case javascriptEvaluationFailed = "javascript_evaluation_failed"
        case connectionTimeout = "connection_timeout"
        case unknown
    }

    let cause: Cause
    let message: String
    let connectionGeneration: Int
    let turnID: String
    let userTranscript: String
    let transcriptIsFinal: Bool
    let userSpeechActive: Bool
    let assistantResponseActive: Bool
    let assistantSpeaking: Bool
    let recoverable: Bool
    let credentialRefreshRecommended: Bool

    var hasRepairableTurn: Bool {
        transcriptIsFinal && !userTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var faultStage: ClementineRealtimeFaultStage {
        if userSpeechActive { return .speech }
        if assistantSpeaking { return .playback }
        if assistantResponseActive || transcriptIsFinal { return .thinking }
        return .transcription
    }

    var requiresStandardVoiceFallback: Bool {
        faultStage == .speech || faultStage == .transcription
    }

    static func parse(_ payload: [String: Any]) -> ClementineRealtimeConnectionLoss {
        let rawCause = stringValue(payload["cause"]).lowercased()
        return ClementineRealtimeConnectionLoss(
            cause: Cause(rawValue: rawCause) ?? .unknown,
            message: stringValue(payload["message"]),
            connectionGeneration: intValue(payload["connectionGeneration"]),
            turnID: stringValue(payload["turnID"]),
            userTranscript: stringValue(payload["userTranscript"]),
            transcriptIsFinal: boolValue(payload["transcriptIsFinal"]),
            userSpeechActive: boolValue(payload["userSpeechActive"]),
            assistantResponseActive: boolValue(payload["assistantResponseActive"]),
            assistantSpeaking: boolValue(payload["assistantSpeaking"]),
            recoverable: boolValue(payload["recoverable"], defaultValue: true),
            credentialRefreshRecommended: boolValue(
                payload["credentialRefreshRecommended"],
                defaultValue: true
            )
        )
    }

    static func local(
        cause: Cause,
        message: String,
        recoverable: Bool = true,
        credentialRefreshRecommended: Bool = true
    ) -> ClementineRealtimeConnectionLoss {
        ClementineRealtimeConnectionLoss(
            cause: cause,
            message: message.trimmingCharacters(in: .whitespacesAndNewlines),
            connectionGeneration: 0,
            turnID: "",
            userTranscript: "",
            transcriptIsFinal: false,
            userSpeechActive: false,
            assistantResponseActive: false,
            assistantSpeaking: false,
            recoverable: recoverable,
            credentialRefreshRecommended: credentialRefreshRecommended
        )
    }

    static func simulatedFault(
        stage: ClementineRealtimeFaultStage,
        turnID: String = "network-fault-smoke-turn",
        transcript: String = "Move Mara into Act Two before Eli reaches the ferry."
    ) -> ClementineRealtimeConnectionLoss {
        let finalTranscript = stage == .thinking || stage == .playback
        return ClementineRealtimeConnectionLoss(
            cause: .peerConnectionDisconnected,
            message: "Simulated disconnect during \(stage.rawValue).",
            connectionGeneration: 1,
            turnID: turnID,
            userTranscript: transcript,
            transcriptIsFinal: finalTranscript,
            userSpeechActive: stage == .speech,
            assistantResponseActive: stage == .thinking || stage == .playback,
            assistantSpeaking: stage == .playback,
            recoverable: true,
            credentialRefreshRecommended: true
        )
    }

    private static func stringValue(_ value: Any?) -> String {
        guard let value, !(value is NSNull) else { return "" }
        return String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func intValue(_ value: Any?) -> Int {
        if let number = value as? NSNumber { return number.intValue }
        return Int(stringValue(value)) ?? 0
    }

    private static func boolValue(_ value: Any?, defaultValue: Bool = false) -> Bool {
        if let number = value as? NSNumber { return number.boolValue }
        switch stringValue(value).lowercased() {
        case "true", "1", "yes":
            return true
        case "false", "0", "no":
            return false
        default:
            return defaultValue
        }
    }
}

struct ClementineRealtimeRecoveryPolicy {
    static let maximumReconnectAttempts = 3
    static let connectionTimeoutNanoseconds: UInt64 = 8_000_000_000

    private static let backoffNanoseconds: [UInt64] = [
        350_000_000,
        900_000_000,
        1_800_000_000,
    ]

    static func delayNanoseconds(forAttempt attempt: Int) -> UInt64? {
        guard attempt > 0, attempt <= maximumReconnectAttempts else { return nil }
        return backoffNanoseconds[attempt - 1]
    }

    static func shouldReconnect(after loss: ClementineRealtimeConnectionLoss, attempt: Int) -> Bool {
        loss.recoverable && delayNanoseconds(forAttempt: attempt) != nil
    }
}
