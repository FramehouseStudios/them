import Foundation

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
    let recoverable: Bool
    let credentialRefreshRecommended: Bool

    var hasRepairableTurn: Bool {
        transcriptIsFinal && !userTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
            recoverable: recoverable,
            credentialRefreshRecommended: credentialRefreshRecommended
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
