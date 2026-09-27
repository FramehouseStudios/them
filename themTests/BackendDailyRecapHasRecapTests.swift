import XCTest
@testable import them

final class BackendDailyRecapHasRecapTests: XCTestCase {
    private func decode(extra: String) throws -> BackendDailyRecapResponse {
        let json = """
        {
          "source": "user", "source_ip": "authuser:u1", "local_day": "2026-09-27",
          "generated_at": 1800000000000, "recap": "No major recap yet today.",
          "highlights": [], "outcomes": [], "next_actions": [],
          "open_tasks": [], "completed_today": [],
          "stats": { "turns_today": 0, "open_tasks": 0, "completed_today": 0, "total_tasks": 0 }\(extra)
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendDailyRecapResponse.self, from: Data(json.utf8))
    }

    func testEmptyStateSentenceIsMarkedAsNoRecap() throws {
        XCTAssertEqual(try decode(extra: #", "has_recap": false"#).hasRecap, false)
    }

    func testOlderServerWithoutTheFlagStillDecodes() throws {
        XCTAssertNil(try decode(extra: "").hasRecap)
    }
}
