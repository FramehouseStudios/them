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
