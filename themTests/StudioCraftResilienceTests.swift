import XCTest
@testable import them

@MainActor
final class StudioCraftResilienceTests: XCTestCase {
    func testBackgroundTransientFailureRetriesOnce() async throws {
        var attempts = 0

        let result: String = try await StudioCraftResilience.run(
            source: "Studio open",
            retryDelayNanoseconds: 0
        ) {
            attempts += 1
            if attempts == 1 {
                throw BackendError.http(502, "Backend service unavailable.")
            }
            return "recovered"
        }

        XCTAssertEqual(result, "recovered")
        XCTAssertEqual(attempts, 2)
    }

    func testManualRefreshDoesNotHideLatencyBehindAutomaticRetry() async {
        var attempts = 0

        do {
            let _: String = try await StudioCraftResilience.run(
                source: "Manual check",
                retryDelayNanoseconds: 0
            ) {
                attempts += 1
                throw BackendError.http(503, "unavailable")
            }
            XCTFail("Expected the manual refresh to fail")
        } catch {
            XCTAssertEqual(attempts, 1)
        }
    }

    func testBackgroundFailuresStayQuietWhileManualFailuresAreFriendly() {
        let error = BackendError.http(502, "<html>proxy failure</html>")

        XCTAssertEqual(
            StudioCraftResilience.presentedError(
                error,
                source: "THEM rail",
                subject: "character memory"
            ),
            ""
        )
        XCTAssertEqual(
            StudioCraftResilience.presentedError(
                error,
                source: "Manual check",
                subject: "character memory"
            ),
            "Couldn't refresh character memory right now. Try again."
        )
    }

    func testValidationFailuresDoNotRetry() {
        XCTAssertFalse(
            StudioCraftResilience.shouldRetry(
                error: BackendError.http(400, "draft required"),
                source: "Draft",
                retryCount: 0
            )
        )
        XCTAssertFalse(
            StudioCraftResilience.shouldRetry(
                error: BackendError.http(502, "unavailable"),
                source: "Studio open",
                retryCount: 1
            )
        )
    }

    func testProviderQuotaDoesNotRetryOrMasqueradeAsBusyRateLimit() {
        let error = BackendError.http(
            429,
            #"{"error_class":"provider_quota","error":"insufficient_quota"}"#
        )

        XCTAssertFalse(
            StudioCraftResilience.shouldRetry(
                error: error,
                source: "Studio open",
                retryCount: 0
            )
        )
        XCTAssertEqual(
            StudioCraftResilience.presentedError(
                error,
                source: "Manual check",
                subject: "character memory"
            ),
            "Clementine's writing service is temporarily unavailable. Your draft is safe. Please try again later."
        )
    }

    func testBackgroundStatusOnlyCallsOutStaleContentWhenThereIsSomethingUseful() {
        XCTAssertEqual(
            StudioCraftResilience.backgroundStatus(
                subject: "craft report",
                hasExistingContent: true
            ),
            "Showing the latest available craft report."
        )
        XCTAssertEqual(
            StudioCraftResilience.backgroundStatus(
                subject: "craft report",
                hasExistingContent: false
            ),
            ""
        )
    }
}
