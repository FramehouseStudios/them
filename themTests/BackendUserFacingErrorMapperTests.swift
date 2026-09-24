import XCTest
@testable import them

final class BackendUserFacingErrorMapperTests: XCTestCase {
    func testKnownStageErrorPairsMapToActionableSentences() {
        XCTAssertEqual(
            BackendUserFacingErrorMapper.message(forStage: "auth_user", error: "user_auth_required"),
            "Please sign in to continue."
        )
        XCTAssertEqual(
            BackendUserFacingErrorMapper.message(forStage: "craft", error: "craft_invalid_screenplay"),
            "That screenplay text needs attention before we can continue."
        )
        XCTAssertEqual(
            BackendUserFacingErrorMapper.message(forStage: "TALK", error: "Talk_Rate_Limited"),
            "You're sending messages too quickly. Please wait a moment.",
            "matching is case-insensitive"
        )
    }

    func testUnknownCodesNeverEchoTheRawPair() {
        let message = BackendUserFacingErrorMapper.message(forStage: "outbox_operator", error: "operator_token_rejected")
        XCTAssertFalse(message.contains("outbox_operator"))
        XCTAssertFalse(message.contains("operator_token_rejected"))
        XCTAssertEqual(message, "Something went wrong. Please try again.")
        XCTAssertEqual(
            BackendUserFacingErrorMapper.message(forStage: "outbox_operator", error: "operator_token_invalid"),
            "Something in that request needs fixing.",
            "codes containing 'invalid' get the fix-it fallback"
        )
        XCTAssertEqual(
            BackendUserFacingErrorMapper.message(forStage: "craft", error: "craft_beat_not_found"),
            "We couldn't find that item."
        )
        XCTAssertEqual(
            BackendUserFacingErrorMapper.message(forStage: "auth", error: "session_expired"),
            "Please sign in again."
        )
    }

    func testPurchaseCodesMapWithoutAStage() {
        let refused = Data(#"{"ok":false,"error":"iap_verify_not_wired","failClosed":true}"#.utf8)
        XCTAssertEqual(
            BackendUserFacingErrorMapper.displayMessage(from: refused, status: 503),
            "Purchases are temporarily unavailable. Your purchase is saved and will be applied automatically."
        )
        XCTAssertEqual(
            BackendUserFacingErrorMapper.message(forStage: "iap_credit", error: "iap_credit_failed"),
            "We couldn't apply that purchase yet. You won't be charged again; we'll keep retrying."
        )
    }

    func testKnownMessageReturnsNilForUnmappedCodesAndParsesStagePrefixes() {
        XCTAssertNil(BackendUserFacingErrorMapper.knownMessage(forServerMessage: "screenplay_store_unavailable"))
        XCTAssertNil(BackendUserFacingErrorMapper.knownMessage(forServerMessage: "Backend returned an invalid response."))
        XCTAssertEqual(
            BackendUserFacingErrorMapper.knownMessage(forServerMessage: "auth_user: user_auth_required"),
            "Please sign in to continue."
        )
        XCTAssertEqual(
            BackendUserFacingErrorMapper.knownMessage(forServerMessage: "iap_verify_not_wired"),
            "Purchases are temporarily unavailable. Your purchase is saved and will be applied automatically."
        )
    }

    func testDisplayMessageDecodesStructuredBodies() {
        let data = Data(#"{"stage":"auth_user","error":"user_auth_required"}"#.utf8)
        XCTAssertEqual(
            BackendUserFacingErrorMapper.displayMessage(from: data, status: 401),
            "Please sign in to continue."
        )
    }

    func testDisplayMessageFallsBackToSanitizerForUnstructuredBodies() {
        let html = Data("<html><body><h1>502 Bad Gateway</h1></body></html>".utf8)
        let message = BackendUserFacingErrorMapper.displayMessage(from: html, status: 502)
        XCTAssertFalse(message.contains("<html"))
        XCTAssertFalse(message.contains("Bad Gateway"))
        XCTAssertFalse(message.isEmpty)
    }
}

extension BackendUserFacingErrorMapperTests {
    func testDailyProviderBudgetIsNotRetriedAndSaysWhenItComesBack() {
        let identity = Data(#"{"stage":"provider_budget","error":"provider_budget_exceeded","scope":"identity","route_class":"talk","daily_limit":500,"retry_after_ms":61200000}"#.utf8)
        let global = Data(#"{"stage":"provider_budget","error":"provider_budget_exceeded","scope":"global","route_class":"talk","daily_limit":5000,"retry_after_ms":61200000}"#.utf8)
        let rateLimit = Data(#"{"stage":"rate_limit","error":"rate_limited","retry_after_ms":1200}"#.utf8)

        XCTAssertTrue(BackendProviderFailurePolicy.isDailyBudgetExhausted(statusCode: 429, data: identity))
        XCTAssertTrue(BackendProviderFailurePolicy.isDailyBudgetExhausted(statusCode: 429, data: global))
        XCTAssertFalse(BackendProviderFailurePolicy.isDailyBudgetExhausted(statusCode: 429, data: rateLimit))
        XCTAssertFalse(BackendProviderFailurePolicy.isQuotaExhausted(statusCode: 429, data: identity), "the daily cap is not the provider's quota")

        // No retry storm against a cap that lasts until midnight.
        XCTAssertFalse(BackendProviderFailurePolicy.shouldRetryHTTP(statusCode: 429, data: identity, retryableStatusCodes: [429, 503]))
        XCTAssertTrue(BackendProviderFailurePolicy.shouldRetryHTTP(statusCode: 429, data: rateLimit, retryableStatusCodes: [429, 503]))

        // Scope-aware copy, on the policy and on the error the client throws.
        XCTAssertEqual(BackendProviderFailurePolicy.dailyBudgetMessage(data: identity), BackendProviderFailurePolicy.dailyBudgetIdentityMessage)
        XCTAssertEqual(BackendProviderFailurePolicy.dailyBudgetMessage(data: global), BackendProviderFailurePolicy.dailyBudgetGlobalMessage)
        let stageError = BackendError.stage("provider_budget", "provider_budget_exceeded")
        XCTAssertEqual(stageError.errorDescription, BackendProviderFailurePolicy.dailyBudgetIdentityMessage)
        let httpError = BackendError.http(429, String(data: global, encoding: .utf8)!)
        XCTAssertEqual(httpError.errorDescription, BackendProviderFailurePolicy.dailyBudgetGlobalMessage)
        XCTAssertEqual(
            BackendUserFacingErrorMapper.message(forStage: "provider_budget", error: "provider_budget_exceeded"),
            BackendProviderFailurePolicy.dailyBudgetIdentityMessage
        )
        // The provider's own quota keeps its copy.
        let quota = BackendError.stage("talk_chat", "provider_quota")
        XCTAssertEqual(quota.errorDescription, BackendProviderFailurePolicy.userMessage)
    }
}

extension BackendUserFacingErrorMapperTests {
    func testRetryAfterHintIsReadFromHeaderThenBody() {
        let none = BackendProviderFailurePolicy.retryAfterInterval(headers: [:], data: Data("{}".utf8))
        XCTAssertNil(none)
        XCTAssertEqual(BackendProviderFailurePolicy.retryAfterInterval(headers: ["Retry-After": "12"], data: Data()), 12)
        XCTAssertEqual(BackendProviderFailurePolicy.retryAfterInterval(headers: ["retry-after": " 3 "], data: Data()), 3)
        XCTAssertEqual(BackendProviderFailurePolicy.retryAfterInterval(headers: [:], data: Data(#"{"retry_after_ms":1500}"#.utf8)), 1.5)
        XCTAssertEqual(BackendProviderFailurePolicy.retryAfterInterval(headers: [:], data: Data(#"{"retry_after_seconds":7}"#.utf8)), 7)
        // Header wins over body; garbage is ignored.
        XCTAssertEqual(BackendProviderFailurePolicy.retryAfterInterval(headers: ["Retry-After": "2"], data: Data(#"{"retry_after_ms":90000}"#.utf8)), 2)
        XCTAssertNil(BackendProviderFailurePolicy.retryAfterInterval(headers: ["Retry-After": "soon"], data: Data("not json".utf8)))
        XCTAssertEqual(BackendProviderFailurePolicy.inlineRetryAfterMax, 2)
    }
}
