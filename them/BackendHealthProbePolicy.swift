import Foundation

/// How the app probes backend health and how often it re-checks while the
/// backend is down. Measured on 2026-09-24 with the backend stopped: the
/// root view polled every 5 s and each poll tried /bridge then /health on
/// every candidate host, 190 connection attempts to one host in six minutes
/// for a fresh session doing nothing. A host that refuses the first probe
/// will refuse the second, and a backend that is down at 5 s is usually
/// still down at 10 s; the poll backs off to a minute and resets the moment
/// the backend answers.
///
/// While healthy the poll was also every 5 s: 12 /bridge requests a minute
/// from an idle home screen (measured 2026-09-27), about 17,000 a day per
/// open app. Real requests already mark the backend unavailable the moment
/// one fails, and the offline outbox drains on network changes, so a
/// healthy backend is re-checked every 30 s; a failure is re-checked after
/// 5 s as before.
nonisolated enum BackendHealthProbePolicy {
    /// Poll interval while the backend answers.
    static let healthyInterval: TimeInterval = 30
    /// First re-check after a failure; doubles while the backend stays down.
    static let baseInterval: TimeInterval = 5
    /// Longest wait between polls while the backend is down.
    static let maxInterval: TimeInterval = 60

    /// 30 s while healthy; 5, 10, 20, 40, 60, 60… while failing.
    static func pollInterval(consecutiveFailures: Int) -> TimeInterval {
        guard consecutiveFailures > 0 else { return healthyInterval }
        let exponent = min(consecutiveFailures - 1, 8)
        return min(maxInterval, baseInterval * pow(2, Double(exponent)))
    }

    /// True when the request never got an HTTP response from the host
    /// (refused, unreachable, DNS, timeout, offline). A second path on the
    /// same host cannot do better.
    static func isTransportFailure(_ error: Error) -> Bool {
        error is URLError
    }
}
