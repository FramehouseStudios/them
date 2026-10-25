import XCTest
@testable import them

final class ClementineVoiceSettingsBargeInTests: XCTestCase {
    private func freshDefaults() -> UserDefaults {
        let suite = "ClementineVoiceSettingsBargeInTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    func test_barge_in_is_on_by_default_on_device() {
        XCTAssertTrue(ClementineVoiceSettings.bargeInEnabled(defaults: freshDefaults(), isSimulator: false))
    }

    func test_barge_in_is_off_by_default_on_the_simulator_which_has_no_echo_cancellation() {
        XCTAssertFalse(ClementineVoiceSettings.bargeInEnabled(defaults: freshDefaults(), isSimulator: true))
    }

    func test_explicit_setting_wins_in_both_directions() {
        let defaults = freshDefaults()
        defaults.set(true, forKey: ClementineVoiceSettings.bargeInEnabledKey)
        XCTAssertTrue(ClementineVoiceSettings.bargeInEnabled(defaults: defaults, isSimulator: true))
        defaults.set(false, forKey: ClementineVoiceSettings.bargeInEnabledKey)
        XCTAssertFalse(ClementineVoiceSettings.bargeInEnabled(defaults: defaults, isSimulator: false))
    }

    func test_non_bool_values_do_not_count_as_an_override() {
        let defaults = freshDefaults()
        defaults.set("yes", forKey: ClementineVoiceSettings.bargeInEnabledKey)
        XCTAssertFalse(ClementineVoiceSettings.bargeInEnabled(defaults: defaults, isSimulator: true))
        XCTAssertTrue(ClementineVoiceSettings.bargeInEnabled(defaults: defaults, isSimulator: false))
    }
}
