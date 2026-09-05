import XCTest
@testable import them

@MainActor
final class PendingMemoryMutation {
    private var continuation: CheckedContinuation<BackendReadResult<BackendMemoryMutationResponse>, Error>?
    var isWaiting: Bool { continuation != nil }
    func wait() async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        try await withCheckedThrowingContinuation { continuation = $0 }
    }
    func complete(_ result: Result<BackendReadResult<BackendMemoryMutationResponse>, Error>) {
        let pending = continuation
        continuation = nil
        pending?.resume(with: result)
    }
}

final class MemoryMutationRequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var entries: [URLRequest] = []
    var requests: [URLRequest] { lock.lock(); defer { lock.unlock() }; return entries }
    func append(_ request: URLRequest) { lock.lock(); defer { lock.unlock() }; entries.append(request) }
}

final class MemoryMutationURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> Data)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "memory-mutation.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            var captured = request
            if captured.httpBody == nil, let stream = request.httpBodyStream {
                stream.open()
                defer { stream.close() }
                var body = Data()
                var buffer = [UInt8](repeating: 0, count: 4096)
                while true {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeRawData) }
                    if count == 0 { break }
                    body.append(contentsOf: buffer.prefix(count))
                }
                captured.httpBody = body
            }
            guard let handler = Self.handler else { throw URLError(.unsupportedURL) }
            let body = try handler(captured)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: body)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
