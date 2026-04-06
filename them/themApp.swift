import SwiftUI
import AVFoundation
import os

@main
struct themApp: App {
    init() {
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
