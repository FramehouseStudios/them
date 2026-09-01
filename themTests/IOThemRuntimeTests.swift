import XCTest
@testable import them

final class IOThemRuntimeTests: XCTestCase {
    func testExplicitXCTestEnvironmentIdentifiesTestProcess() {
        XCTAssertTrue(IOThemRuntime.isTestProcessEnvironment([
            "XCTestConfigurationFilePath": "/tmp/them-tests.xctestconfiguration",
        ]))
        XCTAssertTrue(IOThemRuntime.isTestProcessEnvironment([
            "XCTestBundlePath": "/tmp/themTests.xctest",
        ]))
    }

    func testOrdinaryDebugAppEnvironmentIsNotMistakenForTestProcess() {
        XCTAssertFalse(IOThemRuntime.isTestProcessEnvironment([
            "HOME": "/Users/writer",
            "XCODE_RUNNING_FOR_PREVIEWS": "0",
        ]))
    }

    func testStudioEvalRequiresExactOptInArgument() {
        XCTAssertTrue(IOThemRuntime.isStudioEvalArguments([
            "/Applications/them.app/Contents/MacOS/them",
            "--studio-eval",
        ]))
        XCTAssertFalse(IOThemRuntime.isStudioEvalArguments([
            "/Applications/them.app/Contents/MacOS/them",
            "--studio-eval-disabled",
        ]))
    }

    func testStudioAutomationRequiresAnExplicitEvalOrUITestMarker() {
        XCTAssertFalse(IOThemRuntime.isStudioAutomationArguments([
            "/Applications/them.app/Contents/MacOS/them",
        ]))
        XCTAssertTrue(IOThemRuntime.isStudioAutomationArguments([
            "/Applications/them.app/Contents/MacOS/them",
            "--studio-eval",
        ]))
        XCTAssertTrue(IOThemRuntime.isStudioAutomationArguments([
            "/Applications/them.app/Contents/MacOS/them",
            "--ui-testing",
        ]))
    }

    func testStudioAutomationTargetRequiresExactMarkerAndSessionID() {
        let environment = [
            IOThemRuntime.studioAutomationSessionIDEnvironmentKey: "restore-smoke-42",
        ]

        XCTAssertTrue(IOThemRuntime.studioAutomationTargetMatches(
            "restore-smoke-42",
            arguments: ["them", "--studio-eval"],
            environment: environment
        ))
        XCTAssertFalse(IOThemRuntime.studioAutomationTargetMatches(
            "restore-smoke-41",
            arguments: ["them", "--studio-eval"],
            environment: environment
        ))
        XCTAssertFalse(IOThemRuntime.studioAutomationTargetMatches(
            "restore-smoke-42",
            arguments: ["them", "--studio-eval-disabled"],
            environment: environment
        ))
    }

    func testStudioAutomationTargetFailsClosedForMissingOrInvalidSessionID() {
        XCTAssertFalse(IOThemRuntime.studioAutomationTargetMatches(
            "restore-smoke-42",
            arguments: ["them", "--ui-testing"],
            environment: [:]
        ))
        XCTAssertNil(IOThemRuntime.studioAutomationSessionID(
            arguments: ["them", "--studio-eval"],
            environment: [IOThemRuntime.studioAutomationSessionIDEnvironmentKey: "invalid/session"]
        ))
        XCTAssertTrue(IOThemRuntime.studioAutomationTargetMatches(
            "",
            arguments: ["them", "--ui-testing"],
            environment: [:]
        ))
    }

    func testTargetedStudioEvalRetainsItsImmutableLaunchIdentity() {
        let environment = [
            IOThemRuntime.studioAutomationSessionIDEnvironmentKey: "restore-smoke-42",
        ]

        XCTAssertTrue(IOThemRuntime.studioAutomationProcessCanConsumeCommands(
            targetSessionID: "",
            arguments: ["them", "--studio-eval"],
            environment: environment
        ))
        XCTAssertFalse(IOThemRuntime.studioAutomationProcessCanConsumeCommands(
            targetSessionID: "restore-smoke-42",
            arguments: ["them", "--ui-testing"],
            environment: [:]
        ))
        XCTAssertFalse(IOThemRuntime.studioAutomationProcessCanConsumeCommands(
            targetSessionID: "restore-smoke-42",
            arguments: ["them", "--studio-eval"],
            environment: [:]
        ))
    }

    func testAutomationOutboxRootUsesTmpOnlyForExplicitAutomation() {
        let temporaryRoot = URL(fileURLWithPath: "/tmp", isDirectory: true)
        let environment = [
            IOThemRuntime.studioAutomationSessionIDEnvironmentKey: "restore-smoke-42",
        ]

        XCTAssertEqual(
            IOThemRuntime.automationOutboxRootURL(
                arguments: ["them", "--studio-eval"],
                environment: environment,
                temporaryRoot: temporaryRoot
            )?.path,
            "/tmp/io.them-automation/restore-smoke-42"
        )
        XCTAssertNil(IOThemRuntime.automationOutboxRootURL(
            arguments: ["them"],
            environment: environment,
            temporaryRoot: temporaryRoot
        ))
    }

    func testExplicitPreferenceArgumentsOverrideOnlyTheirExactKey() {
        let arguments = [
            "/Applications/them.app/Contents/MacOS/them",
            "--studio-eval",
            "-auth_signed_in", "true",
            "-auth_user_email=writer@example.com",
            "-auth_signed_in_disabled", "false",
        ]

        XCTAssertEqual(
            IOThemRuntime.explicitPreferenceArgumentValue(
                forKey: "auth_signed_in",
                arguments: arguments
            ),
            "true"
        )
        XCTAssertEqual(
            IOThemRuntime.explicitPreferenceArgumentValue(
                forKey: "auth_user_email",
                arguments: arguments
            ),
            "writer@example.com"
        )
        XCTAssertNil(
            IOThemRuntime.explicitPreferenceArgumentValue(
                forKey: "auth_debug_access_token",
                arguments: arguments
            )
        )
    }

    func testExplicitPreferenceArgumentWithoutAValueFailsClosed() {
        XCTAssertEqual(
            IOThemRuntime.explicitPreferenceArgumentValue(
                forKey: "auth_signed_in",
                arguments: [
                    "/Applications/them.app/Contents/MacOS/them",
                    "-auth_signed_in",
                    "--studio-eval",
                ]
            ),
            ""
        )
    }
}
