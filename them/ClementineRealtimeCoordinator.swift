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

    enum CodingKeys: String, CodingKey {
        case model
        case voice
        case instructions
        case type
        case outputModalities = "output_modalities"
    }
}

struct BackendRealtimeBootstrap: Decodable, Equatable {
    let transport: String
    let assistantName: String
    let model: String
    let voice: String
    let session: BackendRealtimeSessionDescriptor
    let clientSecret: BackendRealtimeClientSecret
    let issuedAt: TimeInterval

    enum CodingKeys: String, CodingKey {
        case transport
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

    var statusText: String {
        switch status {
        case .idle:
            return "Realtime preview armed"
        case .preparing:
            return "Preparing Realtime session…"
        case let .ready(bootstrap):
            let voice = bootstrap.voice.trimmingCharacters(in: .whitespacesAndNewlines)
            return voice.isEmpty ? "Realtime session ready" : "Realtime session ready · \(voice)"
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
        cachedBootstrap = nil
        cachedBootstrapSignature = ""
        status = .idle
    }

    func prepareIfNeeded(
        backend: BackendClient,
        systemPrompt: String?,
        userName: String?,
        isScreenplayMode: Bool
    ) async {
        let signature = bootstrapSignature(
            systemPrompt: systemPrompt,
            userName: userName,
            isScreenplayMode: isScreenplayMode
        )

        if let cachedBootstrap,
           !cachedBootstrap.isExpiringSoon,
           cachedBootstrapSignature == signature {
            status = .ready(cachedBootstrap)
            return
        }

        status = .preparing
        do {
            let bootstrap = try await backend.fetchRealtimeClientSecret(
                systemPrompt: systemPrompt,
                userName: userName,
                isScreenplayMode: isScreenplayMode
            )
            cachedBootstrap = bootstrap
            cachedBootstrapSignature = signature
            status = .ready(bootstrap)
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    private func bootstrapSignature(
        systemPrompt: String?,
        userName: String?,
        isScreenplayMode: Bool
    ) -> String {
        let cleanPrompt = systemPrompt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanUser = userName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return "\(isScreenplayMode)|\(cleanUser)|\(cleanPrompt)"
    }
}
