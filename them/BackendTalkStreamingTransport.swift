import Foundation

/// A completed response failed its durability boundary. It must never be
/// classified as a transient network error and generate another paid turn.
nonisolated struct BackendTalkCustodyError: LocalizedError {
    let underlyingError: Error
    var errorDescription: String? {
        "The reply arrived, but could not be safely kept on this device. Its request remains held; it will not be sent again automatically."
    }
}

/// After HTTP200, decoding/metadata failure is recovery work, never a reason
/// for Root's transient-error policy to submit another generation.
nonisolated struct BackendTalkAcceptedReplyError: LocalizedError {
    let entryID: String
    let underlyingError: Error
    var errorDescription: String? {
        "The accepted response record was kept on this device, but delivery could not finish. Review it in Studio; generation was not repeated."
    }
}

/// Only safe admission identity crosses into UI/playback values. Bearer and
/// session credentials remain in the network client's captured request owner.
nonisolated struct BackendTalkLiveRequestContext: Sendable, Equatable {
    let admission: OfflineTalkLiveAdmission
    let owner: ScreenplayStudioAuthContext
    let backendURL: URL
    var requestID: String { admission.requestID }
}

nonisolated struct BackendTalkLiveDeliveryReceipt: Sendable, Equatable {
    let receipt: OfflineTalkLiveReceipt
    let request: BackendTalkLiveRequestContext
    let requiresPageSave: Bool
    var owner: ScreenplayStudioAuthContext { request.owner }
    var backendURL: URL { request.backendURL }

    @MainActor func confirmFinishedPlayback(outbox: OfflineTalkOutbox = .shared) async {
        let current = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        guard ScreenplayStudioAuthContextPolicy.matches(expected: owner, current: current.ownerContext) else { return }
        // Delivery failure keeps the original blob. It never regenerates or
        // changes an unrelated screen's status from a late playback callback.
        _ = try? await outbox.recordFinishedLivePlayback(self, owner: current)
    }
}

/// The existing live /talk streaming transport, isolated from request/auth/recovery policy.
nonisolated enum BackendTalkStreamingTransport {
    typealias AcceptedResponseRetention = @Sendable (Data, HTTPURLResponse) async throws -> Void

    static func retainIfAccepted(_ data: Data, response: URLResponse,
        using retain: AcceptedResponseRetention?) async throws {
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, let retain else { return }
        do { try await retain(data, http) }
        catch { throw BackendTalkCustodyError(underlyingError: error) }
    }
    /// Stop is not an offline failure and must never enter retry or recovery policy.
    static func checkCancellation(_ error: Error? = nil) throws {
        // A failed completed-response write must retain its held request even
        // when the consumer also cancelled. Cancellation cannot erase custody.
        if let error = error as? BackendTalkCustodyError { throw error }
        if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
            throw CancellationError()
        }
    }

    static func data(
        for request: URLRequest,
        configuration: URLSessionConfiguration,
        onResponse: ((HTTPURLResponse) -> Void)? = nil,
        onChunk: ((Data, HTTPURLResponse) -> Void)? = nil,
        retainAcceptedResponse: (@Sendable (Data, HTTPURLResponse) async throws -> Void)? = nil
    ) async throws -> (Data, URLResponse) {
        try checkCancellation()
        let delegate = TalkStreamingDelegate(onResponse: onResponse, onChunk: onChunk,
            retainAcceptedResponse: retainAcceptedResponse)
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        let task = session.dataTask(with: request)
        defer { session.finishTasksAndInvalidate() }
        let result = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                delegate.attach(continuation)
                task.resume()
            }
        } onCancel: {
            delegate.cancel()
            task.cancel()
        }
        try checkCancellation()
        return result
    }

    private final class TalkStreamingDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {
        // Recursive because a consumer can cancel its task from a stream callback.
        // The lock also prevents a new callback from starting after cancellation wins.
        private let lock = NSRecursiveLock()
        private let onResponse: ((HTTPURLResponse) -> Void)?
        private let onChunk: ((Data, HTTPURLResponse) -> Void)?
        private let retainAcceptedResponse: (@Sendable (Data, HTTPURLResponse) async throws -> Void)?
        private var continuation: CheckedContinuation<(Data, URLResponse), Error>?
        private var terminalResult: Result<(Data, URLResponse), Error>?
        private var response: URLResponse?
        private var accumulatedData = Data()
        private var isRetainingAcceptedResponse = false

        init(
            onResponse: ((HTTPURLResponse) -> Void)?,
            onChunk: ((Data, HTTPURLResponse) -> Void)?,
            retainAcceptedResponse: (@Sendable (Data, HTTPURLResponse) async throws -> Void)?
        ) {
            self.onResponse = onResponse
            self.onChunk = onChunk
            self.retainAcceptedResponse = retainAcceptedResponse
        }

        func attach(_ continuation: CheckedContinuation<(Data, URLResponse), Error>) {
            lock.lock()
            let result = terminalResult
            if result == nil { self.continuation = continuation }
            lock.unlock()
            // Cancellation can complete before the continuation is attached.
            if let result { continuation.resume(with: result) }
        }

        func cancel() {
            lock.lock()
            defer { lock.unlock() }
            // Once complete bytes win, cancellation can suppress UI delivery,
            // but cannot cancel the already-paid response's durable handoff.
            guard !isRetainingAcceptedResponse else { return }
            finish(.failure(CancellationError()))
        }

        private func finish(_ result: Result<(Data, URLResponse), Error>) {
            lock.lock()
            guard terminalResult == nil else { lock.unlock(); return }
            terminalResult = result
            let waiting = continuation
            continuation = nil
            lock.unlock()
            waiting?.resume(with: result)
        }

        func urlSession(
            _ session: URLSession,
            task: URLSessionTask,
            willPerformHTTPRedirection response: HTTPURLResponse,
            newRequest request: URLRequest,
            completionHandler: @escaping @Sendable (URLRequest?) -> Void
        ) {
            lock.lock()
            let cancelled = terminalResult != nil
            lock.unlock()
            guard !cancelled else { completionHandler(nil); return }
            BackendHTTPRedirectGuard.shared.urlSession(session, task: task,
                willPerformHTTPRedirection: response, newRequest: request, completionHandler: completionHandler)
        }

        func urlSession(
            _ session: URLSession,
            dataTask: URLSessionDataTask,
            didReceive response: URLResponse,
            completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
        ) {
            lock.lock()
            guard terminalResult == nil else { lock.unlock(); completionHandler(.cancel); return }
            self.response = response
            if let http = response as? HTTPURLResponse {
                onResponse?(http)
            }
            let disposition: URLSession.ResponseDisposition = terminalResult == nil ? .allow : .cancel
            lock.unlock()
            completionHandler(disposition)
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
            lock.lock()
            defer { lock.unlock() }
            guard terminalResult == nil else { return }
            accumulatedData.append(data)
            guard let http = response as? HTTPURLResponse else { return }
            onChunk?(data, http)
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            lock.lock()
            guard terminalResult == nil, !isRetainingAcceptedResponse else { lock.unlock(); return }
            let response = self.response
            let data = accumulatedData
            if error == nil, let http = response as? HTTPURLResponse, http.statusCode == 200,
               let retainAcceptedResponse {
                isRetainingAcceptedResponse = true
                lock.unlock()
                // This task belongs to completed transport evidence, not the
                // cancelled consumer. The await resumes only after custody.
                Task {
                    do {
                        try await retainAcceptedResponse(data, http)
                        finish(.success((data, http)))
                    } catch { finish(.failure(BackendTalkCustodyError(underlyingError: error))) }
                }
                return
            }
            lock.unlock()
            if let error {
                finish(.failure((error as? URLError)?.code == .cancelled ? CancellationError() : error))
                return
            }
            guard let response else {
                finish(.failure(BackendError.http(-1, "Missing talk response.")))
                return
            }
            finish(.success((data, response)))
        }
    }
}

