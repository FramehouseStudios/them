import SwiftUI
import AVFoundation
import os

@main
struct themApp: App {
    init() {
        #if DEBUG
        UITestLaunchConfiguration.applyIfNeeded()
        #endif

        #if DEBUG || os(macOS)
        #if os(macOS)
        let launchProbeValue = String(Int(Date().timeIntervalSince1970 * 1000))
        UserDefaults.standard.set(launchProbeValue, forKey: "studio_debug_launch_probe")
        UserDefaults.standard.synchronize()
        let launchProbeMirrorDomain = "io.them.them"
        let appDefaultsDomain = Bundle.main.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines)
        if launchProbeMirrorDomain != appDefaultsDomain {
            UserDefaults(suiteName: launchProbeMirrorDomain)?.set(launchProbeValue, forKey: "studio_debug_launch_probe")
            UserDefaults(suiteName: launchProbeMirrorDomain)?.synchronize()
        }
        _ = StudioDebugDefaultsBridge.shared
        #endif
        #endif
        configureAudioSession()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }

    private func configureAudioSession() {
        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP]
            )
            try session.setActive(true)
            HerLog.audio.info("Audio session configured")
        } catch {
            HerLog.audio.error("Audio session setup failed: \(error.localizedDescription)")
        }
        #endif
    }
}
