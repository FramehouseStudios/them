import Foundation
import XCTest
@testable import them

@MainActor
final class BackendTalkStreamingTransportTests: XCTestCase {
    override func tearDown() {
        HeldTalkProtocol.state?.release()
        HeldTalkProtocol.state = nil
        super.tearDown()
    }

    func testCancelBeforeHeadersStopsTheNetworkAndCompletesAsCancellation() async {
        let started = expectation(description: "Real URLSession request entered protocol")
        let stopped = expectation(description: "Real URLSession task stopped")
        let completed = expectation(description: "Swift await completed")
        let state = HeldTalkState(mode: .hold, started: started, stopped: stopped)
        HeldTalkProtocol.state = state
        let operation = Task { () -> Error? in
            defer { completed.fulfill() }
            do {
                _ = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration(),
                    onResponse: { _ in state.recordCallback() }, onChunk: { _, _ in state.recordCallback() })
                return nil
            } catch { return error }
        }
        await fulfillment(of: [started], timeout: 2)
        operation.cancel()
        let outcome = await XCTWaiter.fulfillment(of: [stopped, completed], timeout: 1)
        XCTAssertEqual(outcome, .completed, "Stop left the actual HTTP task or Swift await running")
        state.release() // Bounds the failing-before run; never counted as cancellation proof.
        let error = await operation.value
        XCTAssertTrue(error is CancellationError, "Explicit Stop was not represented as cancellation")
        XCTAssertEqual(state.counts.starts, 1)
        XCTAssertEqual(state.counts.callbacks, 0)
    }

    func testAlreadyCancelledOperationDoesNotStartARequest() async {
        let state = HeldTalkState(mode: .fail)
        HeldTalkProtocol.state = state
        let operation = Task { () -> Error? in
            do { _ = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration()); return nil }
            catch { return error }
        }
        operation.cancel()
        let error = await operation.value
        XCTAssertTrue(error is CancellationError)
        XCTAssertEqual(state.counts.starts, 0)
    }

    func testNormalStreamingPreservesResponseAndExactChunks() async throws {
        let state = HeldTalkState(mode: .succeed)
        HeldTalkProtocol.state = state
        let (data, response) = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration(),
            onResponse: { _ in state.recordCallback() }, onChunk: { data, _ in state.recordChunk(data) })
        XCTAssertEqual(data, Data("exact audio bytes".utf8))
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        XCTAssertEqual(state.counts.starts, 1)
        XCTAssertGreaterThanOrEqual(state.counts.callbacks, 2)
        XCTAssertEqual(state.chunkBytes, data, "Chunk coalescing must preserve the exact streamed bytes")
    }

    func testCompletedResponseFinishesCustodyBeforeCancelledConsumerReturns() async {
        HeldTalkProtocol.state = HeldTalkState(mode: .succeed)
        let entered = expectation(description: "Complete response entered custody")
        let returned = XCTestExpectation(description: "Consumer returned")
        let gate = AcceptedTalkResponseGate()
        let operation = Task { () -> Error? in
            defer { returned.fulfill() }
            do {
                _ = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration(),
                    retainAcceptedResponse: { data, http in
                        XCTAssertEqual(data, Data("exact audio bytes".utf8))
                        XCTAssertEqual(http.statusCode, 200)
                        entered.fulfill()
                        await gate.hold()
                    })
                return nil
            } catch { return error }
        }
        await fulfillment(of: [entered], timeout: 2)
        operation.cancel()
        let waiting = await XCTWaiter.fulfillment(of: [returned], timeout: 0.05)
        XCTAssertEqual(waiting, .timedOut, "Cancellation bypassed custody of a completed response")
        await gate.release()
        let result = await operation.value
        XCTAssertTrue(result is CancellationError, "Custody must not restore cancelled UI delivery")
        let calls = await gate.calls
        XCTAssertEqual(calls, 1)
    }

    func testCompletedResponseCustodyFailureIsNotATransientTransportError() async {
        HeldTalkProtocol.state = HeldTalkState(mode: .succeed)
        do {
            _ = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration(),
                retainAcceptedResponse: { _, _ in throw URLError(.cannotWriteToFile) })
            XCTFail("An unretained accepted response must not report success")
        } catch {
            XCTAssertTrue(error is BackendTalkCustodyError)
            XCTAssertEqual(((error as? BackendTalkCustodyError)?.underlyingError as? URLError)?.code, .cannotWriteToFile)
        }
        XCTAssertEqual(HeldTalkProtocol.state?.counts.starts, 1)
    }

    func testIncompleteResponseNeverReportsAcceptedCustody() async {
        HeldTalkProtocol.state = HeldTalkState(mode: .fail)
        let gate = AcceptedTalkResponseGate()
        do {
            _ = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration(),
                retainAcceptedResponse: { _, _ in await gate.record() })
            XCTFail("Offline response unexpectedly succeeded")
        } catch { XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet) }
        let calls = await gate.calls
        XCTAssertEqual(calls, 0)
    }

    func testCancelFromResponseCallbackSuppressesLaterChunksAndResult() async {
        let state = HeldTalkState(mode: .succeed)
        HeldTalkProtocol.state = state
        let operation = Task { () -> Error? in
            do {
                _ = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration(),
                    onResponse: { _ in state.recordCallback(); state.cancelOperation() },
                    onChunk: { data, _ in state.recordChunk(data) })
                return nil
            } catch { return error }
        }
        state.bind(operation)
        let error = await operation.value
        XCTAssertTrue(error is CancellationError)
        XCTAssertEqual(state.counts.callbacks, 1)
        XCTAssertTrue(state.chunkBytes.isEmpty)
    }

    func testFoundationCancellationIsNormalizedBeforeRecoveryPolicy() async {
        let state = HeldTalkState(mode: .cancel)
        HeldTalkProtocol.state = state
        do {
            _ = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration())
            XCTFail("Cancelled transport unexpectedly succeeded")
        } catch { XCTAssertTrue(error is CancellationError) }
    }

    func testActualTalkStopDoesNotRetryOrEnqueueOfflineWork() async {
        let started = expectation(description: "Actual /talk reached transport before headers")
        let stopped = expectation(description: "Actual /talk network stopped")
        let completed = expectation(description: "Actual talk returned cancellation")
        let state = HeldTalkState(mode: .hold, started: started, stopped: stopped)
        HeldTalkProtocol.state = state
        let backend = BackendAuthClient.resolvedBackendBaseURL()
        let session = URLSession(configuration: configuration())
        defer { session.invalidateAndCancel() }
        let client = BackendClient(baseURL: backend, fallbackURL: backend, urlSession: session,
            persistBackendBaseURL: false)
        _ = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: true)
        let before = await OfflineTalkOutbox.shared.allEntries().map(\.id)
        let operation = Task { () -> Error? in
            defer { completed.fulfill() }
            do {
                _ = try await client.talkText(transcript: "Write a synthetic test scene.",
                    idempotencyKey: "stop-fixture-\(UUID().uuidString)")
                return nil
            } catch { return error }
        }
        await fulfillment(of: [started], timeout: 3)
        operation.cancel()
        let outcome = await XCTWaiter.fulfillment(of: [stopped, completed], timeout: 1)
        XCTAssertEqual(outcome, .completed)
        state.release()
        let error = await operation.value
        XCTAssertTrue(error is CancellationError)
        XCTAssertFalse(error is BackendTalkQueuedError)
        XCTAssertEqual(state.counts.starts, 1, "Stop must not trigger another /talk attempt")
        let after = await OfflineTalkOutbox.shared.allEntries().map(\.id)
        XCTAssertEqual(after, before, "Stopped work must not reappear in the offline queue")
    }

    func testGenuineOfflineFailureIsNotClassifiedAsExplicitStop() async {
        let state = HeldTalkState(mode: .fail)
        HeldTalkProtocol.state = state
        do {
            _ = try await BackendTalkStreamingTransport.data(for: request(), configuration: configuration())
            XCTFail("Offline transport unexpectedly succeeded")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet)
            XCTAssertFalse(error is CancellationError)
        }
    }

    private func request() -> URLRequest {
        var request = URLRequest(url: URL(string: "https://held-talk.test/talk")!)
        request.httpMethod = "POST"
        request.httpBody = Data("synthetic multipart".utf8)
        return request
    }

    private func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HeldTalkProtocol.self]
        return configuration
    }
}

private actor AcceptedTalkResponseGate {
    private var continuation: CheckedContinuation<Void, Never>?
    private var released = false
    private(set) var calls = 0
    func record() { calls += 1 }
    func hold() async {
        calls += 1
        if released { return }
        await withCheckedContinuation { continuation = $0 }
    }
    func release() {
        released = true
        continuation?.resume()
        continuation = nil
    }
}

private nonisolated final class HeldTalkState: @unchecked Sendable {
    enum Mode { case hold, succeed, fail, cancel }
    let mode: Mode
    private let lock = NSLock()
    private var active: HeldTalkProtocol?
    private var starts = 0
    private var callbacks = 0
    private var chunks = Data()
    private var operation: Task<Error?, Never>?
    private let started: XCTestExpectation?
    private let stopped: XCTestExpectation?
    init(mode: Mode, started: XCTestExpectation? = nil, stopped: XCTestExpectation? = nil) {
        self.mode = mode; self.started = started; self.stopped = stopped
    }
    func begin(_ value: HeldTalkProtocol) {
        lock.lock(); active = value; starts += 1; lock.unlock()
        started?.fulfill()
    }
    func stop(_ value: HeldTalkProtocol) {
        lock.lock()
        guard active === value else { lock.unlock(); return }
        active = nil
        lock.unlock()
        stopped?.fulfill()
    }
    func recordCallback() { lock.lock(); callbacks += 1; lock.unlock() }
    func recordChunk(_ data: Data) { lock.lock(); callbacks += 1; chunks.append(data); lock.unlock() }
    var chunkBytes: Data { lock.lock(); defer { lock.unlock() }; return chunks }
    func bind(_ task: Task<Error?, Never>) { lock.lock(); operation = task; lock.unlock() }
    func cancelOperation() { lock.lock(); let task = operation; lock.unlock(); task?.cancel() }
    var counts: (starts: Int, callbacks: Int) { lock.lock(); defer { lock.unlock() }; return (starts, callbacks) }
    func release() {
        lock.lock(); let held = active; active = nil; lock.unlock()
        if let held { held.client?.urlProtocol(held, didFailWithError: URLError(.cancelled)) }
    }
}

private nonisolated final class HeldTalkProtocol: URLProtocol {
    nonisolated(unsafe) static var state: HeldTalkState?
    private var startedState: HeldTalkState?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let state = Self.state else { return }
        if request.url?.path == "/session" {
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(#"{"client_token":"fixture-client","expires_in":3600}"#.utf8))
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        startedState = state
        state.begin(self)
        switch state.mode {
        case .hold: break
        case .fail: client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
        case .cancel: client?.urlProtocol(self, didFailWithError: URLError(.cancelled))
        case .succeed:
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type":"audio/mpeg"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data("exact audio ".utf8))
            client?.urlProtocol(self, didLoad: Data("bytes".utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() { startedState?.stop(self) }
}
