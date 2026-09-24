import XCTest
@testable import them

final class BackendHealthProbePolicyTests: XCTestCase {
    func testPollIntervalBacksOffWhileDownAndResetsWhenUp() {
        XCTAssertEqual(BackendHealthProbePolicy.pollInterval(consecutiveFailures: 0), 5)
        XCTAssertEqual(BackendHealthProbePolicy.pollInterval(consecutiveFailures: 1), 5)
        XCTAssertEqual(BackendHealthProbePolicy.pollInterval(consecutiveFailures: 2), 10)
        XCTAssertEqual(BackendHealthProbePolicy.pollInterval(consecutiveFailures: 3), 20)
        XCTAssertEqual(BackendHealthProbePolicy.pollInterval(consecutiveFailures: 4), 40)
        XCTAssertEqual(BackendHealthProbePolicy.pollInterval(consecutiveFailures: 5), 60)
        XCTAssertEqual(BackendHealthProbePolicy.pollInterval(consecutiveFailures: 50), 60)
        XCTAssertEqual(BackendHealthProbePolicy.pollInterval(consecutiveFailures: -3), 5)
    }

    func testTransportFailuresAreTheOnesWithoutAnHTTPAnswer() {
        XCTAssertTrue(BackendHealthProbePolicy.isTransportFailure(URLError(.cannotConnectToHost)))
        XCTAssertTrue(BackendHealthProbePolicy.isTransportFailure(URLError(.timedOut)))
        XCTAssertTrue(BackendHealthProbePolicy.isTransportFailure(URLError(.notConnectedToInternet)))
        XCTAssertFalse(BackendHealthProbePolicy.isTransportFailure(BackendMemoryAPIError.server(status: 404, message: "not found")))
        XCTAssertFalse(BackendHealthProbePolicy.isTransportFailure(BackendMemoryAPIError.invalidResponse))
    }

    func testRefusedHostIsProbedOnceNotTwice() async {
        HealthProbeURLProtocolStub.reset()
        HealthProbeURLProtocolStub.handler = { request in
            throw URLError(.cannotConnectToHost)
        }
        let api = makeAPI()
        do {
            _ = try await api.fetchHealth()
            XCTFail("expected the probe to fail")
        } catch {
            XCTAssertTrue(BackendHealthProbePolicy.isTransportFailure(error))
        }
        XCTAssertEqual(HealthProbeURLProtocolStub.paths, ["/bridge"], "a refused host is not asked a second time")
    }

    func testOlderBackendWithoutBridgeStillFallsThroughToHealth() async throws {
        HealthProbeURLProtocolStub.reset()
        HealthProbeURLProtocolStub.handler = { request in
            if request.url?.path == "/bridge" {
                return HealthProbeHTTPStub(status: 404, body: Data(#"{"error":"not_found"}"#.utf8))
            }
            return HealthProbeHTTPStub(
                status: 200,
                body: Data(#"{"ok":true,"status":"up","schema_version":1}"#.utf8)
            )
        }
        let api = makeAPI()
        let health = try await api.fetchHealth()
        XCTAssertTrue(health.ok)
        XCTAssertEqual(HealthProbeURLProtocolStub.paths, ["/bridge", "/health"])
    }

    private func makeAPI() -> BackendMemoryAPI {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HealthProbeURLProtocolStub.self]
        return BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://health-probe.test")!
        )
    }
}

private struct HealthProbeHTTPStub {
    let status: Int
    let body: Data
}

private final class HealthProbeURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> HealthProbeHTTPStub)?
    nonisolated(unsafe) static var paths: [String] = []

    static func reset() {
        handler = nil
        paths = []
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "health-probe.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.paths.append(request.url?.path ?? "")
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let stub = try handler(request)
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: stub.status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: stub.body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

extension BackendHealthProbePolicyTests {
    func testFailedHealthIsAnsweredFromMemoryUntilTheBackoffIntervalPasses() async throws {
        HealthProbeURLProtocolStub.reset()
        HealthProbeURLProtocolStub.handler = { _ in throw URLError(.cannotConnectToHost) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HealthProbeURLProtocolStub.self]
        let api = BackendMemoryAPI(session: URLSession(configuration: configuration), baseURL: URL(string: "https://health-probe.test")!)
        let t0 = Date()

        _ = try? await api.fetchHealth(now: t0)
        XCTAssertEqual(HealthProbeURLProtocolStub.paths.count, 1, "first failure probes the host")
        // Two more calls inside the first 5 s window: no network at all.
        _ = try? await api.fetchHealth(now: t0.addingTimeInterval(1))
        _ = try? await api.fetchHealth(now: t0.addingTimeInterval(4))
        XCTAssertEqual(HealthProbeURLProtocolStub.paths.count, 1)
        // At the boundary the probe runs again; the interval then doubles.
        _ = try? await api.fetchHealth(now: t0.addingTimeInterval(5))
        XCTAssertEqual(HealthProbeURLProtocolStub.paths.count, 2)
        _ = try? await api.fetchHealth(now: t0.addingTimeInterval(12))
        XCTAssertEqual(HealthProbeURLProtocolStub.paths.count, 2, "inside the 10 s window")
        _ = try? await api.fetchHealth(now: t0.addingTimeInterval(15))
        XCTAssertEqual(HealthProbeURLProtocolStub.paths.count, 3)

        // The backend comes back: the probe succeeds and the cache clears.
        HealthProbeURLProtocolStub.handler = { _ in
            HealthProbeHTTPStub(status: 200, body: Data(#"{"ok":true,"status":"up","schema_version":1}"#.utf8))
        }
        let health = try await api.fetchHealth(now: t0.addingTimeInterval(40))
        XCTAssertTrue(health.ok)
        _ = try await api.fetchHealth(now: t0.addingTimeInterval(41))
        XCTAssertEqual(HealthProbeURLProtocolStub.paths.suffix(2), ["/bridge", "/bridge"], "healthy calls always probe")
    }
}
