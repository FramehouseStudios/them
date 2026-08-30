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
