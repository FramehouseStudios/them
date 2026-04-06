import Foundation

struct TalkResult {
    let audioURL: URL
    let audioDuration: TimeInterval
    let transcript: String
    let reply: String
    let turnId: String?
}

struct RealtimeBootstrap {
    let clientSecret: String
    let expiresAt: Date
    let model: String
    let voice: String
    let instructions: String
}

struct StudioRenderStreamEvent {
    enum Kind: String {
        case meta, trace, delta, done, error
    }

    let kind: Kind
    let delta: String?
    let reply: String?
    let error: String?
    let firstDeltaMs: Int?
    let totalMs: Int?
}

final class BackendClient: Sendable {
    let baseURL: String
    let appToken: String

    init(baseURL: String = "http://localhost:3001", appToken: String = "them-dev") {
        self.baseURL = baseURL
        self.appToken = appToken
    }

    // MARK: - Talk (turn-based voice)

    func talk(
        audioData: Data,
        systemPrompt: String,
        recentTurns: [(role: String, text: String)] = []
    ) async throws -> TalkResult {
        let boundary = UUID().uuidString
        let url = URL(string: "\(baseURL)/talk")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(appToken, forHTTPHeaderField: "X-APP-TOKEN")
        request.timeoutInterval = 60

        var body = Data()
        func appendField(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        // Audio file part
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)

        appendField("system_prompt", systemPrompt)

        if !recentTurns.isEmpty {
            let turnsJSON = recentTurns.map { ["role": $0.role, "content": $0.text] }
            if let data = try? JSONSerialization.data(withJSONObject: turnsJSON) {
                appendField("recent_turns", String(data: data, encoding: .utf8) ?? "[]")
            }
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let errorStage = httpResponse.value(forHTTPHeaderField: "x-error-stage") ?? "unknown"
            throw BackendError.serverError(status: httpResponse.statusCode, stage: errorStage)
        }

        // Parse response headers
        let transcript = httpResponse.value(forHTTPHeaderField: "x-transcript")?
            .removingPercentEncoding ?? ""
        let reply = httpResponse.value(forHTTPHeaderField: "x-reply")?
            .removingPercentEncoding ?? ""
        let turnId = httpResponse.value(forHTTPHeaderField: "x-turn-id")

        // Write audio to temp file
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp3")
        try data.write(to: tempURL)

        // Get audio duration
        let duration = await audioDuration(for: tempURL)

        return TalkResult(
            audioURL: tempURL,
            audioDuration: duration,
            transcript: transcript,
            reply: reply,
            turnId: turnId
        )
    }

    // MARK: - Text-only talk (for testing without audio)

    func talkText(
        transcript: String,
        systemPrompt: String
    ) async throws -> TalkResult {
        let url = URL(string: "\(baseURL)/talk")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(appToken, forHTTPHeaderField: "X-APP-TOKEN")
        request.timeoutInterval = 60

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        func appendField(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        appendField("client_transcript", transcript)
        appendField("system_prompt", systemPrompt)

        // Send minimal silent audio to satisfy the endpoint
        let silentWAV = minimalSilentWAV()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(silentWAV)
        body.append("\r\n".data(using: .utf8)!)

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw BackendError.invalidResponse
        }

        let replyText = httpResponse.value(forHTTPHeaderField: "x-reply")?
            .removingPercentEncoding ?? ""

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp3")
        try data.write(to: tempURL)

        let duration = await audioDuration(for: tempURL)

        return TalkResult(
            audioURL: tempURL,
            audioDuration: duration,
            transcript: transcript,
            reply: replyText,
            turnId: nil
        )
    }

    // MARK: - Streaming Studio Text

    func streamStudioText(
        transcript: String,
        systemPrompt: String,
        onDelta: @escaping @Sendable (String) -> Void,
        onComplete: @escaping @Sendable (String) -> Void
    ) async throws {
        let url = URL(string: "\(baseURL)/realtime/studio_render_stream")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(appToken, forHTTPHeaderField: "X-APP-TOKEN")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 120

        let payload: [String: Any] = [
            "transcript": transcript,
            "system_prompt": systemPrompt
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (bytes, response) = try await URLSession.shared.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw BackendError.invalidResponse
        }

        var accumulated = ""

        for try await line in bytes.lines {
            guard line.hasPrefix("data: ") else { continue }
            let jsonString = String(line.dropFirst(6))
            guard let data = jsonString.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                continue
            }

            let kind = json["kind"] as? String ?? ""

            switch kind {
            case "delta":
                if let delta = json["delta"] as? String {
                    accumulated += delta
                    onDelta(delta)
                }
            case "done":
                let final = json["reply"] as? String ?? accumulated
                onComplete(final)
                return
            case "error":
                let errorMsg = json["error"] as? String ?? "Unknown streaming error"
                throw BackendError.streamError(errorMsg)
            default:
                break
            }
        }

        onComplete(accumulated)
    }

    // MARK: - Realtime Bootstrap

    func fetchRealtimeBootstrap(
        systemPrompt: String,
        userName: String = ""
    ) async throws -> RealtimeBootstrap {
        let url = URL(string: "\(baseURL)/realtime/client_secret")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(appToken, forHTTPHeaderField: "X-APP-TOKEN")

        let payload: [String: Any] = [
            "system_prompt": systemPrompt,
            "user_name": userName
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw BackendError.invalidResponse
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let clientSecret = json["client_secret"] as? String,
              let expiresAtStr = json["expires_at"] as? String else {
            throw BackendError.parseError
        }

        let formatter = ISO8601DateFormatter()
        let expiresAt = formatter.date(from: expiresAtStr) ?? Date().addingTimeInterval(60)

        let model = json["model"] as? String ?? "gpt-realtime-1.5"
        let voice = json["voice"] as? String ?? "marin"
        let instructions = json["instructions"] as? String ?? systemPrompt

        return RealtimeBootstrap(
            clientSecret: clientSecret,
            expiresAt: expiresAt,
            model: model,
            voice: voice,
            instructions: instructions
        )
    }

    // MARK: - Helpers

    private func audioDuration(for url: URL) async -> TimeInterval {
        do {
            let player = try AVFoundation.AVAudioPlayer(contentsOf: url)
            return player.duration
        } catch {
            return 3.0 // fallback estimate
        }
    }

    private func minimalSilentWAV() -> Data {
        // 44-byte WAV header + 1600 bytes of silence (0.1s at 16kHz mono 16-bit)
        let sampleRate: UInt32 = 16000
        let numSamples: UInt32 = 1600
        let dataSize: UInt32 = numSamples * 2
        let fileSize: UInt32 = 36 + dataSize

        var data = Data()
        data.append(contentsOf: "RIFF".utf8)
        data.append(withUnsafeBytes(of: fileSize.littleEndian) { Data($0) })
        data.append(contentsOf: "WAVE".utf8)
        data.append(contentsOf: "fmt ".utf8)
        data.append(withUnsafeBytes(of: UInt32(16).littleEndian) { Data($0) })
        data.append(withUnsafeBytes(of: UInt16(1).littleEndian) { Data($0) })  // PCM
        data.append(withUnsafeBytes(of: UInt16(1).littleEndian) { Data($0) })  // mono
        data.append(withUnsafeBytes(of: sampleRate.littleEndian) { Data($0) })
        data.append(withUnsafeBytes(of: (sampleRate * 2).littleEndian) { Data($0) })
        data.append(withUnsafeBytes(of: UInt16(2).littleEndian) { Data($0) })  // block align
        data.append(withUnsafeBytes(of: UInt16(16).littleEndian) { Data($0) }) // bits per sample
        data.append(contentsOf: "data".utf8)
        data.append(withUnsafeBytes(of: dataSize.littleEndian) { Data($0) })
        data.append(Data(count: Int(dataSize)))

        return data
    }
}

import AVFoundation

enum BackendError: LocalizedError {
    case invalidResponse
    case serverError(status: Int, stage: String)
    case parseError
    case streamError(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid server response"
        case .serverError(let status, let stage): return "Server error \(status) at \(stage)"
        case .parseError: return "Failed to parse response"
        case .streamError(let msg): return "Stream error: \(msg)"
        }
    }
}
