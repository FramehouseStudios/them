import Foundation
import Network

/// Test-only loopback HTTP fixture. Exercises the real delegate/URLSession
/// transport, which does not use BackendClient's injected URLProtocol session.
nonisolated final class TalkAuthHTTPFixture: @unchecked Sendable {
    enum Mode { case providerAuth, providerQuota, expiredClient, legacyClient, interruptedReply }
    private let listener: NWListener
    private let queue = DispatchQueue(label: "them.tests.talk-auth-http")
    private let lock = NSLock()
    private let mode: Mode
    private var recordedPaths: [String] = []
    private var connections: [NWConnection] = []
    var paths: [String] { lock.withLock { recordedPaths } }

    init(mode: Mode) throws {
        self.mode = mode
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
    }

    func start() async throws -> URL {
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            self.lock.withLock { self.connections.append(connection) }
            connection.start(queue: self.queue)
            self.receive(connection, buffer: Data())
        }
        return try await withCheckedThrowingContinuation { continuation in
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready:
                    self.listener.stateUpdateHandler = nil
                    guard let port = self.listener.port,
                          let url = URL(string: "http://127.0.0.1:\(port.rawValue)") else {
                        continuation.resume(throwing: URLError(.badURL)); return
                    }
                    continuation.resume(returning: url)
                case .failed(let error):
                    self.listener.stateUpdateHandler = nil
                    continuation.resume(throwing: error)
                default: break
                }
            }
            listener.start(queue: queue)
        }
    }

    func stop() {
        listener.cancel()
        lock.withLock { connections.forEach { $0.cancel() }; connections.removeAll() }
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            var bytes = buffer
            if let data { bytes.append(data) }
            guard bytes.count <= 3_000_000 else { connection.cancel(); return }
            if let separator = bytes.range(of: Data("\r\n\r\n".utf8)),
               let header = String(data: bytes[..<separator.lowerBound], encoding: .utf8) {
                let contentLength = header.components(separatedBy: "\r\n")
                    .first { $0.lowercased().hasPrefix("content-length:") }
                    .flatMap { Int($0.split(separator: ":", maxSplits: 1).last?.trimmingCharacters(in: .whitespaces) ?? "") } ?? 0
                if bytes.count >= separator.upperBound + contentLength {
                    let path = header.components(separatedBy: "\r\n").first?.split(separator: " ").dropFirst().first.map(String.init) ?? ""
                    let talkCount = self.lock.withLock { () -> Int in
                        self.recordedPaths.append(path)
                        return self.recordedPaths.filter { $0 == "/talk" }.count
                    }
                    let response: (Int, String)
                    if path == "/talk", self.mode == .interruptedReply {
                        // Accept the complete multipart request, then lose the
                        // response mid-body. Use the actual URLSession delegate,
                        // not a mocked classification that proves itself.
                        let partial = Data("HTTP/1.1 200 OK\r\nContent-Type: audio/wav\r\nContent-Length: 4096\r\nConnection: close\r\n\r\nx".utf8)
                        connection.send(content: partial, completion: .contentProcessed { _ in connection.cancel() })
                        return
                    }
                    if path == "/session" {
                        response = (201, #"{"client_token":"fixture-client-session","expires_in":3600}"#)
                    } else if path == "/talk", self.mode == .providerAuth {
                        response = (401, #"{"stage":"talk_chat","provider_stage":"chat","error_class":"provider_auth","error":"Talk failed during response generation (provider_auth)."}"#)
                    } else if path == "/talk", self.mode == .providerQuota {
                        response = (429, #"{"stage":"talk_chat","error_class":"provider_quota","error":"insufficient_quota"}"#)
                    } else if path == "/talk", talkCount == 1 {
                        response = self.mode == .legacyClient
                            ? (401, #"{"error":"unauthorized"}"#)
                            : (401, #"{"stage":"auth_client","error":"invalid_client_token"}"#)
                    } else {
                        response = (400, #"{"stage":"talk_chat","error":"Fixture ends after session renewal."}"#)
                    }
                    let body = Data(response.1.utf8)
                    var output = Data("HTTP/1.1 \(response.0) Fixture\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n".utf8)
                    output.append(body)
                    connection.send(content: output, completion: .contentProcessed { _ in connection.cancel() })
                    return
                }
            }
            if error != nil || complete { connection.cancel(); return }
            self.receive(connection, buffer: bytes)
        }
    }
}
