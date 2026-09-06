import XCTest
@testable import them

/// docs/persona/mentor-core.txt is the one source of truth shared with the
/// backend mentor golden set (backend/evals/run_mentor_golden_eval.mjs). The
/// Swift literal must match it byte for byte so the eval measures the same
/// identity the app actually sends.
final class HerVoiceSpecMentorCoreParityTests: XCTestCase {
    private func repositoryRoot() throws -> URL {
        var cursor = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while cursor.path != cursor.deletingLastPathComponent().path {
            if FileManager.default.fileExists(atPath: cursor.appendingPathComponent("AGENTS.md").path),
               FileManager.default.fileExists(atPath: cursor.appendingPathComponent("TASKS.md").path) {
                return cursor
            }
            cursor.deleteLastPathComponent()
        }
        throw XCTSkip("Repository root not found from \(#filePath).")
    }

    func test_mentor_core_literal_matches_the_shared_persona_file() throws {
        let root = try repositoryRoot()
        let url = root.appendingPathComponent("docs/persona/mentor-core.txt")
        let shared = try String(contentsOf: url, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let literal = HerVoiceSpec.mentorCoreBlock.trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertEqual(literal, shared, "Update docs/persona/mentor-core.txt together with HerVoiceSpec.mentorCoreBlock.")
    }
}
