import Foundation
import SwiftUI
import Combine

enum ClementineVoiceTransportMode: String, CaseIterable, Identifiable {
    case turnBased = "turn_based"
    case realtimePreview = "realtime_preview"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .turnBased:
            return "Standard"
        case .realtimePreview:
            return "Realtime Preview"
        }
    }

    var subtitle: String {
        switch self {
        case .turnBased:
            return "Current upload-and-reply pipeline. Most stable today."
        case .realtimePreview:
            return "Uses a live OpenAI Realtime WebRTC session on the home screen and in Studio voice mode. Typed Studio prompts still use the standard pipeline."
        }
    }
}

enum ClementineRealtimeSupplierMode: String, CaseIterable, Identifiable {
    case serverDefault = "server_default"
    case openAI = "openai"
    case stub = "stub"

    static let storageKey = "clementine_realtime_supplier_mode"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .serverDefault:
            return "Server Default"
        case .openAI:
            return "OpenAI"
        case .stub:
            return "Stub"
        }
    }

    var subtitle: String {
        switch self {
        case .serverDefault:
            return "Use the backend configured realtime supplier."
        case .openAI:
            return "Force OpenAI Realtime for the next live voice session."
        case .stub:
            return "Use the deterministic stub path for smoke tests and demos."
        }
    }

    var providerParameter: String {
        switch self {
        case .serverDefault:
            return ""
        case .openAI:
            return "openai"
        case .stub:
            return "stub"
        }
    }

    static func normalized(rawValue: String) -> ClementineRealtimeSupplierMode {
        ClementineRealtimeSupplierMode(rawValue: rawValue) ?? .serverDefault
    }

    static func storedProviderParameter(defaults: UserDefaults = .standard) -> String {
        let rawValue = defaults.string(forKey: storageKey) ?? serverDefault.rawValue
        return normalized(rawValue: rawValue).providerParameter
    }
}

struct BackendRealtimeClientSecret: Decodable, Equatable {
    let value: String
    let expiresAt: TimeInterval
    let sessionExpiresAt: TimeInterval?

    enum CodingKeys: String, CodingKey {
        case value
        case expiresAt = "expires_at"
        case sessionExpiresAt = "session_expires_at"
    }
}

struct BackendRealtimeSessionDescriptor: Decodable, Equatable {
    let model: String
    let voice: String
    let instructions: String
    let type: String
    let outputModalities: [String]
    let inputTranscriptionModel: String?

    enum CodingKeys: String, CodingKey {
        case model
        case voice
        case instructions
        case type
        case outputModalities = "output_modalities"
        case inputTranscriptionModel = "input_transcription_model"
    }
}

struct BackendRealtimeBootstrap: Decodable, Equatable {
    let transport: String
    let realtimeProvider: String?
    let fallback: Bool?
    let fallbackReason: String?
    let primarySupplier: String?
    let assistantName: String
    let model: String
    let voice: String
    let session: BackendRealtimeSessionDescriptor
    let clientSecret: BackendRealtimeClientSecret
    let issuedAt: TimeInterval

    enum CodingKeys: String, CodingKey {
        case transport
        case realtimeProvider = "realtime_provider"
        case fallback
        case fallbackReason = "fallback_reason"
        case primarySupplier = "primary_supplier"
        case assistantName = "assistant_name"
        case model
        case voice
        case session
        case clientSecret = "client_secret"
        case issuedAt = "issued_at"
    }

    var expiresAtDate: Date {
        Date(timeIntervalSince1970: clientSecret.expiresAt)
    }

    var isExpiringSoon: Bool {
        expiresAtDate.timeIntervalSinceNow <= 20
    }

    var fallbackSummary: String {
        guard fallback == true else { return "" }
        let used = realtimeProvider?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let primary = primarySupplier?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let reason = fallbackReason?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        var parts: [String] = []
        if !primary.isEmpty { parts.append("from \(primary)") }
        if !used.isEmpty { parts.append("to \(used)") }
        if !reason.isEmpty { parts.append(reason) }
        return parts.isEmpty ? "Fallback active" : "Fallback \(parts.joined(separator: " · "))"
    }
}

@MainActor
final class ClementineRealtimeCoordinator: ObservableObject {
    enum Status: Equatable {
        case idle
        case preparing
        case ready(BackendRealtimeBootstrap)
        case failed(String)
    }

    @Published private(set) var status: Status = .idle

    private var cachedBootstrap: BackendRealtimeBootstrap?
    private var cachedBootstrapSignature: String = ""
    private var preparationGeneration = 0

    var statusText: String {
        switch status {
        case .idle:
            return "Realtime preview armed"
        case .preparing:
            return "Preparing Realtime session…"
        case let .ready(bootstrap):
            let provider = bootstrap.realtimeProvider?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let voice = bootstrap.voice.trimmingCharacters(in: .whitespacesAndNewlines)
            let details = [provider, bootstrap.fallbackSummary, voice].filter { !$0.isEmpty }
            return details.isEmpty ? "Realtime session ready" : "Realtime session ready · \(details.joined(separator: " · "))"
        case let .failed(message):
            return message.isEmpty ? "Realtime session unavailable" : "Realtime unavailable · \(message)"
        }
    }

    var shortLabel: String {
        switch status {
        case .idle:
            return "Realtime"
        case .preparing:
            return "Realtime…"
        case .ready:
            return "Realtime Ready"
        case .failed:
            return "Realtime Offline"
        }
    }

    var latestBootstrap: BackendRealtimeBootstrap? {
        if case let .ready(bootstrap) = status {
            return bootstrap
        }
        return cachedBootstrap
    }

    func clear() {
        preparationGeneration += 1
        cachedBootstrap = nil
        cachedBootstrapSignature = ""
        status = .idle
    }

    @discardableResult
    func prepareIfNeeded(
        backend: BackendClient,
        systemPrompt: String?,
        userName: String?,
        isScreenplayMode: Bool,
        screenplayProjectId: String? = nil,
        screenplayProjectTitle: String? = nil,
        emotionLane: String? = nil,
        supplierMode: ClementineRealtimeSupplierMode = .serverDefault,
        forceRefresh: Bool = false
    ) async -> BackendRealtimeBootstrap? {
        preparationGeneration += 1
        let generation = preparationGeneration
        let signature = bootstrapSignature(
            systemPrompt: systemPrompt,
            userName: userName,
            isScreenplayMode: isScreenplayMode,
            screenplayProjectId: screenplayProjectId,
            screenplayProjectTitle: screenplayProjectTitle,
            emotionLane: emotionLane,
            supplierMode: supplierMode
        )

        if !forceRefresh,
           let cachedBootstrap,
           !cachedBootstrap.isExpiringSoon,
           cachedBootstrapSignature == signature {
            status = .ready(cachedBootstrap)
            return cachedBootstrap
        }

        if forceRefresh {
            cachedBootstrap = nil
            cachedBootstrapSignature = ""
        }

        status = .preparing
        do {
            let bootstrap = try await backend.fetchRealtimeClientSecret(
                systemPrompt: systemPrompt,
                userName: userName,
                isScreenplayMode: isScreenplayMode,
                screenplayProjectId: screenplayProjectId,
                screenplayProjectTitle: screenplayProjectTitle,
                emotionLane: emotionLane,
                realtimeProvider: supplierMode.providerParameter
            )
            guard generation == preparationGeneration else { return nil }
            cachedBootstrap = bootstrap
            cachedBootstrapSignature = signature
            status = .ready(bootstrap)
            return bootstrap
        } catch {
            guard generation == preparationGeneration else { return nil }
            status = .failed(error.localizedDescription)
            return nil
        }
    }

    private func bootstrapSignature(
        systemPrompt: String?,
        userName: String?,
        isScreenplayMode: Bool,
        screenplayProjectId: String?,
        screenplayProjectTitle: String?,
        emotionLane: String?,
        supplierMode: ClementineRealtimeSupplierMode
    ) -> String {
        let cleanPrompt = systemPrompt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanUser = userName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanProjectId = screenplayProjectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanProjectTitle = screenplayProjectTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanEmotionLane = emotionLane?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return "\(isScreenplayMode)|\(supplierMode.rawValue)|\(cleanProjectId)|\(cleanProjectTitle)|\(cleanEmotionLane)|\(cleanUser)|\(cleanPrompt)"
    }
}
