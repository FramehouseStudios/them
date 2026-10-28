import Foundation

/// One canonical normalization for both immediate and streamed incoming turns.
/// Publication remains on the owning bridge after its document lease passes.
nonisolated struct ScreenplayIncomingVoiceTurn {
    let text: String
    let pack: String
    let phase: String
    let projectID: String
    let versionID: String
    let transcript: String
    var key: String { [text, pack, phase, projectID, versionID].joined(separator: "|") }

    init(_ text: String, pack: String, phase: String, projectID: String, versionID: String, transcript: String) {
        self.text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        self.pack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        self.phase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        self.projectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.versionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.transcript = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
