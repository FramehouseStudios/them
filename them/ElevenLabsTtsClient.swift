import Foundation

/// D010 — ElevenLabs BYOK client (list voices, stream speak, abort).
/// No live network in unit tests: inject `dataForRequest`.
protocol CompanionTtsProviding: AnyObject {
    func listVoices(apiKey: String) async throws -> [ElevenLabsTtsClient.Voice]
    func speak(
        text: String,
        voiceId: String,
        apiKey: String,
        modelId: String
    ) async throws -> Data
    func abort()
}

final class ElevenLabsTtsClient: CompanionTtsProviding, @unchecked Sendable {
    struct Voice: Equatable, Identifiable, Sendable {
        let voiceId: String
        let name: String
        let category: String
        let previewUrl: String?

        var id: String { voiceId }
    }

    struct Dependencies: Sendable {
        var dataForRequest: @Sendable (URLRequest) async throws -> (Data, URLResponse)
    }

    enum ClientError: LocalizedError, Equatable {
        case missingApiKey
        case missingVoiceId
        case emptyText
        case http(Int, String)
        case invalidJSON
        case aborted

        var errorDescription: String? {
            switch self {
            case .missingApiKey: return "ElevenLabs API key is missing."
            case .missingVoiceId: return "ElevenLabs voice id is missing."
            case .emptyText: return "Nothing to speak."
            case .http(let code, _): return "ElevenLabs request failed (\(code))."
            case .invalidJSON: return "ElevenLabs returned invalid JSON."
            case .aborted: return "ElevenLabs request was cancelled."
            }
        }
    }

    static let defaultModelId = "eleven_flash_v2_5"
    static let voicesURL = URL(string: "https://api.elevenlabs.io/v1/voices")!

    private let dependencies: Dependencies
    private let stateLock = NSLock()
    private var activeTask: Task<Void, Never>?
    private var aborted = false

    init(dependencies: Dependencies) {
        self.dependencies = dependencies
    }

    convenience init(session: URLSession = .shared) {
        self.init(
            dependencies: Dependencies(
                dataForRequest: { request in
                    try await session.data(for: request)
                }
            )
        )
    }

    /// Build GET /v1/voices — used by tests to assert encoding / no key in URL.
    static func makeListVoicesRequest(apiKey: String) throws -> URLRequest {
        let cleanKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanKey.isEmpty else { throw ClientError.missingApiKey }
        var request = URLRequest(url: voicesURL)
        request.httpMethod = "GET"
        request.setValue(cleanKey, forHTTPHeaderField: "xi-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 30
        return request
    }

    /// Build POST /v1/text-to-speech/{voice_id}/stream
    static func makeSpeakRequest(
        text: String,
        voiceId: String,
        apiKey: String,
        modelId: String = defaultModelId
    ) throws -> URLRequest {
        let cleanKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVoice = voiceId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanText = text
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanKey.isEmpty else { throw ClientError.missingApiKey }
        guard !cleanVoice.isEmpty else { throw ClientError.missingVoiceId }
        guard !cleanText.isEmpty else { throw ClientError.emptyText }

        let encodedVoice = cleanVoice.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? cleanVoice
        guard let url = URL(
            string: "https://api.elevenlabs.io/v1/text-to-speech/\(encodedVoice)/stream?output_format=mp3_44100_128"
        ) else {
            throw ClientError.missingVoiceId
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(cleanKey, forHTTPHeaderField: "xi-api-key")
        request.setValue("audio/mpeg", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 45
        let resolvedModel = modelId.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: [String: Any] = [
            "text": cleanText,
            "model_id": resolvedModel.isEmpty ? defaultModelId : resolvedModel,
            "voice_settings": [
                "stability": 0.45,
                "similarity_boost": 0.80,
                "style": 0.22,
                "use_speaker_boost": true,
            ],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        return request
    }

    /// Safe for logs: never include xi-api-key value.
    static func redactedRequestDescription(_ request: URLRequest) -> String {
        let method = request.httpMethod ?? "?"
        let url = request.url?.absoluteString ?? "?"
        let hasKey = (request.value(forHTTPHeaderField: "xi-api-key") ?? "").isEmpty == false
        return "\(method) \(url) xi-api-key=\(hasKey ? "[redacted]" : "missing")"
    }

    static func redactSecrets(_ value: String) -> String {
        var text = value
        // Each pattern carries its own replacement so an `sk_…` token is not
        // rewritten as an `xi-api-key=` line. `sk_` tokens contain underscores
        // (`sk_live_…`), so the class must allow them.
        let patterns: [(pattern: String, template: String)] = [
            (#"xi-api-key["'\s:=]+[A-Za-z0-9_\-]{8,}"#, "xi-api-key=[redacted]"),
            (#"sk_[A-Za-z0-9_\-]{12,}"#, "[redacted]"),
            (#"(api[_-]?key["'\s:=]+)([A-Za-z0-9_\-]{20,})"#, "$1[redacted]"),
        ]
        for entry in patterns {
            if let regex = try? NSRegularExpression(pattern: entry.pattern, options: [.caseInsensitive]) {
                text = regex.stringByReplacingMatches(
                    in: text,
                    options: [],
                    range: NSRange(text.startIndex..<text.endIndex, in: text),
                    withTemplate: entry.template
                )
            }
        }
        return text
    }

    func listVoices(apiKey: String) async throws -> [Voice] {
        let request = try Self.makeListVoicesRequest(apiKey: apiKey)
        let (data, response) = try await perform(request)
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.http(502, "Invalid response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw ClientError.http(http.statusCode, Self.redactSecrets(raw))
        }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let voices = json["voices"] as? [[String: Any]] else {
            throw ClientError.invalidJSON
        }
        return voices.compactMap { row in
            let id = (row["voice_id"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty else { return nil }
            return Voice(
                voiceId: id,
                name: (row["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                category: (row["category"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                previewUrl: (row["preview_url"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }
    }

    func speak(
        text: String,
        voiceId: String,
        apiKey: String,
        modelId: String = defaultModelId
    ) async throws -> Data {
        let request = try Self.makeSpeakRequest(
            text: text,
            voiceId: voiceId,
            apiKey: apiKey,
            modelId: modelId
        )
        let (data, response) = try await perform(request)
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.http(502, "Invalid response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw ClientError.http(http.statusCode, Self.redactSecrets(raw))
        }
        return data
    }

    func abort() {
        stateLock.lock()
        aborted = true
        let task = activeTask
        activeTask = nil
        stateLock.unlock()
        task?.cancel()
    }

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        stateLock.lock()
        aborted = false
        stateLock.unlock()
        do {
            try Task.checkCancellation()
            stateLock.lock()
            if aborted {
                stateLock.unlock()
                throw ClientError.aborted
            }
            stateLock.unlock()
            let result = try await dependencies.dataForRequest(request)
            stateLock.lock()
            let wasAborted = aborted
            stateLock.unlock()
            if wasAborted || Task.isCancelled {
                throw ClientError.aborted
            }
            return result
        } catch is CancellationError {
            throw ClientError.aborted
        } catch let urlError as URLError where urlError.code == .cancelled {
            throw ClientError.aborted
        } catch let error as ClientError {
            throw error
        } catch {
            throw error
        }
    }
}
