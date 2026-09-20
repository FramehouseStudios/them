import Foundation
import Security

/// D010 — Companion spoken-voice provider preference.
/// `default` keeps the existing server companion TTS path (OpenAI / platform ElevenLabs).
/// `elevenlabs` enables BYOK: user Keychain `xi-api-key` + selected `voice_id`.
enum CompanionTtsProvider: String, CaseIterable, Identifiable, Sendable {
    case `default` = "default"
    case elevenlabs = "elevenlabs"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .default: return "THEM default"
        case .elevenlabs: return "ElevenLabs (your key)"
        }
    }
}

enum CompanionTtsProviderSettings {
    static let providerStorageKey = "companion_tts_provider"
    static let voiceIdStorageKey = "companion_tts_elevenlabs_voice_id"
    static let voiceNameStorageKey = "companion_tts_elevenlabs_voice_name"

    static func provider() -> CompanionTtsProvider {
        let raw = UserDefaults.standard.string(forKey: providerStorageKey) ?? ""
        return CompanionTtsProvider(rawValue: raw) ?? .default
    }

    static func setProvider(_ provider: CompanionTtsProvider) {
        UserDefaults.standard.set(provider.rawValue, forKey: providerStorageKey)
    }

    static func selectedVoiceId() -> String {
        (UserDefaults.standard.string(forKey: voiceIdStorageKey) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func setSelectedVoiceId(_ voiceId: String) {
        let clean = voiceId.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty {
            UserDefaults.standard.removeObject(forKey: voiceIdStorageKey)
        } else {
            UserDefaults.standard.set(clean, forKey: voiceIdStorageKey)
        }
    }

    static func selectedVoiceName() -> String {
        (UserDefaults.standard.string(forKey: voiceNameStorageKey) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func setSelectedVoiceName(_ name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty {
            UserDefaults.standard.removeObject(forKey: voiceNameStorageKey)
        } else {
            UserDefaults.standard.set(clean, forKey: voiceNameStorageKey)
        }
    }

    /// Request-scoped talk headers for BYOK. Empty when provider is default or key missing.
    static func talkByokHeaders() -> [String: String] {
        guard provider() == .elevenlabs else { return [:] }
        guard let apiKey = ElevenLabsByokKeychain.loadApiKey() else { return [:] }
        let voiceId = selectedVoiceId()
        var headers: [String: String] = [
            "X-Tts-Provider": "elevenlabs_byok",
            "X-ElevenLabs-Api-Key": apiKey,
        ]
        if !voiceId.isEmpty {
            headers["X-ElevenLabs-Voice-Id"] = voiceId
        }
        return headers
    }
}

/// Keychain custody for the user's ElevenLabs API key. Never AppStorage / UserDefaults / DB.
enum ElevenLabsByokKeychain {
    static let service = "io.them.companion.elevenlabs.byok"
    static let account = "xi-api-key"

    private static let store = BackendKeychainTokenStore(service: service)

    static func loadApiKey() -> String? {
        store.read(account: account)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
    }

    @discardableResult
    static func saveApiKey(_ key: String) -> Bool {
        let clean = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            return deleteApiKey()
        }
        return store.write(clean, account: account)
    }

    @discardableResult
    static func deleteApiKey() -> Bool {
        store.delete(account: account)
    }

    static func hasApiKey() -> Bool {
        loadApiKey() != nil
    }
}

private extension String {
    var nilIfEmpty: String? {
        let clean = trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }
}
