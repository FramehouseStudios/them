import Foundation

/// Converts a changing realtime transcript into bounded, ordered writing work.
///
/// Realtime speech recognition commonly revises the last few words. Live Write
/// therefore emits only text that has either survived a later partial or has
/// remained unchanged for a short stability window. The final transcript then
/// supplies any remainder and explicitly reports a revision when recognition
/// changed text that was already exposed provisionally.
struct ClementineLiveWriteTranscriptStabilizer: Equatable {
    struct Configuration: Equatable {
        var stableInterval: TimeInterval = 0.8
        var minimumUnpunctuatedWords = 8
    }

    enum Finalization: Equatable {
        case append(String)
        case complete
        case reconcile(fullTranscript: String)
    }

    private(set) var latestPartial = ""
    private(set) var emittedPrefix = ""
    private(set) var latestPartialChangedAt: TimeInterval?

    let configuration: Configuration

    init(configuration: Configuration = Configuration()) {
        self.configuration = configuration
    }

    mutating func observePartial(
        _ transcript: String,
        at timestamp: TimeInterval
    ) -> String? {
        let clean = Self.normalized(transcript)
        guard !clean.isEmpty else { return nil }

        let previous = latestPartial
        if clean != previous {
            latestPartial = clean
            latestPartialChangedAt = timestamp
        }

        guard !previous.isEmpty else { return nil }
        let shared = Self.commonWordPrefix(previous, clean)
        guard let safePrefix = Self.lastCompleteSentence(in: shared) else { return nil }
        return consume(prefix: safePrefix)
    }

    mutating func emitStablePartial(at timestamp: TimeInterval) -> String? {
        guard let changedAt = latestPartialChangedAt,
              timestamp - changedAt + 0.000_001 >= configuration.stableInterval else {
            return nil
        }

        let safePrefix = Self.lastCompleteSentence(in: latestPartial)
            ?? Self.longUnpunctuatedPrefix(
                latestPartial,
                minimumWords: configuration.minimumUnpunctuatedWords
            )
        guard let safePrefix else { return nil }
        return consume(prefix: safePrefix)
    }

    mutating func finalize(_ transcript: String) -> Finalization {
        let clean = Self.normalized(transcript)
        defer { reset() }

        guard !clean.isEmpty else {
            return emittedPrefix.isEmpty ? .complete : .reconcile(fullTranscript: "")
        }
        guard !emittedPrefix.isEmpty else { return .append(clean) }
        guard clean == emittedPrefix || clean.hasPrefix(emittedPrefix + " ") else {
            return .reconcile(fullTranscript: clean)
        }
        guard clean.count > emittedPrefix.count else { return .complete }

        let remainder = clean.dropFirst(emittedPrefix.count)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return remainder.isEmpty ? .complete : .append(remainder)
    }

    mutating func reset() {
        latestPartial = ""
        emittedPrefix = ""
        latestPartialChangedAt = nil
    }

    private mutating func consume(prefix: String) -> String? {
        let clean = Self.normalized(prefix)
        guard !clean.isEmpty else { return nil }
        guard emittedPrefix.isEmpty || clean.hasPrefix(emittedPrefix) else { return nil }

        let next = clean.dropFirst(emittedPrefix.count)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !next.isEmpty else { return nil }
        emittedPrefix = clean
        return next
    }

    private static func normalized(_ source: String) -> String {
        source
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func commonWordPrefix(_ lhs: String, _ rhs: String) -> String {
        let leftWords = normalized(lhs).split(separator: " ")
        let rightWords = normalized(rhs).split(separator: " ")
        let sharedCount = zip(leftWords, rightWords)
            .prefix(while: { $0 == $1 })
            .count
        return leftWords.prefix(sharedCount).joined(separator: " ")
    }

    private static func lastCompleteSentence(in source: String) -> String? {
        let clean = normalized(source)
        guard let boundary = clean.lastIndex(where: { ".!?".contains($0) }) else {
            return nil
        }
        return normalized(String(clean[...boundary]))
    }

    private static func longUnpunctuatedPrefix(
        _ source: String,
        minimumWords: Int
    ) -> String? {
        let words = normalized(source).split(separator: " ")
        guard words.count >= max(1, minimumWords) else { return nil }
        return words.joined(separator: " ")
    }
}

struct ClementineLiveWriteScope: Codable, Equatable {
    let ownerUserID: String
    let projectID: String

    var storageKeySuffix: String? {
        let owner = ownerUserID.trimmingCharacters(in: .whitespacesAndNewlines)
        let project = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !owner.isEmpty, !project.isEmpty else { return nil }
        return "\(owner.utf8.count):\(owner)\(project.utf8.count):\(project)"
    }

    var isValid: Bool { storageKeySuffix != nil }
}

struct ClementineLiveWriteRenderQueue: Equatable {
    struct Chunk: Codable, Equatable, Identifiable {
        let id: UUID
        let transcript: String

        init(id: UUID = UUID(), transcript: String) {
            self.id = id
            self.transcript = transcript
        }
    }

    private(set) var active: Chunk?
    private(set) var pending: [Chunk] = []
    private var knownChunkIDs: Set<UUID> = []

    var isEmpty: Bool {
        active == nil && pending.isEmpty
    }

    var recoverableChunks: [Chunk] {
        (active.map { [$0] } ?? []) + pending
    }

    @discardableResult
    mutating func enqueue(_ transcript: String, id: UUID = UUID()) -> Chunk? {
        let clean = transcript
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, knownChunkIDs.insert(id).inserted else { return nil }
        let chunk = Chunk(id: id, transcript: clean)
        pending.append(chunk)
        return chunk
    }

    mutating func beginNext() -> Chunk? {
        guard active == nil, !pending.isEmpty else { return nil }
        active = pending.removeFirst()
        return active
    }

    @discardableResult
    mutating func finishActive(id: UUID) -> Bool {
        guard let activeChunk = active, activeChunk.id == id else { return false }
        knownChunkIDs.remove(activeChunk.id)
        active = nil
        return true
    }

    @discardableResult
    mutating func deferActive(id: UUID) -> Bool {
        guard let activeChunk = active, activeChunk.id == id else { return false }
        active = nil
        pending.insert(activeChunk, at: 0)
        return true
    }

    mutating func cancelAll() {
        active = nil
        pending.removeAll()
        knownChunkIDs.removeAll()
    }

    mutating func restore(_ chunks: [Chunk]) {
        cancelAll()
        for chunk in chunks { _ = enqueue(chunk.transcript, id: chunk.id) }
    }
}

@MainActor
final class ClementineLiveWriteCoordinator {
    typealias Render = @MainActor (ClementineLiveWriteRenderQueue.Chunk) async -> Bool

    private var stabilizer = ClementineLiveWriteTranscriptStabilizer()
    private var renderQueue = ClementineLiveWriteRenderQueue()
    private var workerTask: Task<Void, Never>?
    private let pendingStore: ClementineLiveWritePendingStore
    private(set) var activeScope: ClementineLiveWriteScope?
    private var expectedEditorCommitID: UUID?
    var detachedPreviewBaseDraft: String?
    private(set) var pendingJournalIsDurable = true

    init(pendingStore: ClementineLiveWritePendingStore? = nil) {
        self.pendingStore = pendingStore ?? ClementineLiveWritePendingStore()
    }

    var latestPartial: String { stabilizer.latestPartial }
    var hasDetachedPreview: Bool { detachedPreviewBaseDraft != nil }
    var editorCommitRequestID: UUID? { expectedEditorCommitID }

    func expectEditorCommit(_ id: UUID?) { expectedEditorCommitID = id }

    func waitForExpectedEditorCommit(
        committedID: @escaping @MainActor () -> UUID?
    ) async -> Bool {
        guard let expectedEditorCommitID else { return false }
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .seconds(3))
        while !Task.isCancelled, clock.now < deadline {
            if committedID() == expectedEditorCommitID {
                self.expectedEditorCommitID = nil
                return true
            }
            try? await Task.sleep(for: .milliseconds(25))
        }
        return false
    }

    func observePartial(_ transcript: String) {
        _ = stabilizer.observePartial(transcript, at: Date().timeIntervalSinceReferenceDate)
    }

    func resume(
        scope: ClementineLiveWriteScope,
        onScopeChange: @MainActor () -> Void = {}
    ) -> Bool {
        guard scope.isValid else { return false }
        activate(scope: scope, onScopeChange: onScopeChange)
        return !renderQueue.isEmpty
    }

    @discardableResult
    func finalize(
        _ transcript: String,
        scope: ClementineLiveWriteScope,
        onScopeChange: @MainActor () -> Void = {}
    ) -> Bool {
        guard scope.isValid else { return false }
        activate(scope: scope, onScopeChange: onScopeChange)
        stabilizer.reset()
        let inserted = renderQueue.enqueue(transcript) != nil
        persistPending()
        return inserted
    }

    func startWorkerIfNeeded(render: @escaping Render, onPause: @escaping @MainActor () -> Void) {
        guard workerTask == nil else { return }
        workerTask = Task { @MainActor [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                guard let chunk = renderQueue.beginNext() else { break }
                persistPending()
                guard await render(chunk) else {
                    if !Task.isCancelled {
                        _ = renderQueue.deferActive(id: chunk.id)
                        persistPending()
                        workerTask = nil
                        onPause()
                    }
                    return
                }
                _ = renderQueue.finishActive(id: chunk.id)
                persistPending()
            }
            workerTask = nil
            if !renderQueue.isEmpty { startWorkerIfNeeded(render: render, onPause: onPause) }
        }
    }

    func cancel() {
        workerTask?.cancel()
        workerTask = nil
        expectedEditorCommitID = nil
        stabilizer.reset()
        if let active = renderQueue.active { _ = renderQueue.deferActive(id: active.id) }
        persistPending()
        detachedPreviewBaseDraft = nil
    }

    private func activate(scope: ClementineLiveWriteScope, onScopeChange: @MainActor () -> Void) {
        guard activeScope != scope else { return }
        if activeScope != nil {
            onScopeChange()
            cancel()
        }
        activeScope = scope
        renderQueue.restore(pendingStore.load(scope: scope))
    }

    private func persistPending() {
        guard let activeScope else { return }
        pendingJournalIsDurable = pendingStore.save(renderQueue.recoverableChunks, scope: activeScope)
    }
}

enum ClementineLiveWriteRendering {
    static func approvedStoryDirection(from context: String) -> String {
        let clean = context.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return "" }
        let paragraphs = clean.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let draftable = paragraphs.filter {
            let lower = $0.lowercased()
            return !$0.hasSuffix("?") && !lower.hasPrefix("what ")
                && !lower.hasPrefix("how ") && !lower.hasPrefix("why ")
        }
        let preferred = draftable.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return preferred.isEmpty ? clean : preferred
    }

    static func renderTranscript(userMessage: String, confirmedContext: String?, forcePage: Bool) -> String {
        let user = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let context = approvedStoryDirection(from: confirmedContext ?? "")
        guard !user.isEmpty else { return context }
        if forcePage && context.isEmpty {
            return """
            Write this directly into screenplay pages now. Maintain continuity with the existing draft and output screenplay text only.

            \(user)
            """
        }
        guard !context.isEmpty else { return user }
        return """
        Write this approved story direction directly into screenplay pages now. Maintain continuity with the existing draft and output screenplay text only.

        \(context)
        """
    }

    static func placeholderLine(from source: String) -> String? {
        var text = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let patterns = [
            #"(?i)^write\s+(?:the\s+)?(?:next\s+beat|next\s+moment|next\s+scene|this|that|it)\s+(?:where\s+)?"#,
            #"(?i)^write\s+(?:where\s+)?"#, #"(?i)^continue\s+(?:the\s+scene\s+)?(?:where\s+)?"#,
            #"(?i)^what\s+if\s+"#, #"(?i)^maybe\s+"#, #"(?i)^have\s+(?:her|him|them)\s+"#,
            #"(?i)^let\s+(?:her|him|them)\s+"#,
            #"(?i)^(?:put\s+this\s+in(?:to)?\s+the\s+draft|work\s+this\s+into\s+the\s+scene|weave\s+this\s+in)\s*"#
        ]
        for pattern in patterns {
            text = text.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        for pattern in [#"(?i)^(?:she|he|they)\s+should\s+"#, #"(?i)^(?:she|he|they)\s+could\s+"#, #"[?!.]+\s*$"#] {
            text = text.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
        }
        text = text.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        return text.count > 180 ? String(text.prefix(180)).trimmingCharacters(in: .whitespacesAndNewlines) : text
    }

    static func sanitizedReply(_ reply: String) -> String {
        var clean = reply
            .replacingOccurrences(of: "\\r\\n", with: "\n")
            .replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.hasPrefix("```") {
            clean = clean.replacingOccurrences(of: #"^```[A-Za-z0-9_-]*\s*"#, with: "", options: .regularExpression)
            clean = clean.replacingOccurrences(of: #"\s*```$"#, with: "", options: .regularExpression)
        }
        return clean.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
