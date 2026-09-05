import SwiftUI
import AVFoundation
import os

@main
struct themApp: App {
    init() {
        #if DEBUG
        UITestLaunchConfiguration.applyIfNeeded()
        #endif

        #if DEBUG
        #if os(macOS)
        if IOThemRuntime.isStudioEvalSession {
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
        }
        #endif
        #endif
        configureAudioSession()
        ClementinePackStore.startLaunchRecoveryIfNeeded()
    }

    var body: some Scene {
        WindowGroup {
            #if os(macOS)
            ContentView()
                .frame(minWidth: 1_200, minHeight: 800)
            #else
            ContentView()
            #endif
        }
        #if os(macOS)
        .defaultSize(width: 1_360, height: 860)
        .windowResizability(.contentMinSize)
        .commands {
            ThemWorkspaceCommands()
        }
        #endif
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
