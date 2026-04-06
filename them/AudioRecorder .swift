import Foundation
import AVFoundation

final class AudioRecorder {

    private var recorder: AVAudioRecorder?

    func startRecording() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("them_recording_\(UUID().uuidString).m4a")

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder?.prepareToRecord()
        recorder?.record()

        return url
    }

    func stopRecording() -> URL? {
        recorder?.stop()
        let url = recorder?.url
        recorder = nil
        return url
    }
}

