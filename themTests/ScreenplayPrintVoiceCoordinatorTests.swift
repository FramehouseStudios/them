import XCTest
@testable import them

@MainActor
final class ScreenplayPrintVoiceCoordinatorTests: XCTestCase {
    private final class FakePrinter {
        var enabled = true
        var rememberedPrinter: String? = "Studio Printer"
        var formatIssue: String?
        var rememberedPrints: [(draft: String, title: String)] = []
        var pickerPrints: [(draft: String, title: String)] = []
        var pickerResult: String? = "Hallway Printer"
        var rememberedResult = true

        func pipeline() -> ScreenplayPrintPipeline {
            ScreenplayPrintPipeline(
                isEnabled: { self.enabled },
                currentTitle: { "The Missing Reel" },
                rememberedPrinterName: { self.rememberedPrinter },
                formatIssue: { _ in self.formatIssue },
                pageCount: { draft in max(1, draft.components(separatedBy: "\n").count / 55 + 1) },
                printToRememberedPrinter: { draft, title in
                    self.rememberedPrints.append((draft, title))
                    return self.rememberedResult
                },
                pickPrinterAndPrint: { draft, title in
                    self.pickerPrints.append((draft, title))
                    return self.pickerResult
                }
            )
        }
    }

    private let draft = "INT. KITCHEN - DAY\n\nMaya enters.\n\nMAYA\nWe need to talk."

    private func makeCoordinator(_ fake: FakePrinter, window: TimeInterval = 0.05) -> ScreenplayPrintVoiceCoordinator {
        let coordinator = ScreenplayPrintVoiceCoordinator(pipeline: fake.pipeline())
        coordinator.confirmationWindow = window
        coordinator.noticeLifetime = 0
        return coordinator
    }

    private func settle(_ seconds: TimeInterval) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    // MARK: - Phrase matching

    func testMatchesPrintPhrasesWithAndWithoutWakeWord() {
        XCTAssertEqual(ScreenplayPrintVoiceCommand.match(normalized: "print the script"), .print(alternate: false))
        XCTAssertEqual(ScreenplayPrintVoiceCommand.match(normalized: "clementine print the script"), .print(alternate: false))
        XCTAssertEqual(ScreenplayPrintVoiceCommand.match(normalized: "hey clementine print my draft."), .print(alternate: false))
        XCTAssertEqual(ScreenplayPrintVoiceCommand.match(normalized: "print somewhere else"), .print(alternate: true))
        XCTAssertEqual(ScreenplayPrintVoiceCommand.match(normalized: "clementine pick a printer"), .print(alternate: true))
        XCTAssertEqual(ScreenplayPrintVoiceCommand.match(normalized: "cancel"), .cancel)
        XCTAssertEqual(ScreenplayPrintVoiceCommand.match(normalized: "stop printing"), .cancel)
    }

    func testDoesNotMatchDialogueThatMentionsPrinting() {
        XCTAssertNil(ScreenplayPrintVoiceCommand.match(normalized: "she prints the photo and slides it across"))
        XCTAssertNil(ScreenplayPrintVoiceCommand.match(normalized: "the script is on the printer"))
        XCTAssertNil(ScreenplayPrintVoiceCommand.match(normalized: "cancel the wedding"))
        XCTAssertNil(ScreenplayPrintVoiceCommand.match(normalized: ""))
    }

    // MARK: - Remembered printer path

    func testRememberedPrinterAnnouncesThenSpoolsAfterWindow() async {
        let fake = FakePrinter()
        let coordinator = makeCoordinator(fake)

        let feedback = coordinator.handlePrint(alternate: false, draft: draft)

        XCTAssertFalse(feedback.isError)
        XCTAssertTrue(feedback.shouldSpeakConfirmation)
        XCTAssertEqual(feedback.confirmation, "Printing 1 page to Studio Printer — say cancel to stop.")
        XCTAssertEqual(coordinator.pending, .init(pages: 1, printerName: "Studio Printer", title: "The Missing Reel"))
        XCTAssertTrue(fake.rememberedPrints.isEmpty, "must not spool before the cancel window closes")

        await settle(0.3)

        XCTAssertNil(coordinator.pending)
        XCTAssertEqual(fake.rememberedPrints.count, 1)
        XCTAssertEqual(fake.rememberedPrints.first?.title, "The Missing Reel")
        XCTAssertEqual(fake.rememberedPrints.first?.draft, draft)
        XCTAssertEqual(coordinator.notice, "Printing 1 page to Studio Printer.")
    }

    func testCancelInsideWindowStopsTheSpool() async {
        let fake = FakePrinter()
        let coordinator = makeCoordinator(fake, window: 0.2)

        _ = coordinator.handlePrint(alternate: false, draft: draft)
        XCTAssertTrue(coordinator.isPending)
        XCTAssertTrue(coordinator.cancel())
        XCTAssertFalse(coordinator.isPending)
        XCTAssertEqual(coordinator.notice, "Cancelled printing.")

        await settle(0.4)

        XCTAssertTrue(fake.rememberedPrints.isEmpty)
        XCTAssertFalse(coordinator.cancel(), "nothing left to cancel")
    }

    func testUnreachablePrinterSuggestsPrintingSomewhereElse() async {
        let fake = FakePrinter()
        fake.rememberedResult = false
        let coordinator = makeCoordinator(fake)

        _ = coordinator.handlePrint(alternate: false, draft: draft)
        await settle(0.3)

        XCTAssertEqual(fake.rememberedPrints.count, 1)
        XCTAssertEqual(coordinator.notice, "Couldn't reach Studio Printer — say \"print somewhere else\" to pick another printer.")
    }

    // MARK: - Picker path

    func testFirstPrintWithNoRememberedPrinterOpensPicker() async {
        let fake = FakePrinter()
        fake.rememberedPrinter = nil
        let coordinator = makeCoordinator(fake)

        let feedback = coordinator.handlePrint(alternate: false, draft: draft)

        XCTAssertFalse(feedback.isError)
        XCTAssertEqual(feedback.confirmation, "Pick a printer for 1 page — I'll remember it for next time.")
        XCTAssertNil(coordinator.pending)
        await settle(0.1)
        XCTAssertEqual(fake.pickerPrints.count, 1)
        XCTAssertTrue(fake.rememberedPrints.isEmpty)
        XCTAssertEqual(coordinator.notice, "Printing 1 page to Hallway Printer.")
    }

    func testPrintSomewhereElseBypassesRememberedPrinter() async {
        let fake = FakePrinter()
        let coordinator = makeCoordinator(fake)

        _ = coordinator.handlePrint(alternate: true, draft: draft)
        await settle(0.1)

        XCTAssertEqual(fake.pickerPrints.count, 1)
        XCTAssertTrue(fake.rememberedPrints.isEmpty)
    }

    func testDismissedPickerReportsCancelled() async {
        let fake = FakePrinter()
        fake.pickerResult = nil
        let coordinator = makeCoordinator(fake)

        _ = coordinator.handlePrint(alternate: true, draft: draft)
        await settle(0.1)

        XCTAssertEqual(coordinator.notice, "Printing cancelled.")
    }

    // MARK: - Gates

    func testEmptyDraftIsAnError() {
        let fake = FakePrinter()
        let coordinator = makeCoordinator(fake)
        let feedback = coordinator.handlePrint(alternate: false, draft: "   \n")
        XCTAssertTrue(feedback.isError)
        XCTAssertEqual(feedback.confirmation, "There's nothing on the page to print yet.")
        XCTAssertNil(coordinator.pending)
    }

    func testFormatIssueBlocksPrinting() {
        let fake = FakePrinter()
        fake.formatIssue = "Format check failed — fix orphan dialogue before final print."
        let coordinator = makeCoordinator(fake)
        let feedback = coordinator.handlePrint(alternate: false, draft: draft)
        XCTAssertTrue(feedback.isError)
        XCTAssertEqual(feedback.confirmation, fake.formatIssue)
        XCTAssertNil(coordinator.pending)
    }

    func testDisabledFeatureIsAnError() {
        let fake = FakePrinter()
        fake.enabled = false
        let coordinator = makeCoordinator(fake)
        let feedback = coordinator.handlePrint(alternate: false, draft: draft)
        XCTAssertTrue(feedback.isError)
        XCTAssertEqual(feedback.confirmation, "Printing isn't enabled in this build.")
    }

    func testLongScriptNeverSpoolsSilently() async {
        let fake = FakePrinter()
        let coordinator = makeCoordinator(fake)
        coordinator.maxSilentPages = 50
        let longDraft = Array(repeating: "Maya waits.", count: 55 * 60).joined(separator: "\n")

        let feedback = coordinator.handlePrint(alternate: false, draft: longDraft)

        XCTAssertFalse(feedback.isError)
        XCTAssertEqual(feedback.confirmation, "That's 61 pages — confirm the printer before I send it.")
        XCTAssertNil(coordinator.pending, "no silent countdown for a feature-length print")
        await settle(0.3)
        XCTAssertTrue(fake.rememberedPrints.isEmpty)
        XCTAssertEqual(fake.pickerPrints.count, 1)
    }

    func testSecondPrintCommandReplacesPendingOne() async {
        let fake = FakePrinter()
        let coordinator = makeCoordinator(fake, window: 0.1)

        _ = coordinator.handlePrint(alternate: false, draft: draft)
        _ = coordinator.handlePrint(alternate: false, draft: draft)
        await settle(0.4)

        XCTAssertEqual(fake.rememberedPrints.count, 1, "the first pending print is superseded, not doubled")
    }
}
