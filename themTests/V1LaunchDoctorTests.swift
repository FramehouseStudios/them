import XCTest
@testable import them

final class V1LaunchDoctorTests: XCTestCase {
    func testReportIncludesEveryLaunchFlow() {
        let report = V1LaunchDoctorReportBuilder.makeReport(
            results: [],
            generatedAt: Date(timeIntervalSince1970: 0)
        )

        XCTAssertEqual(report.schemaVersion, 1)
        XCTAssertEqual(report.source, "io.them.v1_launch_doctor")
        XCTAssertEqual(report.summary.total, 5)
        XCTAssertEqual(report.summary.notStarted, 5)
        XCTAssertEqual(report.overallStatus, .notStarted)
        XCTAssertEqual(report.results.map(\.flow), V1LaunchDoctorFlow.allCases)
    }

    func testReportStatusCountsFailuresBeforePartialProgress() {
        let report = V1LaunchDoctorReportBuilder.makeReport(
            results: [
                V1LaunchDoctorFlowResult(flow: .talkPipeline, status: .passed),
                V1LaunchDoctorFlowResult(flow: .screenplayStudio, status: .inProgress),
                V1LaunchDoctorFlowResult(flow: .creativeMemory, status: .failed),
            ],
            generatedAt: Date(timeIntervalSince1970: 0)
        )

        XCTAssertEqual(report.summary.passed, 1)
        XCTAssertEqual(report.summary.failed, 1)
        XCTAssertEqual(report.summary.inProgress, 1)
        XCTAssertEqual(report.summary.notStarted, 2)
        XCTAssertEqual(report.overallStatus, .failed)
    }

    func testReportPassesOnlyWhenAllFlowsPass() {
        let report = V1LaunchDoctorReportBuilder.makeReport(
            results: V1LaunchDoctorFlow.allCases.map {
                V1LaunchDoctorFlowResult(flow: $0, status: .passed)
            },
            generatedAt: Date(timeIntervalSince1970: 0)
        )

        XCTAssertEqual(report.summary.passed, 5)
        XCTAssertEqual(report.summary.failed, 0)
        XCTAssertEqual(report.overallStatus, .passed)
    }

    func testMarkdownCarriesEvidenceAndPassCriteria() {
        let report = V1LaunchDoctorReportBuilder.makeReport(
            results: [
                V1LaunchDoctorFlowResult(
                    flow: .talkPipeline,
                    status: .passed,
                    notes: "Audio reply heard and saved.",
                    evidence: "Build 128, local backend",
                    updatedAt: Date(timeIntervalSince1970: 0)
                ),
            ],
            generatedAt: Date(timeIntervalSince1970: 0)
        )

        XCTAssertTrue(report.markdown.contains("# io.them V1 Launch Doctor"))
        XCTAssertTrue(report.markdown.contains("## Talk Pipeline"))
        XCTAssertTrue(report.markdown.contains("## iOS Release Readiness"))
        XCTAssertTrue(report.markdown.contains("Evidence: Build 128, local backend"))
        XCTAssertTrue(report.markdown.contains("Voice -> reply -> playback -> saved turn"))
        XCTAssertTrue(report.markdown.contains("Release config is real, preflight is green"))
    }

    func testJSONRoundTripsWithSchemaVersion() throws {
        let report = V1LaunchDoctorReportBuilder.makeReport(
            results: [
                V1LaunchDoctorFlowResult(flow: .realtime, status: .inProgress, notes: "Fallback under test"),
            ],
            generatedAt: Date(timeIntervalSince1970: 0)
        )

        let data = try report.jsonData
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(V1LaunchDoctorReport.self, from: data)

        XCTAssertEqual(decoded.schemaVersion, V1LaunchDoctorReport.schemaVersion)
        XCTAssertEqual(decoded.overallStatus, .inProgress)
        XCTAssertEqual(decoded.results.count, 5)
    }
}
