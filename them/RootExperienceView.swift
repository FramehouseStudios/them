import SwiftUI
import DraftStudio
import ScreenplayStudio
import os
import AVFoundation
import CryptoKit
import UniformTypeIdentifiers
import Combine
import Speech
#if os(macOS)
import AppKit
import CoreGraphics
import Darwin
import ScreenCaptureKit
#endif
#if os(iOS)
import UIKit
#endif

private extension View {
    @ViewBuilder
    func themDesktopSheetFrame(minWidth: CGFloat, minHeight: CGFloat) -> some View {
        #if os(macOS)
        frame(minWidth: minWidth, minHeight: minHeight)
        #else
        self
        #endif
    }
}

private enum BackendConnectionState: String {
    case checking
    case up
    case reconnecting
}

private struct DebugBundleSnapshot: Codable {
    let generatedAtISO8601: String
    let appBundleID: String
    let appVersion: String
    let appBuild: String
    let platform: String
    let visualContextEnabled: Bool
    let visualContextStatus: String
    let lastVisualContextError: String
    let voiceTransportMode: String
    let realtimePreviewStatus: String
    let realtimePreviewLive: Bool
    let lastRealtimeCommitTurnId: String
    let lastRealtimeCommitError: String
    let connectionState: String
    let backendFailureCount: Int
    let isTurnSubmitting: Bool
    let localStateVersion: String
    let lastIssueSummary: String
    let diagnosticsSummary: String
    let speculative: DebugBundleSpeculativeSnapshot
    let backendHealth: DebugBundleHealthSnapshot?
    let backendRoutes: DebugBundleRoutesSnapshot?
    let backendTalkDiagnostics: DebugBundleTalkDiagnosticsSnapshot?
    let clientLatency: DebugBundleClientLatencySnapshot
    let backendSync: DebugBundleSyncSnapshot
}

private struct DebugBundleSpeculativeSnapshot: Codable {
    let silenceWindowTriggerCount: Int
    let backendPrepareAttemptCount: Int
    let backendPrepareSuccessCount: Int
    let compatiblePreparedPromptReuseCount: Int
    let lastCompatiblePreparedPromptReused: Bool
    let lastBackendReuseHit: Bool
    let lastSpeculativeKey: String
    let lastPreparedPromptHash: String
    let lastTriggerAt: TimeInterval
}

private struct DebugBundleHealthSnapshot: Codable {
    let ok: Bool
    let status: String
    let sessionId: String
    let stateVersion: String
    let backendBootId: String
    let backendBuild: String
    let lastTurnId: String
    let lastUpdatedAt: TimeInterval
    let historyUpdatedAt: TimeInterval
    let memoryUpdatedAt: TimeInterval
}

private struct DebugBundleRoutesSnapshot: Codable {
    let schemaVersion: Int
    let scope: String
    let total: Int
    let diagnosticsSummary: String
    let groups: [String]
    let routes: [BackendOpsRoute]
    let refreshedAtISO8601: String
    let lastError: String
}

private struct DebugBundleTalkDiagnosticsSnapshot: Codable {
    let statsSummary: String
    let errorSummary: String
    let refreshedAtISO8601: String
    let lastError: String
}

private struct DebugBundleClientLatencySnapshot: Codable {
    let sampleCount: Int
    let healthLevel: String
    let healthSummary: String
    let evaluatedMetricCount: Int
    let pendingMetricCount: Int
    let breaches: [ClementineLatencySLOBreach]
    let latestFirstTextMs: Double?
    let latestFirstAudioMs: Double?
    let latestBargeInAckMs: Double?
    let medianFirstTextMs: Double?
    let p95FirstTextMs: Double?
    let medianFirstAudioMs: Double?
    let p95FirstAudioMs: Double?
    let samples: [ClementineLatencySample]
}

private struct DebugBundleSyncSnapshot: Codable {
    let status: String
    let sessionId: String
    let schemaVersion: Int
    let backendBuild: String
    let backendBootId: String
    let lastTurnId: String
    let lastUpdatedAt: TimeInterval
    let historyUpdatedAt: TimeInterval
    let memoryUpdatedAt: TimeInterval
    let stateVersion: String
}

#if DEBUG || os(macOS)
private struct StudioDebugVoiceDraftBreadcrumb: Codable {
    let token: Int
    let event: String
    let detail: String
    let interruptionReason: String?
    let promptPreview: String
    let replyPreview: String
    let restorePreview: Bool?
    let timestampISO8601: String
}

private struct StudioDebugVoiceTurnResultSnapshot: Codable {
    let token: Int
    let status: String
    let error: String
    let prompt: String
    let turnID: String
    let preparedUseScreenplayMode: Bool
    let preparedShouldWriteToPage: Bool
    let preparedMemoryDomain: String
    let requestedScreenplayTarget: String
    let timingSource: String
    let screenplayOutputTarget: String
    let screenplayOutputSource: String
    let screenplayQualityReason: String
    let screenplayQualityConfidence: String
    let screenplayQualityFeatureAct: String
    let screenplayRepairAttempted: Bool
    let screenplayRepairOutcome: String
    let screenplayRepairMs: Int?
    let screenplayRepairReason: String
    let creativeMemoryApplied: Bool
    let creativeMemoryProjectID: String
    let creativeMemoryProjectTitle: String
    let creativeMemoryCharacterCount: Int
    let creativeMemoryEpisodicCount: Int
    let creativeMemoryCorrectionCount: Int
    let creativeMemoryCharacters: [String]
    let creativeMemoryCorrectedTerms: [String]
    let creativeMemoryCorrectionReplacements: [String]
    let creativeMemoryEpisodeSummaries: [String]
    let screenplayOutputText: String
    let screenplayCueCount: Int
    let screenplayCues: [BackendTalkScreenplayCue]
    let dialogueTimeline: BackendTalkDialogueTimelineRevision?
    let acknowledgedAtISO8601: String?
    let renderRequestID: String
    let renderServerFirstDeltaMs: Int?
    let renderServerTotalMs: Int?
    let insertedPreview: String
    let replyPreview: String
    let finalCommittedPageText: String
    let dispatchResolvedBaseURL: String
    let talkRequestURL: String
    let talkDispatchStage: String
    let clientTokenResolved: Bool
    let dispatchErrorDomain: String
    let dispatchErrorCode: Int?
    let dispatchErrorDescription: String
    let draftStartedAtISO8601: String?
    let headerTextCommittedAtISO8601: String?
    let commitAtISO8601: String?
    let firstAudioSegmentReadyAtISO8601: String?
    let playbackStartedAtISO8601: String?
    let playbackStartSource: String
    let playbackFinishedAtISO8601: String?
    let draftStartedBeforePlaybackFinished: Bool
    let committedWhileAssistantSpeaking: Bool
    let syncedInsertInterruptionReason: String
    let syncedVoicePhase: String
    let syncedVoiceAppliedCueCount: Int
    let syncedVoiceCueCount: Int
    let syncedVoiceCueDensified: Bool
    let syncedVoiceTimingSource: String
    let syncedVoiceFallbackCommitted: Bool
    let syncedVoiceFallbackReason: String
    let syncedVoicePlaybackDriftMs: Int
    let syncedVoiceActiveSegmentID: String?
    let syncedVoiceActiveSceneID: String
    let syncedVoiceActiveBeatID: String?
    let syncedVoiceActiveScriptNodeID: String
    let syncedVoiceSeekApplied: Bool
    let syncedVoiceSeekCount: Int
    let syncedVoiceSeekFromMs: Int?
    let syncedVoiceSeekToMs: Int?
    let syncedVoicePreviewReplyOnly: Bool
    let syncedVoiceSyncReady: Bool
    let syncedVoiceAuthoritativePageTextAvailable: Bool
    let breadcrumbs: [StudioDebugVoiceDraftBreadcrumb]
}

private struct StudioDebugLoadProjectRequest: Codable {
    let token: Int
    let projectID: String
    let versionID: String
}

private struct StudioDebugVoiceTurnRequest: Codable {
    let token: Int
    let prompt: String
    let projectID: String
}

#if os(macOS)
private let studioDebugPreferencesDomain = "io.them.them" as CFString
private let studioDebugLoadProjectRequestFilename = "them_studio_debug_load_project_request.json"
private let studioDebugLoadProjectRequestURLs: [URL] = {
    let fileManager = FileManager.default
    let hardcodedURL = URL(fileURLWithPath: "/tmp").appendingPathComponent(studioDebugLoadProjectRequestFilename)
    let temporaryURL = fileManager.temporaryDirectory.appendingPathComponent(studioDebugLoadProjectRequestFilename)
    let homeTemporaryURL = fileManager.homeDirectoryForCurrentUser
        .appendingPathComponent("tmp")
        .appendingPathComponent(studioDebugLoadProjectRequestFilename)
    var seen: Set<String> = []
    return [hardcodedURL, temporaryURL, homeTemporaryURL].filter { url in
        seen.insert(url.path).inserted
    }
}()
private let studioDebugLoadProjectRequestURL = studioDebugLoadProjectRequestURLs[0]
private let studioDebugVoiceTurnRequestURL = URL(fileURLWithPath: "/tmp/them_studio_debug_voice_turn_request.json")

private func studioDebugPreferenceDomains() -> [String] {
    var domains: [String] = []
    if let bundleID = Bundle.main.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines),
       !bundleID.isEmpty {
        domains.append(bundleID)
    }
    let fallbackDomain = String(studioDebugPreferencesDomain)
    if !domains.contains(fallbackDomain) {
        domains.append(fallbackDomain)
    }
    return domains
}

private func studioDebugSuiteDefaults(for domain: String) -> UserDefaults? {
    if let bundleID = Bundle.main.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines),
       domain == bundleID {
        return nil
    }
    return UserDefaults(suiteName: domain)
}

private func studioDebugPreferencePlistURLs(for domain: String) -> [URL] {
    let libraryURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library")
    let filename = domain.hasSuffix(".plist") ? domain : "\(domain).plist"
    return [
        libraryURL
            .appendingPathComponent("Containers")
            .appendingPathComponent(domain)
            .appendingPathComponent("Data/Library/Preferences")
            .appendingPathComponent(filename),
        libraryURL
            .appendingPathComponent("Preferences")
            .appendingPathComponent(filename),
    ]
}

private enum StudioDebugPreferenceSnapshot {
    private static let refreshInterval: TimeInterval = 0.35
    private static var cachedAt: TimeInterval = 0
    private static var cachedPlistValues: [String: [Any]] = [:]

    static func invalidate() {
        cachedAt = 0
        cachedPlistValues = [:]
    }

    static func plistValues(forKey key: String) -> [Any] {
        let now = Date().timeIntervalSinceReferenceDate
        if cachedAt == 0 || now - cachedAt > refreshInterval {
            cachedAt = now
            cachedPlistValues = buildPlistValues()
        }
        return cachedPlistValues[key] ?? []
    }

    private static func buildPlistValues() -> [String: [Any]] {
        var values: [String: [Any]] = [:]
        var seenFingerprints: [String: Set<String>] = [:]

        func append(_ value: Any, forKey key: String) {
            let fingerprint = "\(type(of: value))::\(String(describing: value))"
            var seen = seenFingerprints[key] ?? []
            guard seen.insert(fingerprint).inserted else { return }
            seenFingerprints[key] = seen
            values[key, default: []].append(value)
        }

        for domain in studioDebugPreferenceDomains() {
            for url in studioDebugPreferencePlistURLs(for: domain) {
                guard let dictionary = NSDictionary(contentsOf: url) else { continue }
                for (rawKey, value) in dictionary {
                    guard let key = rawKey as? String else { continue }
                    append(value, forKey: key)
                }
            }
        }

        return values
    }
}

private func studioDebugPreferenceValues(forKey key: String) -> [Any] {
    #if DEBUG
    if let fileValue = StudioDebugPreferenceFileBridge.value(forKey: key) {
        return [fileValue]
    }
    #endif
    var values: [Any] = []
    var seenFingerprints: Set<String> = []

    func append(_ value: Any?) {
        guard let value else { return }
        let fingerprint = "\(type(of: value))::\(String(describing: value))"
        guard seenFingerprints.insert(fingerprint).inserted else { return }
        values.append(value)
    }

    for value in StudioDebugPreferenceSnapshot.plistValues(forKey: key) {
        append(value)
    }

    for domain in studioDebugPreferenceDomains() {
        if let suite = studioDebugSuiteDefaults(for: domain) {
            suite.synchronize()
            append(suite.object(forKey: key))
        }
        let domainRef = domain as CFString
        CFPreferencesAppSynchronize(domainRef)
        append(CFPreferencesCopyAppValue(key as CFString, domainRef))
    }
    UserDefaults.standard.synchronize()
    append(UserDefaults.standard.object(forKey: key))
    return values
}

private func writeStudioDebugPreferenceInt(_ value: Int, forKey key: String) {
    #if DEBUG
    StudioDebugPreferenceFileBridge.write(value, forKey: key)
    #endif
    UserDefaults.standard.set(value, forKey: key)
    for domain in studioDebugPreferenceDomains() {
        if let suite = studioDebugSuiteDefaults(for: domain) {
            suite.set(value, forKey: key)
            suite.synchronize()
        }
        let domainRef = domain as CFString
        CFPreferencesSetAppValue(key as CFString, NSNumber(value: value), domainRef)
        CFPreferencesAppSynchronize(domainRef)
        mirrorStudioDebugPreferenceValue(NSNumber(value: value), forKey: key, domain: domain)
    }
    UserDefaults.standard.synchronize()
    StudioDebugPreferenceSnapshot.invalidate()
}

private func writeStudioDebugPreferenceString(_ value: String, forKey key: String) {
    #if DEBUG
    StudioDebugPreferenceFileBridge.write(value, forKey: key)
    #endif
    UserDefaults.standard.set(value, forKey: key)
    for domain in studioDebugPreferenceDomains() {
        if let suite = studioDebugSuiteDefaults(for: domain) {
            suite.set(value, forKey: key)
            suite.synchronize()
        }
        let domainRef = domain as CFString
        CFPreferencesSetAppValue(key as CFString, value as CFString, domainRef)
        CFPreferencesAppSynchronize(domainRef)
        mirrorStudioDebugPreferenceValue(value as NSString, forKey: key, domain: domain)
    }
    UserDefaults.standard.synchronize()
    StudioDebugPreferenceSnapshot.invalidate()
}

private func mirrorStudioDebugPreferenceValue(_ value: Any, forKey key: String, domain: String) {
    for url in studioDebugPreferencePlistURLs(for: domain) {
        let directoryURL = url.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        let dictionary = (NSMutableDictionary(contentsOf: url) ?? NSMutableDictionary())
        dictionary[key] = value
        dictionary.write(to: url, atomically: true)
    }
}

#if DEBUG
@MainActor
final class StudioDebugDefaultsBridge: ObservableObject {
    static let shared = StudioDebugDefaultsBridge()

    @Published private(set) var openToken: Int = 0
    @Published private(set) var loadProjectToken: Int = 0
    @Published private(set) var voiceTurnToken: Int = 0

    private var pollTask: Task<Void, Never>?

    init() {
        guard IOThemRuntime.isStudioAutomationSession else { return }
        noteLifecycle("polling_started")
        startPolling()
    }

    deinit {
        pollTask?.cancel()
    }

    private func startPolling() {
        guard IOThemRuntime.isStudioAutomationSession else { return }
        pollTask?.cancel()
        pollTask = Task { @MainActor in
            await Task.yield()
            try? await Task.sleep(nanoseconds: 50_000_000)
            while !Task.isCancelled {
                let nextOpenToken = Self.readInt(forKey: "studio_debug_open_token")
                if nextOpenToken != openToken {
                    openToken = nextOpenToken
                }

                let nextLoadProjectToken = Self.readInt(forKey: "studio_debug_load_project_token")
                if nextLoadProjectToken != loadProjectToken {
                    loadProjectToken = nextLoadProjectToken
                }

                let nextVoiceTurnToken = Self.readInt(forKey: "studio_debug_voice_turn_token")
                if nextVoiceTurnToken != voiceTurnToken {
                    voiceTurnToken = nextVoiceTurnToken
                }

                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
    }

    private func noteLifecycle(_ stage: String) {
        let cleanStage = stage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanStage.isEmpty else { return }
        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        writeStudioDebugPreferenceString(cleanStage, forKey: "studio_debug_lifecycle_stage")
        writeStudioDebugPreferenceInt(timestamp, forKey: "studio_debug_lifecycle_timestamp_ms")
    }

    private static func readInt(forKey key: String, fallback: Int = 0) -> Int {
        var bestValue: Int?
        for value in studioDebugPreferenceValues(forKey: key) {
            if let number = value as? NSNumber {
                let parsed = Int(number.int64Value)
                bestValue = max(bestValue ?? parsed, parsed)
                continue
            }
            if let string = value as? String,
               let parsed = Int(string.trimmingCharacters(in: .whitespacesAndNewlines)) {
                bestValue = max(bestValue ?? parsed, parsed)
            }
        }
        return bestValue ?? fallback
    }
}
#endif
#else
private func studioDebugPreferenceValues(forKey key: String) -> [Any] {
    guard let value = UserDefaults.standard.object(forKey: key) else { return [] }
    return [value]
}

private func writeStudioDebugPreferenceInt(_ value: Int, forKey key: String) {
    UserDefaults.standard.set(value, forKey: key)
}

private func writeStudioDebugPreferenceString(_ value: String, forKey key: String) {
    UserDefaults.standard.set(value, forKey: key)
}
#endif
#endif

private enum PrimarySurface: String {
    case home
    case studio
}

struct ClementineVisualContextEnvelope {
    let promptAddendum: String
    let summary: String
    let appName: String
    let windowTitle: String
    let source: String
    let capturedAt: Date
}

#if os(macOS)
struct ClementineCapturedVisualContext {
    let imageData: Data
    let mimeType: String
    let appName: String
    let windowTitle: String
    let source: String
}

enum ClementineVisualContextCaptureError: LocalizedError {
    case permissionRequired
    case noWindowFound
    case captureFailed
    case encodingFailed

    var errorDescription: String? {
        switch self {
        case .permissionRequired:
            return "Screen access is required for visual context."
        case .noWindowFound:
            return "No visible frontmost window was available to capture."
        case .captureFailed:
            return "Could not capture the frontmost window."
        case .encodingFailed:
            return "Could not compress the visual context image."
        }
    }
}

enum ClementineVisualContextCapture {
    static func hasScreenAccess() -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    @discardableResult
    @MainActor
    static func requestScreenAccess() -> Bool {
        if hasScreenAccess() { return true }
        return CGRequestScreenCaptureAccess()
    }

    static func permissionStatusText() -> String {
        hasScreenAccess()
            ? "Screen access granted. io.them can inspect the active window when visual context is enabled."
            : "Screen access is not granted yet. Enable it to let io.them see the active window."
    }

    @MainActor
    static func captureFrontmostWindowJPEG(
        maxPixelDimension: CGFloat = 1440,
        compression: CGFloat = 0.68
    ) async throws -> ClementineCapturedVisualContext {
        guard hasScreenAccess() else {
            throw ClementineVisualContextCaptureError.permissionRequired
        }
        guard let frontmostApp = NSWorkspace.shared.frontmostApplication else {
            throw ClementineVisualContextCaptureError.noWindowFound
        }

        let appName = frontmostApp.localizedName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let targetPID = frontmostApp.processIdentifier
        let shareableContent = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )
        let candidate = bestWindow(for: targetPID, windows: shareableContent.windows)
        let windowTitle = candidate?.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        let image: CGImage
        let source: String
        if let candidate {
            let configuration = SCStreamConfiguration()
            configuration.width = max(1, Int(candidate.frame.width.rounded()))
            configuration.height = max(1, Int(candidate.frame.height.rounded()))
            configuration.showsCursor = false
            configuration.scalesToFit = true
            configuration.ignoreShadowsSingleWindow = true
            image = try await captureImage(
                contentFilter: SCContentFilter(desktopIndependentWindow: candidate),
                configuration: configuration
            )
            source = "frontmost_window"
        } else if let display = shareableContent.displays.first {
            let configuration = SCStreamConfiguration()
            configuration.width = max(1, display.width)
            configuration.height = max(1, display.height)
            configuration.showsCursor = false
            configuration.ignoreShadowsDisplay = true
            image = try await captureImage(
                contentFilter: SCContentFilter(
                    display: display,
                    excludingApplications: [],
                    exceptingWindows: []
                ),
                configuration: configuration
            )
            source = "main_display"
        } else {
            throw ClementineVisualContextCaptureError.noWindowFound
        }

        guard let jpegData = jpegData(from: image, maxPixelDimension: maxPixelDimension, compression: compression) else {
            throw ClementineVisualContextCaptureError.encodingFailed
        }

        return ClementineCapturedVisualContext(
            imageData: jpegData,
            mimeType: "image/jpeg",
            appName: appName,
            windowTitle: windowTitle,
            source: source
        )
    }

    private static func bestWindow(
        for pid: pid_t,
        windows: [SCWindow]
    ) -> SCWindow? {
        let candidates = windows.filter { window in
            guard let ownerPID = window.owningApplication?.processID else {
                return false
            }
            return ownerPID == pid &&
                window.windowLayer == 0 &&
                window.isOnScreen &&
                window.frame.width >= 80 &&
                window.frame.height >= 80
        }
        return candidates.max { lhs, rhs in
            (lhs.frame.width * lhs.frame.height) < (rhs.frame.width * rhs.frame.height)
        }
    }

    private static func captureImage(
        contentFilter: SCContentFilter,
        configuration: SCStreamConfiguration
    ) async throws -> CGImage {
        try await withCheckedThrowingContinuation { continuation in
            SCScreenshotManager.captureImage(
                contentFilter: contentFilter,
                configuration: configuration
            ) { image, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let image else {
                    continuation.resume(throwing: ClementineVisualContextCaptureError.captureFailed)
                    return
                }
                continuation.resume(returning: image)
            }
        }
    }

    private static func jpegData(
        from cgImage: CGImage,
        maxPixelDimension: CGFloat,
        compression: CGFloat
    ) -> Data? {
        let width = CGFloat(cgImage.width)
        let height = CGFloat(cgImage.height)
        let scale = min(1, maxPixelDimension / max(width, height))
        let targetWidth = max(1, Int((width * scale).rounded()))
        let targetHeight = max(1, Int((height * scale).rounded()))
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: targetWidth,
            pixelsHigh: targetHeight,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: false,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else {
            return nil
        }

        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let image = NSImage(cgImage: cgImage, size: NSSize(width: width, height: height))
        image.draw(
            in: NSRect(x: 0, y: 0, width: CGFloat(targetWidth), height: CGFloat(targetHeight)),
            from: NSRect(origin: .zero, size: NSSize(width: width, height: height)),
            operation: .copy,
            fraction: 1
        )
        NSGraphicsContext.restoreGraphicsState()

        return bitmap.representation(
            using: .jpeg,
            properties: [.compressionFactor: compression]
        )
    }
}
#endif

struct ScreenplayRestoredLiveDraftProjectPromotionPolicy {
    static func shouldCreateProject(
        isStudioSurfaceActive: Bool,
        draft: String,
        existingProjectID: String,
        isAutoCreatingProject: Bool,
        createKey: String,
        lastCreateKey: String
    ) -> Bool {
        guard isStudioSurfaceActive else { return false }
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard existingProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard !isAutoCreatingProject else { return false }
        guard !createKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return createKey != lastCreateKey
    }
}

struct RootExperienceView: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    @State private var showPrompt = true
    @State private var isThinking = false
    @State private var transcript = ""
    @State private var livePartialTranscript = ""
    @State private var lastNonEmptyPartialTranscriptHint = ""
    @State private var recentTurnWindow: [(user: String, assistant: String)] = []
    @State private var recentTurnWindowHistoryUpdatedAt: TimeInterval = 0
    @State private var onboardingName = ""
    @State private var onboardingSceneSeed = ""
    @State private var isMagicMomentSubmitting = false
    @State private var magicMomentOnboardingError = ""
    @AppStorage("auth_signed_in") private var authSignedIn: Bool = false
    @AppStorage("auth_session_token_deletion_pending")
    private var authSessionTokenDeletionPending: Bool = false
    @AppStorage("t11.magic_moment_last_duration_ms") private var magicMomentLastDurationMs: Double = 0
    @AppStorage("t12.magic_moment_perceived_response_ms") private var magicMomentPerceivedResponseMs: Double = 0
    @State private var showingMemories = false
    @State private var showingConversationHistory = false
    @State private var showingNotes = false
    @State private var showingTasks = false
    @State private var primarySurface: PrimarySurface = .home
    @State private var uiTestForceStudioSurface = false
    @AppStorage(ThemWorkspaceSurfaceRestorePolicy.storageKey) private var persistedPrimarySurfaceRaw: String = ""
    @State private var showingRecap = false
    @State private var showingVoiceSettings = false
    @State private var showingCompanionControls = false
    @State private var showingDataControls = false
    @State private var showingTrustCenter = false
    @State private var showingProfileAccount = false
    @State private var resumeStudioAfterAccountSignIn = false
    @State private var isRestoringWorkspaceAuthSession = false
    @State private var studioOwnerUserIDSnapshot: String?
    @State private var studioWasAuthenticatedSnapshot: Bool?
    @State private var studioAccountIdentityGeneration = 0
    @State private var inFlightTalkTask: Task<Void, Never>?
    @State private var didBumpSessionThisLaunch = false
    @FocusState private var onboardingNameFocused: Bool
    @FocusState private var onboardingSceneFocused: Bool
    #if os(macOS)
    @State private var keyMonitor: Any?
    #endif

    @StateObject private var voice = HerVoiceController()
    @StateObject private var realtimeVoice = ClementineRealtimeCoordinator()
    @StateObject private var realtimeTransport = ClementineRealtimeWebViewBridge()
    @State private var realtimeGroundingRefreshTask: Task<Void, Never>?
    @State private var pendingRealtimeGroundingRevision = ""
    @State private var lastRealtimeGroundingRevision = ""
    @StateObject private var clientLatency = ClementineLatencyTelemetryStore.shared
    @StateObject private var evolution = HerEvolutionStore.shared
    @StateObject private var screenplayDraftBridge = ScreenplayLiveDraftBridge.shared

    @State private var backend = BackendClient()
    @State private var pageInterruptService: ClementinePageInterruptService?
    private let screenplayPromptBuilder = ScreenplayPromptBuilder()
    @StateObject private var orbAudio = OrbAudioDriver()
    @StateObject private var speculativeTalk = SpeculativeTalkEngine()
    @State private var promptSpeaker = PersonalityPromptSpeaker()
    @State private var typedReplySpeaker = StreamingSpeechPlayer()
    @State private var uiReflection = BackendTalkUIReflection.default
    @State private var lastClementineEmotionLane = "curious_steady"
    @State private var localStateVersion = ""
    @State private var sessionContinuitySnapshot: BackendSessionContinuitySnapshot?
    @State private var dismissedSessionContinuityFingerprint = ""
    @State private var inFlightCommitVersions: Set<String> = []
    @State private var backendHealthTask: Task<Void, Never>?
    @State private var backendHydrationTask: Task<Void, Never>?
    @State private var backendConnectionState: BackendConnectionState = .checking
    @State private var backendFailureCount = 0
    @State private var offlineTalkOutboxSnapshot = OfflineTalkOutboxSnapshot.empty
    @State private var isTurnSubmitting = false
    @State private var lastIssueSummary = ""
    @State private var lastHealthStatus: BackendHealthStatus?
    @State private var lastOpsRoutesManifest: BackendOpsRouteManifestResponse?
    @State private var lastOpsRoutesManifestRefreshedAt: Date?
    @State private var lastOpsRoutesManifestError = ""
    @State private var lastTalkStats: BackendTalkStatsResponse?
    @State private var lastTalkErrors: BackendTalkErrorsResponse?
    @State private var lastTalkDiagnosticsRefreshedAt: Date?
    @State private var lastTalkDiagnosticsError = ""
    @State private var isRefreshingTalkDiagnostics = false
    @State private var lastSubmittedFingerprint = ""
    @State private var lastSubmittedAt: Date = .distantPast
    @State private var lastOpenedNoteTurnID = ""
    @State private var lastOpenedNotePath = ""
    @State private var lastKnowledgeCitations: [String] = []
    @State private var lastKnowledgeConfidenceClass = ""
    @State private var lastKnowledgeContradictionRisk: Double = 0
    @State private var liveScreenplayText: String = ""
    @State private var liveScreenplayPhase: String = ""
    @State private var liveScreenplayPack: String = ""
    @State private var liveScreenplayProjectID: String = ""
    @State private var liveScreenplayVersionID: String = ""
    @State private var liveScreenplayUpdatedAt: Date = .distantPast
    @State private var conversationLoopEnabled = false
    @State private var pendingGoodbyeStopAfterPlayback = false
    @State private var lastAutoOpenedStudioTurnID = ""
    @State private var isAutoCreatingStudioProject = false
    @State private var lastAutoCreatedStudioProjectKey = ""
    @State private var realtimeBridgeRequest: URLRequest?
    @State private var realtimePreviewStandardFallbackActive = false
    @State private var realtimePendingUserTranscript = ""
    @State private var realtimeAssistantTranscriptFallbackTask: Task<Void, Never>?
    @State private var realtimeRecoveryTask: Task<Void, Never>?
    @State private var realtimeRecoveryGeneration = 0
    @State private var realtimeReconnectAttempt = 0
    @State private var realtimeRecoveryTurnID = ""
    @State private var realtimeRecoveryTranscriptIsFinal = false
    @State private var realtimeRecoveryNeedsTurnRepair = false
    @State private var realtimeRecoveryTurnWasInterrupted = false
    @State private var realtimeRecoveryOutcomeGate = ClementineRealtimeRecoveryOutcomeGate()
    @State private var lastRealtimeRepairDispatchKey = ""
    @State private var lastRealtimeFallbackRepairFingerprint = ""
    @State private var lastRealtimeFallbackRepairAt: Date = .distantPast
    @State private var lastRealtimeAssistantTextAt: Date = .distantPast
    @State private var lastRealtimeHandledPairFingerprint = ""
    @State private var lastRealtimeHandledAt: Date = .distantPast
    @State private var lastHandledLocalStudioCommandUserMessage = ""
    @State private var lastHandledLocalStudioCommandAt: Date = .distantPast
    @State private var lastRealtimeCommittedPairFingerprint = ""
    @State private var lastRealtimeCommittedTurnID = ""
    @State private var lastRealtimeCommitAt: Date = .distantPast
    @State private var lastRealtimeCommitError = ""
    @State private var realtimeStudioRenderTask: Task<String?, Never>?
    @State private var realtimeStudioRenderUserMessage = ""
    @State private var realtimeStudioRenderedReply = ""
    @State private var activeTurnBasedLatencyTurnID = ""
    @State private var lastRealtimeStudioPreviewAt: Date = .distantPast
    @State private var lastRealtimeStudioPreviewCharacterCount: Int = 0
    @State private var studioTypedPromptRoutingMode: ScreenplayStudioScreen.PromptRoutingMode = .automatic
    @AppStorage("show_live_script_preview") private var showLiveScriptPreview: Bool = true
    @AppStorage(ClementineVoiceSettings.voiceSpeedKey) private var clementineSpeakingPace: Double = 1.0
    @AppStorage("studio_typed_reply_audio_enabled") private var studioTypedReplyAudioEnabled: Bool = true
    @AppStorage("clementine_visual_context_enabled") private var visualContextEnabled: Bool = false
    @AppStorage("clementine_voice_transport_mode")
    private var voiceTransportModeRaw: String = ClementineVoiceTransportMode.turnBased.rawValue
    @AppStorage(ClementineRealtimeSupplierMode.storageKey)
    private var realtimeSupplierModeRaw: String = ClementineRealtimeSupplierMode.serverDefault.rawValue
#if DEBUG || os(macOS)
    @AppStorage("studio_debug_submit_transport_mode") private var studioDebugSubmitTransportMode: String = "live"
    @AppStorage("studio_debug_open_token") private var studioDebugOpenToken: Int = 0
    @AppStorage("studio_debug_open_ack_token") private var studioDebugOpenAckToken: Int = 0
    @AppStorage("studio_debug_load_project_token") private var studioDebugLoadProjectToken: Int = 0
    @AppStorage("studio_debug_load_project_id") private var studioDebugLoadProjectID: String = ""
    @AppStorage("studio_debug_load_project_version_id") private var studioDebugLoadProjectVersionID: String = ""
    @AppStorage("studio_debug_load_project_ack_token") private var studioDebugLoadProjectAckToken: Int = 0
    @AppStorage("studio_debug_voice_turn_token") private var studioDebugVoiceTurnToken: Int = 0
    @AppStorage("studio_debug_voice_turn_command_received_token") private var studioDebugVoiceTurnCommandReceivedToken: Int = 0
    @AppStorage("studio_debug_voice_turn_ack_token") private var studioDebugVoiceTurnAckToken: Int = 0
    @AppStorage("studio_debug_voice_turn_text") private var studioDebugVoiceTurnText: String = ""
    @AppStorage("studio_debug_voice_turn_project_id") private var studioDebugVoiceTurnProjectID: String = ""
    @AppStorage("studio_debug_voice_turn_result_token") private var studioDebugVoiceTurnResultToken: Int = 0
    @AppStorage("studio_debug_voice_turn_result_status") private var studioDebugVoiceTurnResultStatus: String = ""
    @AppStorage("studio_debug_voice_turn_result_error") private var studioDebugVoiceTurnResultError: String = ""
    @AppStorage("studio_debug_voice_turn_result_json") private var studioDebugVoiceTurnResultJSON: String = ""
    @AppStorage("studio_debug_voice_draft_trace_json") private var studioDebugVoiceDraftTraceJSON: String = ""
    @AppStorage("orb_echo_debug_show_token") private var orbEchoDebugShowToken: Int = 0
    @AppStorage("orb_echo_debug_hide_token") private var orbEchoDebugHideToken: Int = 0
    @AppStorage("orb_echo_debug_user_text") private var orbEchoDebugUserText: String = ""
    @AppStorage("orb_echo_debug_assistant_text") private var orbEchoDebugAssistantText: String = ""
    @AppStorage("home_turn_cue_debug_token") private var homeTurnCueDebugToken: Int = 0
    @AppStorage("home_turn_cue_debug_text") private var homeTurnCueDebugText: String = ""
#if DEBUG && os(macOS)
    @StateObject private var studioDebugDefaultsBridge = StudioDebugDefaultsBridge.shared
#endif
    @State private var activeStudioDebugVoiceTurnToken: Int?
    @State private var activeStudioDebugVoiceTurnPrompt: String = ""
    @State private var studioDebugCommandPollTask: Task<Void, Never>?
    @State private var lastHandledStudioDebugOpenToken: Int = 0
    @State private var lastHandledStudioDebugLoadProjectToken: Int = 0
    @State private var lastHandledStudioDebugLoadProjectRequestToken: Int = 0
    @State private var lastHandledStudioDebugVoiceTurnToken: Int = 0
#if DEBUG
    @State private var uiTestRealtimeNetworkFaultStage: ClementineRealtimeFaultStage?
    @State private var uiTestRealtimeNetworkFaultResult = ""
#endif
#endif
    @State private var lastVisualContextEnvelope: ClementineVisualContextEnvelope?
    @State private var lastVisualContextFingerprint = ""
    @State private var lastVisualContextCapturedAt: Date = .distantPast
    @State private var lastVisualContextError = ""
    @State private var transientTurnBannerText: String?
    @State private var transientTurnBannerTask: Task<Void, Never>?
    @State private var pendingCanonClarification: BackendCanonCorrectionAmbiguity?
    @State private var isResolvingCanonClarification = false
    @State private var canonClarificationError = ""
    @State private var userReplyEcho: String = ""
    @State private var assistantReplyEcho: String = ""
    @State private var replyEchoOpacity: Double = 0
    @State private var replyEchoClearTask: Task<Void, Never>?
    @State private var showingReportOptions = false
    @State private var showingTalkDiagnostics = false
    @State private var showingDebugBundleNotice = false
    @State private var debugBundleNoticeMessage = ""
    #if os(iOS)
    @State private var showingDebugBundleShareSheet = false
    @State private var debugBundleShareItems: [Any] = []
    #endif
    private var canStartTalk: Bool {
        !evolution.needsOnboardingName &&
        !isTurnSubmitting
    }

    private var voiceTransportMode: ClementineVoiceTransportMode {
        ClementineVoiceTransportMode(rawValue: voiceTransportModeRaw) ?? .turnBased
    }

    private var realtimeSupplierMode: ClementineRealtimeSupplierMode {
        ClementineRealtimeSupplierMode.normalized(rawValue: realtimeSupplierModeRaw)
    }

    private var supportDiagnosticsEnabled: Bool {
        #if DEBUG || os(macOS)
        return true
        #else
        return false
        #endif
    }

    private var isStudioSurfaceActive: Bool {
        primarySurface == .studio || uiTestForceStudioSurface
    }

    private var usesRealtimePreviewTransport: Bool {
        voiceTransportMode == .realtimePreview
    }

    private static func shouldUseStreamingStudioPageWriteTransport(
        shouldWriteToPage: Bool,
        isStudioSurfaceActive: Bool
    ) -> Bool {
        _ = shouldWriteToPage
        return StudioResponseStreamingPolicy.shouldStream(
            isStudioSurfaceActive: isStudioSurfaceActive
        )
    }

    private func shouldUseStreamingStudioPageWriteTransport(
        shouldWriteToPage: Bool
    ) -> Bool {
        Self.shouldUseStreamingStudioPageWriteTransport(
            shouldWriteToPage: shouldWriteToPage,
            isStudioSurfaceActive: isStudioSurfaceActive
        )
    }

    #if DEBUG || os(macOS)
    private static let studioPageWriteTransportRoutingChecked: Bool = {
        precondition(
            shouldUseStreamingStudioPageWriteTransport(
                shouldWriteToPage: true,
                isStudioSurfaceActive: true
            )
        )
        precondition(
            !shouldUseStreamingStudioPageWriteTransport(
                shouldWriteToPage: true,
                isStudioSurfaceActive: false
            )
        )
        precondition(
            shouldUseStreamingStudioPageWriteTransport(
                shouldWriteToPage: false,
                isStudioSurfaceActive: true
            )
        )
        return true
    }()
    #endif

    private var visualContextStatusText: String {
        guard visualContextEnabled else { return "Off" }
        if !lastVisualContextError.isEmpty {
            return "On · \(lastVisualContextError)"
        }
        if let envelope = lastVisualContextEnvelope {
            let label = envelope.appName.isEmpty ? envelope.source : envelope.appName
            return label.isEmpty ? "On" : "On · \(label)"
        }
        #if os(macOS)
        return ClementineVisualContextCapture.permissionStatusText()
        #else
        return "Visual context is only available on macOS right now."
        #endif
    }

    private var realtimePreviewStatusText: String {
        if realtimePreviewStandardFallbackActive {
            return standardVoiceFallbackStatusText
        }
        if realtimeReconnectAttempt > 0 {
            return "Reconnecting live voice · attempt \(realtimeReconnectAttempt) of \(ClementineRealtimeRecoveryPolicy.maximumReconnectAttempts)"
        }
        if case .failed = realtimeVoice.status {
            return realtimeVoice.statusText
        }
        if realtimeTransport.isBusy || realtimeTransport.isLive {
            return realtimeTransport.statusText
        }
        return realtimeVoice.statusText
    }

    private var standardVoiceFallbackStatusText: String {
        switch voice.mode {
        case .capturingSpeech:
            return "Standard voice listening"
        case .assistantSpeaking:
            return "Standard voice speaking"
        case .armedListening:
            return "Standard voice ready"
        case .muted:
            return "Standard voice muted"
        case .idle:
            return "Standard voice standby"
        }
    }

    private var activeCompanionSignals: CreativeCompanionSignalState {
        screenplayDraftBridge.companionSignalState
    }

    private var bodyBackground: some View {
        LinearGradient(
            gradient: Gradient(colors: [
                .herPeachTop,
                .herPeachMid,
                .herPeachBottom
            ]),
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    @ViewBuilder
    private var primarySurfaceLayer: some View {
        if isStudioSurfaceActive {
            studioSurface
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(20)
        } else {
            homeSurface
                .zIndex(0)
        }
    }

    @ViewBuilder
    private var homeCompanionSignalCard: some View {
        let signalState = activeCompanionSignals
        if signalState.hasContent {
            VStack(spacing: 6) {
                if !signalState.presence.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(signalState.presence.title)
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundColor(.herText.opacity(0.86))
                        .textCase(.uppercase)
                        .tracking(0.8)
                }
                if !signalState.intent.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(signalState.intent.summary)
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.84))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let proactive = signalState.proactiveSuggestion,
                   !proactive.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(proactive.prompt)
                        .font(.system(size: 11, weight: .medium, design: .default))
                        .foregroundColor(.herText.opacity(0.76))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: 440)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(0.16))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.20), lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    private var homeSessionContinuityCard: some View {
        if let snapshot = sessionContinuitySnapshot,
           snapshot.isMeaningful,
           sessionContinuityFingerprint(snapshot) != dismissedSessionContinuityFingerprint {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("Where We Left Off")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundColor(.herText.opacity(0.86))
                        .textCase(.uppercase)
                        .tracking(0.8)
                    Spacer(minLength: 8)
                    Button {
                        dismissedSessionContinuityFingerprint = sessionContinuityFingerprint(snapshot)
                    } label: {
                        Text("Hide")
                            .font(.system(size: 11, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.74))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Hide restored memory")
                }

                Text(sessionContinuityTitle(snapshot))
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.92))
                    .lineLimit(1)

                Text(sessionContinuityBody(snapshot))
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.82))
                    .lineSpacing(4)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    Button {
                        openStudio()
                    } label: {
                        Text("Continue Writing")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.92))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Color.white.opacity(0.20))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home.session-continuity.open-studio")

                    Button {
                        openMemories()
                    } label: {
                        Text("Review Memory")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.86))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Color.white.opacity(0.14))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home.session-continuity.open-memories")
                }
            }
            .frame(maxWidth: 500, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(0.16))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.20), lineWidth: 1)
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Where we left off. \(sessionContinuityBody(snapshot))")
        }
    }

    @ViewBuilder
    private var bodyForegroundLayers: some View {
        primarySurfaceLayer

        if evolution.needsOnboardingName {
            onboardingOverlay
                .transition(.opacity)
                .zIndex(10)
        }

        if voiceTransportMode == .realtimePreview {
            ClementineRealtimeTransportHost(
                bridge: realtimeTransport,
                bridgeRequest: realtimeBridgeRequest
            )
            .zIndex(-1)
        }

#if DEBUG
        if !uiTestRealtimeNetworkFaultResult.isEmpty {
            Text(uiTestRealtimeNetworkFaultResult)
                .font(.system(size: 8, weight: .regular, design: .monospaced))
                .foregroundColor(.herText.opacity(0.85))
                .lineLimit(4)
                .padding(8)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .allowsHitTesting(false)
                .accessibilityIdentifier("realtime.network-fault.result")
                .accessibilityLabel(uiTestRealtimeNetworkFaultResult)
                .zIndex(100)
        }
#endif
    }

    @ViewBuilder
    private func canonClarificationLayer(viewportSize: CGSize) -> some View {
        if !evolution.needsOnboardingName,
           let pendingCanonClarification {
            #if os(macOS)
            let overlayAlignment: Alignment = .top
            #else
            let overlayAlignment: Alignment = .bottom
            #endif
            CanonClarificationCard(
                clarification: pendingCanonClarification,
                isResolving: isResolvingCanonClarification,
                errorMessage: canonClarificationError,
                onResolve: resolveCanonClarification,
                onDefer: deferCanonClarification
            )
            .frame(width: max(0, min(560, viewportSize.width - 32)))
            .padding(.vertical, 20)
            .frame(
                width: viewportSize.width,
                height: viewportSize.height,
                alignment: overlayAlignment
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .zIndex(40)
        }
    }

    private var rootBodyView: some View {
        #if os(iOS)
        GeometryReader { viewport in
            ZStack {
                bodyBackground
                bodyForegroundLayers
                canonClarificationLayer(viewportSize: viewport.size)
            }
            .frame(width: viewport.size.width, height: viewport.size.height)
            .clipped()
        }
        #else
        GeometryReader { viewport in
            ZStack {
                bodyBackground
                bodyForegroundLayers
                canonClarificationLayer(viewportSize: viewport.size)
            }
        }
        #endif
    }

    #if DEBUG
    private var bodyWithObservedChanges: AnyView {
        AnyView(
            rootBodyView
                .onChange(of: studioDebugOpenToken) { _, _ in
                    DispatchQueue.main.async {
                        handleStudioDebugOpenChange()
                    }
                }
                .onChange(of: studioDebugLoadProjectToken) { _, newValue in
                    DispatchQueue.main.async {
                        handleStudioDebugLoadProjectTokenChange(newValue)
                    }
                }
                .onChange(of: studioDebugVoiceTurnToken) { _, newValue in
                    DispatchQueue.main.async {
                        handleStudioDebugVoiceTurnTokenChange(newValue)
                    }
                }
#if os(macOS)
                .onReceive(studioDebugDefaultsBridge.$openToken.removeDuplicates()) { token in
                    DispatchQueue.main.async {
                        handleStudioDebugOpenChange(token)
                    }
                }
                .onReceive(studioDebugDefaultsBridge.$loadProjectToken.removeDuplicates()) { token in
                    DispatchQueue.main.async {
                        handleStudioDebugLoadProjectTokenChange(token)
                    }
                }
                .onReceive(studioDebugDefaultsBridge.$voiceTurnToken.removeDuplicates()) { token in
                    DispatchQueue.main.async {
                        handleStudioDebugVoiceTurnTokenChange(token)
                    }
                }
#endif
                .onChange(of: homeTurnCueDebugToken) { _, newValue in
                    DispatchQueue.main.async {
                        handleHomeTurnCueDebugTokenChange(newValue)
                    }
                }
                .onChange(of: orbEchoDebugShowToken) { _, newValue in
                    DispatchQueue.main.async {
                        handleOrbEchoDebugShowChange(newValue)
                    }
                }
                .onChange(of: orbEchoDebugHideToken) { _, newValue in
                    DispatchQueue.main.async {
                        handleOrbEchoDebugHideChange(newValue)
                    }
                }
        )
    }
    #else
    private var bodyWithObservedChanges: AnyView {
        AnyView(rootBodyView)
    }
    #endif

    private var bodyWithLifecycleObservers: AnyView {
        AnyView(
            bodyWithObservedChanges
                .onAppear {
                    DispatchQueue.main.async {
                        handleContentViewAppear()
                    }
                }
                .onDisappear {
                    DispatchQueue.main.async {
                        handleContentViewDisappear()
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    DispatchQueue.main.async {
                        handleScenePhaseChange(newPhase)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .themOfflineTalkOutboxUpdated)) { notification in
                    let snapshot = OfflineTalkOutboxSnapshot(notification: notification)
                    offlineTalkOutboxSnapshot = snapshot
                    if let status = snapshot.userVisibleStatus, snapshot.hasWork {
                        showOfflineTalkOutboxBanner(status)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .themOpenStudioRequested)) { _ in
                    handleWorkspaceNavigationCommand(.openStudio)
                }
                .onReceive(NotificationCenter.default.publisher(for: .themCloseStudioRequested)) { _ in
                    handleWorkspaceNavigationCommand(.closeStudio)
                }
                .onReceive(NotificationCenter.default.publisher(for: .themToggleStudioRequested)) { _ in
                    handleWorkspaceNavigationCommand(.toggleStudio)
                }
                .onChange(of: isStudioSurfaceActive) { _, newValue in
                    DispatchQueue.main.async {
                        handleStudioSurfaceActiveChange(newValue)
                    }
                }
                .onChange(of: studioTypedReplyAudioEnabled) { _, isEnabled in
                    if !isEnabled {
                        typedReplySpeaker.cancel()
                    }
                }
                .onChange(of: voiceTransportModeRaw) { _, newValue in
                    DispatchQueue.main.async {
                        handleVoiceTransportModeChange(newValue)
                    }
                }
                .onChange(of: realtimeSupplierModeRaw) { _, newValue in
                    DispatchQueue.main.async {
                        handleRealtimeSupplierModeChange(newValue)
                    }
                }
        )
    }

    var body: some View {
        applyPlatformPresentationModifiers(
            to: applyAlertModifiers(
                to: applySheetModifiers(to: bodyWithLifecycleObservers)
            )
        )
    }

    private func handleStudioDebugOpenChange(_ newValue: Int? = nil) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard IOThemRuntime.currentStudioAutomationTargetMatches else { return }
        let token = newValue ?? studioDebugOpenToken
        guard token > 0 else { return }
        guard token != lastHandledStudioDebugOpenToken else { return }
        lastHandledStudioDebugOpenToken = token
        noteStudioDebugLifecycle("open_token_consumed")
        studioDebugOpenAckToken = token
        setStudioDebugPreferenceInt(token, forKey: "studio_debug_open_ack_token")
        openStudio()
        #endif
    }

    private func handleStudioDebugLoadProjectTokenChange(_ newValue: Int) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard IOThemRuntime.currentStudioAutomationTargetMatches else { return }
        guard newValue > 0 else { return }
        guard newValue != lastHandledStudioDebugLoadProjectToken else { return }
        lastHandledStudioDebugLoadProjectToken = newValue
        noteStudioDebugLifecycle("load_token_consumed")
        let debugProjectID = studioDebugPreferenceString("studio_debug_load_project_id")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let debugVersionID = studioDebugPreferenceString("studio_debug_load_project_version_id")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !debugProjectID.isEmpty {
            screenplayDraftBridge.preferredProjectID = debugProjectID
            screenplayDraftBridge.debugRequestedProjectID = debugProjectID
            liveScreenplayProjectID = debugProjectID
        }
        screenplayDraftBridge.preferredVersionID = debugVersionID
        screenplayDraftBridge.debugRequestedVersionID = debugVersionID
        screenplayDraftBridge.debugProjectLoadToken = newValue
        liveScreenplayVersionID = debugVersionID
        // Stage the requested project in the shell and open Studio, but let the
        // Studio screen acknowledge once the actual selectProject path completes.
        openStudio()
        #endif
    }

    private func handleStudioDebugVoiceTurnTokenChange(_ newValue: Int) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard IOThemRuntime.currentStudioAutomationTargetMatches else { return }
        handleStudioDebugVoiceTurnCommand(
            token: newValue,
            promptOverride: nil,
            projectIDOverride: nil
        )
        #endif
    }

    private func handleStudioDebugVoiceTurnCommand(
        token: Int,
        promptOverride: String?,
        projectIDOverride: String?
    ) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard token > 0 else { return }
        guard token != lastHandledStudioDebugVoiceTurnToken else { return }
        lastHandledStudioDebugVoiceTurnToken = token
        studioDebugVoiceTurnCommandReceivedToken = token
        setStudioDebugPreferenceInt(token, forKey: "studio_debug_voice_turn_command_received_token")
        studioDebugVoiceTurnAckToken = token
        setStudioDebugPreferenceInt(token, forKey: "studio_debug_voice_turn_ack_token")
        let request = studioDebugVoiceTurnRequest(for: token)
        let cleaned = (promptOverride ?? request?.prompt ?? currentStudioDebugVoiceTurnTextFromDefaults())
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let prompt = cleaned.isEmpty ? "what if she leaves before he answers" : cleaned
        let projectID = projectIDOverride ?? request?.projectID
        appendStudioDebugVoiceDraftBreadcrumb(
            event: "debug_turn_command_received",
            detail: "Studio debug voice turn command token consumed by the app.",
            tokenOverride: token,
            promptPreviewOverride: prompt
        )
        Task { @MainActor in
            await runStudioDebugVoiceTurn(
                token: token,
                prompt: prompt,
                projectIDOverride: projectID
            )
        }
        #endif
    }

    private func handleOrbEchoDebugShowChange(_ newValue: Int) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard newValue > 0 else { return }
        showReplyEcho(
            user: orbEchoDebugUserText,
            assistant: orbEchoDebugAssistantText,
            debugToken: newValue
        )
        #endif
    }

    private func handleOrbEchoDebugHideChange(_ newValue: Int) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard newValue > 0 else { return }
        hideReplyEcho(debugToken: newValue)
        #endif
    }

    private func handleHomeTurnCueDebugTokenChange(_ newValue: Int) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard newValue > 0 else { return }
        let cleaned = homeTurnCueDebugText.trimmingCharacters(in: .whitespacesAndNewlines)
        let probeText = cleaned.isEmpty ? "Hey, can we talk for a second?" : cleaned
        let prepared = buildPreparedTurnPrompt(
            confirmedTranscript: probeText,
            partialHint: "",
            isScreenplayModeOverride: false,
            turnKeyNamespace: "debug-home-cue"
        )
        writeHomeTurnCueDebugState(token: newValue, probeText: probeText, prepared: prepared)
        #endif
    }

#if DEBUG || os(macOS)
    private func copyStudioDebugPreferenceValue(forKey key: String) -> Any? {
        studioDebugPreferenceValues(forKey: key).first
    }

    private func studioDebugPreferenceInt(_ key: String, fallback: Int = 0) -> Int {
        var bestValue: Int?
        for value in studioDebugPreferenceValues(forKey: key) {
            if let number = value as? NSNumber {
                let parsed = Int(number.int64Value)
                bestValue = max(bestValue ?? parsed, parsed)
                continue
            }
            if let string = value as? String,
               let parsed = Int(string.trimmingCharacters(in: .whitespacesAndNewlines)) {
                bestValue = max(bestValue ?? parsed, parsed)
            }
        }
        return bestValue ?? fallback
    }

    private func studioDebugPreferenceBool(_ key: String, fallback: Bool = false) -> Bool {
        if let number = copyStudioDebugPreferenceValue(forKey: key) as? NSNumber {
            return number.boolValue
        }
        if let string = copyStudioDebugPreferenceValue(forKey: key) as? String {
            let normalized = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if ["1", "true", "yes", "on"].contains(normalized) { return true }
            if ["0", "false", "no", "off"].contains(normalized) { return false }
        }
        return fallback
    }

    private func studioDebugPreferenceString(_ key: String, fallback: String = "") -> String {
        if let string = copyStudioDebugPreferenceValue(forKey: key) as? String {
            return string
        }
        if let number = copyStudioDebugPreferenceValue(forKey: key) as? NSNumber {
            return number.stringValue
        }
        return fallback
    }

    private func setStudioDebugPreferenceInt(_ value: Int, forKey key: String) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        writeStudioDebugPreferenceInt(value, forKey: key)
        #endif
    }

    private func setStudioDebugPreferenceString(_ value: String, forKey key: String) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        writeStudioDebugPreferenceString(value, forKey: key)
        #endif
    }

    private func currentStudioDebugVoiceTurnTextFromDefaults() -> String {
        let value = studioDebugPreferenceString("studio_debug_voice_turn_text")
        return value.isEmpty ? studioDebugVoiceTurnText : value
    }

    private func currentStudioDebugVoiceTurnProjectIDFromDefaults() -> String {
        let value = studioDebugPreferenceString("studio_debug_voice_turn_project_id")
        return value.isEmpty ? studioDebugVoiceTurnProjectID : value
    }

    private func studioDebugVoiceTurnRequest(for token: Int) -> StudioDebugVoiceTurnRequest? {
        #if DEBUG && os(macOS)
        guard IOThemRuntime.isStudioAutomationSession else { return nil }
        guard let data = try? Data(contentsOf: studioDebugVoiceTurnRequestURL),
              let request = try? JSONDecoder().decode(StudioDebugVoiceTurnRequest.self, from: data),
              request.token == token else {
            return nil
        }
        try? FileManager.default.removeItem(at: studioDebugVoiceTurnRequestURL)
        return request
        #else
        return nil
        #endif
    }

    private func noteStudioDebugLifecycle(_ stage: String) {
        guard !IOThemRuntime.isRunningTests else { return }
        let cleanStage = stage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanStage.isEmpty else { return }
        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        setStudioDebugPreferenceString(cleanStage, forKey: "studio_debug_lifecycle_stage")
        setStudioDebugPreferenceInt(timestamp, forKey: "studio_debug_lifecycle_timestamp_ms")
    }

    @MainActor
    private func prepareBackendForStudioDebugVoiceTurn() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let rawPinnedURL = studioDebugPreferenceString("backend_base_url", fallback: "http://127.0.0.1:3000")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let pinnedURL = BackendDefaultBaseURLPolicy.currentUITestOverrideBaseURL
            ?? canonicalizedStudioDebugBackendURL(from: rawPinnedURL)
        setStudioDebugPreferenceString(pinnedURL.absoluteString, forKey: "backend_base_url")
        backend = BackendClient(baseURL: pinnedURL, fallbackURL: pinnedURL)
        let service = ClementinePageInterruptService(backend: backend)
        pageInterruptService = service
        bindPageInterruptObservation(to: service)
        screenplayDraftBridge.onPageGenerationInterrupted = { reason in
            requestPageLaneCancelOnInterrupt(reason: reason)
        }
        #endif
    }

    private func canonicalizedStudioDebugBackendURL(from raw: String) -> URL {
        let fallback = URL(string: "http://127.0.0.1:3000")!
        guard let parsed = URL(string: raw) else { return fallback }
        guard let host = parsed.host?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
            return parsed
        }
        guard host == "localhost" || host == "::1" || host == "[::1]" else {
            return parsed
        }
        guard var components = URLComponents(url: parsed, resolvingAgainstBaseURL: false) else {
            return fallback
        }
        components.host = "127.0.0.1"
        return components.url ?? fallback
    }

    private func studioDebugVoiceTurnTraceKey(for token: Int) -> String {
        "studio_debug_voice_draft_trace_json_\(token)"
    }

    private func studioDebugVoiceTurnResultKey(for token: Int) -> String {
        "studio_debug_voice_turn_result_json_\(token)"
    }

    private func processPendingStudioDebugCommandsIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard IOThemRuntime.currentStudioAutomationTargetMatches else { return }
        handleStudioDebugLoadProjectRequestFileIfNeeded()

        let autoInsertEnabled = studioDebugPreferenceBool(
            "studio_auto_insert",
            fallback: screenplayDraftBridge.autoInsertEnabled
        )
        if screenplayDraftBridge.autoInsertEnabled != autoInsertEnabled {
            screenplayDraftBridge.autoInsertEnabled = autoInsertEnabled
        }

        let openToken = studioDebugPreferenceInt("studio_debug_open_token")
        if openToken > 0 {
            noteStudioDebugLifecycle("open_token_seen")
            handleStudioDebugOpenChange(openToken)
        }

        let loadProjectToken = studioDebugPreferenceInt("studio_debug_load_project_token")
        if loadProjectToken > 0 {
            noteStudioDebugLifecycle("load_token_seen")
            handleStudioDebugLoadProjectTokenChange(loadProjectToken)
        }

        let voiceToken = studioDebugPreferenceInt("studio_debug_voice_turn_token")
        if voiceToken > 0 {
            handleStudioDebugVoiceTurnTokenChange(voiceToken)
        }
        #endif
    }

    private func handleStudioDebugLoadProjectRequestFileIfNeeded() {
        #if DEBUG && os(macOS)
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard IOThemRuntime.currentStudioAutomationTargetMatches else { return }
        guard let match = studioDebugLoadProjectRequestURLs.lazy.compactMap({ url -> (StudioDebugLoadProjectRequest, URL)? in
            guard let data = try? Data(contentsOf: url),
                  let request = try? JSONDecoder().decode(StudioDebugLoadProjectRequest.self, from: data) else {
                return nil
            }
            return (request, url)
        }).first else {
            return
        }
        let request = match.0
        guard request.token > 0 else { return }
        guard request.token != lastHandledStudioDebugLoadProjectRequestToken else { return }
        lastHandledStudioDebugLoadProjectRequestToken = request.token
        noteStudioDebugLifecycle("load_request_file_consumed")
        for url in studioDebugLoadProjectRequestURLs {
            try? FileManager.default.removeItem(at: url)
        }
        let debugProjectID = request.projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let debugVersionID = request.versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        if !debugProjectID.isEmpty {
            screenplayDraftBridge.preferredProjectID = debugProjectID
            screenplayDraftBridge.debugRequestedProjectID = debugProjectID
            liveScreenplayProjectID = debugProjectID
        }
        screenplayDraftBridge.preferredVersionID = debugVersionID
        screenplayDraftBridge.debugRequestedVersionID = debugVersionID
        screenplayDraftBridge.debugProjectLoadToken = request.token
        liveScreenplayVersionID = debugVersionID
        setStudioDebugPreferenceString(debugProjectID, forKey: "studio_debug_load_project_id")
        setStudioDebugPreferenceString(debugVersionID, forKey: "studio_debug_load_project_version_id")
        setStudioDebugPreferenceInt(0, forKey: "studio_debug_load_project_ack_token")
        setStudioDebugPreferenceInt(request.token, forKey: "studio_debug_load_project_token")
        openStudio()
        #endif
    }

    #if DEBUG && os(macOS)
    private func startStudioDebugCommandPolling() {
        guard IOThemRuntime.isStudioAutomationSession else { return }
        studioDebugCommandPollTask?.cancel()
        noteStudioDebugLifecycle("polling_started")
        studioDebugCommandPollTask = Task { @MainActor in
            await Task.yield()
            try? await Task.sleep(nanoseconds: 250_000_000)
            while !Task.isCancelled {
                processPendingStudioDebugCommandsIfNeeded()
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
    }

    private func stopStudioDebugCommandPolling() {
        studioDebugCommandPollTask?.cancel()
        studioDebugCommandPollTask = nil
    }
    #endif

    #if DEBUG
    @MainActor
    private func runStudioDebugVoiceTurn(token: Int, prompt: String) async {
        await runStudioDebugVoiceTurn(token: token, prompt: prompt, projectIDOverride: nil)
    }

    @MainActor
    private func runStudioDebugVoiceTurn(
        token: Int,
        prompt: String,
        projectIDOverride: String?
    ) async {
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let cleanPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanPrompt.isEmpty else {
            writeStudioDebugVoiceTurnResult(
                token: token,
                status: "error",
                error: "Studio debug voice prompt was empty.",
                prompt: prompt,
                turnID: "",
                insertedPreview: "",
                replyPreview: ""
            )
            return
        }
        guard !isTurnSubmitting, inFlightTalkTask == nil else {
            writeStudioDebugVoiceTurnResult(
                token: token,
                status: "error",
                error: "A turn was already in flight.",
                prompt: cleanPrompt,
                turnID: "",
                insertedPreview: "",
                replyPreview: ""
            )
            return
        }

        studioDebugVoiceTurnResultStatus = "running"
        studioDebugVoiceTurnResultError = ""
        studioDebugVoiceTurnResultJSON = ""
        studioDebugVoiceTurnResultToken = 0
        studioDebugVoiceDraftTraceJSON = "[]"
        setStudioDebugPreferenceString("running", forKey: "studio_debug_voice_turn_result_status")
        setStudioDebugPreferenceString("", forKey: "studio_debug_voice_turn_result_error")
        setStudioDebugPreferenceString("", forKey: "studio_debug_voice_turn_result_json")
        setStudioDebugPreferenceInt(0, forKey: "studio_debug_voice_turn_result_token")
        setStudioDebugPreferenceString("[]", forKey: "studio_debug_voice_draft_trace_json")
        setStudioDebugPreferenceString("", forKey: studioDebugVoiceTurnResultKey(for: token))
        setStudioDebugPreferenceString("[]", forKey: studioDebugVoiceTurnTraceKey(for: token))
        activeStudioDebugVoiceTurnToken = token
        activeStudioDebugVoiceTurnPrompt = cleanPrompt
        appendStudioDebugVoiceDraftBreadcrumb(
            event: "debug_turn_acknowledged",
            detail: "Studio debug voice turn command acknowledged.",
            tokenOverride: token,
            promptPreviewOverride: cleanPrompt
        )
        persistStudioDebugVoiceTurnProgress(
            token: token,
            status: "running",
            error: "",
            prompt: cleanPrompt,
            turnID: "",
            insertedPreview: "",
            replyPreview: "",
            finalCommittedPageText: "",
            dispatchResolvedBaseURL: "",
            talkRequestURL: "",
            talkDispatchStage: "acknowledged",
            clientTokenResolved: false,
            dispatchErrorDomain: "",
            dispatchErrorCode: nil,
            dispatchErrorDescription: ""
        )
        prepareBackendForStudioDebugVoiceTurn()
        appendStudioDebugVoiceDraftBreadcrumb(
            event: "debug_turn_started",
            detail: "Studio debug voice turn started.",
            tokenOverride: token,
            promptPreviewOverride: cleanPrompt
        )
        voiceTransportModeRaw = ClementineVoiceTransportMode.turnBased.rawValue
        let debugProjectID = (projectIDOverride ?? currentStudioDebugVoiceTurnProjectIDFromDefaults())
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !debugProjectID.isEmpty {
            screenplayDraftBridge.preferredProjectID = debugProjectID
            screenplayDraftBridge.preferredVersionID = ""
            liveScreenplayProjectID = debugProjectID
            liveScreenplayVersionID = ""
        }
        openStudio()
        hideReplyEcho()
        transcript = cleanPrompt
        livePartialTranscript = ""
        lastNonEmptyPartialTranscriptHint = String(cleanPrompt.prefix(320))

        let durationMs = 1800 + (token % 17)
        await sendUtterance(
            silentTalkWavData(durationMs: durationMs),
            clientTranscriptOverride: cleanPrompt,
            debugVoiceTurnToken: token
        )
    }
    #endif

    private func currentStudioDebugVoiceDraftBreadcrumbs(
        token: Int? = nil
    ) -> [StudioDebugVoiceDraftBreadcrumb] {
        let raw: String
        if let token, token > 0 {
            raw = studioDebugPreferenceString(studioDebugVoiceTurnTraceKey(for: token))
                .trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            raw = studioDebugVoiceDraftTraceJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard !raw.isEmpty, let data = raw.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([StudioDebugVoiceDraftBreadcrumb].self, from: data)) ?? []
    }

    private func appendStudioDebugVoiceDraftBreadcrumb(
        event: String,
        detail: String,
        interruptionReason: String? = nil,
        replyPreview: String = "",
        restorePreview: Bool? = nil,
        tokenOverride: Int? = nil,
        promptPreviewOverride: String? = nil
    ) {
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let cleanEvent = event.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanEvent.isEmpty else { return }
        let effectiveToken = tokenOverride ?? activeStudioDebugVoiceTurnToken ?? 0
        var breadcrumbs = currentStudioDebugVoiceDraftBreadcrumbs()
        var scopedBreadcrumbs = effectiveToken > 0
            ? currentStudioDebugVoiceDraftBreadcrumbs(token: effectiveToken)
            : []
        let formatter = ISO8601DateFormatter()
        let promptPreviewSource = (promptPreviewOverride ?? "").isEmpty
            ? (activeStudioDebugVoiceTurnPrompt.isEmpty
                ? realtimeStudioRenderUserMessage
                : activeStudioDebugVoiceTurnPrompt)
            : (promptPreviewOverride ?? "")
        let breadcrumb = StudioDebugVoiceDraftBreadcrumb(
            token: effectiveToken,
            event: cleanEvent,
            detail: detail,
            interruptionReason: interruptionReason?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? interruptionReason?.trimmingCharacters(in: .whitespacesAndNewlines)
                : nil,
            promptPreview: String(promptPreviewSource.prefix(220)),
            replyPreview: String(replyPreview.prefix(220)),
            restorePreview: restorePreview,
            timestampISO8601: formatter.string(from: Date())
        )
        breadcrumbs.append(breadcrumb)
        if effectiveToken > 0 {
            scopedBreadcrumbs.append(breadcrumb)
        }
        if breadcrumbs.count > 48 {
            breadcrumbs.removeFirst(breadcrumbs.count - 48)
        }
        if scopedBreadcrumbs.count > 64 {
            scopedBreadcrumbs.removeFirst(scopedBreadcrumbs.count - 64)
        }
        if let data = try? JSONEncoder().encode(breadcrumbs),
           let raw = String(data: data, encoding: .utf8) {
            studioDebugVoiceDraftTraceJSON = raw
            setStudioDebugPreferenceString(raw, forKey: "studio_debug_voice_draft_trace_json")
        }
        if effectiveToken > 0,
           let data = try? JSONEncoder().encode(scopedBreadcrumbs),
           let raw = String(data: data, encoding: .utf8) {
            setStudioDebugPreferenceString(raw, forKey: studioDebugVoiceTurnTraceKey(for: effectiveToken))
        }
    }

    private func writeStudioDebugVoiceTurnResult(
        token: Int,
        status: String,
        error: String,
        prompt: String,
        turnID: String,
        preparedUseScreenplayMode: Bool = false,
        preparedShouldWriteToPage: Bool = false,
        preparedMemoryDomain: String = "",
        requestedScreenplayTarget: String = "",
        timingSource: String = "",
        screenplayOutputTarget: String = "",
        screenplayOutputSource: String = "",
        screenplayQualityReason: String = "",
        screenplayQualityConfidence: String = "",
        screenplayQualityFeatureAct: String = "",
        screenplayRepairAttempted: Bool = false,
        screenplayRepairOutcome: String = "",
        screenplayRepairMs: Int? = nil,
        screenplayRepairReason: String = "",
        creativeMemoryApplied: Bool = false,
        creativeMemoryProjectID: String = "",
        creativeMemoryProjectTitle: String = "",
        creativeMemoryCharacterCount: Int = 0,
        creativeMemoryEpisodicCount: Int = 0,
        creativeMemoryCorrectionCount: Int = 0,
        creativeMemoryCharacters: [String] = [],
        creativeMemoryCorrectedTerms: [String] = [],
        creativeMemoryCorrectionReplacements: [String] = [],
        creativeMemoryEpisodeSummaries: [String] = [],
        screenplayOutputText: String = "",
        screenplayCues: [BackendTalkScreenplayCue] = [],
        dialogueTimeline: BackendTalkDialogueTimelineRevision? = nil,
        insertedPreview: String,
        replyPreview: String,
        finalCommittedPageText: String = "",
        dispatchResolvedBaseURL: String = "",
        talkRequestURL: String = "",
        talkDispatchStage: String = "",
        clientTokenResolved: Bool = false,
        dispatchErrorDomain: String = "",
        dispatchErrorCode: Int? = nil,
        dispatchErrorDescription: String = "",
        syncedVoiceSeekApplied: Bool = false,
        syncedVoiceSeekCount: Int = 0,
        syncedVoiceSeekFromMs: Int? = nil,
        syncedVoiceSeekToMs: Int? = nil,
        appendPersistenceBreadcrumb: Bool = true
    ) {
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let formatter = ISO8601DateFormatter()
        let decoder = ISO8601DateFormatter()
        let breadcrumbs = currentStudioDebugVoiceDraftBreadcrumbs(token: token)

        func firstDate(for event: String) -> Date? {
            breadcrumbs.first(where: { $0.event == event }).flatMap { decoder.date(from: $0.timestampISO8601) }
        }

        func firstMatchingDetail(for event: String) -> String {
            breadcrumbs.first(where: { $0.event == event })?.detail ?? ""
        }

        func firstInterruptionReason(for event: String) -> String {
            breadcrumbs.first(where: { $0.event == event })?.interruptionReason ?? ""
        }

        func requestID(from detail: String) -> String {
            guard let match = detail.range(
                of: #"request_id=([A-Za-z0-9._:-]+)"#,
                options: .regularExpression
            ) else {
                return ""
            }
            let captured = String(detail[match])
            return captured
                .replacingOccurrences(
                    of: #"^.*request_id="#,
                    with: "",
                    options: .regularExpression
                )
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }

        func milliseconds(from detail: String) -> Int? {
            guard let match = detail.range(
                of: #"(\d+)ms"#,
                options: .regularExpression
            ) else {
                return nil
            }
            let token = String(detail[match]).replacingOccurrences(
                of: #"[^0-9]"#,
                with: "",
                options: .regularExpression
            )
            return Int(token)
        }

        func firstFieldValue(for event: String, key: String) -> String {
            guard let detail = breadcrumbs.first(where: { $0.event == event })?.detail else { return "" }
            let pattern = key + #"=([^ ]+)"#
            guard let match = detail.range(of: pattern, options: .regularExpression) else {
                return ""
            }
            let captured = String(detail[match])
            return captured
                .replacingOccurrences(
                    of: #"^.*="#,
                    with: "",
                    options: .regularExpression
                )
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }

        let acknowledgedAt = firstDate(for: "debug_turn_acknowledged")
        let draftStartedAt = firstDate(for: "request_started")
        let headerTextCommittedAt = firstDate(for: "header_text_committed")
        let commitAt = firstDate(for: "request_committed")
        let firstAudioSegmentReadyAt = firstDate(for: "first_audio_segment_ready")
        let playbackStartedAt = firstDate(for: "assistant_playback_started")
        let playbackFinishedAt = firstDate(for: "assistant_playback_finished")
        let renderMetaDetail = firstMatchingDetail(for: "render_stream_meta_received")
        let renderFirstDeltaDetail = firstMatchingDetail(for: "render_stream_first_delta_server")
        let renderDoneDetail = firstMatchingDetail(for: "render_stream_done_server")
        let renderRequestID = {
            let fromMeta = requestID(from: renderMetaDetail)
            if !fromMeta.isEmpty { return fromMeta }
            let fromFirstDelta = requestID(from: renderFirstDeltaDetail)
            if !fromFirstDelta.isEmpty { return fromFirstDelta }
            return requestID(from: renderDoneDetail)
        }()
        let draftStartedBeforePlaybackFinished: Bool
        if let draftStartedAt, let playbackFinishedAt {
            draftStartedBeforePlaybackFinished = draftStartedAt < playbackFinishedAt
        } else {
            draftStartedBeforePlaybackFinished = false
        }
        let committedWhileAssistantSpeaking: Bool
        if let commitAt, let playbackStartedAt, let playbackFinishedAt {
            committedWhileAssistantSpeaking = commitAt >= playbackStartedAt && commitAt <= playbackFinishedAt
        } else {
            committedWhileAssistantSpeaking = false
        }
        let syncedInsertInterruptionReason = firstInterruptionReason(for: "synced_insert_cancelled")
        let syncedVoiceState = screenplayDraftBridge.syncedVoiceTurnState
        let syncedVoiceFallbackCommitted = screenplayDraftBridge.syncedVoiceFallbackCommitted
            || breadcrumbs.contains(where: { $0.event == "synced_insert_fallback_committed" })
        let syncedVoiceFallbackReason = {
            let bridgeReason = screenplayDraftBridge.syncedVoiceFallbackReason
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !bridgeReason.isEmpty { return bridgeReason }
            return firstMatchingDetail(for: "synced_insert_fallback_committed")
        }()
        let resolvedDispatchBaseURL = dispatchResolvedBaseURL.isEmpty
            ? firstFieldValue(for: "talk_dispatch_base_url_resolved", key: "base_url")
            : dispatchResolvedBaseURL
        let resolvedTalkRequestURL = talkRequestURL.isEmpty
            ? firstFieldValue(for: "talk_dispatch_request_built", key: "request_url")
            : talkRequestURL
        let resolvedDispatchStage = talkDispatchStage.isEmpty
            ? (
                !firstFieldValue(for: "talk_dispatch_failed", key: "stage").isEmpty
                    ? firstFieldValue(for: "talk_dispatch_failed", key: "stage")
                    : firstFieldValue(for: "talk_dispatch_stage", key: "stage")
            )
            : talkDispatchStage
        let resolvedClientTokenResolved = clientTokenResolved
            || firstFieldValue(for: "talk_dispatch_client_token_resolved", key: "resolved").lowercased() == "true"
        let resolvedDispatchErrorDomain = dispatchErrorDomain.isEmpty
            ? firstFieldValue(for: "talk_dispatch_failed", key: "domain")
            : dispatchErrorDomain
        let resolvedDispatchErrorCode = dispatchErrorCode
            ?? Int(firstFieldValue(for: "talk_dispatch_failed", key: "code"))
        let resolvedDispatchErrorDescription = dispatchErrorDescription.isEmpty
            ? firstFieldValue(for: "talk_dispatch_failed", key: "description")
            : dispatchErrorDescription
        let playbackStartSource = firstFieldValue(for: "assistant_playback_started", key: "source")
        let syncedVoiceCueDensified = syncedVoiceState.cueCount > screenplayCues.count
            && screenplayCues.count > 0

        let snapshot = StudioDebugVoiceTurnResultSnapshot(
            token: token,
            status: status,
            error: error,
            prompt: prompt,
            turnID: turnID,
            preparedUseScreenplayMode: preparedUseScreenplayMode,
            preparedShouldWriteToPage: preparedShouldWriteToPage,
            preparedMemoryDomain: preparedMemoryDomain,
            requestedScreenplayTarget: requestedScreenplayTarget,
            timingSource: timingSource,
            screenplayOutputTarget: screenplayOutputTarget,
            screenplayOutputSource: screenplayOutputSource,
            screenplayQualityReason: screenplayQualityReason,
            screenplayQualityConfidence: screenplayQualityConfidence,
            screenplayQualityFeatureAct: screenplayQualityFeatureAct,
            screenplayRepairAttempted: screenplayRepairAttempted,
            screenplayRepairOutcome: screenplayRepairOutcome,
            screenplayRepairMs: screenplayRepairMs,
            screenplayRepairReason: screenplayRepairReason,
            creativeMemoryApplied: creativeMemoryApplied,
            creativeMemoryProjectID: creativeMemoryProjectID,
            creativeMemoryProjectTitle: creativeMemoryProjectTitle,
            creativeMemoryCharacterCount: creativeMemoryCharacterCount,
            creativeMemoryEpisodicCount: creativeMemoryEpisodicCount,
            creativeMemoryCorrectionCount: creativeMemoryCorrectionCount,
            creativeMemoryCharacters: creativeMemoryCharacters,
            creativeMemoryCorrectedTerms: creativeMemoryCorrectedTerms,
            creativeMemoryCorrectionReplacements: creativeMemoryCorrectionReplacements,
            creativeMemoryEpisodeSummaries: creativeMemoryEpisodeSummaries,
            screenplayOutputText: screenplayOutputText,
            screenplayCueCount: screenplayCues.count,
            screenplayCues: screenplayCues,
            dialogueTimeline: dialogueTimeline,
            acknowledgedAtISO8601: acknowledgedAt.map { formatter.string(from: $0) },
            renderRequestID: renderRequestID,
            renderServerFirstDeltaMs: milliseconds(from: renderFirstDeltaDetail),
            renderServerTotalMs: milliseconds(from: renderDoneDetail),
            insertedPreview: String(insertedPreview.prefix(220)),
            replyPreview: String(replyPreview.prefix(220)),
            finalCommittedPageText: finalCommittedPageText,
            dispatchResolvedBaseURL: resolvedDispatchBaseURL,
            talkRequestURL: resolvedTalkRequestURL,
            talkDispatchStage: resolvedDispatchStage,
            clientTokenResolved: resolvedClientTokenResolved,
            dispatchErrorDomain: resolvedDispatchErrorDomain,
            dispatchErrorCode: resolvedDispatchErrorCode,
            dispatchErrorDescription: resolvedDispatchErrorDescription,
            draftStartedAtISO8601: draftStartedAt.map { formatter.string(from: $0) },
            headerTextCommittedAtISO8601: headerTextCommittedAt.map { formatter.string(from: $0) },
            commitAtISO8601: commitAt.map { formatter.string(from: $0) },
            firstAudioSegmentReadyAtISO8601: firstAudioSegmentReadyAt.map { formatter.string(from: $0) },
            playbackStartedAtISO8601: playbackStartedAt.map { formatter.string(from: $0) },
            playbackStartSource: playbackStartSource,
            playbackFinishedAtISO8601: playbackFinishedAt.map { formatter.string(from: $0) },
            draftStartedBeforePlaybackFinished: draftStartedBeforePlaybackFinished,
            committedWhileAssistantSpeaking: committedWhileAssistantSpeaking,
            syncedInsertInterruptionReason: syncedInsertInterruptionReason,
            syncedVoicePhase: syncedVoiceState.phase.rawValue,
            syncedVoiceAppliedCueCount: screenplayDraftBridge.syncedVoiceAppliedCueCount,
            syncedVoiceCueCount: syncedVoiceState.cueCount,
            syncedVoiceCueDensified: syncedVoiceCueDensified,
            syncedVoiceTimingSource: syncedVoiceState.timingSource,
            syncedVoiceFallbackCommitted: syncedVoiceFallbackCommitted,
            syncedVoiceFallbackReason: syncedVoiceFallbackReason,
            syncedVoicePlaybackDriftMs: screenplayDraftBridge.syncedVoicePlaybackDriftMs,
            syncedVoiceActiveSegmentID: syncedVoiceState.activeSegmentID,
            syncedVoiceActiveSceneID: syncedVoiceState.activeSceneID,
            syncedVoiceActiveBeatID: syncedVoiceState.activeBeatID,
            syncedVoiceActiveScriptNodeID: syncedVoiceState.activeScriptNodeID,
            syncedVoiceSeekApplied: syncedVoiceSeekApplied,
            syncedVoiceSeekCount: syncedVoiceSeekCount,
            syncedVoiceSeekFromMs: syncedVoiceSeekFromMs,
            syncedVoiceSeekToMs: syncedVoiceSeekToMs,
            syncedVoicePreviewReplyOnly: syncedVoiceState.previewReplyOnly,
            syncedVoiceSyncReady: syncedVoiceState.renderContract.syncReady,
            syncedVoiceAuthoritativePageTextAvailable: syncedVoiceState.renderContract.authoritativePageTextAvailable,
            breadcrumbs: breadcrumbs
        )

        if let data = try? JSONEncoder().encode(snapshot),
           let raw = String(data: data, encoding: .utf8),
           !raw.isEmpty {
            studioDebugVoiceTurnResultJSON = raw
            setStudioDebugPreferenceString(raw, forKey: "studio_debug_voice_turn_result_json")
            setStudioDebugPreferenceString(raw, forKey: studioDebugVoiceTurnResultKey(for: token))
            if appendPersistenceBreadcrumb {
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "debug_turn_result_persisted",
                    detail: "Studio debug voice result JSON persisted.",
                    replyPreview: replyPreview,
                    tokenOverride: token,
                    promptPreviewOverride: prompt
                )
            }
        } else {
            let manualBreadcrumbs = breadcrumbs.map { breadcrumb in
                [
                    "token": breadcrumb.token,
                    "event": breadcrumb.event,
                    "detail": breadcrumb.detail,
                    "interruptionReason": breadcrumb.interruptionReason as Any,
                    "promptPreview": breadcrumb.promptPreview,
                    "replyPreview": breadcrumb.replyPreview,
                    "restorePreview": breadcrumb.restorePreview as Any,
                    "timestampISO8601": breadcrumb.timestampISO8601,
                ]
            }
            let manualScreenplayCues = screenplayCues.map { cue in
                [
                    "index": cue.index,
                    "text": cue.text,
                    "element": cue.element,
                    "start_ms": cue.startMs,
                    "end_ms": cue.endMs,
                ]
            }
            let manualDialogueTimeline: Any = {
                guard let dialogueTimeline,
                      let data = try? JSONEncoder().encode(dialogueTimeline),
                      let object = try? JSONSerialization.jsonObject(with: data, options: []) else {
                    return NSNull()
                }
                return object
            }()
            let manualSnapshot: [String: Any] = [
                "token": token,
                "status": status,
                "error": error,
                "prompt": prompt,
                "turnID": turnID,
                "preparedUseScreenplayMode": preparedUseScreenplayMode,
                "preparedShouldWriteToPage": preparedShouldWriteToPage,
                "preparedMemoryDomain": preparedMemoryDomain,
                "requestedScreenplayTarget": requestedScreenplayTarget,
                "timingSource": timingSource,
                "screenplayOutputTarget": screenplayOutputTarget,
                "screenplayOutputSource": screenplayOutputSource,
                "screenplayQualityReason": screenplayQualityReason,
                "screenplayQualityConfidence": screenplayQualityConfidence,
                "screenplayQualityFeatureAct": screenplayQualityFeatureAct,
                "screenplayRepairAttempted": screenplayRepairAttempted,
                "screenplayRepairOutcome": screenplayRepairOutcome,
                "screenplayRepairMs": screenplayRepairMs as Any,
                "screenplayRepairReason": screenplayRepairReason,
                "creativeMemoryApplied": creativeMemoryApplied,
                "creativeMemoryProjectID": creativeMemoryProjectID,
                "creativeMemoryProjectTitle": creativeMemoryProjectTitle,
                "creativeMemoryCharacterCount": creativeMemoryCharacterCount,
                "creativeMemoryEpisodicCount": creativeMemoryEpisodicCount,
                "creativeMemoryCorrectionCount": creativeMemoryCorrectionCount,
                "creativeMemoryCharacters": creativeMemoryCharacters,
                "creativeMemoryCorrectedTerms": creativeMemoryCorrectedTerms,
                "creativeMemoryCorrectionReplacements": creativeMemoryCorrectionReplacements,
                "creativeMemoryEpisodeSummaries": creativeMemoryEpisodeSummaries,
                "screenplayOutputText": screenplayOutputText,
                "screenplayCueCount": screenplayCues.count,
                "screenplayCues": manualScreenplayCues,
                "dialogueTimeline": manualDialogueTimeline,
                "acknowledgedAtISO8601": acknowledgedAt.map { formatter.string(from: $0) } as Any,
                "renderRequestID": renderRequestID,
                "renderServerFirstDeltaMs": milliseconds(from: renderFirstDeltaDetail) as Any,
                "renderServerTotalMs": milliseconds(from: renderDoneDetail) as Any,
                "insertedPreview": String(insertedPreview.prefix(220)),
                "replyPreview": String(replyPreview.prefix(220)),
                "finalCommittedPageText": finalCommittedPageText,
                "dispatchResolvedBaseURL": resolvedDispatchBaseURL,
                "talkRequestURL": resolvedTalkRequestURL,
                "talkDispatchStage": resolvedDispatchStage,
                "clientTokenResolved": resolvedClientTokenResolved,
                "dispatchErrorDomain": resolvedDispatchErrorDomain,
                "dispatchErrorCode": resolvedDispatchErrorCode as Any,
                "dispatchErrorDescription": resolvedDispatchErrorDescription,
                "draftStartedAtISO8601": draftStartedAt.map { formatter.string(from: $0) } as Any,
                "headerTextCommittedAtISO8601": headerTextCommittedAt.map { formatter.string(from: $0) } as Any,
                "commitAtISO8601": commitAt.map { formatter.string(from: $0) } as Any,
                "firstAudioSegmentReadyAtISO8601": firstAudioSegmentReadyAt.map { formatter.string(from: $0) } as Any,
                "playbackStartedAtISO8601": playbackStartedAt.map { formatter.string(from: $0) } as Any,
                "playbackStartSource": playbackStartSource,
                "playbackFinishedAtISO8601": playbackFinishedAt.map { formatter.string(from: $0) } as Any,
                "draftStartedBeforePlaybackFinished": draftStartedBeforePlaybackFinished,
                "committedWhileAssistantSpeaking": committedWhileAssistantSpeaking,
                "syncedInsertInterruptionReason": syncedInsertInterruptionReason,
                "syncedVoicePhase": syncedVoiceState.phase.rawValue,
                "syncedVoiceAppliedCueCount": screenplayDraftBridge.syncedVoiceAppliedCueCount,
                "syncedVoiceCueCount": syncedVoiceState.cueCount,
                "syncedVoiceCueDensified": syncedVoiceCueDensified,
                "syncedVoiceTimingSource": syncedVoiceState.timingSource,
                "syncedVoiceFallbackCommitted": syncedVoiceFallbackCommitted,
                "syncedVoiceFallbackReason": syncedVoiceFallbackReason,
                "syncedVoicePlaybackDriftMs": screenplayDraftBridge.syncedVoicePlaybackDriftMs,
                "syncedVoiceActiveSegmentID": syncedVoiceState.activeSegmentID as Any,
                "syncedVoiceActiveSceneID": syncedVoiceState.activeSceneID,
                "syncedVoiceActiveBeatID": syncedVoiceState.activeBeatID as Any,
                "syncedVoiceActiveScriptNodeID": syncedVoiceState.activeScriptNodeID,
                "syncedVoiceSeekApplied": syncedVoiceSeekApplied,
                "syncedVoiceSeekCount": syncedVoiceSeekCount,
                "syncedVoiceSeekFromMs": syncedVoiceSeekFromMs as Any,
                "syncedVoiceSeekToMs": syncedVoiceSeekToMs as Any,
                "syncedVoicePreviewReplyOnly": syncedVoiceState.previewReplyOnly,
                "syncedVoiceSyncReady": syncedVoiceState.renderContract.syncReady,
                "syncedVoiceAuthoritativePageTextAvailable": syncedVoiceState.renderContract.authoritativePageTextAvailable,
                "breadcrumbs": manualBreadcrumbs,
            ]
            if JSONSerialization.isValidJSONObject(manualSnapshot),
               let data = try? JSONSerialization.data(withJSONObject: manualSnapshot, options: []),
               let raw = String(data: data, encoding: .utf8) {
                studioDebugVoiceTurnResultJSON = raw
                setStudioDebugPreferenceString(raw, forKey: "studio_debug_voice_turn_result_json")
                setStudioDebugPreferenceString(raw, forKey: studioDebugVoiceTurnResultKey(for: token))
                if appendPersistenceBreadcrumb {
                    appendStudioDebugVoiceDraftBreadcrumb(
                        event: "debug_turn_result_persisted",
                        detail: "Studio debug voice result JSON persisted via manual serialization.",
                        replyPreview: replyPreview,
                        tokenOverride: token,
                        promptPreviewOverride: prompt
                    )
                }
            } else {
                studioDebugVoiceTurnResultJSON = "{\"token\":\(token),\"status\":\"\(status)\"}"
                setStudioDebugPreferenceString(
                    "{\"token\":\(token),\"status\":\"\(status)\"}",
                    forKey: "studio_debug_voice_turn_result_json"
                )
                setStudioDebugPreferenceString(
                    "{\"token\":\(token),\"status\":\"\(status)\"}",
                    forKey: studioDebugVoiceTurnResultKey(for: token)
                )
                if appendPersistenceBreadcrumb {
                    appendStudioDebugVoiceDraftBreadcrumb(
                        event: "debug_turn_result_persisted",
                        detail: "Studio debug voice result JSON persisted via minimal fallback snapshot.",
                        replyPreview: replyPreview,
                        tokenOverride: token,
                        promptPreviewOverride: prompt
                    )
                }
            }
        }
        studioDebugVoiceTurnResultStatus = status
        studioDebugVoiceTurnResultError = error
        studioDebugVoiceTurnResultToken = token
        setStudioDebugPreferenceString(status, forKey: "studio_debug_voice_turn_result_status")
        setStudioDebugPreferenceString(error, forKey: "studio_debug_voice_turn_result_error")
        setStudioDebugPreferenceInt(token, forKey: "studio_debug_voice_turn_result_token")
    }

    private func persistStudioDebugVoiceTurnProgress(
        token: Int,
        status: String = "running",
        error: String = "",
        prompt: String,
        turnID: String,
        insertedPreview: String,
        replyPreview: String,
        dialogueTimeline: BackendTalkDialogueTimelineRevision? = nil,
        finalCommittedPageText: String = "",
        dispatchResolvedBaseURL: String = "",
        talkRequestURL: String = "",
        talkDispatchStage: String = "",
        clientTokenResolved: Bool = false,
        dispatchErrorDomain: String = "",
        dispatchErrorCode: Int? = nil,
        dispatchErrorDescription: String = ""
    ) {
        writeStudioDebugVoiceTurnResult(
            token: token,
            status: status,
            error: error,
            prompt: prompt,
            turnID: turnID,
            dialogueTimeline: dialogueTimeline,
            insertedPreview: insertedPreview,
            replyPreview: replyPreview,
            finalCommittedPageText: finalCommittedPageText,
            dispatchResolvedBaseURL: dispatchResolvedBaseURL,
            talkRequestURL: talkRequestURL,
            talkDispatchStage: talkDispatchStage,
            clientTokenResolved: clientTokenResolved,
            dispatchErrorDomain: dispatchErrorDomain,
            dispatchErrorCode: dispatchErrorCode,
            dispatchErrorDescription: dispatchErrorDescription,
            appendPersistenceBreadcrumb: false
        )
    }

#endif

    private func silentTalkWavData(durationMs: Int, sampleRate: Int = 16_000) -> Data {
        let safeDurationMs = max(120, min(2_000, durationMs))
        let channels: UInt16 = 1
        let bitsPerSample: UInt16 = 16
        let bytesPerSample = Int(bitsPerSample / 8)
        let frameCount = max(1, (sampleRate * safeDurationMs) / 1_000)
        let dataSize = frameCount * Int(channels) * bytesPerSample
        let byteRate = UInt32(sampleRate * Int(channels) * bytesPerSample)
        let blockAlign = UInt16(Int(channels) * bytesPerSample)
        let riffChunkSize = UInt32(36 + dataSize)

        var data = Data()
        data.append(contentsOf: "RIFF".utf8)
        data.append(littleEndianBytes(riffChunkSize))
        data.append(contentsOf: "WAVE".utf8)
        data.append(contentsOf: "fmt ".utf8)
        data.append(littleEndianBytes(UInt32(16)))
        data.append(littleEndianBytes(UInt16(1)))
        data.append(littleEndianBytes(channels))
        data.append(littleEndianBytes(UInt32(sampleRate)))
        data.append(littleEndianBytes(byteRate))
        data.append(littleEndianBytes(blockAlign))
        data.append(littleEndianBytes(bitsPerSample))
        data.append(contentsOf: "data".utf8)
        data.append(littleEndianBytes(UInt32(dataSize)))
        data.append(Data(repeating: 0, count: dataSize))
        return data
    }

    private func littleEndianBytes(_ value: UInt16) -> Data {
        var littleEndian = value.littleEndian
        return Data(bytes: &littleEndian, count: MemoryLayout<UInt16>.size)
    }

    private func littleEndianBytes(_ value: UInt32) -> Data {
        var littleEndian = value.littleEndian
        return Data(bytes: &littleEndian, count: MemoryLayout<UInt32>.size)
    }

    private func handleContentViewAppear() {
        #if DEBUG || os(macOS)
        noteStudioDebugLifecycle("content_view_appear")
        #if DEBUG
        #if os(macOS)
        startStudioDebugCommandPolling()
        #endif
        processPendingStudioDebugCommandsIfNeeded()
        #endif
        #endif
        if studioOwnerUserIDSnapshot == nil || studioWasAuthenticatedSnapshot == nil {
            let session = BackendAuthClient.currentAuthSessionState()
            studioOwnerUserIDSnapshot = session.user?.userId ?? ""
            studioWasAuthenticatedSnapshot = session.isAuthenticated && !session.accessExpired
        }
        ensureSessionBumped()
        onboardingName = evolution.preferredName
        if evolution.needsOnboardingName {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                onboardingNameFocused = true
            }
        } else {
            #if DEBUG
            let shouldRestorePersistedSurface = ThemWorkspaceSurfaceRestorePolicy.shouldRestorePersistedSurface(
                isRunningUITests: IOThemRuntime.isRunningUITests,
                arguments: ProcessInfo.processInfo.arguments
            )
            #else
            let shouldRestorePersistedSurface = true
            #endif
            if shouldRestorePersistedSurface {
                restoreWorkspaceSurfaceForLaunchIfNeeded()
            }
            if !isStudioSurfaceActive {
                verballyAskForPersonalityIfNeeded()
            }
        }

        configureVoiceCallbacks()
        voice.isStudioMode = isStudioSurfaceActive
        configureRealtimeCallbacks()
        startOfflineTalkOutbox()

        if !IOThemRuntime.isRunningUITests {
            startBackendHealthMonitoring()
            scheduleBackendHydration()
            Task { @MainActor in
                await screenplayDraftBridge.hydrateBackendCompanionState(force: false)
            }
            if voiceTransportMode == .realtimePreview {
                Task { @MainActor in
                    await prewarmRealtimeIfNeeded(isScreenplayMode: isStudioSurfaceActive)
                }
            }
        }

        #if DEBUG
        openUITestLaunchSurfaceIfNeeded()
        #endif

        DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
            withAnimation(.easeInOut(duration: 2)) {
                showPrompt = false
            }
        }

        installMacKeyMonitorIfNeeded()
    }

    #if DEBUG
    private func openUITestLaunchSurfaceIfNeeded() {
        guard IOThemRuntime.isRunningUITests else { return }
        guard !evolution.needsOnboardingName else { return }
        let arguments = ProcessInfo.processInfo.arguments
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if UITestLaunchConfiguration.shouldRunAuthRefreshSmoke(arguments: arguments) {
                Task { @MainActor in
                    do {
                        let refreshed = try await BackendAuthClient.refreshAuthSession(force: true)
                        print("[UITestAuthRefreshSmoke] authenticated=\(refreshed.isAuthenticated)")
                    } catch {
                        print("[UITestAuthRefreshSmoke] authenticated=false")
                    }
                }
            }
            if arguments.contains("--ui-open-memories") {
                uiTestForceStudioSurface = false
                primarySurface = .home
                openMemories()
            } else if arguments.contains("--ui-open-data-controls") {
                uiTestForceStudioSurface = false
                primarySurface = .home
                showingDataControls = true
            } else if arguments.contains("--ui-open-studio") {
                uiTestForceStudioSurface = true
                openStudio()
            }
            if arguments.contains("--ui-show-canon-clarification") {
                presentCanonClarificationIfNeeded(
                    BackendCanonCorrectionAmbiguity(
                        id: "canon_ambiguity_ui_fixture",
                        status: "pending",
                        projectId: "split-ferries",
                        projectTitle: "Split Ferries",
                        correctionText: "Mara goes back for both of them.",
                        candidateFacts: [
                            "Mara abandons Eli at the east ferry dock.",
                            "Mara abandons June at the east ferry dock.",
                        ],
                        correctionMemoryId: nil,
                        selectedFact: nil,
                        selectedFacts: nil,
                        receiptId: nil,
                        createdAt: Date().timeIntervalSince1970 * 1_000,
                        resolvedAt: nil
                    )
                )
            }
            runUITestRealtimeNetworkFaultSmokeIfNeeded(arguments: arguments)
        }
    }

    private func runUITestRealtimeNetworkFaultSmokeIfNeeded(arguments: [String]) {
        guard let flagIndex = arguments.firstIndex(of: "--ui-realtime-network-fault") else { return }
        let valueIndex = arguments.index(after: flagIndex)
        guard arguments.indices.contains(valueIndex),
              let stage = ClementineRealtimeFaultStage(rawValue: arguments[valueIndex]) else {
            uiTestRealtimeNetworkFaultResult = "complete=false error=invalid_fault_stage"
            return
        }

        uiTestRealtimeNetworkFaultStage = stage
        uiTestRealtimeNetworkFaultResult = "stage=\(stage.rawValue) complete=false status=injecting"
        conversationLoopEnabled = true
        realtimePreviewStandardFallbackActive = false
        resetRealtimeRecoveryOutcome(
            turnID: "network-fault-\(stage.rawValue)",
            transcript: "Move Mara into Act Two before Eli reaches the ferry."
        )
        handleRealtimeConnectionLoss(
            .simulatedFault(
                stage: stage,
                turnID: "network-fault-\(stage.rawValue)"
            )
        )
    }
    #endif


    private func ensurePageInterruptService() -> ClementinePageInterruptService {
        if let existing = pageInterruptService {
            return existing
        }
        let created = ClementinePageInterruptService(backend: backend)
        pageInterruptService = created
        bindPageInterruptObservation(to: created)
        return created
    }

    private func bindPageInterruptObservation(to service: ClementinePageInterruptService) {
        backend.onPageReservationObserved = { reservationId in
            Task { @MainActor in
                service.notePageReservationId(reservationId)
            }
        }
        backend.onPageTalkInFlightChanged = { inFlight in
            Task { @MainActor in
                service.markPageTalkInFlight(inFlight)
            }
        }
    }

    private func requestPageLaneCancelOnInterrupt(reason: ScreenplaySyncedInsertInterruptionReason) {
        ensurePageInterruptService().handleInterrupt(reason: reason)
    }

    private func configureVoiceCallbacks() {
        _ = ensurePageInterruptService()
        screenplayDraftBridge.onPageGenerationInterrupted = { reason in
            requestPageLaneCancelOnInterrupt(reason: reason)
        }
        voice.stopAssistantPlayback = {
            let typedTurnID = typedReplySpeaker.activeTurnID
            let turnBasedTurnID = orbAudio.isSpeaking
                ? activeTurnBasedLatencyTurnID.trimmingCharacters(in: .whitespacesAndNewlines)
                : ""
            if typedReplySpeaker.isSpeaking, let typedTurnID {
                clientLatency.beginBargeIn(turnID: typedTurnID)
            }
            if !turnBasedTurnID.isEmpty {
                clientLatency.beginBargeIn(turnID: turnBasedTurnID)
            }
            orbAudio.stop()
            promptSpeaker.stop()
            typedReplySpeaker.cancel()
            // D010: abort any in-flight ElevenLabs BYOK client stream (same interrupt family).
            CompanionTtsRouter.shared.abortInFlight()
            if let typedTurnID {
                clientLatency.recordBargeInAcknowledged(turnID: typedTurnID)
            }
            if !turnBasedTurnID.isEmpty {
                clientLatency.recordBargeInAcknowledged(turnID: turnBasedTurnID)
                activeTurnBasedLatencyTurnID = ""
            }
            voice.markAssistantPlaybackEnded()
            inFlightTalkTask?.cancel()
            inFlightTalkTask = nil
            isThinking = false
            requestPageLaneCancelOnInterrupt(reason: .bargeIn)
        }
        voice.isAssistantPlaying = {
            orbAudio.isSpeaking ||
                promptSpeaker.isSpeaking ||
                typedReplySpeaker.isSpeaking ||
                realtimeTransport.isAssistantSpeaking
        }
        voice.onBargeInDetected = {
            HerLog.ui.info("barge-in detected -> interrupting assistant audio")
            isThinking = false
            speculativeTalk.cancel()
            screenplayDraftBridge.cancelStream(reason: .bargeIn)
        }
        typedReplySpeaker.onFirstAudioStarted = { turnID, startedAt, networkClass, targetCharacters in
            clientLatency.recordFirstAudio(
                turnID: turnID,
                at: startedAt,
                networkClass: networkClass,
                targetCharacters: targetCharacters
            )
            if voice.mode == .capturingSpeech {
                clientLatency.beginBargeIn(turnID: turnID, at: startedAt)
                typedReplySpeaker.cancel()
                clientLatency.recordBargeInAcknowledged(turnID: turnID)
                screenplayDraftBridge.cancelStream(reason: .bargeIn)
            } else if voice.mode == .armedListening {
                voice.markAssistantPlaybackStarted()
            }
        }
        typedReplySpeaker.onNetworkProfileChanged = { turnID, networkClass, targetCharacters in
            clientLatency.recordNetworkProfile(
                turnID: turnID,
                networkClass: networkClass,
                targetCharacters: targetCharacters
            )
        }
        typedReplySpeaker.onPlaybackEnded = { _ in
            if voice.mode == .assistantSpeaking {
                voice.markAssistantPlaybackEnded()
            }
        }
        voice.onPartialTranscript = { partial in
            livePartialTranscript = partial
            let cleaned = partial.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleaned.isEmpty {
                lastNonEmptyPartialTranscriptHint = String(cleaned.prefix(320))
                hideReplyEcho()
            }
        }
        voice.onSpeechProgressSnapshot = { audioSnapshot, partial, speechAge in
            let cleaned = partial.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return }
            let screenplayModeHint = isStudioSurfaceActive || shouldAutoOpenStudioForScriptIntent(cleaned)
            let speculativePreparedPrompt = buildPreparedTurnPrompt(
                confirmedTranscript: cleaned,
                partialHint: cleaned,
                isScreenplayModeOverride: screenplayModeHint,
                turnKeyNamespace: "speculative"
            )
            speculativeTalk.prepareIfNeeded(
                seedText: cleaned,
                isScreenplayMode: speculativePreparedPrompt.useScreenplayMode,
                shouldWriteToPage: speculativePreparedPrompt.shouldWriteToPage
            ) { _, _, _ in
                return await buildCanonicalModelPrompt(
                    speculativePreparedPrompt.baseSystemPrompt,
                    userMessage: speculativePreparedPrompt.directorText,
                    isScreenplayMode: speculativePreparedPrompt.useScreenplayMode,
                    shouldWriteToPage: speculativePreparedPrompt.shouldWriteToPage
                )
            }
            speculativeTalk.consider(
                audioSnapshot: audioSnapshot,
                partialText: cleaned,
                speechAge: speechAge,
                isTurnSubmitting: isTurnSubmitting
            ) { request in
                let receipt = try await backend.prepareSpeculativeTalk(
                    audioSnapshot: request.audioSnapshot,
                    systemPrompt: request.preparedPrompt,
                    userName: evolution.preferredName,
                    partialTranscriptHint: request.partialText,
                    speculativeKey: request.speculativeKey,
                    speculativePromptHash: request.preparedPromptHash
                )
                return SpeculativeTalkPrepareReceipt(speculativeKey: receipt.speculativeKey)
            }
        }
        voice.onUtteranceReady = { wavData in
            hideReplyEcho()
            guard !isTurnSubmitting else {
                isThinking = false
                voice.markRequestFailed()
                voice.resumeRecordingIfNeeded()
                return
            }

            isThinking = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                isThinking = false
            }

            guard inFlightTalkTask == nil else { return }
            inFlightTalkTask = Task {
                await sendUtterance(wavData)
            }
        }
    }

    private func configureRealtimeCallbacks() {
        realtimeTransport.onConnected = {
            handleRealtimeConnectionRestored()
        }
        realtimeTransport.onConnectionLost = { loss in
            handleRealtimeConnectionLoss(loss)
        }
        realtimeTransport.onProjectGroundingEvent = { event in
            clientLatency.recordRealtimeGrounding(event)
            HerLog.talk.info(
                "realtime project grounding event=\(event.kind.rawValue, privacy: .public) attempt=\(event.attempt) elapsed_ms=\(event.elapsedMilliseconds ?? 0, privacy: .public)"
            )
        }
        realtimeTransport.onProjectGroundingUpdated = { revision in
            let cleanRevision = revision.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanRevision.isEmpty else { return }
            lastRealtimeGroundingRevision = cleanRevision
            if pendingRealtimeGroundingRevision == cleanRevision {
                pendingRealtimeGroundingRevision = ""
            }
        }
        realtimeTransport.onProjectGroundingUpdateFailed = { revision, message in
            let cleanRevision = revision.trimmingCharacters(in: .whitespacesAndNewlines)
            if pendingRealtimeGroundingRevision == cleanRevision {
                pendingRealtimeGroundingRevision = ""
            }
            HerLog.talk.error(
                "realtime project grounding refresh failed revision=\(cleanRevision, privacy: .public) error=\(message, privacy: .public)"
            )
        }
        realtimeTransport.onUserSpeechStarted = { turnID in
            realtimeAssistantTranscriptFallbackTask?.cancel()
            realtimeAssistantTranscriptFallbackTask = nil
            realtimePendingUserTranscript = ""
            realtimeRecoveryTurnID = turnID.trimmingCharacters(in: .whitespacesAndNewlines)
            realtimeRecoveryTranscriptIsFinal = false
            realtimeRecoveryNeedsTurnRepair = false
            resetRealtimeRecoveryOutcome(turnID: realtimeRecoveryTurnID)
            if isStudioSurfaceActive {
                cancelRealtimeStudioDraftStream(restorePreview: true)
            }
        }
        realtimeTransport.onLatencyEvent = { event in
            switch event.kind {
            case .turnStarted:
                clientLatency.beginTurn(id: event.turnID, transport: .realtimeVoice)
                if let networkClass = event.networkClass {
                    clientLatency.recordNetworkProfile(
                        turnID: event.turnID,
                        networkClass: networkClass
                    )
                }
            case .firstText:
                if let elapsedMilliseconds = event.elapsedMilliseconds {
                    clientLatency.recordFirstText(
                        turnID: event.turnID,
                        elapsedMilliseconds: elapsedMilliseconds
                    )
                }
            case .firstAudio:
                if let elapsedMilliseconds = event.elapsedMilliseconds {
                    clientLatency.recordFirstAudio(
                        turnID: event.turnID,
                        elapsedMilliseconds: elapsedMilliseconds
                    )
                }
            case .bargeInStarted:
                clientLatency.beginBargeIn(turnID: event.turnID)
            case .bargeInAcknowledged:
                if let elapsedMilliseconds = event.elapsedMilliseconds {
                    clientLatency.recordBargeInAcknowledged(
                        turnID: event.turnID,
                        elapsedMilliseconds: elapsedMilliseconds
                    )
                }
            case .networkProfile:
                if let networkClass = event.networkClass {
                    clientLatency.recordNetworkProfile(
                        turnID: event.turnID,
                        networkClass: networkClass
                    )
                }
            }
        }
        realtimeTransport.onUserTranscriptPartial = { partial in
            let cleaned = partial.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return }
            if realtimeTransport.isAssistantSpeaking {
                realtimeAssistantTranscriptFallbackTask?.cancel()
                realtimeAssistantTranscriptFallbackTask = nil
                realtimeTransport.interruptAssistant()
                if isStudioSurfaceActive {
                    cancelRealtimeStudioDraftStream(restorePreview: true)
                }
            }
            livePartialTranscript = String(cleaned.prefix(320))
            lastNonEmptyPartialTranscriptHint = String(cleaned.prefix(320))
            hideReplyEcho()
        }
        realtimeTransport.onUserTranscriptFinal = { finalTranscript in
            let cleaned = finalTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return }
            let preparedPrompt = buildPreparedTurnPrompt(
                confirmedTranscript: cleaned,
                partialHint: cleaned,
                turnKeyNamespace: "realtime"
            )
            screenplayDraftBridge.applyCompanionSignalState(
                preparedPrompt.companionSignals,
                persist: false
            )
            if preparedPrompt.memoryDomain != .companion {
                HerEvolutionStore.shared.noteCreativeContext(
                    from: preparedPrompt.directorText,
                    isScreenplayMode: preparedPrompt.useScreenplayMode
                )
            }
            if preparedPrompt.shouldAutoOpenStudio, !isStudioSurfaceActive {
                openStudio()
            }
            transcript = preparedPrompt.directorText
            livePartialTranscript = ""
            lastNonEmptyPartialTranscriptHint = String(preparedPrompt.directorText.prefix(320))
            let localCommand = runLocalStudioCommandIfNeeded(
                preparedPrompt.directorText,
                source: .voice,
                shouldSpeakConfirmation: true
            )
            if localCommand.handled {
                clearRealtimeRecoveryTurn()
                return
            }
            Task { @MainActor in
                await applyConversationalStudioCorrectionIfNeeded(
                    preparedPrompt.directorText
                )
            }
            realtimePendingUserTranscript = preparedPrompt.directorText
            realtimeRecoveryTranscriptIsFinal = true
            realtimeRecoveryNeedsTurnRepair = true
            if isStudioSurfaceActive || preparedPrompt.shouldAutoOpenStudio {
                startRealtimeStudioDraftStreamIfNeeded(for: preparedPrompt.directorText)
            }
        }
        realtimeTransport.onAssistantTranscriptFinal = { finalTranscript in
            let cleaned = finalTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return }
            if Date().timeIntervalSince(lastRealtimeAssistantTextAt) < 1.5,
               realtimePendingUserTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return
            }
            realtimeAssistantTranscriptFallbackTask?.cancel()
            realtimeAssistantTranscriptFallbackTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 450_000_000)
                guard !Task.isCancelled else { return }
                guard acceptRealtimeRecoveryResponseIfNeeded() else {
                    realtimeAssistantTranscriptFallbackTask = nil
                    return
                }
                await handleCompletedRealtimeTurn(
                    userMessage: currentRealtimePendingUserMessage(),
                    assistantMessage: cleaned
                )
                clearRealtimeRecoveryTurn()
                realtimeAssistantTranscriptFallbackTask = nil
            }
        }
        realtimeTransport.onAssistantTextFinal = { finalText in
            let cleaned = finalText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return }
            lastRealtimeAssistantTextAt = Date()
            realtimeAssistantTranscriptFallbackTask?.cancel()
            realtimeAssistantTranscriptFallbackTask = nil
            Task { @MainActor in
                guard acceptRealtimeRecoveryResponseIfNeeded() else { return }
                await handleCompletedRealtimeTurn(
                    userMessage: currentRealtimePendingUserMessage(),
                    assistantMessage: cleaned
                )
                clearRealtimeRecoveryTurn()
            }
        }
    }

    private func handleContentViewDisappear() {
#if DEBUG
        #if os(macOS)
        if IOThemRuntime.isRunningTests {
            stopStudioDebugCommandPolling()
        }
        #endif
#endif
        backendHydrationTask?.cancel()
        backendHydrationTask = nil
        transientTurnBannerTask?.cancel()
        transientTurnBannerTask = nil
        replyEchoClearTask?.cancel()
        replyEchoClearTask = nil
        #if os(macOS)
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
            self.keyMonitor = nil
        }
        #endif
        voice.onUtteranceReady = nil
        voice.stopAssistantPlayback = nil
        voice.isAssistantPlaying = nil
        voice.onBargeInDetected = nil
        voice.onPartialTranscript = nil
        voice.onSpeechProgressSnapshot = nil
        typedReplySpeaker.onFirstAudioStarted = nil
        typedReplySpeaker.onNetworkProfileChanged = nil
        typedReplySpeaker.onPlaybackEnded = nil
        speculativeTalk.cancel()
        cancelRealtimeStudioDraftStream(restorePreview: true)
        realtimeTransport.onUserTranscriptPartial = nil
        realtimeTransport.onUserTranscriptFinal = nil
        realtimeTransport.onAssistantTranscriptFinal = nil
        realtimeTransport.onAssistantTextFinal = nil
        realtimeTransport.onUserSpeechStarted = nil
        realtimeTransport.onLatencyEvent = nil
        realtimeTransport.onConnected = nil
        realtimeTransport.onConnectionLost = nil
        realtimeTransport.onProjectGroundingEvent = nil
        realtimeTransport.onProjectGroundingUpdated = nil
        realtimeTransport.onProjectGroundingUpdateFailed = nil
        realtimeGroundingRefreshTask?.cancel()
        realtimeGroundingRefreshTask = nil
        pendingRealtimeGroundingRevision = ""
        realtimeAssistantTranscriptFallbackTask?.cancel()
        realtimeAssistantTranscriptFallbackTask = nil
        cancelRealtimeRecovery(clearTurn: true)
        inFlightTalkTask?.cancel()
        inFlightTalkTask = nil
        realtimeTransport.disconnect()
        orbAudio.stop()
        promptSpeaker.stop()
        typedReplySpeaker.cancel()
        stopBackendHealthMonitoring()
    }

    private func handleScenePhaseChange(_ newPhase: ScenePhase) {
        guard newPhase == .active else {
            if voiceTransportMode == .realtimePreview, conversationLoopEnabled {
                cancelRealtimeRecovery(clearTurn: false)
                realtimeTransport.disconnect()
            }
            return
        }
#if DEBUG
        processPendingStudioDebugCommandsIfNeeded()
#endif
        retryOfflineTalkOutbox()
        scheduleBackendHydration()
        Task { @MainActor in
            await screenplayDraftBridge.hydrateBackendCompanionState(force: false)
        }
        if voiceTransportMode == .realtimePreview,
           conversationLoopEnabled,
           !realtimePreviewStandardFallbackActive {
            if realtimeRecoveryTranscriptIsFinal && realtimeRecoveryNeedsTurnRepair {
                scheduleRealtimeReconnect(
                    after: .local(
                        cause: .peerConnectionDisconnected,
                        message: "Realtime session resumed after the app became active."
                    )
                )
            } else {
                Task { @MainActor in
                    await startRealtimePreviewConversationIfNeeded()
                }
            }
        }
    }

    private func handleVoiceTransportModeChange(_ newValue: String) {
        let mode = ClementineVoiceTransportMode(rawValue: newValue) ?? .turnBased
        cancelRealtimeRecovery(clearTurn: true)
        realtimePreviewStandardFallbackActive = false
        if mode == .realtimePreview {
            Task { @MainActor in
                await prewarmRealtimeIfNeeded(isScreenplayMode: isStudioSurfaceActive)
            }
        } else {
            realtimeVoice.clear()
            realtimeTransport.disconnect()
            realtimeBridgeRequest = nil
        }
    }

    private func handleRealtimeSupplierModeChange(_ newValue: String) {
        _ = ClementineRealtimeSupplierMode.normalized(rawValue: newValue)
        cancelRealtimeRecovery(clearTurn: true)
        realtimePreviewStandardFallbackActive = false
        realtimeVoice.clear()
        realtimeTransport.disconnect()
        realtimeBridgeRequest = nil
        guard voiceTransportMode == .realtimePreview else { return }
        Task { @MainActor in
            await prewarmRealtimeIfNeeded(isScreenplayMode: isStudioSurfaceActive)
        }
    }

    private func applySheetModifiers(to view: AnyView) -> AnyView {
        AnyView(
            view
                .sheet(isPresented: $showingMemories) {
                    MemoriesScreen(startTalkingAction: {
                            showingMemories = false
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                                guard !evolution.needsOnboardingName else { return }
                                startConversationLoopIfNeeded()
                            }
                        }, openStudioAction: {
                            showingMemories = false
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                                openStudio()
                            }
                        })
                        .themDesktopSheetFrame(minWidth: 1100, minHeight: 760)
                }
                .sheet(isPresented: $showingConversationHistory) {
                    ConversationHistoryScreen(openConversation: {
                            showingConversationHistory = false
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                                guard !evolution.needsOnboardingName else { return }
                                startConversationLoopIfNeeded()
                            }
                        })
                        .themDesktopSheetFrame(minWidth: 1100, minHeight: 760)
                }
                .sheet(isPresented: $showingNotes) {
                    NotesPanel(onDone: {
                        showingNotes = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                            guard !evolution.needsOnboardingName else { return }
                            startConversationLoopIfNeeded()
                        }
                    })
                    .themDesktopSheetFrame(minWidth: 920, minHeight: 700)
                }
                .sheet(isPresented: $showingTasks) {
                    TasksPanel(onDone: {
                        showingTasks = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                            guard !evolution.needsOnboardingName else { return }
                            startConversationLoopIfNeeded()
                        }
                    })
                    .themDesktopSheetFrame(minWidth: 900, minHeight: 680)
                }
                .sheet(isPresented: $showingRecap) {
                    RecapPanel(onDone: {
                        showingRecap = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                            guard !evolution.needsOnboardingName else { return }
                            startConversationLoopIfNeeded()
                        }
                    })
                    .themDesktopSheetFrame(minWidth: 900, minHeight: 700)
                }
                .sheet(isPresented: $showingVoiceSettings) {
                    VoiceSettingsScreen(onDone: {
                        showingVoiceSettings = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                            guard !evolution.needsOnboardingName else { return }
                            startConversationLoopIfNeeded()
                        }
                    })
                    .themDesktopSheetFrame(minWidth: 960, minHeight: 760)
                }
                .sheet(isPresented: $showingCompanionControls) {
                    CompanionControlsPanel(
                        bridge: screenplayDraftBridge,
                        onDone: {
                            showingCompanionControls = false
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                                guard !evolution.needsOnboardingName else { return }
                                startConversationLoopIfNeeded()
                            }
                        }
                    )
                    .themDesktopSheetFrame(minWidth: 920, minHeight: 720)
                }
                .sheet(isPresented: $showingDataControls) {
                    DataControlsScreen(onDone: {
                        showingDataControls = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                            guard !evolution.needsOnboardingName else { return }
                            startConversationLoopIfNeeded()
                        }
                    })
                    .themDesktopSheetFrame(minWidth: 900, minHeight: 680)
                }
                .sheet(isPresented: $showingTrustCenter) {
                    TrustCenterScreen(
                        onDone: {
                            showingTrustCenter = false
                        },
                        onOpenDataControls: {
                            showingTrustCenter = false
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                                showingDataControls = true
                            }
                        },
                        onOpenPrivacyPolicy: {
                            openURL(privacyPolicyURL)
                        }
                    )
                    .themDesktopSheetFrame(minWidth: 900, minHeight: 680)
                }
                .sheet(isPresented: $showingProfileAccount) {
                    ProfileAccountScreen(onSessionChanged: handleAccountSessionChanged)
                }
        )
    }

    private func applyAlertModifiers(to view: AnyView) -> AnyView {
        AnyView(
            view
                .alert(item: $voice.micPermissionNotice) { notice in
                    Alert(
                        title: Text(notice.title),
                        message: Text(notice.message),
                        primaryButton: .default(Text("Open Settings")) {
                            openMicrophoneSettings()
                        },
                        secondaryButton: .cancel()
                    )
                }
                .confirmationDialog(
                    "Report a Problem",
                    isPresented: $showingReportOptions,
                    titleVisibility: .visible
                ) {
                    NumberedChoiceActionButton(number: "1", title: "Email Summary") {
                        reportProblem()
                    }
                    if supportDiagnosticsEnabled {
                        NumberedChoiceActionButton(
                            number: "2",
                            title: "Talk Diagnostics",
                            prominence: .prominent
                        ) {
                            showingTalkDiagnostics = true
                            Task { @MainActor in
                                await refreshTalkDiagnostics(force: true)
                            }
                        }
                        NumberedChoiceActionButton(
                            number: "3",
                            title: "Send Debug Bundle",
                            prominence: .prominent
                        ) {
                            Task { @MainActor in
                                await sendDebugBundle()
                            }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text(
                        supportDiagnosticsEnabled
                            ? "Choose what to send to support. Press 1 for an email summary, 2 for talk diagnostics, or 3 for a debug bundle."
                            : "Choose what to send to support. Press 1 for an email summary."
                    )
                }
                .sheet(isPresented: $showingTalkDiagnostics) {
                    TalkDiagnosticsSheet(
                        stats: lastTalkStats,
                        errors: lastTalkErrors,
                        latency: clientLatency.summary,
                        latencyHealth: clientLatency.health,
                        refreshedAt: lastTalkDiagnosticsRefreshedAt,
                        lastError: lastTalkDiagnosticsError,
                        isRefreshing: isRefreshingTalkDiagnostics,
                        onRefresh: {
                            Task { @MainActor in
                                await refreshTalkDiagnostics(force: true)
                            }
                        },
                        onDone: {
                            showingTalkDiagnostics = false
                        }
                    )
                    .frame(minWidth: 520, minHeight: 520)
                }
                .alert("Debug Bundle", isPresented: $showingDebugBundleNotice) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text(debugBundleNoticeMessage)
                }
        )
    }

    private func applyPlatformPresentationModifiers(to view: AnyView) -> some View {
        #if os(iOS)
        return AnyView(
            view.sheet(isPresented: $showingDebugBundleShareSheet) {
                DebugBundleActivityView(items: debugBundleShareItems)
            }
        )
        #else
        return view
        #endif
    }

    private func installMacKeyMonitorIfNeeded() {
        #if os(macOS)
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { event in
            if evolution.needsOnboardingName {
                return event
            }
            if showingMemories ||
                showingConversationHistory ||
                showingNotes ||
                showingTasks ||
                isStudioSurfaceActive ||
                showingVoiceSettings ||
                showingCompanionControls ||
                showingRecap ||
                showingDataControls ||
                showingTrustCenter ||
                showingProfileAccount {
                return event
            }

            let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            if !modifiers.isEmpty {
                return event
            }

            if event.keyCode == 49 {
                HerLog.ui.info("KEY space pressed -> arm requested")
                guard canStartTalk else { return nil }
                startConversationLoopIfNeeded()
                return nil
            }

            if event.keyCode == 53 {
                HerLog.ui.info("KEY escape pressed -> stop requested")
                stopCurrentInteraction()
                return nil
            }

            return event
        }
        #endif
    }

    private var homeSurface: some View {
        ZStack {
            VStack(spacing: 40) {
                Spacer()
                OrbView(
                    driver: orbAudio,
                    userMicLevel: voice.micLevel,
                    isUserSpeaking: voice.isSpeechDetected
                )

                if replyEchoOpacity > 0 || !assistantReplyEcho.isEmpty {
                    VStack(alignment: .center, spacing: 6) {
                        if !userReplyEcho.isEmpty {
                            Text(userReplyEcho)
                                .font(.system(size: 11, weight: .regular, design: .default))
                                .foregroundColor(.herText.opacity(0.42))
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                                .italic()
                                .accessibilityIdentifier("orb_reply_echo_user")
                        }
                        Text(assistantReplyEcho)
                            .font(.system(size: 14, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.80))
                            .multilineTextAlignment(.center)
                            .lineLimit(4)
                            .padding(.horizontal, 32)
                            .accessibilityIdentifier("orb_reply_echo_assistant")
                    }
                    .frame(maxWidth: 480)
                    .opacity(replyEchoOpacity)
                    .transition(.opacity)
                    .accessibilityIdentifier("orb_reply_echo_container")
                }

                homeSessionContinuityCard

                if showPrompt {
                    VStack(spacing: 14) {
                        Text("Talk")
                            .font(.system(size: 30, weight: .semibold, design: .default))
                            .foregroundColor(.herText.opacity(0.92))

                        Button {
                            guard canStartTalk else { return }
                            startConversationLoopIfNeeded()
                        } label: {
                            Text(usesRealtimePreviewTransport ? "Start live voice with io.them" : "Hold to speak to io.them")
                                .font(.system(size: 17, weight: .regular, design: .default))
                                .foregroundColor(.herText.opacity(0.92))
                                .padding(.horizontal, 20)
                                .padding(.vertical, 12)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(Color.white.opacity(0.20))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(Color.white.opacity(0.22), lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                        .opacity(canStartTalk ? 1.0 : 0.55)
                        .allowsHitTesting(canStartTalk)
                        .accessibilityIdentifier("home.talk.button")
                        .simultaneousGesture(
                            LongPressGesture(minimumDuration: 0.08, maximumDistance: 80).onEnded { _ in
                                guard canStartTalk else { return }
                                startConversationLoopIfNeeded()
                            }
                        )
                        if let banner = connectionBannerText {
                            Text(banner)
                                .font(.system(size: 13, weight: .regular, design: .default))
                                .foregroundColor(.herText.opacity(0.80))
                                .padding(.top, 4)
                        }
                        if voiceTransportMode == .realtimePreview {
                            VStack(spacing: 4) {
                                Text(realtimePreviewStatusText)
                                    .font(.system(size: 11, weight: .regular, design: .default))
                                    .foregroundColor(.herText.opacity(0.74))
                                    .multilineTextAlignment(.center)
                                if !lastRealtimeCommitError.isEmpty {
                                    Text("Realtime save issue: \(lastRealtimeCommitError)")
                                        .font(.system(size: 10, weight: .regular, design: .default))
                                        .foregroundColor(.red.opacity(0.88))
                                        .multilineTextAlignment(.center)
                                } else if !lastRealtimeCommittedTurnID.isEmpty, lastRealtimeCommitAt > .distantPast {
                                    Text("Saved \(relativeTimestamp(lastRealtimeCommitAt)) · \(lastRealtimeCommittedTurnID)")
                                        .font(.system(size: 10, weight: .regular, design: .default))
                                        .foregroundColor(.herText.opacity(0.62))
                                        .multilineTextAlignment(.center)
                                }
                            }
                            .padding(.top, 2)
                        }
                        if let transientTurnBannerText, !transientTurnBannerText.isEmpty {
                            Text(transientTurnBannerText)
                                .font(.system(size: 12, weight: .regular, design: .default))
                                .foregroundColor(.herText.opacity(0.92))
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(
                                    Capsule()
                                        .fill(Color.white.opacity(0.22))
                                )
                                .overlay(
                                    Capsule()
                                        .stroke(Color.white.opacity(0.28), lineWidth: 1)
                                )
                                .padding(.top, 2)
                                .transition(.opacity)
                        }
                        homeCompanionSignalCard
                        if !lastKnowledgeCitations.isEmpty {
                            VStack(alignment: .center, spacing: 4) {
                                Text("Sources: \(lastKnowledgeCitations.prefix(2).joined(separator: " • "))")
                                    .font(.system(size: 11, weight: .regular, design: .default))
                                    .foregroundColor(.herText.opacity(0.66))
                                    .lineLimit(2)
                                    .multilineTextAlignment(.center)
                                if !lastKnowledgeConfidenceClass.isEmpty {
                                    Text("Knowledge confidence: \(lastKnowledgeConfidenceClass) • contradiction risk \(Int((min(max(lastKnowledgeContradictionRisk, 0), 1) * 100).rounded()))%")
                                        .font(.system(size: 10, weight: .regular, design: .default))
                                        .foregroundColor(.herText.opacity(0.56))
                                        .lineLimit(1)
                                }
                            }
                            .frame(maxWidth: 460)
                            .padding(.top, 2)
                        }
                        if showLiveScriptPreview && !liveScreenplayText.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(spacing: 8) {
                                    Text("Live Script")
                                        .font(.system(size: 12, weight: .semibold, design: .default))
                                        .foregroundColor(.herText.opacity(0.92))
                                    if !liveScreenplayPack.isEmpty {
                                        Text(liveScreenplayPack)
                                            .font(.system(size: 11, weight: .semibold, design: .default))
                                            .foregroundColor(.herText.opacity(0.82))
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.white.opacity(0.16))
                                            .clipShape(Capsule())
                                    }
                                    if !liveScreenplayPhase.isEmpty {
                                        Text(liveScreenplayPhase.replacingOccurrences(of: "_", with: " "))
                                            .font(.system(size: 11, weight: .regular, design: .default))
                                            .foregroundColor(.herText.opacity(0.74))
                                    }
                                    Spacer(minLength: 8)
                                    Button {
                                        openStudio()
                                    } label: {
                                        Text("Open in Studio")
                                            .font(.system(size: 11, weight: .regular, design: .default))
                                            .foregroundColor(.herText.opacity(0.90))
                                            .padding(.horizontal, 9)
                                            .padding(.vertical, 4)
                                            .background(Color.white.opacity(0.18))
                                            .clipShape(Capsule())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("home.open-studio-preview")
                                    Button {
                                        showLiveScriptPreview = false
                                    } label: {
                                        Text("Hide")
                                            .font(.system(size: 11, weight: .regular, design: .default))
                                            .foregroundColor(.herText.opacity(0.82))
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.white.opacity(0.14))
                                            .clipShape(Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }

                                ScrollView(.vertical) {
                                    Text(liveScreenplayText)
                                        .font(.system(size: 12, weight: .regular, design: .monospaced))
                                        .foregroundColor(.herText.opacity(0.90))
                                        .textSelection(.enabled)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 8)
                                }
                                .frame(maxHeight: 190)
                                .background(Color.white.opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                                HStack(spacing: 8) {
                                    if !liveScreenplayProjectID.isEmpty {
                                        Text("Project \(liveScreenplayProjectID)")
                                            .font(.system(size: 10, weight: .regular, design: .default))
                                            .foregroundColor(.herText.opacity(0.66))
                                    }
                                    if !liveScreenplayVersionID.isEmpty {
                                        Text("Version \(liveScreenplayVersionID)")
                                            .font(.system(size: 10, weight: .regular, design: .default))
                                            .foregroundColor(.herText.opacity(0.60))
                                    }
                                    Spacer(minLength: 8)
                                    if liveScreenplayUpdatedAt > .distantPast {
                                        Text("Updated \(relativeTimestamp(liveScreenplayUpdatedAt))")
                                            .font(.system(size: 10, weight: .regular, design: .default))
                                            .foregroundColor(.herText.opacity(0.56))
                                    }
                                }
                            }
                            .frame(maxWidth: 760)
                            .padding(.top, 6)
                        } else if !showLiveScriptPreview && !liveScreenplayText.isEmpty {
                            Button {
                                showLiveScriptPreview = true
                            } label: {
                                Text("Show live script preview")
                                    .font(.system(size: 11, weight: .regular, design: .default))
                                    .foregroundColor(.herText.opacity(0.84))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 7)
                                    .background(Color.white.opacity(0.16))
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 4)
                        }
                    }
                    .transition(.opacity)
                }

                Spacer()
            }

            VStack {
                HStack {
                    Spacer()
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                    Button {
                        openMemories()
                    } label: {
                        Text("Memories")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        inFlightTalkTask?.cancel()
                        inFlightTalkTask = nil
                        voice.teardown()
                        orbAudio.stop()
                        showingMemories = false
                        showingConversationHistory = false
                        showingNotes = false
                        showingTasks = false
                        showingRecap = false
                        showingVoiceSettings = true
                    } label: {
                        Text("Voice")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        inFlightTalkTask?.cancel()
                        inFlightTalkTask = nil
                        voice.teardown()
                        orbAudio.stop()
                        showingMemories = false
                        showingConversationHistory = false
                        showingNotes = false
                        showingTasks = false
                        showingRecap = false
                        showingCompanionControls = true
                    } label: {
                        Text("Companion")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        inFlightTalkTask?.cancel()
                        inFlightTalkTask = nil
                        voice.teardown()
                        orbAudio.stop()
                        showingMemories = false
                        showingConversationHistory = true
                        showingNotes = false
                        showingTasks = false
                        showingRecap = false
                    } label: {
                        Text("History")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        inFlightTalkTask?.cancel()
                        inFlightTalkTask = nil
                        voice.teardown()
                        orbAudio.stop()
                        showingMemories = false
                        showingConversationHistory = false
                        showingNotes = true
                        showingTasks = false
                        showingRecap = false
                    } label: {
                        Text("Notes")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        inFlightTalkTask?.cancel()
                        inFlightTalkTask = nil
                        voice.teardown()
                        orbAudio.stop()
                        showingMemories = false
                        showingConversationHistory = false
                        showingNotes = false
                        showingTasks = true
                        showingRecap = false
                    } label: {
                        Text("Tasks")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        showingMemories = false
                        showingConversationHistory = false
                        showingNotes = false
                        showingTasks = false
                        showingRecap = false
                        openStudio()
                    } label: {
                        Text("Studio")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home.open-studio")

                    Button {
                        openAccount()
                    } label: {
                        Label(
                            authSignedIn && !authSessionTokenDeletionPending ? "Account" : "Sign In",
                            systemImage: "person.crop.circle"
                        )
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home.open-account")

                    Button {
                        inFlightTalkTask?.cancel()
                        inFlightTalkTask = nil
                        voice.teardown()
                        orbAudio.stop()
                        showingMemories = false
                        showingConversationHistory = false
                        showingNotes = false
                        showingTasks = false
                        showingRecap = true
                    } label: {
                        Text("Recap")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        inFlightTalkTask?.cancel()
                        inFlightTalkTask = nil
                        voice.teardown()
                        orbAudio.stop()
                        showingMemories = false
                        showingConversationHistory = false
                        showingNotes = false
                        showingTasks = false
                        showingRecap = false
                        showingTrustCenter = true
                    } label: {
                        Text("Trust")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        inFlightTalkTask?.cancel()
                        inFlightTalkTask = nil
                        voice.teardown()
                        orbAudio.stop()
                        showingMemories = false
                        showingConversationHistory = false
                        showingNotes = false
                        showingTasks = false
                        showingRecap = false
                        showingDataControls = true
                    } label: {
                        Text("Data")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home.open-data-controls")

                    Button {
                        openURL(privacyPolicyURL)
                    } label: {
                        Text("Privacy")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Button {
                        showingReportOptions = true
                    } label: {
                        Text("Report")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.95))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.28))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Text(evolution.personaPreset.title)
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.95))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.28))
                        .clipShape(Capsule())
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                    }
                    .frame(maxWidth: 1060)
                    .background(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(Color.white.opacity(0.16))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.white.opacity(0.22), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.10), radius: 22, x: 0, y: 14)
                    .padding(.top, 18)
                    .padding(.trailing, 18)
                }
                Spacer()
            }
            .allowsHitTesting(!evolution.needsOnboardingName)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.surface")
    }

    private var studioSurface: some View {
        ScreenplayStudioScreen(
            onDone: {
                closeStudio()
            },
            liveDraftBridge: screenplayDraftBridge,
            onArmTalk: {
                guard canStartTalk else { return }
                startConversationLoopIfNeeded()
            },
            onStopTalk: {
                stopStudioTalkFlow()
            },
            onOpenVoiceSettings: {
                showingVoiceSettings = true
            },
            canTalk: canStartTalk,
            talkStatusText: studioTalkStatusText,
            talkIsActive: studioTalkIsActive,
            debugVoicePartialStableSeconds: voice.debugPartialStableSeconds,
            debugVoicePartialStabilityWindowSeconds: voice.debugPartialStabilityWindowSeconds,
            isSubmittingPrompt: isTurnSubmitting,
            typedReplyAudioEnabled: $studioTypedReplyAudioEnabled,
            streamingAssistantReply: realtimeStudioRenderedReply,
            onSubmitPrompt: { prompt, routingMode, requestID in
#if DEBUG || os(macOS)
                setStudioDebugPreferenceString("root_closure_started", forKey: "studio_debug_root_submit_stage")
                setStudioDebugPreferenceString(prompt, forKey: "studio_debug_root_submit_prompt")
                setStudioDebugPreferenceString(requestID, forKey: "studio_debug_root_submit_request_id")
#endif
                return await submitStudioPrompt(prompt, routingMode: routingMode, requestID: requestID)
            },
            shouldRoutePromptToPage: { prompt, routingMode in
                shouldRouteStudioPromptToPage(prompt, preferredTarget: routingMode)
            }
        )
        .id(studioAccountIdentityGeneration)
        .ignoresSafeArea()
    }

    private var onboardingOverlay: some View {
        ZStack {
            Color.black.opacity(0.12)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                VStack(spacing: 6) {
                    Text("Start your first page")
                        .font(.system(size: 30, weight: .semibold, design: .default))
                        .foregroundColor(.herText.opacity(0.94))
                        .multilineTextAlignment(.center)

                    Text("Tell io.them who you are and the scene you want to hear first.")
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.72))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 10) {
                    TextField("Your name", text: $onboardingName)
                        .font(.system(size: 17, weight: .regular, design: .default))
                        .textFieldStyle(.roundedBorder)
                        .focused($onboardingNameFocused)
                        .submitLabel(.next)
                        .onSubmit {
                            if canSubmitOnboarding {
                                onboardingSceneFocused = true
                            }
                        }
                        .accessibilityIdentifier("onboarding.name.field")

                    TextField("A detective finds a letter under a motel door...", text: $onboardingSceneSeed, axis: .vertical)
                        .font(.system(size: 16, weight: .regular, design: .default))
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3...5)
                        .focused($onboardingSceneFocused)
                        .submitLabel(.go)
                        .onSubmit {
                            startMagicMomentOnboarding()
                        }
                        .accessibilityIdentifier("onboarding.scene.field")
                }

                HStack(spacing: 10) {
                    Button {
                        startMagicMomentVoiceOnboarding()
                    } label: {
                        Text("Voice to Scene")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(canStartMagicMoment ? 0.90 : 0.45))
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.white.opacity(canStartMagicMoment ? 0.16 : 0.08))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.white.opacity(0.18), lineWidth: 1)
                    )
                    .disabled(!canStartMagicMoment)
                    .accessibilityIdentifier("onboarding.voice-to-scene")

                    Button {
                        startMagicMomentOnboarding()
                    } label: {
                        Text(isMagicMomentSubmitting ? "Writing..." : "Start Page")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(canStartMagicMoment ? 0.94 : 0.45))
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.white.opacity(canStartMagicMoment ? 0.26 : 0.12))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.white.opacity(0.24), lineWidth: 1)
                    )
                    .disabled(!canStartMagicMoment)
                    .accessibilityIdentifier("onboarding.start-page")
                }

                if !magicMomentOnboardingError.isEmpty {
                    Text(magicMomentOnboardingError)
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.red.opacity(0.86))
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                }
            }
            .padding(24)
            .frame(maxWidth: 430)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.white.opacity(0.18))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color.white.opacity(0.22), lineWidth: 1)
            )
            .padding(.horizontal, 20)
        }
    }

    private var canSubmitOnboarding: Bool {
        !onboardingName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var canStartMagicMoment: Bool {
        canSubmitOnboarding && !isMagicMomentSubmitting
    }

    @MainActor
    private func startMagicMomentOnboarding() {
        guard !isMagicMomentSubmitting else { return }
        guard completeOnboarding(askForPersonality: false) else { return }

        let cleanName = onboardingName.trimmingCharacters(in: .whitespacesAndNewlines)
        let sceneSeed = normalizedMagicMomentSceneSeed()
        let prompt = magicMomentFirstPagePrompt(name: cleanName, sceneSeed: sceneSeed)
        let requestID = "magic-moment-\(UUID().uuidString.lowercased())"
        let startedAt = Date()

        isMagicMomentSubmitting = true
        magicMomentOnboardingError = ""
        openStudio()
        screenplayDraftBridge.autoInsertStatusText = "io.them is writing the first page..."
        magicMomentPerceivedResponseMs = Date().timeIntervalSince(startedAt) * 1_000

        Task { @MainActor in
            await Task.yield()
            let error = await submitStudioPrompt(prompt, routingMode: .page, requestID: requestID)
            magicMomentLastDurationMs = Date().timeIntervalSince(startedAt) * 1_000
            isMagicMomentSubmitting = false

            if let error = error?.trimmingCharacters(in: .whitespacesAndNewlines), !error.isEmpty {
                magicMomentOnboardingError = error
                lastIssueSummary = error
                screenplayDraftBridge.autoInsertStatusText = error
                return
            }

            onboardingSceneSeed = ""
            magicMomentOnboardingError = ""
        }
    }

    @MainActor
    private func startMagicMomentVoiceOnboarding() {
        guard !isMagicMomentSubmitting else { return }
        guard completeOnboarding(askForPersonality: false) else { return }
        magicMomentOnboardingError = ""
        openStudio()
        startConversationLoopIfNeeded()
    }

    private func normalizedMagicMomentSceneSeed() -> String {
        let clean = onboardingSceneSeed.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty { return clean }
        return "someone walks into a room carrying a secret they cannot say out loud yet"
    }

    private func magicMomentFirstPagePrompt(name: String, sceneSeed: String) -> String {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanSeed = sceneSeed.trimmingCharacters(in: .whitespacesAndNewlines)
        let displayName = cleanName.isEmpty ? "the writer" : cleanName
        let impulse = cleanSeed.isEmpty ? normalizedMagicMomentSceneSeed() : cleanSeed
        return """
        Write the first page of a screenplay scene for \(displayName).

        Scene impulse: \(impulse)

        Write only the page content in clean Fountain/Hollywood screenplay format: one slugline, visual action, character cues, and dialogue. Keep it to roughly one page. Do not explain the formatting.
        """
    }

    private var shouldDefaultLaunchIntoStudio: Bool {
        #if os(macOS)
        return true
        #else
        return false
        #endif
    }

    private func restoreWorkspaceSurfaceForLaunchIfNeeded() {
        let resolvedSurfaceRaw = ThemWorkspaceSurfaceRestorePolicy.launchSurfaceRawValue(
            persistedSurfaceRawValue: persistedPrimarySurfaceRaw,
            hasCompletedOnboarding: !evolution.needsOnboardingName,
            isMacOS: shouldDefaultLaunchIntoStudio
        )
        if persistedPrimarySurfaceRaw != resolvedSurfaceRaw {
            persistedPrimarySurfaceRaw = resolvedSurfaceRaw
        }
        guard resolvedSurfaceRaw == PrimarySurface.studio.rawValue else { return }
        openStudio()
    }

    private func persistWorkspaceSurface(_ surface: PrimarySurface) {
        persistedPrimarySurfaceRaw = surface.rawValue
    }

    private func openMemories() {
        inFlightTalkTask?.cancel()
        inFlightTalkTask = nil
        voice.teardown()
        orbAudio.stop()
        showingConversationHistory = false
        showingNotes = false
        showingTasks = false
        showingRecap = false
        showingMemories = true
    }

    private func openStudio() {
        let authSession = BackendAuthClient.currentAuthSessionState()
        switch ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: authSession.isAuthenticated,
            accessTokenExpired: authSession.accessExpired,
            refreshTokenPresent: authSession.refreshTokenPresent,
            isRunningUITests: IOThemRuntime.isRunningUITests
        ) {
        case .refreshPersistedSession:
            restorePersistedAuthSessionAndOpenStudio()
            return
        case .requireAccount:
            openAccount(resumeStudioAfterSignIn: true)
            return
        case .openWorkspace:
            break
        }
        cancelRealtimeStudioDraftStream(restorePreview: true)
        if !conversationLoopEnabled && (realtimeTransport.isLive || realtimeTransport.isBusy) {
            realtimeTransport.disconnect()
        }
        evolution.markAsScreenwriter()
        #if DEBUG
        if IOThemRuntime.isRunningUITests {
            uiTestForceStudioSurface = true
        }
        #endif
        let evo = evolution
        Task {
            await BackendMemoryAPI.shared.syncEvolutionState(
                stage: evo.stage,
                depthScore: evo.depthScore,
                romanceTension: evo.romanceTension,
                sessionCount: evo.sessionCount,
                reassuranceNeed: evo.reassuranceNeed,
                boundaryNeed: evo.boundaryNeed,
                playfulMomentum: evo.playfulMomentum,
                trustSignal: evo.trustSignal,
                lastThemeCue: evo.lastThemeCue,
                preferredName: evo.preferredName,
                isScreenwriter: evo.isScreenwriter,
                latestUserMessage: nil
            )
        }
        withAnimation(.easeInOut(duration: 0.28)) {
            primarySurface = .studio
        }
        persistWorkspaceSurface(.studio)
        promoteRestoredLiveDraftToStudioProjectIfNeeded()
        if voiceTransportMode == .realtimePreview {
            Task { @MainActor in
                await prewarmRealtimeIfNeeded(isScreenplayMode: true)
            }
        }
    }

    @MainActor
    private func restorePersistedAuthSessionAndOpenStudio() {
        guard !isRestoringWorkspaceAuthSession else { return }
        isRestoringWorkspaceAuthSession = true
        Task { @MainActor in
            defer { isRestoringWorkspaceAuthSession = false }
            do {
                let restored = try await BackendAuthClient.restorePersistedAuthSessionIfNeeded()
                guard restored.isAuthenticated, !restored.accessExpired else {
                    openAccount(resumeStudioAfterSignIn: true)
                    return
                }
                resumeStudioAfterAccountSignIn = false
                handleAccountSessionChanged()
                openStudio()
            } catch {
                openAccount(resumeStudioAfterSignIn: true)
                lastIssueSummary = "Your saved session could not be refreshed. Sign in again to continue into Studio."
            }
        }
    }

    private func openAccount(resumeStudioAfterSignIn: Bool = false) {
        resumeStudioAfterAccountSignIn = resumeStudioAfterSignIn
        showingProfileAccount = true
        if resumeStudioAfterSignIn {
            lastIssueSummary = "Sign in to open Studio and sync your screenplay projects."
        }
    }

    @MainActor
    private func handleAccountSessionChanged() {
        let session = BackendAuthClient.currentAuthSessionState()
        let nextOwnerUserID = session.user?.userId ?? ""
        let nextIsAuthenticated = session.isAuthenticated && !session.accessExpired
        let shouldResetStudio = ScreenplayStudioAccountTransitionPolicy.requiresStudioStateReset(
            previousOwnerUserID: studioOwnerUserIDSnapshot,
            previousWasAuthenticated: studioWasAuthenticatedSnapshot,
            nextOwnerUserID: nextOwnerUserID,
            nextIsAuthenticated: nextIsAuthenticated,
            nextAccessExpired: session.accessExpired
        )
        studioOwnerUserIDSnapshot = nextOwnerUserID
        studioWasAuthenticatedSnapshot = nextIsAuthenticated

        if shouldResetStudio {
            studioAccountIdentityGeneration = studioAccountIdentityGeneration == Int.max
                ? 1
                : studioAccountIdentityGeneration + 1
            liveScreenplayProjectID = ""
            liveScreenplayVersionID = ""
            sessionContinuitySnapshot = nil
            dismissedSessionContinuityFingerprint = ""
            if isStudioSurfaceActive {
                closeStudio()
            }
        }

        screenplayDraftBridge.reconcileAccountStorage()
        guard session.isAuthenticated, !session.accessExpired else { return }

        scheduleBackendHydration()
        Task { @MainActor in
            await screenplayDraftBridge.hydrateBackendCompanionState(force: true)
        }

        guard resumeStudioAfterAccountSignIn else { return }
        resumeStudioAfterAccountSignIn = false
        showingProfileAccount = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            openStudio()
        }
    }

    private func closeStudio() {
        cancelRealtimeStudioDraftStream(restorePreview: true)
        if !conversationLoopEnabled && (realtimeTransport.isLive || realtimeTransport.isBusy) {
            realtimeTransport.disconnect()
        }
        uiTestForceStudioSurface = false
        withAnimation(.easeInOut(duration: 0.28)) {
            primarySurface = .home
        }
        persistWorkspaceSurface(.home)
        if voiceTransportMode == .realtimePreview {
            Task { @MainActor in
                await prewarmRealtimeIfNeeded(isScreenplayMode: false)
            }
        }
    }

    private func handleWorkspaceNavigationCommand(_ command: ThemWorkspaceNavigationCommand) {
        guard !evolution.needsOnboardingName else { return }
        switch command {
        case .openStudio:
            openStudio()
        case .closeStudio:
            closeStudio()
        case .toggleStudio:
            isStudioSurfaceActive ? closeStudio() : openStudio()
        }
    }

    private func handleStudioSurfaceActiveChange(_ isActive: Bool) {
        voice.isStudioMode = isActive
        guard isActive else { return }
        promoteRestoredLiveDraftToStudioProjectIfNeeded()
    }

    private func mergedStudioDraft(existing: String, insertion: String) -> String {
        let cleanInsertion = insertion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanInsertion.isEmpty else { return existing }
        let cleanExisting = existing.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanExisting.isEmpty else { return cleanInsertion }
        return cleanExisting + "\n\n" + cleanInsertion
    }

    private struct PreparedTurnPrompt {
        let directorText: String
        let partialHint: String
        let useScreenplayMode: Bool
        let shouldWriteToPage: Bool
        let shouldAutoOpenStudio: Bool
        let memoryDomain: StudioMemoryDomain
        let director: HerDirectorContext
        let companionSignals: CreativeCompanionSignalState
        let baseSystemPrompt: String
    }

    private func studioMemoryDomain(
        for userText: String,
        preferredTarget: ScreenplayStudioScreen.PromptRoutingMode = .automatic
    ) -> StudioMemoryDomain {
        let clean = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return .project }
        if shouldRouteStudioPromptToPage(clean, preferredTarget: preferredTarget) {
            return .project
        }

        let normalized = " \(clean.lowercased()) "
        let companionSignals = [
            " i feel ",
            " i am feeling ",
            " i'm feeling ",
            " im feeling ",
            " i feel stuck ",
            " i am stuck ",
            " i'm stuck ",
            " im stuck ",
            " i am spiraling ",
            " i'm spiraling ",
            " im spiraling ",
            " spiraling ",
            " talk me through ",
            " stay with me ",
            " encourage me ",
            " reassure me ",
            " reassurance ",
            " calm me down ",
            " overwhelmed ",
            " anxious ",
            " check in with me ",
            " how are you ",
            " do you think i'm okay "
        ]
        let projectSignals = [
            " screenplay ",
            " script ",
            " scene ",
            " slugline ",
            " dialogue ",
            " outline ",
            " beat ",
            " act ",
            " draft ",
            " rewrite ",
            " revise ",
            " story ",
            " character ",
            " pages "
        ]

        let hasCompanionSignal = companionSignals.contains(where: normalized.contains)
        let hasProjectSignal = projectSignals.contains(where: normalized.contains)
            || shouldTreatStudioPromptAsCollaboration(clean, preferredTarget: preferredTarget)
            || shouldAutoOpenStudioForScriptIntent(clean)

        if hasProjectSignal && hasCompanionSignal {
            return .mixed
        }
        if hasProjectSignal {
            return .project
        }
        if hasCompanionSignal {
            return .companion
        }
        return isStudioSurfaceActive ? .project : .companion
    }

    private func studioRecentTurns(
        for memoryDomain: StudioMemoryDomain,
        isScreenplayMode: Bool
    ) -> [(user: String, assistant: String)] {
        guard isScreenplayMode else { return recentTurnWindow }
        let routedTurns = screenplayDraftBridge.recentTurnPairs(for: memoryDomain)
        guard !routedTurns.isEmpty else { return recentTurnWindow }
        return routedTurns
    }

#if DEBUG
    private struct DebugStudioPromptStubReply {
        let target: ScreenplayStudioUserPrompt.Target
        let pack: String
        let phase: String
        let projectID: String
        let versionID: String
        let noteTitle: String
        let noteBody: String
        let insertedText: String
    }

    private var debugStudioPromptTransportMode: String {
#if DEBUG
        if IOThemRuntime.isRunningUITests {
            let arguments = ProcessInfo.processInfo.arguments
            if let index = arguments.firstIndex(of: "-studio_debug_submit_transport_mode") {
                let valueIndex = arguments.index(after: index)
                if arguments.indices.contains(valueIndex) {
                    let override = arguments[valueIndex]
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .lowercased()
                    if !override.isEmpty { return override }
                }
            }
        }
#endif
        return studioDebugPreferenceString(
            "studio_debug_submit_transport_mode",
            fallback: studioDebugSubmitTransportMode
        )
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private var shouldUseDebugStudioPromptStubTransport: Bool {
        IOThemRuntime.isStudioAutomationSession && debugStudioPromptTransportMode == "stub"
    }

    private var shouldUseDebugStudioPromptLiveBackendTransport: Bool {
        IOThemRuntime.isStudioAutomationSession && debugStudioPromptTransportMode == "live-backend"
    }

    private func debugStudioPromptLooksLikeRewriteIntent(_ prompt: String) -> Bool {
        let clean = prompt.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !clean.isEmpty else { return false }
        let cues = [
            "rewrite",
            "replace",
            "restore",
            "shorter",
            "sharper",
            "same line",
            "last line",
            "last write"
        ]
        return cues.contains(where: { clean.contains($0) })
    }

    private func debugStudioStubRewriteBlock(
        from source: String,
        prompt: String
    ) -> String {
        let cleanSource = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanSource.isEmpty else { return source }
        let normalizedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var lines = cleanSource.components(separatedBy: .newlines)
        guard let lastIndex = lines.lastIndex(where: {
            !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) else {
            return cleanSource
        }

        let currentLine = lines[lastIndex].trimmingCharacters(in: .whitespacesAndNewlines)
        let rewrittenLine: String
        if normalizedPrompt.contains("shorter") {
            rewrittenLine = currentLine.uppercased().hasPrefix("FRANK")
                ? "FRANK meets her eyes."
                : String(currentLine.prefix(32)).trimmingCharacters(in: .whitespacesAndNewlines)
        } else if normalizedPrompt.contains("sharper") {
            rewrittenLine = currentLine.uppercased().hasPrefix("FRANK")
                ? "FRANK finally looks up."
                : currentLine
        } else {
            rewrittenLine = currentLine.uppercased().hasPrefix("FRANK")
                ? "FRANK looks up."
                : currentLine
        }
        lines[lastIndex] = rewrittenLine
        return lines.joined(separator: "\n")
    }

    private func debugStudioStubCommittedPageWrite(
        existingDraft: String,
        requestID: String,
        insertedText: String
    ) -> ScreenplayCommittedWrite {
        let replacementTarget = screenplayDraftBridge.submittedReplacementTarget
            ?? screenplayDraftBridge.pendingReplacementTarget
        let writeID = "debug-write-\(requestID.lowercased())"
        let cleanInsertedText = insertedText.trimmingCharacters(in: .whitespacesAndNewlines)

        if let replacementTarget {
            screenplayDraftBridge.debugTraceReplacementTarget(
                kind: "capture-submit",
                target: replacementTarget,
                detail: "Captured replacement target for stub submit.",
                requestID: requestID
            )
            let originalLines = existingDraft.components(separatedBy: .newlines)
            let safeStartLine = max(1, replacementTarget.startLine)
            let safeEndLine = max(safeStartLine, replacementTarget.endLine)
            if !originalLines.isEmpty, safeStartLine <= originalLines.count {
                let startIndex = max(0, safeStartLine - 1)
                let endIndex = min(max(startIndex, safeEndLine - 1), originalLines.count - 1)
                var rewrittenLines = originalLines
                rewrittenLines.replaceSubrange(
                    startIndex...endIndex,
                    with: cleanInsertedText.components(separatedBy: .newlines)
                )
                screenplayDraftBridge.debugTraceReplacementTarget(
                    kind: "resolve-fallback-line-range",
                    target: replacementTarget,
                    detail: "Resolved stub replacement using stored line range.",
                    requestID: requestID
                )
                screenplayDraftBridge.debugTraceReplacementTarget(
                    kind: "commit-standard-replacement",
                    target: replacementTarget,
                    detail: "Committed stub replacement write.",
                    requestID: requestID
                )
                return screenplayDraftBridge.makeCommittedWrite(
                    id: UUID(),
                    writeID: writeID,
                    previousDraft: existingDraft,
                    committedDraft: rewrittenLines.joined(separator: "\n"),
                    insertedText: cleanInsertedText,
                    replacementApplied: true,
                    replacedWriteID: replacementTarget.sourceWriteID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ? nil
                        : replacementTarget.sourceWriteID,
                    startLine: safeStartLine,
                    endLine: safeStartLine + max(1, cleanInsertedText.components(separatedBy: .newlines).count) - 1,
                    committedAt: Date()
                )
            }
        }

        let committedDraft = mergedStudioDraft(existing: existingDraft, insertion: cleanInsertedText)
        let previousLines = existingDraft.components(separatedBy: .newlines)
        let cleanPreviousDraft = existingDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let startLine = cleanPreviousDraft.isEmpty ? 1 : previousLines.count + 2
        let insertedLineCount = max(1, cleanInsertedText.components(separatedBy: .newlines).count)
        return screenplayDraftBridge.makeCommittedWrite(
            id: UUID(),
            writeID: writeID,
            previousDraft: existingDraft,
            committedDraft: committedDraft,
            insertedText: cleanInsertedText,
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: startLine,
            endLine: startLine + insertedLineCount - 1,
            committedAt: Date()
        )
    }

    private func debugMentionedCharacterName(from prompt: String) -> String? {
        let knownNames = ["mara", "lucy", "frank", "jess"]
        let lowercasedPrompt = prompt.lowercased()
        if let known = knownNames.first(where: { lowercasedPrompt.contains($0) }) {
            return known.capitalized
        }

        let ignoredWords: Set<String> = [
            "Remember",
            "Scene",
            "Story",
            "Screenplay",
            "Script",
            "Give",
            "Tell",
            "Make",
            "Write",
            "Rewrite",
            "Continue"
        ]
        let words = prompt.components(separatedBy: CharacterSet.alphanumerics.inverted)
        for word in words {
            guard word.count >= 3, !ignoredWords.contains(word) else { continue }
            if word.first?.isUppercase == true {
                return word
            }
        }
        return nil
    }

    private func makeDebugStudioPromptStubReply(
        prompt: String,
        memoryDomain: StudioMemoryDomain,
        shouldWriteToPage: Bool
    ) -> DebugStudioPromptStubReply {
        let pack = screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? "Debug" : screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
        let phase = screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? "scene_draft" : screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
        let projectID = screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let versionID = screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines)

        if shouldWriteToPage {
            let defaultInsertedText = """
INT. KITCHEN - DAY

LUCY hovers in the doorway, jaw set, while FRANK keeps his eyes on the cold coffee in front of him.

LUCY
You don't get to disappear every time the truth gets loud.

FRANK looks up, finally forced to meet her.
"""
            let insertedText: String
            if debugStudioPromptLooksLikeRewriteIntent(prompt),
               let replacementTarget = screenplayDraftBridge.submittedReplacementTarget ?? screenplayDraftBridge.pendingReplacementTarget {
                insertedText = debugStudioStubRewriteBlock(
                    from: replacementTarget.currentText,
                    prompt: prompt
                )
            } else {
                insertedText = defaultInsertedText
            }
            return DebugStudioPromptStubReply(
                target: .page,
                pack: pack,
                phase: phase,
                projectID: projectID,
                versionID: versionID,
                noteTitle: "Wrote to page",
                noteBody: "",
                insertedText: insertedText
            )
        }

        switch memoryDomain {
        case .project:
            return DebugStudioPromptStubReply(
                target: .voicePin,
                pack: pack,
                phase: phase,
                projectID: projectID,
                versionID: versionID,
                noteTitle: "Story Development",
                noteBody: "Put the call in the parking lot if you want the scene to begin with emotional exposure instead of domestic routine. It buys you urgency, isolates her before she crosses the threshold, and lets the kitchen confrontation land as escalation instead of setup.\(debugMentionedCharacterName(from: prompt).map { "\n\nFor \($0), keep the private fear visible before the clever line; that makes the wit feel like armor, not decoration." } ?? "")",
                insertedText: ""
            )
        case .companion:
            return DebugStudioPromptStubReply(
                target: .voicePin,
                pack: pack,
                phase: phase,
                projectID: projectID,
                versionID: versionID,
                noteTitle: "Companion Check-In",
                noteBody: """
You're okay. Let's slow it down for one beat and get our footing back. Pick the next tiny move you want to make on the script, and I'll stay with you through it.
""",
                insertedText: ""
            )
        case .mixed:
            return DebugStudioPromptStubReply(
                target: .voicePin,
                pack: pack,
                phase: phase,
                projectID: projectID,
                versionID: versionID,
                noteTitle: "Companion + Craft",
                noteBody: "You're carrying both the scene problem and the pressure around it. For the midpoint, give the scene one irreversible choice, then let the emotional fallout arrive in the next beat instead of solving everything at once.\(debugMentionedCharacterName(from: prompt).map { "\n\nFor \($0), keep the emotional tell consistent: a joke can hide fear, but the page should still let us feel the fear under it." } ?? "")",
                insertedText: ""
            )
        }
    }

    @MainActor
    private func applyDebugStudioPromptStubReply(
        _ stub: DebugStudioPromptStubReply,
        prompt: String,
        requestID: String,
        memoryDomain: StudioMemoryDomain
    ) {
        screenplayDraftBridge.latestPack = stub.pack
        screenplayDraftBridge.latestPhase = stub.phase
        screenplayDraftBridge.preferredProjectID = stub.projectID
        screenplayDraftBridge.preferredVersionID = stub.versionID
        screenplayDraftBridge.latestMemoryDomain = memoryDomain
        screenplayDraftBridge.latestStudioRouteTarget = stub.target
        screenplayDraftBridge.recordStudioUserPrompt(
            prompt,
            requestID: requestID,
            source: .typed,
            target: stub.target,
            memoryDomain: memoryDomain
        )

        if stub.target == .page {
            let committedWrite = debugStudioStubCommittedPageWrite(
                existingDraft: screenplayDraftBridge.draftText,
                requestID: requestID,
                insertedText: stub.insertedText
            )

            screenplayDraftBridge.draftText = committedWrite.committedDraft
            screenplayDraftBridge.lastCommittedWrite = committedWrite
            screenplayDraftBridge.lastUpdatedAt = Date()
            liveScreenplayText = stub.insertedText
            liveScreenplayPack = stub.pack
            liveScreenplayPhase = stub.phase
            liveScreenplayProjectID = stub.projectID
            liveScreenplayVersionID = stub.versionID
            liveScreenplayUpdatedAt = Date()
            screenplayDraftBridge.clearPendingPageWriteReplacement()
            screenplayDraftBridge.updateAssistantPin(
                mode: "page",
                category: "Scene",
                title: stub.noteTitle,
                body: committedWrite.replacementApplied
                    ? "Stubbed page rewrite committed for deterministic Studio route validation."
                    : "Stubbed page write committed for deterministic Studio route validation.",
                badge: stub.pack,
                actionSummary: stub.insertedText.components(separatedBy: .newlines).first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) ?? "Page write"
            )
            return
        }

        screenplayDraftBridge.updateAssistantPin(
            mode: "copilot",
            category: memoryDomain == .companion ? "Story" : "Scene",
            title: stub.noteTitle,
            body: clippedStudioAssistantText(stub.noteBody),
            fullBody: stub.noteBody,
            badge: stub.pack,
            actionSummary: ""
        )
    }
#endif

    @MainActor
    private func showStudioCommandNotice(_ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        transientTurnBannerTask?.cancel()
        withAnimation(.easeInOut(duration: 0.18)) {
            transientTurnBannerText = clean
        }
        transientTurnBannerTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.22)) {
                transientTurnBannerText = nil
            }
        }
    }

    @MainActor
    private func presentCanonClarificationIfNeeded(_ clarification: BackendCanonCorrectionAmbiguity?) {
        guard let clarification,
              clarification.isPending,
              clarification.candidateFacts.count >= 2 else {
            return
        }
        guard pendingCanonClarification?.id != clarification.id else { return }
        isResolvingCanonClarification = false
        canonClarificationError = ""
        withAnimation(.easeInOut(duration: 0.22)) {
            pendingCanonClarification = clarification
        }
    }

    @MainActor
    private func deferCanonClarification() {
        guard !isResolvingCanonClarification else { return }
        canonClarificationError = ""
        withAnimation(.easeInOut(duration: 0.20)) {
            pendingCanonClarification = nil
        }
    }

    @MainActor
    private func resolveCanonClarification(_ selectedFacts: [String]) {
        guard let clarification = pendingCanonClarification,
              clarification.isPending,
              !isResolvingCanonClarification else {
            return
        }
        var seen = Set<String>()
        let cleanFacts = selectedFacts.compactMap { value -> String? in
            let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty, clarification.candidateFacts.contains(clean) else { return nil }
            let key = clean.lowercased()
            guard seen.insert(key).inserted else { return nil }
            return clean
        }
        guard !cleanFacts.isEmpty, cleanFacts.count == selectedFacts.count else { return }

        isResolvingCanonClarification = true
        canonClarificationError = ""
        Task { @MainActor in
            do {
                let result = try await BackendMemoryAPI.shared.resolveCanonCorrection(
                    ambiguityID: clarification.id,
                    selectedFacts: cleanFacts
                )
                guard result.payload.ok else {
                    canonClarificationError = result.payload.message ?? "Clementine could not update canon yet."
                    isResolvingCanonClarification = false
                    return
                }
                let retiredFacts = result.payload.correctionReceipt?.matchedFacts ?? cleanFacts
                screenplayDraftBridge.noteResolvedCanonCorrection(
                    correctionText: clarification.correctionText,
                    retiredFacts: retiredFacts,
                    projectId: clarification.projectId,
                    projectTitle: clarification.projectTitle
                )
                withAnimation(.easeInOut(duration: 0.20)) {
                    pendingCanonClarification = nil
                }
                isResolvingCanonClarification = false
                let count = retiredFacts.count
                showStudioCommandNotice(
                    "Canon updated across \(count) \(count == 1 ? "fact" : "facts"). Clementine will use your correction from here forward."
                )
                scheduleRealtimeProjectGroundingRefresh(
                    reason: "canon_clarification_resolved",
                    stateVersion: result.sync.stateVersion,
                    projectId: result.payload.correctionReceipt?.projectId ??
                        clarification.projectId ?? "",
                    projectTitle: result.payload.correctionReceipt?.projectTitle ??
                        clarification.projectTitle ?? ""
                )
            } catch {
                isResolvingCanonClarification = false
                canonClarificationError = error.localizedDescription
            }
        }
    }

    @MainActor
    private func runLocalStudioCommandIfNeeded(
        _ rawText: String,
        source: ScreenplayStudioUserPrompt.Source,
        shouldSpeakConfirmation: Bool
    ) -> (handled: Bool, error: String?) {
        guard isStudioSurfaceActive else { return (false, nil) }
        guard let feedback = screenplayDraftBridge.executeLocalStudioCommand(rawText, source: source) else {
            return (false, nil)
        }

        let clean = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        if source == .voice, !clean.isEmpty {
            lastHandledLocalStudioCommandUserMessage = clean
            lastHandledLocalStudioCommandAt = Date()
            transcript = clean
            livePartialTranscript = ""
            lastNonEmptyPartialTranscriptHint = ""
            if !feedback.isError {
                showReplyEcho(user: clean, assistant: feedback.confirmation)
            }
        }

        showStudioCommandNotice(feedback.confirmation)

        if source == .voice, shouldSpeakConfirmation, feedback.shouldSpeakConfirmation, !feedback.isError {
            let spokenText = (feedback.spokenText ?? feedback.confirmation)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !spokenText.isEmpty else {
                return (true, feedback.isError ? feedback.confirmation : nil)
            }
            promptSpeaker.stop()
            typedReplySpeaker.cancel()
            promptSpeaker.speak(spokenText, style: feedback.spokenStyle)
            let resumeDelay = max(0.95, promptSpeaker.estimatedDuration(for: spokenText, style: feedback.spokenStyle) + 0.35)
            DispatchQueue.main.asyncAfter(deadline: .now() + resumeDelay) {
                if self.pendingGoodbyeStopAfterPlayback || !self.conversationLoopEnabled {
                    self.voice.stopRecording()
                    self.voice.teardown()
                } else {
                    self.voice.resumeRecordingIfNeeded()
                }
            }
        }

        return (true, feedback.isError ? feedback.confirmation : nil)
    }

    @MainActor
    @discardableResult
    private func applyConversationalStudioCorrectionIfNeeded(
        _ rawText: String
    ) async -> Bool {
        let clean = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        guard isStudioSurfaceActive || screenplayDraftBridge.latestAppliedMemory.hasContent else {
            return false
        }
        guard let correction = ScreenplayStudioAppliedMemoryState.conversationalCorrection(from: clean) else {
            return false
        }

        do {
            let character = try await screenplayDraftBridge.saveInlineAppliedMemoryCorrection(correction)
            speculativeTalk.cancel()
            let confirmation = "Saved correction for \(character)."
            screenplayDraftBridge.autoInsertStatusText = confirmation
            showStudioCommandNotice(confirmation)
            return true
        } catch {
            let message = "Memory correction failed: \(error.localizedDescription)"
            screenplayDraftBridge.autoInsertStatusText = message
            showStudioCommandNotice(message)
            return false
        }
    }

    @MainActor
    private func recordStudioConversationMemoryIfNeeded(
        user: String,
        assistant: String,
        memoryDomain: StudioMemoryDomain,
        isScreenplayMode: Bool,
        source: ScreenplayCompanionTurnSource = .voice
    ) {
        guard isScreenplayMode else {
            screenplayDraftBridge.recordCompanionHomeTurn(user: user, assistant: assistant)
            appendRecentTurnWindow(user: user, assistant: assistant)
            return
        }

        screenplayDraftBridge.recordStudioConversationTurn(
            user: user,
            assistant: assistant,
            memoryDomain: memoryDomain,
            source: source
        )

        if memoryDomain == .companion || memoryDomain == .mixed {
            appendRecentTurnWindow(user: user, assistant: assistant)
        }
    }

    @MainActor
    private func syncEvolutionForMemoryDomain(
        userMessage: String,
        memoryDomain: StudioMemoryDomain,
        isScreenplayMode: Bool
    ) async {
        let cleanUser = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUser.isEmpty else { return }

        if memoryDomain == .project || memoryDomain == .mixed {
            HerEvolutionStore.shared.noteCreativeContext(from: cleanUser, isScreenplayMode: isScreenplayMode)
        }

        if memoryDomain == .companion || memoryDomain == .mixed {
            if let detectedName = evolution.updatePreferredNameFromUserTextIfPresent(cleanUser) {
                onboardingName = detectedName
            }
            _ = evolution.updatePersonaFromUserTextIfPresent(cleanUser)
            evolution.recordUserMessage(cleanUser)
        }

        let evo = evolution
        await BackendMemoryAPI.shared.syncEvolutionState(
            stage: evo.stage,
            depthScore: evo.depthScore,
            romanceTension: evo.romanceTension,
            sessionCount: evo.sessionCount,
            reassuranceNeed: evo.reassuranceNeed,
            boundaryNeed: evo.boundaryNeed,
            playfulMomentum: evo.playfulMomentum,
            trustSignal: evo.trustSignal,
            lastThemeCue: evo.lastThemeCue,
            preferredName: evo.preferredName,
            isScreenwriter: evo.isScreenwriter,
            latestUserMessage: memoryDomain == .project ? nil : cleanUser
        )
    }

    private func shouldIgnoreRealtimeStudioAssistantForLocalCommand(userMessage: String) -> Bool {
        let clean = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        guard clean == lastHandledLocalStudioCommandUserMessage else { return false }
        return Date().timeIntervalSince(lastHandledLocalStudioCommandAt) < 8
    }

    @MainActor
    private func currentPartialHintForTalk() -> String {
        let live = livePartialTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !live.isEmpty { return String(live.prefix(320)) }
        let cached = lastNonEmptyPartialTranscriptHint.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cached.isEmpty { return String(cached.prefix(320)) }
        return ""
    }

    @MainActor
    private func buildPreparedTurnPrompt(
        confirmedTranscript: String,
        partialHint: String,
        isScreenplayModeOverride: Bool? = nil,
        turnKeyNamespace: String = "voice"
    ) -> PreparedTurnPrompt {
        let store = HerEvolutionStore.shared
        let directorText = richerTurnText(
            confirmedTranscript: confirmedTranscript,
            partialHint: partialHint
        )
        let screenplayPhaseHint = screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
        let screenplayPackHint = screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPack.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
        let screenplayDraftExcerpt = String(
            screenplayDraftBridge.draftText
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .suffix(2200)
        )

        let shouldAutoOpenStudioForTurn = isScreenplayModeOverride == nil
            ? shouldAutoOpenStudioForScriptIntent(directorText)
            : false
        let useScreenplayModeForTurn = isScreenplayModeOverride
            ?? (isStudioSurfaceActive || shouldAutoOpenStudioForTurn)
        let memoryDomain = useScreenplayModeForTurn
            ? studioMemoryDomain(for: directorText, preferredTarget: .automatic)
            : .companion

        let director = HerDirectorContext.build(from: store, userText: directorText)
        let turnKey = "\(store.sessionCount)|\(turnKeyNamespace)|\(useScreenplayModeForTurn ? "studio" : "voice")|\(directorText.lowercased())"
        let opening = HerMicroInitiations.openingBeat(
            context: director,
            turnKey: turnKey,
            isScreenplayMode: useScreenplayModeForTurn
        )
        let recentTurns = studioRecentTurns(
            for: memoryDomain,
            isScreenplayMode: useScreenplayModeForTurn
        )
        let shouldWriteToPage = useScreenplayModeForTurn
            ? shouldRouteStudioPromptToPage(
                directorText,
                preferredTarget: .automatic
            )
            : false
        let confirmedStudioStoryContext = useScreenplayModeForTurn
            ? confirmedStudioPageWriteContext(for: directorText)
            : nil
        let promptContext = HerVoiceSpec.Context(
            stage: director.stage,
            depthScore: director.depth,
            romanceTension: director.romance,
            personaPreset: director.personaPreset,
            isLoveTopic: director.isLoveTopic,
            preferredName: director.preferredName,
            subtleMemoryCue: director.subtleMemoryCue,
            canUseRomanticAmbiguity: director.canUseRomanticAmbiguity,
            canInitiateVulnerability: director.canInitiateVulnerability,
            optionalOpeningBeat: opening,
            isScreenplayMode: useScreenplayModeForTurn,
            screenplayPhaseHint: screenplayPhaseHint,
            screenplayPackHint: screenplayPackHint,
            screenplayDraftExcerpt: screenplayDraftExcerpt,
            screenplayGenre: director.screenplayGenre,
            isAskingForStoryHelp: director.isAskingForStoryHelp,
            isSynopsisFocused: director.isSynopsisFocused,
            isOutlineFocused: director.isOutlineFocused,
            isStoryDirectionPrompt: director.isStoryDirectionPrompt,
            isCharacterFocused: director.isCharacterFocused,
            isClimax: director.isClimax,
            isOpeningOrClosing: director.isOpeningOrClosing,
            isLongFormScreenplayRequest: director.isLongFormScreenplayRequest,
            isDirectScreenplayPageWrite: shouldWriteToPage,
            hasConfirmedScreenplayPageWrite: shouldWriteToPage || confirmedStudioStoryContext != nil,
            confirmedScreenplayStoryDirection: shouldWriteToPage ? directorText : (confirmedStudioStoryContext ?? ""),
            isUserVulnerable: director.isUserVulnerable,
            isUserPlayful: director.isUserPlayful,
            isUserDirect: director.isUserDirect,
            isNostalgic: director.isNostalgic,
            hasCommitmentSignals: director.hasCommitmentSignals,
            hasRomanticChemistrySignals: director.hasRomanticChemistrySignals,
            isLowEnergyAnalytical: director.isLowEnergyAnalytical,
            isGrief: director.isGrief,
            isAnxious: director.isAnxious,
            isCelebrating: director.isCelebrating,
            recentTurns: recentTurns,
            partialTranscriptHint: partialHint,
            voicedRatio: voice.lastFinalTurnHints.voicedRatio,
            speechAgeSeconds: voice.lastFinalTurnHints.speechAgeSeconds,
            hasStrongPartial: voice.lastFinalTurnHints.hasStrongPartial
        )
        let companionSignals = CreativeCompanionSignalEngine.build(
            context: director,
            memoryDomain: memoryDomain,
            companionMode: screenplayDraftBridge.companionMode,
            isScreenplayMode: useScreenplayModeForTurn,
            shouldWriteToPage: shouldWriteToPage,
            screenplayPhaseHint: screenplayPhaseHint,
            screenplayPackHint: screenplayPackHint,
            recentTurns: recentTurns,
            sourceText: directorText
        )
        let baseSystemPrompt = ScreenplayPromptBuilder.makeLocalPersonaPrompt(
            context: promptContext,
            speakingPace: clementineSpeakingPace,
            memoryDomain: memoryDomain,
            shouldWriteToPage: shouldWriteToPage,
            companionInstruction: screenplayDraftBridge.companionMode.promptInstruction,
            companionSignals: companionSignals
        )

        return PreparedTurnPrompt(
            directorText: directorText,
            partialHint: partialHint,
            useScreenplayMode: useScreenplayModeForTurn,
            shouldWriteToPage: shouldWriteToPage,
            shouldAutoOpenStudio: shouldAutoOpenStudioForTurn,
            memoryDomain: memoryDomain,
            director: director,
            companionSignals: companionSignals,
            baseSystemPrompt: baseSystemPrompt
        )
    }

    private func isStudioPageWriteConfirmationCue(_ userText: String) -> Bool {
        let trimmed = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }

        var normalized = trimmed.lowercased()
        normalized = normalized.replacingOccurrences(of: "’", with: "")
        normalized = normalized.replacingOccurrences(of: "'", with: "")
        normalized = normalized.replacingOccurrences(
            of: #"[^\p{L}\p{N}]+"#,
            with: " ",
            options: .regularExpression
        )
        normalized = normalized.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return false }

        let exactApprovals: Set<String> = [
            "yes",
            "yeah",
            "yep",
            "yup",
            "ok",
            "okay",
            "sure",
            "yes please",
            "sounds good",
            "that works",
            "perfect",
            "great",
            "lets do it",
            "lets do that",
            "do it",
            "do that",
            "write it",
            "write that",
            "use that",
            "go with that",
            "put it on the page",
            "put that on the page",
            "put it in the script",
            "put that in the script",
        ]
        if exactApprovals.contains(normalized) {
            return true
        }

        let padded = " \(normalized) "
        let phraseCues = [
            " yes write that ",
            " yes write it ",
            " yeah write that ",
            " yeah write it ",
            " okay write that ",
            " okay write it ",
            " ok write that ",
            " ok write it ",
            " sure write that ",
            " sure write it ",
            " do that ",
            " do it ",
            " write that ",
            " write it ",
            " use that ",
            " go with that ",
            " put it on the page ",
            " put that on the page ",
            " put it in the script ",
            " put that in the script ",
        ]
        return phraseCues.contains { padded.contains($0) }
    }

    private func latestStudioCopilotContext() -> String? {
        let pins = [screenplayDraftBridge.assistantPin] + screenplayDraftBridge.assistantPinHistory
        for pin in pins where pin.mode.lowercased() == "copilot" {
            let body = pin.body.trimmingCharacters(in: .whitespacesAndNewlines)
            let summary = pin.actionSummary.trimmingCharacters(in: .whitespacesAndNewlines)
            let combined = [body, summary]
                .filter { !$0.isEmpty }
                .joined(separator: "\n")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !combined.isEmpty {
                return combined
            }
        }

        for turn in recentTurnWindow.reversed() {
            let assistant = turn.assistant.trimmingCharacters(in: .whitespacesAndNewlines)
            if !assistant.isEmpty {
                return assistant
            }
        }
        return nil
    }

    private func confirmedStudioPageWriteContext(for userText: String) -> String? {
        guard isStudioPageWriteConfirmationCue(userText) else { return nil }
        let context = latestStudioCopilotContext()?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !context.isEmpty else { return nil }
        return context
    }

    private func studioApprovedStoryDirection(from context: String) -> String {
        let cleanContext = context.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanContext.isEmpty else { return "" }

        let paragraphs = cleanContext
            .components(separatedBy: "\n\n")
            .map { paragraph in
                paragraph.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            .filter { !$0.isEmpty }

        let draftableParagraphs = paragraphs.filter { paragraph in
            let lower = paragraph.lowercased()
            if paragraph.hasSuffix("?") { return false }
            if lower.hasPrefix("what ") || lower.hasPrefix("how ") || lower.hasPrefix("why ") {
                return false
            }
            return true
        }

        let preferred = draftableParagraphs.joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return preferred.isEmpty ? cleanContext : preferred
    }

    private func studioRenderTranscript(
        for userMessage: String,
        confirmedContext: String?,
        preferredTarget: ScreenplayStudioScreen.PromptRoutingMode = .automatic
    ) -> String {
        let cleanUser = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanContext = studioApprovedStoryDirection(
            from: confirmedContext?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        )
        guard !cleanUser.isEmpty else { return cleanContext }
        if preferredTarget == .page && cleanContext.isEmpty {
            return """
Write this directly into screenplay pages now. Maintain continuity with the existing draft and output screenplay text only.

\(cleanUser)
"""
        }
        guard !cleanContext.isEmpty else { return cleanUser }

        return """
Write this approved story direction directly into screenplay pages now. Maintain continuity with the existing draft and output screenplay text only.

\(cleanContext)
"""
    }

    private func realtimeStudioDraftPlaceholderReply(
        userMessage: String,
        confirmedContext: String?
    ) -> String? {
        let approvedContext = studioApprovedStoryDirection(
            from: confirmedContext?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        )
        let source = approvedContext.isEmpty
            ? userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
            : approvedContext
        guard !source.isEmpty else { return nil }

        let candidate = source
            .components(separatedBy: .newlines)
            .compactMap(realtimeStudioDraftPlaceholderLine(from:))
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !candidate.isEmpty else { return nil }

        let normalized = FountainFormatter.normalizeHollywoodDraft(
            candidate,
            existingDraft: screenplayDraftBridge.previewFormattingBaseDraft
        )
        guard FountainFormatter.isLikelyFountainBlock(normalized) else { return nil }
        return normalized
    }

    private func realtimeStudioDraftPlaceholderLine(from source: String) -> String? {
        var text = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        let leadingPatterns = [
            #"(?i)^write\s+(?:the\s+)?(?:next\s+beat|next\s+moment|next\s+scene|this|that|it)\s+(?:where\s+)?"#,
            #"(?i)^write\s+(?:where\s+)?"#,
            #"(?i)^continue\s+(?:the\s+scene\s+)?(?:where\s+)?"#,
            #"(?i)^what\s+if\s+"#,
            #"(?i)^maybe\s+"#,
            #"(?i)^have\s+(?:her|him|them)\s+"#,
            #"(?i)^let\s+(?:her|him|them)\s+"#,
            #"(?i)^(?:put\s+this\s+in(?:to)?\s+the\s+draft|work\s+this\s+into\s+the\s+scene|weave\s+this\s+in)\s*"#
        ]
        for pattern in leadingPatterns {
            text = text.replacingOccurrences(
                of: pattern,
                with: "",
                options: [.regularExpression]
            )
            text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        text = text.replacingOccurrences(
            of: #"(?i)^(?:she|he|they)\s+should\s+"#,
            with: "",
            options: [.regularExpression]
        )
        text = text.replacingOccurrences(
            of: #"(?i)^(?:she|he|they)\s+could\s+"#,
            with: "",
            options: [.regularExpression]
        )
        text = text.replacingOccurrences(
            of: #"[?!.]+\s*$"#,
            with: "",
            options: [.regularExpression]
        )
        text = text.replacingOccurrences(
            of: #"\s+"#,
            with: " ",
            options: [.regularExpression]
        )
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        if text.count > 180 {
            text = String(text.prefix(180)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return text
    }

    private func shouldForceStudioPageWrite(for userText: String) -> Bool {
        let normalized = " \(userText.lowercased()) "
        if isSynopsisDevelopmentPrompt(userText) && !isExplicitStudioPageDestinationCue(userText) {
            return false
        }
        let directPageWritePatterns = [
            #"\bwrite\b.*\b(?:screenplay\s+)?action\s+line(?:s)?\b"#,
            #"\bwrite\b.*\b(?:screenplay\s+)?dialogue\s+line(?:s)?\b"#
        ]
        if directPageWritePatterns.contains(where: {
            normalized.range(of: $0, options: .regularExpression) != nil
        }) {
            return true
        }
        let cues = [
            " write the scene ",
            " write a scene ",
            " write a longer scene ",
            " write a longer script ",
            " write the full scene ",
            " write the next scene ",
            " write the next beat ",
            " write dialogue ",
            " write action ",
            " rewrite the scene ",
            " rewrite this scene ",
            " continue the scene ",
            " continue this scene ",
            " continue from here ",
            " continue the script ",
            " draft the scene ",
            " draft a scene ",
            " draft the next scene ",
            " draft the next beat ",
            " keep writing ",
            " keep going from here ",
            " carry this forward ",
            " take it from here ",
            " rewrite it ",
            " rewrite this ",
            " rewrite that ",
            " rewrite the last ",
            " revise this ",
            " replace the line ",
            " replace that line ",
            " replace the last ",
            " swap out the line ",
            " play out the full sequence ",
            " play out the whole scene ",
            " full sequence ",
            " full scene ",
            " more dialogue ",
            " more beats ",
            " more pages ",
            " next page ",
            " put this on the page ",
            " put it on the page ",
            " put this in the scene ",
            " put this in the draft ",
            " work this into the scene ",
            " weave this in ",
            " next beat ",
            " next scene ",
            " scene where ",
            " write a scene ",
            " add dialogue ",
            " punch this up ",
            " punch up this scene ",
            " punch up ",
            " make this scene ",
            " open on ",
            " give me the scene ",
        ]
        if cues.contains(where: { normalized.contains($0) }) {
            return true
        }
        if explicitStudioScreenplayBlockCandidate(from: userText) != nil {
            return true
        }
        return confirmedStudioPageWriteContext(for: userText) != nil
    }

    private func isExplicitStudioPageWritePrompt(_ userText: String) -> Bool {
        let normalized = " \(userText.lowercased()) "
        let directPageWritePatterns = [
            #"\bwrite\b.*\b(?:screenplay\s+)?action\s+line(?:s)?\b"#,
            #"\bwrite\b.*\b(?:screenplay\s+)?dialogue\s+line(?:s)?\b"#
        ]
        if directPageWritePatterns.contains(where: {
            normalized.range(of: $0, options: .regularExpression) != nil
        }) {
            return true
        }
        let cues = [
            " write the scene ",
            " write a scene ",
            " write a longer scene ",
            " write a longer script ",
            " write the full scene ",
            " write an opening scene ",
            " write the next scene ",
            " write the next beat ",
            " write dialogue ",
            " write action ",
            " draft the scene ",
            " draft a scene ",
            " draft the next scene ",
            " draft the next beat ",
            " play out the full sequence ",
            " play out the whole scene ",
            " script the ",
            " script this ",
            " continue the scene ",
            " continue this scene ",
            " continue from here ",
            " continue the script ",
            " keep writing ",
            " keep going from here ",
            " carry this forward ",
            " take it from here ",
            " next page ",
            " put this on the page ",
            " put it on the page ",
            " give me the scene ",
            " open on ",
            " scene where ",
        ]
        if cues.contains(where: { normalized.contains($0) }) {
            return true
        }
        return explicitStudioScreenplayBlockCandidate(from: userText) != nil
    }

    private func explicitStudioScreenplayBlockCandidate(from userText: String) -> String? {
        let clean = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }

        let lower = clean.lowercased()
        let explicitLeadIns = [
            "screenplay block",
            "exactly this screenplay block",
            "exactly this script block",
            "screenplay lines",
            "screenplay pages",
            "script block",
            "script pages",
            "nothing else:"
        ]
        let hasExplicitLeadIn = explicitLeadIns.contains(where: { lower.contains($0) })
        let candidate = studioPromptScreenplayBlockPayload(from: clean)
        guard hasExplicitLeadIn || studioPromptContainsRawScreenplayMarkers(candidate) else {
            return nil
        }

        let normalized = FountainFormatter.normalizeHollywoodDraft(
            candidate,
            existingDraft: screenplayDraftBridge.previewFormattingBaseDraft
        )
        if FountainFormatter.isLikelyFountainBlock(normalized) {
            return normalized
        }

        return studioPromptContainsRawScreenplayMarkers(candidate) ? candidate : nil
    }

    private func studioPromptScreenplayBlockPayload(from userText: String) -> String {
        let clean = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return "" }

        if let newlineIndex = clean.firstIndex(of: "\n") {
            let leading = clean[..<newlineIndex].lowercased()
            let remainder = clean[clean.index(after: newlineIndex)...]
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if leading.contains("screenplay") || leading.contains("script") || leading.contains("write exactly this") {
                return remainder
            }
        }

        if let colonIndex = clean.firstIndex(of: ":") {
            let leading = clean[..<colonIndex].lowercased()
            if leading.contains("screenplay") ||
                leading.contains("script") ||
                leading.contains("write exactly this") ||
                leading.contains("nothing else") {
                return clean[clean.index(after: colonIndex)...]
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        return clean
    }

    private func studioPromptContainsRawScreenplayMarkers(_ candidate: String) -> Bool {
        let lines = candidate
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !lines.isEmpty else { return false }

        let hasSceneHeading = lines.contains { line in
            let upper = line.uppercased()
            return upper.hasPrefix("INT.") ||
                upper.hasPrefix("EXT.") ||
                upper.hasPrefix("INT/EXT.") ||
                upper.hasPrefix("I/E.")
        }
        let hasCharacterCue = lines.indices.contains { index in
            let line = lines[index]
            guard line == line.uppercased() else { return false }
            guard line.count <= 32 else { return false }
            guard !line.contains(".") else { return false }
            return index + 1 < lines.count
        }

        return hasSceneHeading || hasCharacterCue
    }

    private func isExplicitStudioPageDestinationCue(_ userText: String) -> Bool {
        let normalized = " \(userText.lowercased()) "
        let cues = [
            " on the page ",
            " into the draft ",
            " in the draft ",
            " as screenplay pages ",
            " as pages ",
            " in fountain ",
            " in screenplay format ",
            " draft it as a scene ",
            " write the scene ",
            " write a scene ",
            " write the next scene ",
            " write the next beat "
        ]
        return cues.contains(where: { normalized.contains($0) })
    }

    private func isExplicitStudioStoryAdvicePrompt(_ userText: String) -> Bool {
        let normalized = " \(userText.lowercased()) "
        if isExplicitStudioPageDestinationCue(userText) || isExplicitStudioPageWritePrompt(userText) {
            return false
        }
        if isSynopsisDevelopmentPrompt(userText) {
            return true
        }
        let adviceCues = [
            " what if ",
            " maybe she ",
            " maybe he ",
            " maybe they ",
            " maybe this scene ",
            " maybe the scene ",
            " maybe we open ",
            " maybe we cut ",
            " should she ",
            " should he ",
            " should they ",
            " she should ",
            " he should ",
            " they should ",
            " she could ",
            " he could ",
            " they could ",
            " have her ",
            " have him ",
            " have them ",
            " let her ",
            " let him ",
            " let them ",
            " what's weak ",
            " what is weak ",
            " what's missing ",
            " what is missing ",
            " what's not working ",
            " what is not working ",
            " what isnt working ",
            " what isn't working ",
            " any notes ",
            " feedback ",
            " coverage ",
            " diagnose ",
            " scene doctor ",
            " doctor this ",
            " doctor the scene ",
            " fix this scene ",
            " why isn't this working ",
            " why isnt this working ",
            " give me notes ",
            " what do you think ",
            " does this work ",
            " is this working ",
            " how can i improve ",
            " what would make this better ",
            " what should change ",
        ]
        if adviceCues.contains(where: { normalized.contains($0) }) {
            return true
        }
        let director = HerDirectorContext.build(from: HerEvolutionStore.shared, userText: userText)
        return director.isStoryDirectionPrompt || director.isAskingForStoryHelp || director.isCharacterFocused
    }

    private func isSynopsisDevelopmentPrompt(_ userText: String) -> Bool {
        let normalized = " \(userText.lowercased()) "
        let directCues = [
            " synopsis ",
            " logline ",
            " treatment ",
            " premise ",
            " one pager ",
            " one-pager ",
            " story summary ",
            " plot summary ",
            " outline ",
            " beat sheet ",
            " beat-sheet ",
            " series bible "
        ]
        if directCues.contains(where: { normalized.contains($0) }) {
            return true
        }
        let director = HerDirectorContext.build(from: HerEvolutionStore.shared, userText: userText)
        return director.isSynopsisFocused
    }

    private func shouldTreatStudioPromptAsCollaboration(
        _ userText: String,
        preferredTarget: ScreenplayStudioScreen.PromptRoutingMode = .automatic
    ) -> Bool {
        if preferredTarget == .page { return false }
        if preferredTarget == .voicePin { return true }
        if isExplicitStudioStoryAdvicePrompt(userText) {
            return true
        }
        if shouldForceStudioPageWrite(for: userText) || isExplicitStudioPageWritePrompt(userText) {
            return false
        }
        let director = HerDirectorContext.build(from: HerEvolutionStore.shared, userText: userText)
        return director.isStoryDirectionPrompt || director.isAskingForStoryHelp || director.isCharacterFocused
    }

    private func shouldRouteStudioPromptToPage(
        _ userText: String,
        preferredTarget: ScreenplayStudioScreen.PromptRoutingMode = .automatic
    ) -> Bool {
        let clean = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        let target: DraftStudioPromptTarget
        switch preferredTarget {
        case .automatic:
            target = .automatic
        case .page:
            target = .page
        case .voicePin:
            target = .voicePin
        }
        return DraftStudioPromptRouter.shouldRouteToPage(
            clean,
            preferredTarget: target,
            signals: DraftStudioPromptSignals(
                isExplicitStoryAdvice: isExplicitStudioStoryAdvicePrompt(clean),
                isForcedPageWrite: shouldForceStudioPageWrite(for: clean),
                isExplicitPageWrite: isExplicitStudioPageWritePrompt(clean)
            )
        )
    }

    private func clippedStudioAssistantText(_ text: String, limit: Int = 560) -> String {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count > limit else { return clean }
        return String(clean.prefix(limit)).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func studioAssistantBadge(pack: String, phase: String) -> String {
        let cleanPack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanPack.isEmpty { return cleanPack }
        let cleanPhase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanPhase.isEmpty { return "Studio" }
        return cleanPhase.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func studioAssistantActionSummary(from result: BackendTalkResult) -> String {
        if let task = result.taskAction {
            let status = task.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let title = (task.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !status.isEmpty && status != "none" {
                if !title.isEmpty {
                    return "Task \(status): \(title)"
                }
                return "Task \(status)."
            }
        }

        if let note = result.noteAction, note.captured {
            let title = (note.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let target = note.target.trimmingCharacters(in: .whitespacesAndNewlines)
            if !title.isEmpty && !target.isEmpty {
                return "Saved note to \(target): \(title)"
            }
            if !title.isEmpty {
                return "Saved note: \(title)"
            }
            return "Captured note."
        }

        return ""
    }

    private func studioAssistantCategory(from result: BackendTalkResult, insertedText: String?) -> String {
        if result.taskAction?.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "none",
           !(result.taskAction?.status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) {
            return "Task"
        }
        if result.noteAction?.captured == true {
            return "Task"
        }

        let cleanInsertedText = (insertedText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let transcript = (result.transcript ?? "").lowercased()
        let reply = (result.reply ?? "").lowercased()
        let combined = " \(transcript) \(reply) \(cleanInsertedText.lowercased()) "

        let dialogueCues = [
            " dialogue ",
            " line ",
            " lines ",
            " monologue ",
            " voiceover ",
            " voice over ",
            " banter ",
            " subtext ",
            " what does he say ",
            " what does she say ",
        ]
        if dialogueCues.contains(where: { combined.contains($0) }) {
            return "Dialogue"
        }

        let insertedLines = cleanInsertedText
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let hasSceneHeading = insertedLines.contains { line in
            let upper = line.uppercased()
            return upper.hasPrefix("INT.") ||
                upper.hasPrefix("EXT.") ||
                upper.hasPrefix("INT/EXT.") ||
                upper.hasPrefix("I/E.")
        }
        let hasCharacterCue = insertedLines.contains { line in
            guard line == line.uppercased() else { return false }
            guard line.count <= 32 else { return false }
            return !line.contains(".")
        }
        if hasCharacterCue && !hasSceneHeading {
            return "Dialogue"
        }

        let sceneCues = [
            " scene ",
            " slugline ",
            " location ",
            " setting ",
            " opening image ",
            " beat ",
            " blocking ",
            " entrance ",
            " exit ",
        ]
        if hasSceneHeading || sceneCues.contains(where: { combined.contains($0) }) {
            return "Scene"
        }

        return "Story"
    }

    @MainActor
    private func updateStudioAssistantPin(
        from result: BackendTalkResult,
        insertedText: String?,
        promptSource: ScreenplayStudioUserPrompt.Source = .voice,
        promptTextOverride: String? = nil,
        promptTargetOverride: ScreenplayStudioUserPrompt.Target? = nil,
        shouldRecordPrompt: Bool = true
    ) {
        guard isStudioSurfaceActive || result.screenplayTrace.modeEnabled else { return }

        let cleanTranscript = (promptTextOverride ?? result.transcript ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanReply = (result.reply ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanInsertedText = (insertedText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let badge = studioAssistantBadge(
            pack: result.screenplayTrace.pack,
            phase: result.screenplayTrace.phase
        )
        let actionSummary = studioAssistantActionSummary(from: result)
        let category = studioAssistantCategory(from: result, insertedText: insertedText)
        let requestedPromptTarget = promptTargetOverride ?? (cleanInsertedText.isEmpty ? .voicePin : .page)
        let memoryDomain = studioMemoryDomain(
            for: cleanTranscript,
            preferredTarget: requestedPromptTarget == .page ? .page : .voicePin
        )
        let promptTarget: ScreenplayStudioUserPrompt.Target
        if requestedPromptTarget == .voicePin {
            promptTarget = .voicePin
        } else if !cleanInsertedText.isEmpty {
            promptTarget = .page
        } else if memoryDomain == .companion {
            promptTarget = .voicePin
        } else {
            promptTarget = requestedPromptTarget
        }

        if shouldRecordPrompt, !cleanTranscript.isEmpty {
            screenplayDraftBridge.recordStudioUserPrompt(
                cleanTranscript,
                requestID: result.commit?.requestId,
                source: promptSource,
                target: promptTarget,
                memoryDomain: memoryDomain
            )
        }

        if promptTarget == .page, !cleanInsertedText.isEmpty {
            let firstLine = cleanInsertedText
                .split(whereSeparator: \.isNewline)
                .map(String.init)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .first(where: { !$0.isEmpty }) ?? ""
            let summary = actionSummary.isEmpty
                ? (firstLine.isEmpty ? "Latest dictation inserted into the page." : "Latest insert: \(firstLine)")
                : actionSummary
            screenplayDraftBridge.updateAssistantPin(
                mode: "page",
                category: category,
                title: "Writing On The Page",
                body: "io.them is in page mode. If io.them pitches a beat you want drafted, say yes, write that and it will put it on the page. Ask for stronger conflict, sharper subtext, a harder reversal, cleaner visuals, or the next beat and she will keep writing directly into the draft.",
                badge: badge,
                actionSummary: summary
            )
            return
        }

        if !cleanReply.isEmpty {
            screenplayDraftBridge.updateAssistantPin(
                mode: actionSummary.isEmpty ? "copilot" : "task",
                category: category,
                title: actionSummary.isEmpty ? "io.them Voice Pin" : "Copilot And Task Status",
                body: clippedStudioAssistantText(cleanReply),
                fullBody: cleanReply,
                badge: badge,
                actionSummary: actionSummary
            )
            return
        }

        if !actionSummary.isEmpty {
            screenplayDraftBridge.updateAssistantPin(
                mode: "task",
                category: category,
                title: "Studio Task Status",
                body: "io.them handled a screenplay-related action.",
                badge: badge,
                actionSummary: actionSummary
            )
        }
    }

    private func autoCreatedStudioProjectTitle(for draft: String, pack: String) -> String {
        let lines = draft
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let candidate = lines.first(where: { line in
            let upper = line.uppercased()
            return !upper.hasPrefix("INT.") &&
                !upper.hasPrefix("EXT.") &&
                !upper.hasPrefix("EST.") &&
                !upper.hasPrefix(".")
        }) ?? lines.first ?? ""

        let sanitized = candidate
            .replacingOccurrences(of: "[^A-Za-z0-9 ]+", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if sanitized.count >= 4 {
            let trimmed = String(sanitized.prefix(48)).trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return trimmed
            }
        }

        let cleanPack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanPack.isEmpty {
            return cleanPack.replacingOccurrences(of: "_", with: " ").capitalized
        }

        return "Studio Draft \(Date().formatted(date: .abbreviated, time: .omitted))"
    }

    @MainActor
    private func promoteRestoredLiveDraftToStudioProjectIfNeeded() {
        let cleanProjectID = screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackProjectID = liveScreenplayProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let projectID = cleanProjectID.isEmpty ? fallbackProjectID : cleanProjectID
        let cleanPack = screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhase = screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)

        autoCreateStudioProjectIfNeeded(
            draft: screenplayDraftBridge.draftText,
            pack: cleanPack.isEmpty ? liveScreenplayPack : cleanPack,
            phase: cleanPhase.isEmpty ? liveScreenplayPhase : cleanPhase,
            existingProjectID: projectID
        )
    }

    @MainActor
    private func autoCreateStudioProjectIfNeeded(
        draft: String,
        pack: String,
        phase: String,
        existingProjectID: String
    ) {
        let cleanDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let knownProjectID = existingProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            : existingProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let createKey = utteranceFingerprint(Data("\(cleanDraft)|\(pack)|\(phase)".utf8))
        guard ScreenplayRestoredLiveDraftProjectPromotionPolicy.shouldCreateProject(
            isStudioSurfaceActive: isStudioSurfaceActive,
            draft: cleanDraft,
            existingProjectID: knownProjectID,
            isAutoCreatingProject: isAutoCreatingStudioProject,
            createKey: createKey,
            lastCreateKey: lastAutoCreatedStudioProjectKey
        ) else {
            return
        }

        isAutoCreatingStudioProject = true
        screenplayDraftBridge.autoInsertStatusText = "Creating a Studio project for this script..."

        Task { @MainActor in
            defer { isAutoCreatingStudioProject = false }

            do {
                let title = autoCreatedStudioProjectTitle(for: cleanDraft, pack: pack)
                let normalizedPhase = phase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? "scene_draft"
                    : phase.trimmingCharacters(in: .whitespacesAndNewlines)

                let projectResult = try await BackendMemoryAPI.shared.upsertScreenplayProject(
                    title: title,
                    phase: normalizedPhase
                )
                guard let createdProject = projectResult.payload.project else {
                    throw NSError(
                        domain: "StudioAutoCreate",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "Backend did not return a screenplay project."]
                    )
                }

                let versionResult = try await BackendMemoryAPI.shared.upsertScreenplayProjectVersion(
                    projectId: createdProject.id,
                    draft: cleanDraft,
                    title: createdProject.title,
                    phase: createdProject.lastPhase ?? normalizedPhase,
                    notes: "Auto-created from first Studio turn",
                    source: "studio_first_turn_auto_create",
                    baseVersionId: "",
                    conflictStrategy: "reject_if_stale"
                )

                let resolvedProject = versionResult.payload.project ?? createdProject
                let resolvedVersionID = (versionResult.payload.versionId ?? versionResult.payload.version?.id ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)

                screenplayDraftBridge.preferredProjectID = resolvedProject.id
                screenplayDraftBridge.preferredVersionID = resolvedVersionID
                if screenplayDraftBridge.draftText != cleanDraft {
                    screenplayDraftBridge.draftText = cleanDraft
                }

                liveScreenplayProjectID = resolvedProject.id
                liveScreenplayVersionID = resolvedVersionID
                lastAutoCreatedStudioProjectKey = createKey
                screenplayDraftBridge.autoInsertStatusText = "Saved to Studio project: \(resolvedProject.title)"
            } catch {
                screenplayDraftBridge.autoInsertStatusText = "Studio project save failed: \(error.localizedDescription)"
            }
        }
    }

    @MainActor
    private func stopCurrentInteraction() {
        conversationLoopEnabled = false
        pendingGoodbyeStopAfterPlayback = false
        inFlightTalkTask?.cancel()
        inFlightTalkTask = nil
        isTurnSubmitting = false
        isThinking = false
        realtimeAssistantTranscriptFallbackTask?.cancel()
        realtimeAssistantTranscriptFallbackTask = nil
        cancelRealtimeRecovery(clearTurn: true)
        cancelRealtimeStudioDraftStream(restorePreview: true)
        realtimeTransport.disconnect()
        speculativeTalk.cancel()

        voice.stopRecording()
        voice.teardown()
        orbAudio.stop()
        promptSpeaker.stop()
        typedReplySpeaker.cancel()
    }

    private func openMicrophoneSettings() {
        #if os(iOS)
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        openURL(url)
        #elseif os(macOS)
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") else { return }
        openURL(url)
        #endif
    }

    private var privacyPolicyURL: URL {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "PRIVACY_POLICY_URL") as? String {
            let clean = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if let url = URL(string: clean), !clean.isEmpty {
                return url
            }
        }
        return URL(string: "https://yourdomain.com/privacy")!
    }

    @MainActor
    @discardableResult
    private func completeOnboarding(askForPersonality: Bool = true) -> Bool {
        let clean = onboardingName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        evolution.setPreferredName(clean)
        onboardingName = clean
        onboardingNameFocused = false
        onboardingSceneFocused = false
        if askForPersonality {
            verballyAskForPersonalityIfNeeded()
        }
        return true
    }

    @MainActor
    private func ensureSessionBumped() {
        guard !didBumpSessionThisLaunch else { return }
        didBumpSessionThisLaunch = true
        evolution.bumpSession()
    }

    @MainActor
    private func scheduleBackendHydration() {
        guard !IOThemRuntime.isRunningTests else { return }
        backendHydrationTask?.cancel()
        backendHydrationTask = Task { @MainActor in
            await hydrateBackendState()
        }
    }

    @MainActor
    private func hydrateBackendState() async {
        guard !IOThemRuntime.isRunningTests else { return }
        do {
            let session = try? await BackendMemoryAPI.shared.bootstrapSession(force: false)
            if let evolutionSync = session?.evolutionSync {
                evolution.seedFromBackend(evolutionSync)
            }
            applySessionContinuity(session?.continuity)
            let health = try await BackendMemoryAPI.shared.fetchHealth()
            lastHealthStatus = health
            if health.ok {
                backendConnectionState = .up
                backendFailureCount = 0
            }

            let sync = await BackendMemoryAPI.shared.currentSyncState()
            if !sync.stateVersion.isEmpty {
                let delta = try? await BackendMemoryAPI.shared.fetchStateDelta(
                    sinceVersion: sync.stateVersion,
                    sinceTurnId: sync.lastTurnId.isEmpty ? nil : sync.lastTurnId,
                    historyLimit: 1,
                    memoriesLimit: 1
                )
                if let continuity = delta?.payload.continuity {
                    applySessionContinuity(continuity)
                }
                if let deltaSync = delta?.sync, !deltaSync.stateVersion.isEmpty {
                    localStateVersion = deltaSync.stateVersion
                } else {
                    localStateVersion = sync.stateVersion
                }
            } else if session?.continuity == nil {
                let delta = try? await BackendMemoryAPI.shared.fetchStateDelta(
                    sinceVersion: "",
                    sinceTurnId: nil,
                    historyLimit: 1,
                    memoriesLimit: 1
                )
                if let continuity = delta?.payload.continuity {
                    applySessionContinuity(continuity)
                }
                if let deltaSync = delta?.sync, !deltaSync.stateVersion.isEmpty {
                    localStateVersion = deltaSync.stateVersion
                }
            }
            let latestSync = await BackendMemoryAPI.shared.currentSyncState()
            await hydrateRecentTurnWindowFromBackend(sync: latestSync, force: recentTurnWindow.isEmpty)
        } catch {
            markBackendUnavailable(reason: error.localizedDescription)
        }
    }

    @MainActor
    private func applySessionContinuity(_ continuity: BackendSessionContinuitySnapshot?) {
        guard let continuity, continuity.isMeaningful else {
            sessionContinuitySnapshot = nil
            return
        }
        let previousFingerprint = sessionContinuitySnapshot.map(sessionContinuityFingerprint)
        let nextFingerprint = sessionContinuityFingerprint(continuity)
        sessionContinuitySnapshot = continuity
        if previousFingerprint != nextFingerprint || !screenplayDraftBridge.companionSignalState.hasContent {
            screenplayDraftBridge.applyRestoredSessionContinuitySignal(continuity, persist: true)
        }
    }

    @MainActor
    private func verballyAskForPersonalityIfNeeded() {
        guard evolution.shouldVerballyPromptForPersonality else { return }
        promptSpeaker.speak(
            "I am CLEMENTINE."
        )
        evolution.markPersonalityPromptPlayed()
    }

    @MainActor
    private func sendUtterance(
        _ wavData: Data,
        clientTranscriptOverride: String? = nil,
        debugVoiceTurnToken: Int? = nil
    ) async {
        // Phase 1 latency pass: start playback on the first streamed segment as soon
        // as it is ready. We stop recording before playback begins to avoid bleed.
        let allowEarlyStreamPlayback = true
        var didStartEarlyStudioDraftStream = false
        var didStartEarlyStreamPlayback = false
        var didRecordAssistantPlaybackStart = false
        var didStartSyncedVoiceInsert = false
        var didInterruptSyncedVoiceInsert = false
        var didCommitSyncedVoiceFallback = false
        var didCommitEarlyStudioDraftPreviewFallback = false
        var pendingStreamRemainderURL: URL?
        let syncedPlaybackClock = SegmentedPlaybackClock()
        var debugSyncedPlaybackSeekApplied = false
        var debugSyncedPlaybackSeekCount = 0
        var debugSyncedPlaybackSeekFromMs: Int?
        var debugSyncedPlaybackSeekToMs: Int?
        var debugSyncedPlaybackTimeAdjustment: TimeInterval = 0
        let clientLatencyTurnID = "turn-based-\(UUID().uuidString.lowercased())"
        let clientLatencyStartedAt = Date()

        func resolvedDebugSyncedPlaybackObservation(
            from observation: SegmentedPlaybackObservation?
        ) -> SegmentedPlaybackObservation? {
            guard var observation else { return nil }
#if DEBUG
            guard IOThemRuntime.isStudioAutomationSession else { return observation }
            let freezeAfterMs = max(
                UserDefaults.standard.integer(forKey: "studio_debug_freeze_synced_voice_playback_after_ms"),
                0
            )
            if freezeAfterMs > 0 {
                let freezeAt = TimeInterval(freezeAfterMs) / 1_000.0
                if observation.currentTime >= freezeAt {
                    let estimatedTime = max(observation.estimatedTime, freezeAt)
                    observation = SegmentedPlaybackObservation(
                        currentTime: freezeAt,
                        estimatedTime: estimatedTime,
                        driftMs: max(Int(((estimatedTime - freezeAt) * 1_000.0).rounded()), 0),
                        hasActiveSegment: observation.hasActiveSegment
                    )
                }
            }

            let seekAfterMs = max(
                UserDefaults.standard.integer(forKey: "studio_debug_seek_synced_voice_playback_after_ms"),
                0
            )
            let seekToMs = max(
                UserDefaults.standard.integer(forKey: "studio_debug_seek_synced_voice_playback_to_ms"),
                0
            )
            if seekAfterMs > 0 && seekToMs >= 0 {
                let currentTimeMs = Int((observation.currentTime * 1_000.0).rounded())
                if !debugSyncedPlaybackSeekApplied && currentTimeMs >= seekAfterMs {
                    debugSyncedPlaybackSeekApplied = true
                    debugSyncedPlaybackSeekCount += 1
                    debugSyncedPlaybackSeekFromMs = currentTimeMs
                    debugSyncedPlaybackSeekToMs = seekToMs
                    debugSyncedPlaybackTimeAdjustment = (TimeInterval(seekToMs) / 1_000.0) - observation.currentTime
                    if didStartSyncedVoiceInsert {
                        let didSeekSyncedInsert = screenplayDraftBridge.seekActiveSyncedVoiceInsert(to: seekToMs)
                        if didSeekSyncedInsert, let debugVoiceTurnToken {
                            let hasRecordedSeekRecompute = currentStudioDebugVoiceDraftBreadcrumbs().contains {
                                $0.token == debugVoiceTurnToken && $0.event == "synced_insert_seeked"
                            }
                            if !hasRecordedSeekRecompute {
                                let syncedState = screenplayDraftBridge.syncedVoiceTurnState
                                appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "synced_insert_seeked",
                                    detail: "Synced voice insert recomputed from a debug playback seek at reveal unit \(syncedState.appliedCueCount)/\(syncedState.cueCount). from_ms=\(currentTimeMs) to_ms=\(seekToMs) request_id=\(syncedState.requestID)",
                                    replyPreview: String(syncedState.authoritativeText.prefix(220)),
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: effectiveTranscript
                                )
                                persistDebugVoiceTurnProgress()
                            }
                        }
                    }
                }
                if debugSyncedPlaybackSeekApplied {
                    let adjustedCurrentTime = max(0, observation.currentTime + debugSyncedPlaybackTimeAdjustment)
                    let adjustedEstimatedTime = max(
                        adjustedCurrentTime,
                        observation.estimatedTime + debugSyncedPlaybackTimeAdjustment
                    )
                    observation = SegmentedPlaybackObservation(
                        currentTime: adjustedCurrentTime,
                        estimatedTime: adjustedEstimatedTime,
                        driftMs: max(Int(((adjustedEstimatedTime - adjustedCurrentTime) * 1_000.0).rounded()), 0),
                        hasActiveSegment: observation.hasActiveSegment
                    )
                }
            }
            return observation
#else
            return observation
#endif
        }

        var didReceiveTalkResponse = false
        var debugSyncedInsertCancelTask: Task<Void, Never>?
        let cleanClientTranscriptOverride = String(clientTranscriptOverride ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let effectiveTranscript = cleanClientTranscriptOverride.isEmpty
            ? transcript
            : cleanClientTranscriptOverride
        let effectivePartialHintForTalk = cleanClientTranscriptOverride.isEmpty
            ? currentPartialHintForTalk()
            : String(cleanClientTranscriptOverride.prefix(320))

#if DEBUG || os(macOS)
        var debugVoiceTurnDidFinalize = false
        var debugTurnID = ""
        var debugInsertedPreview = ""
        var debugReplyPreview = ""
        var debugFinalCommittedPageText = ""
        var debugPreparedUseScreenplayMode = false
        var debugPreparedShouldWriteToPage = false
        var debugPreparedMemoryDomain = ""
        var debugRequestedScreenplayTarget = ""
        var debugTimingSource = ""
        var debugScreenplayOutputTarget = ""
        var debugScreenplayOutputSource = ""
        var debugScreenplayQualityReason = ""
        var debugScreenplayQualityConfidence = ""
        var debugScreenplayQualityFeatureAct = ""
        var debugScreenplayRepairAttempted = false
        var debugScreenplayRepairOutcome = ""
        var debugScreenplayRepairMs: Int?
        var debugScreenplayRepairReason = ""
        var debugCreativeMemoryApplied = false
        var debugCreativeMemoryProjectID = ""
        var debugCreativeMemoryProjectTitle = ""
        var debugCreativeMemoryCharacterCount = 0
        var debugCreativeMemoryEpisodicCount = 0
        var debugCreativeMemoryCorrectionCount = 0
        var debugCreativeMemoryCharacters: [String] = []
        var debugCreativeMemoryCorrectedTerms: [String] = []
        var debugCreativeMemoryCorrectionReplacements: [String] = []
        var debugCreativeMemoryEpisodeSummaries: [String] = []
        var debugScreenplayOutputText = ""
        var debugScreenplayCues: [BackendTalkScreenplayCue] = []
        var debugDialogueTimeline: BackendTalkDialogueTimelineRevision?
        var debugDispatchResolvedBaseURL = ""
        var debugTalkRequestURL = ""
        var debugTalkDispatchStage = "acknowledged"
        var debugClientTokenResolved = false
        var debugDispatchErrorDomain = ""
        var debugDispatchErrorCode: Int?
        var debugDispatchErrorDescription = ""

        func refreshDebugCommittedPageText() {
            if let lastCommittedWrite = screenplayDraftBridge.lastCommittedWrite {
                let committedText = lastCommittedWrite.insertedText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !committedText.isEmpty,
                   abs(lastCommittedWrite.committedAt.timeIntervalSinceNow) < 20 {
                    debugFinalCommittedPageText = committedText
                    return
                }
            }
            let syncedState = screenplayDraftBridge.syncedVoiceTurnState
            let authoritativeText = syncedState.authoritativeText
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if syncedState.phase == .completed, !authoritativeText.isEmpty {
                debugFinalCommittedPageText = authoritativeText
            }
        }

        func updateDebugCreativeMemoryTrace(_ trace: BackendTalkCreativeMemoryTrace) {
            debugCreativeMemoryApplied = trace.applied
            debugCreativeMemoryProjectID = (trace.projectId ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            debugCreativeMemoryProjectTitle = (trace.projectTitle ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            debugCreativeMemoryCharacterCount = trace.characterCount
            debugCreativeMemoryEpisodicCount = trace.episodicCount
            debugCreativeMemoryCorrectionCount = trace.correctionCount
            debugCreativeMemoryCharacters = trace.characters
                .map { $0.name.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            debugCreativeMemoryCorrectedTerms = trace.correctedTerms
            debugCreativeMemoryCorrectionReplacements = trace.correctionReplacements
            debugCreativeMemoryEpisodeSummaries = trace.episodic
                .map { episode in
                    let summary = episode.summary.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !summary.isEmpty { return summary }
                    return episode.excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                .filter { !$0.isEmpty }
        }

        func finalizeDebugVoiceTurn(status: String, error: String = "") {
            guard let debugVoiceTurnToken, !debugVoiceTurnDidFinalize else { return }
            debugVoiceTurnDidFinalize = true
            refreshDebugCommittedPageText()
            if debugSyncedPlaybackSeekApplied {
                let hasRecordedSeekEvent = currentStudioDebugVoiceDraftBreadcrumbs().contains {
                    $0.token == debugVoiceTurnToken && $0.event == "synced_playback_seek_applied"
                }
                if !hasRecordedSeekEvent {
                    appendStudioDebugVoiceDraftBreadcrumb(
                        event: "synced_playback_seek_applied",
                        detail: "Debug playback seek adjusted the synced voice playhead. from_ms=\(debugSyncedPlaybackSeekFromMs ?? 0) to_ms=\(debugSyncedPlaybackSeekToMs ?? 0)",
                        tokenOverride: debugVoiceTurnToken,
                        promptPreviewOverride: effectiveTranscript
                    )
                }
            }
            if debugInsertedPreview.isEmpty, didStartEarlyStudioDraftStream {
                let committedPreview = screenplayDraftBridge.lastCommittedWrite?.insertedText
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if !committedPreview.isEmpty {
                    debugInsertedPreview = String(committedPreview.prefix(220))
                } else if screenplayDraftBridge.isStreamingDraftPreviewActive {
                    let stagedPreview = liveScreenplayText.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !stagedPreview.isEmpty {
                        debugInsertedPreview = String(stagedPreview.prefix(220))
                    }
                }
            }
            appendStudioDebugVoiceDraftBreadcrumb(
                event: "debug_turn_finalizing",
                detail: error.isEmpty
                    ? "Studio debug voice turn is finalizing with status \(status)."
                    : "Studio debug voice turn is finalizing with status \(status): \(error)",
                replyPreview: debugReplyPreview,
                tokenOverride: debugVoiceTurnToken,
                promptPreviewOverride: effectiveTranscript
            )
            writeStudioDebugVoiceTurnResult(
                token: debugVoiceTurnToken,
                status: status,
                error: error,
                prompt: effectiveTranscript,
                turnID: debugTurnID,
                preparedUseScreenplayMode: debugPreparedUseScreenplayMode,
                preparedShouldWriteToPage: debugPreparedShouldWriteToPage,
                preparedMemoryDomain: debugPreparedMemoryDomain,
                requestedScreenplayTarget: debugRequestedScreenplayTarget,
                timingSource: debugTimingSource,
                screenplayOutputTarget: debugScreenplayOutputTarget,
                screenplayOutputSource: debugScreenplayOutputSource,
                screenplayQualityReason: debugScreenplayQualityReason,
                screenplayQualityConfidence: debugScreenplayQualityConfidence,
                screenplayQualityFeatureAct: debugScreenplayQualityFeatureAct,
                screenplayRepairAttempted: debugScreenplayRepairAttempted,
                screenplayRepairOutcome: debugScreenplayRepairOutcome,
                screenplayRepairMs: debugScreenplayRepairMs,
                screenplayRepairReason: debugScreenplayRepairReason,
                creativeMemoryApplied: debugCreativeMemoryApplied,
                creativeMemoryProjectID: debugCreativeMemoryProjectID,
                creativeMemoryProjectTitle: debugCreativeMemoryProjectTitle,
                creativeMemoryCharacterCount: debugCreativeMemoryCharacterCount,
                creativeMemoryEpisodicCount: debugCreativeMemoryEpisodicCount,
                creativeMemoryCorrectionCount: debugCreativeMemoryCorrectionCount,
                creativeMemoryCharacters: debugCreativeMemoryCharacters,
                creativeMemoryCorrectedTerms: debugCreativeMemoryCorrectedTerms,
                creativeMemoryCorrectionReplacements: debugCreativeMemoryCorrectionReplacements,
                creativeMemoryEpisodeSummaries: debugCreativeMemoryEpisodeSummaries,
                screenplayOutputText: debugScreenplayOutputText,
                screenplayCues: debugScreenplayCues,
                dialogueTimeline: debugDialogueTimeline,
                insertedPreview: debugInsertedPreview,
                replyPreview: debugReplyPreview,
                finalCommittedPageText: debugFinalCommittedPageText,
                dispatchResolvedBaseURL: debugDispatchResolvedBaseURL,
                talkRequestURL: debugTalkRequestURL,
                talkDispatchStage: debugTalkDispatchStage,
                clientTokenResolved: debugClientTokenResolved,
                dispatchErrorDomain: debugDispatchErrorDomain,
                dispatchErrorCode: debugDispatchErrorCode,
                dispatchErrorDescription: debugDispatchErrorDescription,
                syncedVoiceSeekApplied: debugSyncedPlaybackSeekApplied,
                syncedVoiceSeekCount: debugSyncedPlaybackSeekCount,
                syncedVoiceSeekFromMs: debugSyncedPlaybackSeekFromMs,
                syncedVoiceSeekToMs: debugSyncedPlaybackSeekToMs
            )
            if activeStudioDebugVoiceTurnToken == debugVoiceTurnToken {
                activeStudioDebugVoiceTurnToken = nil
                activeStudioDebugVoiceTurnPrompt = ""
            }
        }

        func persistDebugVoiceTurnProgress(status: String = "running", error: String = "") {
            guard let debugVoiceTurnToken else { return }
            refreshDebugCommittedPageText()
            persistStudioDebugVoiceTurnProgress(
                token: debugVoiceTurnToken,
                status: status,
                error: error,
                prompt: effectiveTranscript,
                turnID: debugTurnID,
                insertedPreview: debugInsertedPreview,
                replyPreview: debugReplyPreview,
                dialogueTimeline: debugDialogueTimeline,
                finalCommittedPageText: debugFinalCommittedPageText,
                dispatchResolvedBaseURL: debugDispatchResolvedBaseURL,
                talkRequestURL: debugTalkRequestURL,
                talkDispatchStage: debugTalkDispatchStage,
                clientTokenResolved: debugClientTokenResolved,
                dispatchErrorDomain: debugDispatchErrorDomain,
                dispatchErrorCode: debugDispatchErrorCode,
                dispatchErrorDescription: debugDispatchErrorDescription
            )
        }

#endif
        let playbackObservationProvider: (@MainActor @Sendable () -> SegmentedPlaybackObservation?) = {
            resolvedDebugSyncedPlaybackObservation(from: syncedPlaybackClock.currentObservation)
        }
        let playbackTimeProvider: (@MainActor @Sendable () -> TimeInterval?) = {
            playbackObservationProvider()?.currentTime
        }

        func beginSyncedPlaybackClockSegment(for url: URL) {
            let expectedDuration = audioDurationSeconds(at: url) ?? 0
            syncedPlaybackClock.beginSegment(expectedDuration: expectedDuration) {
                orbAudio.currentPlayer?.currentTime
            }
        }

        func authoritativePageWriteText(from screenplayOutput: BackendTalkScreenplayOutput?) -> String {
            guard let screenplayOutput, screenplayOutput.writesToPage else { return "" }
            return screenplayOutput.text.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        func resolvedPendingSyncedVoiceInsertTimingSource(
            _ rawSource: String?,
            cues: [ScreenplayVoiceCue]
        ) -> String {
            let cleanSource = (rawSource ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cues.isEmpty else { return "estimated" }
            return cleanSource.isEmpty ? "backend_cues" : cleanSource
        }

        func finishPlaybackAndResumeMic() {
            syncedPlaybackClock.completeCurrentSegment()
            if didStartSyncedVoiceInsert {
                screenplayDraftBridge.completeActiveSyncedVoiceInsertIfNeeded()
            } else {
                _ = commitSyncedVoiceFallbackIfNeeded(
                    trigger: "playback_finished",
                    markCompleted: true
                )
            }
            voice.markAssistantPlaybackEnded()
            if activeTurnBasedLatencyTurnID == clientLatencyTurnID {
                activeTurnBasedLatencyTurnID = ""
            }
#if DEBUG || os(macOS)
            if let debugVoiceTurnToken {
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "assistant_playback_finished",
                    detail: "Assistant playback finished.",
                    replyPreview: debugReplyPreview,
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: effectiveTranscript
                )
                finalizeDebugVoiceTurn(status: "ok")
            }
#endif
            if pendingGoodbyeStopAfterPlayback || !conversationLoopEnabled {
                pendingGoodbyeStopAfterPlayback = false
                conversationLoopEnabled = false
                HerLog.ui.info("conversation loop ended after playback")
                voice.stopRecording()
                voice.teardown()
                return
            }
            HerLog.ui.info("playback finished, resume mic")
            voice.resumeRecordingIfNeeded()
        }

        func playStreamRemainderOrFinish() {
            syncedPlaybackClock.completeCurrentSegment()
            guard let remainderURL = pendingStreamRemainderURL else {
                guard didReceiveTalkResponse else {
                    HerLog.audio.info("waiting for full streamed audio before finishing playback")
                    return
                }
                finishPlaybackAndResumeMic()
                return
            }
            pendingStreamRemainderURL = nil
            do {
                HerLog.audio.info("playing stream remainder path=\(remainderURL.path, privacy: .public)")
                try orbAudio.play(url: remainderURL, onFinish: {
                    Task { @MainActor in
                        finishPlaybackAndResumeMic()
                    }
                })
                beginSyncedPlaybackClockSegment(for: remainderURL)
            } catch {
                _ = commitSyncedVoiceFallbackIfNeeded(
                    trigger: "stream_remainder_playback_error",
                    markCompleted: true
                )
                HerLog.ui.error("stream remainder playback error=\(error.localizedDescription, privacy: .public), resume mic")
                voice.markRequestFailed()
                voice.resumeRecordingIfNeeded()
#if DEBUG || os(macOS)
                finalizeDebugVoiceTurn(status: "error", error: error.localizedDescription)
#endif
            }
        }

        defer {
            debugSyncedInsertCancelTask?.cancel()
            screenplayDraftBridge.onSyncedInsertLifecycleEvent = nil
            inFlightTalkTask = nil
            isTurnSubmitting = false
        }

        isTurnSubmitting = true
        let now = Date()
        var fingerprintInput = Data()
        fingerprintInput.append(wavData)
        if !cleanClientTranscriptOverride.isEmpty {
            fingerprintInput.append(Data(cleanClientTranscriptOverride.utf8))
        }
        let fingerprint = utteranceFingerprint(fingerprintInput)
        if fingerprint == lastSubmittedFingerprint, now.timeIntervalSince(lastSubmittedAt) < 8 {
            HerLog.talk.info("duplicate utterance suppressed fingerprint=\(fingerprint, privacy: .public)")
            isThinking = false
            voice.markAssistantPlaybackEnded()
            voice.resumeRecordingIfNeeded()
#if DEBUG || os(macOS)
            finalizeDebugVoiceTurn(status: "error", error: "Duplicate utterance suppressed.")
#endif
            return
        }

        lastSubmittedFingerprint = fingerprint
        lastSubmittedAt = now

        let wavURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("them_utterance_\(UUID().uuidString).wav")

        do {
            try wavData.write(to: wavURL, options: [.atomic])
            HerLog.mic.info("VAD wrote file at \(wavURL.path, privacy: .public)")
            voice.stopRecording()
        } catch {
            voice.mode = .armedListening
#if DEBUG || os(macOS)
            finalizeDebugVoiceTurn(status: "error", error: "Could not write utterance WAV.")
#endif
            return
        }

        // Director-context prompt pattern (per-turn)
        let preparedPrompt = buildPreparedTurnPrompt(
            confirmedTranscript: effectiveTranscript,
            partialHint: effectivePartialHintForTalk
        )
        screenplayDraftBridge.applyCompanionSignalState(
            preparedPrompt.companionSignals,
            persist: false
        )
        if preparedPrompt.memoryDomain != .companion {
            HerEvolutionStore.shared.noteCreativeContext(
                from: preparedPrompt.directorText,
                isScreenplayMode: preparedPrompt.useScreenplayMode
            )
        }
        if preparedPrompt.shouldAutoOpenStudio, !isStudioSurfaceActive {
            openStudio()
        }
        let localStudioCommand = runLocalStudioCommandIfNeeded(
            preparedPrompt.directorText,
            source: .voice,
            shouldSpeakConfirmation: true
        )
        if localStudioCommand.handled {
            isThinking = false
            speculativeTalk.cancel()
            voice.markAssistantPlaybackEnded()
#if DEBUG || os(macOS)
            finalizeDebugVoiceTurn(
                status: localStudioCommand.error == nil ? "ok" : "error",
                error: localStudioCommand.error ?? ""
            )
#endif
            return
        }
        clientLatency.beginTurn(
            id: clientLatencyTurnID,
            transport: .turnBasedVoice,
            at: clientLatencyStartedAt
        )
        _ = await applyConversationalStudioCorrectionIfNeeded(
            preparedPrompt.directorText
        )
        let shouldUseSyncedStudioVoiceInsert =
            preparedPrompt.useScreenplayMode &&
            preparedPrompt.shouldWriteToPage &&
            screenplayDraftBridge.autoInsertEnabled
        let shouldStartEarlyStudioDraftStream =
            preparedPrompt.useScreenplayMode &&
            preparedPrompt.shouldWriteToPage &&
            screenplayDraftBridge.autoInsertEnabled &&
            !shouldUseSyncedStudioVoiceInsert
        if shouldStartEarlyStudioDraftStream {
            startRealtimeStudioDraftStreamIfNeeded(
                for: preparedPrompt.directorText,
                debugVoiceTurnToken: debugVoiceTurnToken
            )
            didStartEarlyStudioDraftStream = true
        } else if isStudioSurfaceActive {
            cancelRealtimeStudioDraftStream(
                restorePreview: true,
                debugVoiceTurnToken: debugVoiceTurnToken,
                promptPreviewOverride: preparedPrompt.directorText
            )
        }
        let turnHints = voice.lastFinalTurnHints
        let effectiveTurnTailSilenceMs: Int = {
#if DEBUG || os(macOS)
            if debugVoiceTurnToken != nil {
                return max(turnHints.tailSilenceMs, 1_650)
            }
#endif
            return turnHints.tailSilenceMs
        }()
        let effectiveTurnVadThreshold: Float = {
#if DEBUG || os(macOS)
            if debugVoiceTurnToken != nil {
                return max(turnHints.vadThreshold, 0.006)
            }
#endif
            return turnHints.vadThreshold
        }()
        let effectiveTurnSpeechMs: Int = {
#if DEBUG || os(macOS)
            if debugVoiceTurnToken != nil {
                return max(turnHints.speechMs, 1_850)
            }
#endif
            return turnHints.speechMs
        }()
        let speculativeReuseCandidate = speculativeTalk.reuseCandidateIfCompatible(
            finalText: preparedPrompt.directorText,
            isScreenplayMode: preparedPrompt.useScreenplayMode,
            shouldWriteToPage: preparedPrompt.shouldWriteToPage
        )
        speculativeTalk.cancel()
#if DEBUG || os(macOS)
        if let debugVoiceTurnToken {
            appendStudioDebugVoiceDraftBreadcrumb(
                event: "speculative_prompt_reuse_evaluated",
                detail: "Speculative prompt reuse candidate=\(speculativeReuseCandidate == nil ? "0" : "1") should_write_to_page=\(preparedPrompt.shouldWriteToPage)",
                tokenOverride: debugVoiceTurnToken,
                promptPreviewOverride: preparedPrompt.directorText
            )
            persistDebugVoiceTurnProgress()
        }
#endif
        let systemPrompt: String
        if let speculativeReuseCandidate {
            systemPrompt = speculativeReuseCandidate.preparedPrompt
        } else if shouldSkipVisualContextForStudioDraftTurn(
            isScreenplayMode: preparedPrompt.useScreenplayMode,
            shouldWriteToPage: preparedPrompt.shouldWriteToPage
        ) {
            systemPrompt = await buildCanonicalModelPrompt(
                preparedPrompt.baseSystemPrompt,
                userMessage: preparedPrompt.directorText,
                isScreenplayMode: preparedPrompt.useScreenplayMode,
                shouldWriteToPage: preparedPrompt.shouldWriteToPage,
                includeVisualContext: false
            )
        } else {
            systemPrompt = await buildCanonicalModelPrompt(
                preparedPrompt.baseSystemPrompt,
                userMessage: preparedPrompt.directorText,
                isScreenplayMode: preparedPrompt.useScreenplayMode,
                shouldWriteToPage: preparedPrompt.shouldWriteToPage
            )
        }
        let initialStudioMetadata = initialStudioTalkMetadata(from: preparedPrompt)
        let talkScreenplayGenerationTranscript: String? = {
            guard preparedPrompt.shouldWriteToPage else { return nil }
            let confirmedContext = confirmedStudioPageWriteContext(for: preparedPrompt.directorText)
            let renderTranscript = studioRenderTranscript(
                for: preparedPrompt.directorText,
                confirmedContext: confirmedContext,
                preferredTarget: .page
            ).trimmingCharacters(in: .whitespacesAndNewlines)
            return renderTranscript.isEmpty ? nil : renderTranscript
        }()
#if DEBUG || os(macOS)
        debugPreparedUseScreenplayMode = preparedPrompt.useScreenplayMode
        debugPreparedShouldWriteToPage = preparedPrompt.shouldWriteToPage
        debugPreparedMemoryDomain = preparedPrompt.memoryDomain.rawValue
        debugRequestedScreenplayTarget = initialStudioMetadata?.screenplayTarget
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if let debugVoiceTurnToken {
            let generationTranscriptState = (talkScreenplayGenerationTranscript ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty ? "0" : "1"
            appendStudioDebugVoiceDraftBreadcrumb(
                event: "talk_route_decided",
                detail: "Route decided. use_screenplay_mode=\(preparedPrompt.useScreenplayMode) should_write_to_page=\(preparedPrompt.shouldWriteToPage) memory_domain=\(preparedPrompt.memoryDomain.rawValue) requested_target=\(debugRequestedScreenplayTarget.isEmpty ? "none" : debugRequestedScreenplayTarget) generation_transcript=\(generationTranscriptState)",
                tokenOverride: debugVoiceTurnToken,
                promptPreviewOverride: preparedPrompt.directorText
            )
            persistDebugVoiceTurnProgress()
        }
#endif
        screenplayDraftBridge.onSyncedInsertLifecycleEvent = { event, plan, appliedCueCount, interruptionReason in
            if event == "cancelled" {
                didInterruptSyncedVoiceInsert = true
            }
#if DEBUG || os(macOS)
            guard let debugVoiceTurnToken else { return }
            let detail: String
            switch event {
            case "started":
                detail = "Synced voice insert started with \(plan.cueCount) reveal units. timing_source=\(plan.timingSource) request_id=\(plan.requestID)"
            case "cue_applied":
                detail = "Synced voice insert applied reveal unit \(appliedCueCount)/\(plan.cueCount). timing_source=\(plan.timingSource) request_id=\(plan.requestID)"
            case "seeked":
                detail = "Synced voice insert recomputed from a playback seek at reveal unit \(appliedCueCount)/\(plan.cueCount). timing_source=\(plan.timingSource) request_id=\(plan.requestID)"
            case "finished":
                detail = "Synced voice insert finished with \(plan.cueCount) reveal units. timing_source=\(plan.timingSource) request_id=\(plan.requestID)"
            case "cancelled":
                let reason = (interruptionReason ?? .other).rawValue
                detail = "Synced voice insert cancelled after \(appliedCueCount) reveal units. reason=\(reason) timing_source=\(plan.timingSource) request_id=\(plan.requestID)"
            case "fallback_committed":
                let reason = screenplayDraftBridge.syncedVoiceFallbackReason
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                detail = "Synced voice insert finalized from authoritative fallback after \(appliedCueCount) reveal units. reason=\(reason.isEmpty ? "unknown" : reason) timing_source=\(plan.timingSource) request_id=\(plan.requestID)"
            default:
                detail = "Synced voice insert event \(event). request_id=\(plan.requestID)"
            }
            appendStudioDebugVoiceDraftBreadcrumb(
                event: "synced_insert_\(event)",
                detail: detail,
                interruptionReason: event == "cancelled"
                    ? (interruptionReason ?? .other).rawValue
                    : nil,
                replyPreview: String(plan.fullText.prefix(220)),
                tokenOverride: debugVoiceTurnToken,
                promptPreviewOverride: preparedPrompt.directorText
            )
            persistDebugVoiceTurnProgress()
#endif
        }

        @discardableResult
        func commitSyncedVoiceFallbackIfNeeded(
            trigger: String,
            markCompleted: Bool
        ) -> String? {
            guard shouldUseSyncedStudioVoiceInsert else { return nil }
            guard !didStartSyncedVoiceInsert else { return nil }
            guard !didCommitSyncedVoiceFallback else { return nil }
            let authoritativeText = screenplayDraftBridge.syncedVoiceTurnState.authoritativeText
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !authoritativeText.isEmpty else { return nil }
            guard let committedText = commitCurrentStudioPagePreviewIfNeeded(
                preferredText: authoritativeText,
                userTranscript: effectiveTranscript,
                promptSource: .voice
            ) else {
                return nil
            }
            didCommitSyncedVoiceFallback = true
            if markCompleted {
                _ = screenplayDraftBridge.completePendingSyncedVoiceTurnImmediately()
            }
#if DEBUG || os(macOS)
            debugInsertedPreview = String(committedText.prefix(220))
            refreshDebugCommittedPageText()
            if let debugVoiceTurnToken {
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "synced_insert_fallback_committed",
                    detail: "Committed authoritative screenplay text without cue streaming. trigger=\(trigger)",
                    replyPreview: String(committedText.prefix(220)),
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
                persistDebugVoiceTurnProgress()
            }
#endif
            return committedText
        }

        func startSyncedVoiceInsertIfPossible(trigger: String, audioURL: URL? = nil) {
            guard shouldUseSyncedStudioVoiceInsert else { return }
            guard !didStartSyncedVoiceInsert else { return }
            guard !didInterruptSyncedVoiceInsert else { return }
            guard didRecordAssistantPlaybackStart else { return }
            guard screenplayDraftBridge.syncedVoiceTurnState.interruptionReason == nil else { return }
            let cleanText = screenplayDraftBridge.syncedVoiceTurnState.authoritativeText
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanText.isEmpty else { return }
            let resolvedDuration = resolvedStudioVoiceInsertDuration(
                for: cleanText,
                audioURL: audioURL,
                backendDurationMs: screenplayDraftBridge.syncedVoiceTurnState.audioDurationMs
            )
            if resolvedDuration > 0 {
                screenplayDraftBridge.stageSyncedVoiceTurnAudioDuration(resolvedDuration)
            }
            guard let audioDurationMs = screenplayDraftBridge.syncedVoiceTurnState.audioDurationMs,
                  audioDurationMs > 0 else { return }
            guard let plan = screenplayDraftBridge.startStagedSyncedVoiceInsert(
                audioDuration: TimeInterval(audioDurationMs) / 1_000.0,
                playbackTimeProvider: playbackTimeProvider,
                playbackObservationProvider: playbackObservationProvider
            ) else {
                return
            }
            didStartSyncedVoiceInsert = true
#if DEBUG || os(macOS)
            debugInsertedPreview = String(cleanText.prefix(220))
            if let debugVoiceTurnToken {
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "header_text_committed",
                    detail: "Screenplay page text entered synced insert at playback start. trigger=\(trigger) timing_source=\(plan.timingSource) reveal_units=\(plan.cueCount)",
                    replyPreview: String(cleanText.prefix(220)),
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
                let hasRecordedRequestCommit = currentStudioDebugVoiceDraftBreadcrumbs().contains {
                    $0.token == debugVoiceTurnToken && $0.event == "request_committed"
                }
                if !hasRecordedRequestCommit {
                    appendStudioDebugVoiceDraftBreadcrumb(
                        event: "request_committed",
                        detail: "Synced voice insert began from screenplay page text. trigger=\(trigger)",
                        replyPreview: String(cleanText.prefix(220)),
                        tokenOverride: debugVoiceTurnToken,
                        promptPreviewOverride: preparedPrompt.directorText
                    )
                }
                persistDebugVoiceTurnProgress()
            }
            #if DEBUG
            if IOThemRuntime.isStudioAutomationSession {
                let debugCancelAfterMs = UserDefaults.standard.integer(
                    forKey: "studio_debug_cancel_synced_voice_insert_after_ms"
                )
                if debugCancelAfterMs > 0 {
                    debugSyncedInsertCancelTask?.cancel()
                    debugSyncedInsertCancelTask = Task { @MainActor in
                        try? await Task.sleep(nanoseconds: UInt64(debugCancelAfterMs) * 1_000_000)
                        guard !Task.isCancelled else { return }
                        screenplayDraftBridge.cancelStream(reason: .cancel)
                        appendStudioDebugVoiceDraftBreadcrumb(
                            event: "synced_insert_cancelled",
                            detail: "Debug hook cancelled synced voice insert after \(debugCancelAfterMs)ms. reason=cancel",
                            interruptionReason: ScreenplaySyncedInsertInterruptionReason.cancel.rawValue,
                            replyPreview: String(cleanText.prefix(220)),
                            tokenOverride: debugVoiceTurnToken,
                            promptPreviewOverride: preparedPrompt.directorText
                        )
                    }
                }
            }
            #endif
#endif
        }

        do {
            HerLog.talk.info("TALK sending file=\(wavURL.lastPathComponent, privacy: .public)")
#if DEBUG || os(macOS)
            if let debugVoiceTurnToken {
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "talk_request_started",
                    detail: "Backend /talk request started.",
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
            }
            let onBackendTalkDebugEvent: (BackendTalkDebugEvent) -> Void = { event in
                Task { @MainActor in
                    debugTalkDispatchStage = event.stage
                    if let resolvedBaseURL = event.resolvedBaseURL,
                       !resolvedBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        debugDispatchResolvedBaseURL = resolvedBaseURL
                        appendStudioDebugVoiceDraftBreadcrumb(
                            event: "talk_dispatch_base_url_resolved",
                            detail: "Talk dispatch resolved base_url=\(resolvedBaseURL)",
                            tokenOverride: debugVoiceTurnToken,
                            promptPreviewOverride: preparedPrompt.directorText
                        )
                    }
                    if let clientTokenResolved = event.clientTokenResolved {
                        debugClientTokenResolved = debugClientTokenResolved || clientTokenResolved
                        appendStudioDebugVoiceDraftBreadcrumb(
                            event: "talk_dispatch_client_token_resolved",
                            detail: "Talk dispatch resolved client token. resolved=\(clientTokenResolved)",
                            tokenOverride: debugVoiceTurnToken,
                            promptPreviewOverride: preparedPrompt.directorText
                        )
                    }
                    if let requestURL = event.requestURL,
                       !requestURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        debugTalkRequestURL = requestURL
                        appendStudioDebugVoiceDraftBreadcrumb(
                            event: "talk_dispatch_request_built",
                            detail: "Talk dispatch built request_url=\(requestURL)",
                            tokenOverride: debugVoiceTurnToken,
                            promptPreviewOverride: preparedPrompt.directorText
                        )
                    }
                    if let errorDomain = event.errorDomain,
                       !errorDomain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        debugDispatchErrorDomain = errorDomain
                    }
                    if let errorCode = event.errorCode {
                        debugDispatchErrorCode = errorCode
                    }
                    if let errorDescription = event.errorDescription,
                       !errorDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        debugDispatchErrorDescription = errorDescription
                    }
                    if event.stage.hasSuffix("failed") {
                        let domain = event.errorDomain ?? ""
                        let code = event.errorCode.map(String.init) ?? ""
                        let description = (event.errorDescription ?? "")
                            .replacingOccurrences(of: " ", with: "_")
                        appendStudioDebugVoiceDraftBreadcrumb(
                            event: "talk_dispatch_failed",
                            detail: "Talk dispatch failed. stage=\(event.stage) domain=\(domain) code=\(code) description=\(description)",
                            tokenOverride: debugVoiceTurnToken,
                            promptPreviewOverride: preparedPrompt.directorText
                        )
                    } else if event.stage != "resolve_base_url_ok"
                                && event.stage != "resolve_client_token_ok"
                                && event.stage != "request_built" {
                        appendStudioDebugVoiceDraftBreadcrumb(
                            event: "talk_dispatch_stage",
                            detail: "Talk dispatch advanced stage=\(event.stage)",
                            tokenOverride: debugVoiceTurnToken,
                            promptPreviewOverride: preparedPrompt.directorText
                        )
                    }
                    persistDebugVoiceTurnProgress()
                }
            }
#else
            let onBackendTalkDebugEvent: ((BackendTalkDebugEvent) -> Void)? = nil
#endif
            let idempotencyKey = "them-\(fingerprint)-\(Int(now.timeIntervalSince1970 * 1000))"
            if shouldUseSyncedStudioVoiceInsert {
                screenplayDraftBridge.prepareSyncedVoiceTurn(
                    requestID: idempotencyKey,
                    renderContract: .pageWritePreview
                )
            } else {
                screenplayDraftBridge.resetSyncedVoiceTurnTracking()
            }
            let requestTalk = {
                try await backend.talk(
                    fileURL: wavURL,
                    fileDataOverride: wavData,
                    systemPrompt: systemPrompt,
                    stage: preparedPrompt.director.stage,
                    depthScore: preparedPrompt.director.depth,
                    romanceTension: preparedPrompt.director.romance,
                    sessionCount: preparedPrompt.director.sessionCount,
                    personaPreset: preparedPrompt.director.personaPreset.rawValue,
                    memoryCue: preparedPrompt.director.subtleMemoryCue,
                    idempotencyKey: idempotencyKey,
                    tailSilenceMs: effectiveTurnTailSilenceMs,
                    vadThreshold: effectiveTurnVadThreshold,
                    speechMs: effectiveTurnSpeechMs,
                    noiseFloorRms: turnHints.noiseFloorRms,
                    speechRms: turnHints.speechRms,
                    userName: preparedPrompt.director.preferredName,
                    partialTranscriptHint: effectivePartialHintForTalk,
                    speculativeReuseKey: speculativeReuseCandidate?.speculativeKey,
                    speculativePromptHash: speculativeReuseCandidate?.preparedPromptHash,
                    studioMetadata: initialStudioMetadata,
                    clientTranscriptOverride: cleanClientTranscriptOverride.isEmpty ? nil : cleanClientTranscriptOverride,
                    screenplayGenerationTranscriptOverride: talkScreenplayGenerationTranscript,
                    onResponseMetadataReady: { metadata in
                        Task { @MainActor in
                            if preparedPrompt.useScreenplayMode {
                                screenplayDraftBridge.updateScreenplayQualityStatus(
                                    quality: metadata.screenplayQuality,
                                    output: metadata.screenplayOutput
                                )
                            }
                            presentCanonClarificationIfNeeded(
                                metadata.creativeMemoryTrace.canonClarification
                            )
#if DEBUG || os(macOS)
                            debugTimingSource = metadata.timingSource?
                                .trimmingCharacters(in: .whitespacesAndNewlines) ?? debugTimingSource
                            if let screenplayOutput = metadata.screenplayOutput {
                                debugScreenplayOutputTarget = screenplayOutput.target
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                debugScreenplayOutputSource = screenplayOutput.source
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                debugScreenplayOutputText = screenplayOutput.text
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                            }
                            if let quality = metadata.screenplayQuality ?? metadata.screenplayOutput?.quality {
                                debugScreenplayQualityReason = quality.reason
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                debugScreenplayQualityConfidence = quality.confidence
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                debugScreenplayQualityFeatureAct = (quality.featureAct ?? "")
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                            }
                            debugScreenplayRepairAttempted = metadata.screenplayTrace.repairAttempted
                            debugScreenplayRepairOutcome = metadata.screenplayTrace.repairOutcome
                                .trimmingCharacters(in: .whitespacesAndNewlines)
                            debugScreenplayRepairMs = metadata.screenplayTrace.repairMs
                            debugScreenplayRepairReason = (metadata.screenplayTrace.repairReason ?? "")
                                .trimmingCharacters(in: .whitespacesAndNewlines)
                            updateDebugCreativeMemoryTrace(metadata.creativeMemoryTrace)
                            self.screenplayDraftBridge.noteTalkCreativeMemoryTrace(
                                metadata.creativeMemoryTrace,
                                source: "talk_response_metadata"
                            )
                            if !metadata.screenplayCues.isEmpty {
                                debugScreenplayCues = metadata.screenplayCues
                            }
                            if let metadataDialogueTimeline = metadata.dialogueTimeline {
                                debugDialogueTimeline = metadataDialogueTimeline
                            }
                            if let debugVoiceTurnToken {
                                let headerTarget = metadata.screenplayOutput?.target
                                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                                let headerSource = metadata.screenplayOutput?.source
                                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                                let headerTimingSource = metadata.timingSource?
                                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                                let headerQuality = metadata.screenplayQuality ?? metadata.screenplayOutput?.quality
                                let headerQualityReason = headerQuality?.reason
                                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                                let headerQualityConfidence = headerQuality?.confidence
                                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                                let headerRepairOutcome = metadata.screenplayTrace.repairOutcome
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                let headerRepairMs = metadata.screenplayTrace.repairMs ?? 0
                                let memoryCharacters = metadata.creativeMemoryTrace.characters
                                    .map { $0.name.trimmingCharacters(in: .whitespacesAndNewlines) }
                                    .filter { !$0.isEmpty }
                                    .prefix(4)
                                    .joined(separator: ",")
                                let memoryCorrections = metadata.creativeMemoryTrace.correctionReplacements
                                    .prefix(3)
                                    .joined(separator: ",")
                                    .replacingOccurrences(of: " ", with: "_")
                                appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "talk_response_metadata_ready",
                                    detail: "Talk response metadata ready. output_target=\(headerTarget.isEmpty ? "none" : headerTarget) output_source=\(headerSource.isEmpty ? "none" : headerSource) timing_source=\(headerTimingSource.isEmpty ? "none" : headerTimingSource) quality_reason=\(headerQualityReason.isEmpty ? "none" : headerQualityReason) quality_confidence=\(headerQualityConfidence.isEmpty ? "none" : headerQualityConfidence) repair_attempted=\(metadata.screenplayTrace.repairAttempted ? "1" : "0") repair_outcome=\(headerRepairOutcome.isEmpty ? "none" : headerRepairOutcome) repair_ms=\(headerRepairMs) memory_applied=\(metadata.creativeMemoryTrace.applied ? "1" : "0") memory_characters=\(metadata.creativeMemoryTrace.characterCount) memory_episodes=\(metadata.creativeMemoryTrace.episodicCount) memory_corrections=\(metadata.creativeMemoryTrace.correctionCount) memory_names=\(memoryCharacters.isEmpty ? "none" : memoryCharacters) memory_repairs=\(memoryCorrections.isEmpty ? "none" : memoryCorrections) cue_count=\(metadata.screenplayCues.count)",
                                    replyPreview: String((metadata.screenplayOutput?.text ?? "").prefix(220)),
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: preparedPrompt.directorText
                                )
                                persistDebugVoiceTurnProgress()
                            }
#endif
                            guard preparedPrompt.useScreenplayMode else { return }
                            guard preparedPrompt.shouldWriteToPage else { return }
                            let voiceTimeline = studioDialogueTimeline(from: metadata.dialogueTimeline)
                            let voiceInsertCues = studioVoiceInsertCues(
                                from: metadata.screenplayCues,
                                timeline: voiceTimeline
                            )
                            let renderContract = syncedVoiceRenderContract(from: metadata.renderContract)
                            let resolvedTimingSource = resolvedPendingSyncedVoiceInsertTimingSource(
                                metadata.timingSource,
                                cues: voiceInsertCues
                            )
                            screenplayDraftBridge.updateSyncedVoiceTurnRenderContract(renderContract)
                            screenplayDraftBridge.stageSyncedVoiceTurnAuthoritativeContent(
                                text: authoritativePageWriteText(from: metadata.screenplayOutput),
                                cues: voiceInsertCues,
                                timeline: voiceTimeline,
                                timingSource: resolvedTimingSource,
                                audioDuration: metadata.audioDurationMs.map { TimeInterval($0) / 1_000.0 },
                                renderContract: renderContract
                            )
                            if didStartEarlyStreamPlayback, renderContract.syncReady {
                                startSyncedVoiceInsertIfPossible(trigger: "response_metadata_ready")
                            }
                        }
                    },
                    onFirstAudioSegmentReady: { firstSegmentURL in
                        Task { @MainActor in
                            guard allowEarlyStreamPlayback else { return }
                            guard !didStartEarlyStreamPlayback else { return }
                            didStartEarlyStreamPlayback = true
                            HerLog.ui.info("stream first segment ready -> start playback early")
                            isThinking = false
                            voice.markAssistantPlaybackStarted()
                            didRecordAssistantPlaybackStart = true
#if DEBUG || os(macOS)
                            if let debugVoiceTurnToken {
                                appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "first_audio_segment_ready",
                                    detail: "First streamed audio segment became playable. source=streamed_first_segment",
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: preparedPrompt.directorText
                                )
                                appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "assistant_playback_started",
                                    detail: "Assistant playback started from first streamed segment. source=streamed_first_segment",
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: preparedPrompt.directorText
                                )
                            }
#endif
                            voice.resumeRecordingIfNeeded()
                            do {
                                try orbAudio.play(url: firstSegmentURL, onFinish: {
                                    Task { @MainActor in
                                        playStreamRemainderOrFinish()
                                    }
                                })
                                activeTurnBasedLatencyTurnID = clientLatencyTurnID
                                clientLatency.recordFirstAudio(turnID: clientLatencyTurnID)
                                syncedPlaybackClock.reset()
                                beginSyncedPlaybackClockSegment(for: firstSegmentURL)
                                if shouldUseSyncedStudioVoiceInsert {
                                    screenplayDraftBridge.markSyncedVoiceTurnPlaybackStarted()
                                    let authoritativeText = screenplayDraftBridge.syncedVoiceTurnState.authoritativeText
                                    screenplayDraftBridge.stageSyncedVoiceTurnAudioDuration(
                                        resolvedStudioVoiceInsertDuration(
                                            for: authoritativeText,
                                            audioURL: firstSegmentURL,
                                            backendDurationMs: screenplayDraftBridge.syncedVoiceTurnState.audioDurationMs
                                        )
                                    )
                                    startSyncedVoiceInsertIfPossible(
                                        trigger: "first_audio_segment_ready",
                                        audioURL: firstSegmentURL
                                    )
                                }
                            } catch {
                                _ = commitSyncedVoiceFallbackIfNeeded(
                                    trigger: "first_audio_segment_playback_error",
                                    markCompleted: true
                                )
                                HerLog.ui.error("early stream playback error=\(error.localizedDescription, privacy: .public)")
                                didStartEarlyStreamPlayback = false
                                voice.markRequestFailed()
                                voice.resumeRecordingIfNeeded()
#if DEBUG || os(macOS)
                                finalizeDebugVoiceTurn(status: "error", error: error.localizedDescription)
#endif
                            }
                        }
                    },
                    onTextReady: { rawReply in
                        Task { @MainActor in
                            if !rawReply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                clientLatency.recordFirstText(turnID: clientLatencyTurnID)
                            }
                            guard preparedPrompt.useScreenplayMode else { return }
                            guard preparedPrompt.shouldWriteToPage else { return }
                            guard isStudioSurfaceActive else { return }
                            if shouldUseSyncedStudioVoiceInsert {
                                screenplayDraftBridge.stageSyncedVoiceTurnPreviewText(rawReply)
                            }
#if DEBUG || os(macOS)
                            if let debugVoiceTurnToken {
                                appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "header_text_ready",
                                    detail: "Received x-reply header text before talk completion.",
                                    replyPreview: String(rawReply.prefix(220)),
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: preparedPrompt.directorText
                                )
                            }
#endif
                            if shouldUseSyncedStudioVoiceInsert {
                                return
                            }
                            HerLog.ui.info("early screenplay text ready -> applying draft preview")
                            if let previewText = applyLiveScreenplayPreviewFromRawReply(
                                rawReply,
                                userTranscript: effectiveTranscript,
                                memoryDomainOverride: preparedPrompt.memoryDomain
                            ) {
#if DEBUG || os(macOS)
                                debugInsertedPreview = String(previewText.prefix(220))
                                if let debugVoiceTurnToken {
                                    appendStudioDebugVoiceDraftBreadcrumb(
                                        event: "header_text_previewed",
                                        detail: "Header-time x-reply text previewed in the Studio draft.",
                                        replyPreview: String(previewText.prefix(220)),
                                        tokenOverride: debugVoiceTurnToken,
                                        promptPreviewOverride: preparedPrompt.directorText
                                    )
                                }
#endif
                                if didStartEarlyStudioDraftStream {
                                    cancelRealtimeStudioDraftStream(
                                        restorePreview: false,
                                        debugVoiceTurnToken: debugVoiceTurnToken,
                                        promptPreviewOverride: preparedPrompt.directorText
                                    )
                                }
                            }
                        }
                    },
                    onDebugEvent: onBackendTalkDebugEvent
                )
            }
            let result: BackendTalkResult
            do {
                result = try await requestTalk()
            } catch {
                guard shouldRetryTalkOnce(for: error) else { throw error }
                HerLog.talk.info("transient TALK failure, retrying once")
                try await Task.sleep(nanoseconds: 250_000_000)
                result = try await requestTalk()
            }
            didReceiveTalkResponse = true
            if !(result.reply ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                clientLatency.recordFirstText(turnID: clientLatencyTurnID)
            }
#if DEBUG || os(macOS)
            if let debugVoiceTurnToken {
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "talk_response_received",
                    detail: "Backend /talk response received.",
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
            }
#endif
            speculativeTalk.noteBackendReuse(
                hit: result.speculativeTrace.reused,
                speculativeKey: result.speculativeTrace.speculativeKey ?? speculativeReuseCandidate?.speculativeKey
            )
            backendConnectionState = .up
            backendFailureCount = 0
            lastIssueSummary = ""
            withAnimation(.easeInOut(duration: 0.45)) {
                uiReflection = result.uiReflection
            }
            if let emotionLane = result.voiceEmotionLane?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !emotionLane.isEmpty {
                lastClementineEmotionLane = emotionLane
            }
            HerLog.ui.info(
                "ui reflection cycle=\(result.uiReflection.cycleIndex) sat=\(result.uiReflection.orbSaturation) react=\(result.uiReflection.orbReactivity) smooth=\(result.uiReflection.orbSmoothing) voice_speed=\(result.uiReflection.voiceSpeed) guard=\(result.uiReflection.overAttachmentSafeguardActive)"
            )
            lastKnowledgeCitations = Array(result.knowledgeTrace.citations.prefix(4))
            lastKnowledgeConfidenceClass = result.knowledgeTrace.confidenceClass
            lastKnowledgeContradictionRisk = min(max(result.knowledgeTrace.contradictionRisk, 0), 1)
            updateTransientTurnBanner(from: result)
            presentCanonClarificationIfNeeded(result.creativeMemoryTrace.canonClarification)
            if preparedPrompt.useScreenplayMode {
                screenplayDraftBridge.updateScreenplayQualityStatus(
                    quality: result.screenplayQuality,
                    output: result.screenplayOutput
                )
            }
#if DEBUG || os(macOS)
            debugTimingSource = (result.timingSource ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            debugScreenplayCues = result.screenplayCues
            if let resultDialogueTimeline = result.dialogueTimeline {
                debugDialogueTimeline = resultDialogueTimeline
            }
            if let screenplayOutput = result.screenplayOutput {
                debugScreenplayOutputTarget = screenplayOutput.target
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                debugScreenplayOutputSource = screenplayOutput.source
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                debugScreenplayOutputText = screenplayOutput.text
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if let quality = result.screenplayQuality ?? result.screenplayOutput?.quality {
                debugScreenplayQualityReason = quality.reason
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                debugScreenplayQualityConfidence = quality.confidence
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                debugScreenplayQualityFeatureAct = (quality.featureAct ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
            debugScreenplayRepairAttempted = result.screenplayTrace.repairAttempted
            debugScreenplayRepairOutcome = result.screenplayTrace.repairOutcome
                .trimmingCharacters(in: .whitespacesAndNewlines)
            debugScreenplayRepairMs = result.screenplayTrace.repairMs
            debugScreenplayRepairReason = (result.screenplayTrace.repairReason ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            updateDebugCreativeMemoryTrace(result.creativeMemoryTrace)
            screenplayDraftBridge.noteTalkCreativeMemoryTrace(
                result.creativeMemoryTrace,
                source: "talk_result"
            )
            if let debugVoiceTurnToken {
                let resolvedOutputTarget = result.screenplayOutput?.target
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let resolvedOutputSource = result.screenplayOutput?.source
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let resolvedTimingSource = (result.timingSource ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let resolvedQuality = result.screenplayQuality ?? result.screenplayOutput?.quality
                let resolvedQualityReason = resolvedQuality?.reason
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let resolvedQualityConfidence = resolvedQuality?.confidence
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let resolvedRepairOutcome = result.screenplayTrace.repairOutcome
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let resolvedRepairMs = result.screenplayTrace.repairMs ?? 0
                let memoryCharacters = result.creativeMemoryTrace.characters
                    .map { $0.name.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                    .prefix(4)
                    .joined(separator: ",")
                let memoryCorrections = result.creativeMemoryTrace.correctionReplacements
                    .prefix(3)
                    .joined(separator: ",")
                    .replacingOccurrences(of: " ", with: "_")
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "talk_result_received_meta",
                    detail: "Talk result received. output_target=\(resolvedOutputTarget.isEmpty ? "none" : resolvedOutputTarget) output_source=\(resolvedOutputSource.isEmpty ? "none" : resolvedOutputSource) timing_source=\(resolvedTimingSource.isEmpty ? "none" : resolvedTimingSource) quality_reason=\(resolvedQualityReason.isEmpty ? "none" : resolvedQualityReason) quality_confidence=\(resolvedQualityConfidence.isEmpty ? "none" : resolvedQualityConfidence) repair_attempted=\(result.screenplayTrace.repairAttempted ? "1" : "0") repair_outcome=\(resolvedRepairOutcome.isEmpty ? "none" : resolvedRepairOutcome) repair_ms=\(resolvedRepairMs) memory_applied=\(result.creativeMemoryTrace.applied ? "1" : "0") memory_characters=\(result.creativeMemoryTrace.characterCount) memory_episodes=\(result.creativeMemoryTrace.episodicCount) memory_corrections=\(result.creativeMemoryTrace.correctionCount) memory_names=\(memoryCharacters.isEmpty ? "none" : memoryCharacters) memory_repairs=\(memoryCorrections.isEmpty ? "none" : memoryCorrections) cue_count=\(result.screenplayCues.count)",
                    replyPreview: String((result.screenplayOutput?.text ?? result.reply ?? "").prefix(220)),
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
                persistDebugVoiceTurnProgress()
            }
#endif
            if shouldUseSyncedStudioVoiceInsert {
                let voiceTimeline = studioDialogueTimeline(from: result.dialogueTimeline)
                let voiceInsertCues = studioVoiceInsertCues(
                    from: result.screenplayCues,
                    timeline: voiceTimeline
                )
                let renderContract = syncedVoiceRenderContract(from: result.renderContract)
                let resolvedTimingSource = resolvedPendingSyncedVoiceInsertTimingSource(
                    result.timingSource,
                    cues: voiceInsertCues
                )
                screenplayDraftBridge.updateSyncedVoiceTurnRenderContract(renderContract)
                let authoritativeSyncedText = authoritativePageWriteText(from: result.screenplayOutput)
                if !authoritativeSyncedText.isEmpty {
                    screenplayDraftBridge.stageSyncedVoiceTurnAuthoritativeContent(
                        text: authoritativeSyncedText,
                        cues: voiceInsertCues,
                        timeline: voiceTimeline,
                        timingSource: resolvedTimingSource,
                        audioDuration: result.audioDurationMs.map { TimeInterval($0) / 1_000.0 },
                        renderContract: renderContract
                    )
                }
                screenplayDraftBridge.stageSyncedVoiceTurnAudioDuration(
                    resolvedStudioVoiceInsertDuration(
                        for: screenplayDraftBridge.syncedVoiceTurnState.authoritativeText,
                        audioURL: result.audioURL,
                        backendDurationMs: result.audioDurationMs
                    )
                )
                if renderContract.syncReady {
                    startSyncedVoiceInsertIfPossible(
                        trigger: "talk_result_received",
                        audioURL: result.audioURL
                    )
                } else {
                    screenplayDraftBridge.failSyncedVoiceTurn(reason: "Missing authoritative screenplay sync payload.")
                }
            }
            let talkInsertedScreenplayText = applyLiveScreenplayPreview(
                from: result,
                promptSource: .voice,
                memoryDomainOverride: preparedPrompt.memoryDomain,
                preferredTargetOverride: preparedPrompt.shouldWriteToPage ? .page : .voicePin,
                skipCommitIfMatchesActiveText: didStartSyncedVoiceInsert
                    ? screenplayDraftBridge.syncedVoiceTurnState.authoritativeText
                    : nil,
                allowImmediateCommit: !shouldUseSyncedStudioVoiceInsert,
                requireAuthoritativePageOutput: shouldUseSyncedStudioVoiceInsert
            )
            let insertedScreenplayText: String?
            if let talkInsertedScreenplayText {
                insertedScreenplayText = talkInsertedScreenplayText
                if didStartEarlyStudioDraftStream {
                    cancelRealtimeStudioDraftStream(
                        restorePreview: false,
                        debugVoiceTurnToken: debugVoiceTurnToken,
                        promptPreviewOverride: preparedPrompt.directorText
                    )
                }
            } else if didStartEarlyStudioDraftStream,
                      preparedPrompt.shouldWriteToPage,
                      let committedPreviewText = commitCurrentStudioPagePreviewIfNeeded(
                        userTranscript: result.transcript ?? "",
                        promptSource: .voice
                      ) {
                didCommitEarlyStudioDraftPreviewFallback = true
                insertedScreenplayText = committedPreviewText
                cancelRealtimeStudioDraftStream(
                    restorePreview: false,
                    debugVoiceTurnToken: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
            } else if didStartEarlyStudioDraftStream,
                      let committedPreviewText = commitActiveRealtimeStudioDraftPreviewIfNeeded() {
                didCommitEarlyStudioDraftPreviewFallback = true
                insertedScreenplayText = committedPreviewText
                cancelRealtimeStudioDraftStream(
                    restorePreview: false,
                    debugVoiceTurnToken: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
            } else {
                insertedScreenplayText = nil
                if didStartEarlyStudioDraftStream {
                    cancelRealtimeStudioDraftStream(
                        restorePreview: false,
                        debugVoiceTurnToken: debugVoiceTurnToken,
                        promptPreviewOverride: preparedPrompt.directorText
                    )
                    restoreRealtimeStudioDraftPreview()
                }
            }
            let effectiveInsertedScreenplayText: String? = {
                let cleanInsertedText = (insertedScreenplayText ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !cleanInsertedText.isEmpty {
                    return cleanInsertedText
                }
                guard preparedPrompt.shouldWriteToPage else { return nil }
                let syncedInsertedText = screenplayDraftBridge.syncedVoiceTurnState.authoritativeText
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !syncedInsertedText.isEmpty {
                    return syncedInsertedText
                }
                return nil
            }()
            updateStudioAssistantPin(
                from: result,
                insertedText: effectiveInsertedScreenplayText,
                promptSource: .voice,
                promptTextOverride: preparedPrompt.directorText,
                promptTargetOverride: preparedPrompt.shouldWriteToPage ? .page : .voicePin
            )
            await annotateStudioTalkTurnIfNeeded(
                result: result,
                promptSource: .voice,
                targetOverride: preparedPrompt.shouldWriteToPage ? .page : .voicePin,
                insertedTextOverride: effectiveInsertedScreenplayText
            )

            let confirmedTranscript = result.transcript?.trimmingCharacters(in: .whitespacesAndNewlines)
            let confirmedReply = result.reply?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let confirmedTranscript, let confirmedReply, !confirmedTranscript.isEmpty, !confirmedReply.isEmpty {
                recordStudioConversationMemoryIfNeeded(
                    user: confirmedTranscript,
                    assistant: confirmedReply,
                    memoryDomain: preparedPrompt.memoryDomain,
                    isScreenplayMode: preparedPrompt.useScreenplayMode,
                    source: .voice
                )
                showReplyEcho(user: confirmedTranscript, assistant: confirmedReply)
            }
#if DEBUG || os(macOS)
            debugTurnID = result.commit?.turnId ?? ""
            debugReplyPreview = String((confirmedReply ?? "").prefix(220))
            if let effectiveInsertedScreenplayText {
                debugInsertedPreview = String(effectiveInsertedScreenplayText.prefix(220))
            }
            let hasRecordedRequestCommit = debugVoiceTurnToken.map { token in
                currentStudioDebugVoiceDraftBreadcrumbs().contains {
                    $0.token == token && $0.event == "request_committed"
                }
            } ?? false
            if didStartEarlyStudioDraftStream, let effectiveInsertedScreenplayText, !hasRecordedRequestCommit {
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "request_committed",
                    detail: didCommitEarlyStudioDraftPreviewFallback
                        ? "Early Studio draft preview committed to the page."
                        : "Final Studio draft write committed.",
                    replyPreview: String(effectiveInsertedScreenplayText.prefix(220)),
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
                persistDebugVoiceTurnProgress()
            }
#endif

            if let text = confirmedTranscript, !text.isEmpty {
                self.transcript = text
                livePartialTranscript = ""
                lastNonEmptyPartialTranscriptHint = ""
                speculativeTalk.cancel()
                if isGoodbyeIntent(text) {
                    pendingGoodbyeStopAfterPlayback = true
                    conversationLoopEnabled = false
                }
                await syncEvolutionForMemoryDomain(
                    userMessage: text,
                    memoryDomain: preparedPrompt.memoryDomain,
                    isScreenplayMode: preparedPrompt.useScreenplayMode
                )
                if containsStudioOpenCommand(text) {
                    let turnId = result.commit?.turnId ?? ""
                    if turnId.isEmpty || turnId != lastAutoOpenedStudioTurnID {
                        openStudio()
                        if !turnId.isEmpty {
                            lastAutoOpenedStudioTurnID = turnId
                        }
                    }
                } else if shouldAutoOpenStudioForScriptIntent(text) {
                    let turnId = result.commit?.turnId ?? ""
                    if turnId.isEmpty || turnId != lastAutoOpenedStudioTurnID {
                        openStudio()
                        if !turnId.isEmpty {
                            lastAutoOpenedStudioTurnID = turnId
                        }
                    }
                }
            }
            if let persistedName = result.userName?.trimmingCharacters(in: .whitespacesAndNewlines),
               !persistedName.isEmpty {
                evolution.setPreferredName(persistedName)
                onboardingName = persistedName
            }
            await onTurnCommitted(
                result.commit,
                userMessage: result.transcript,
                assistantMessage: result.reply
            )

            handleNoteCaptureIfNeeded(result.noteAction, turnId: result.commit?.turnId)
            isThinking = false
            if didStartEarlyStreamPlayback {
                pendingStreamRemainderURL = result.streamedRemainderURL
                if !orbAudio.isSpeaking {
                    playStreamRemainderOrFinish()
                }
            } else {
                voice.markAssistantPlaybackStarted()
                didRecordAssistantPlaybackStart = true
#if DEBUG || os(macOS)
                if let debugVoiceTurnToken {
                    appendStudioDebugVoiceDraftBreadcrumb(
                        event: "assistant_playback_started",
                        detail: "Assistant playback started from full response audio. source=full_response_audio",
                        tokenOverride: debugVoiceTurnToken,
                        promptPreviewOverride: preparedPrompt.directorText
                    )
                }
#endif
                voice.resumeRecordingIfNeeded()
                HerLog.audio.info("AUDIO file path=\(result.audioURL.path, privacy: .public)")
                try orbAudio.play(url: result.audioURL, onFinish: {
                    Task { @MainActor in
                        finishPlaybackAndResumeMic()
                    }
                })
                activeTurnBasedLatencyTurnID = clientLatencyTurnID
                clientLatency.recordFirstAudio(turnID: clientLatencyTurnID)
                syncedPlaybackClock.reset()
                beginSyncedPlaybackClockSegment(for: result.audioURL)
                if shouldUseSyncedStudioVoiceInsert {
                    screenplayDraftBridge.markSyncedVoiceTurnPlaybackStarted()
                    startSyncedVoiceInsertIfPossible(
                        trigger: "full_response_audio_started",
                        audioURL: result.audioURL
                    )
                }
            }
        } catch BackendError.continueListening {
            backendConnectionState = .up
            backendFailureCount = 0
            isThinking = false
            if shouldUseSyncedStudioVoiceInsert {
                screenplayDraftBridge.interruptSyncedVoiceTurn(reason: .other)
            }
            if didStartEarlyStudioDraftStream {
                cancelRealtimeStudioDraftStream(
                    restorePreview: true,
                    debugVoiceTurnToken: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
            }
            if didStartEarlyStreamPlayback {
                orbAudio.stop()
            }
            voice.markAssistantPlaybackEnded()
            HerLog.ui.info("backend requested continue listening (turn-end guard)")
            voice.resumeRecordingIfNeeded()
#if DEBUG || os(macOS)
            finalizeDebugVoiceTurn(status: "error", error: "Backend requested continue listening.")
#endif
        } catch is CancellationError {
            isThinking = false
            if shouldUseSyncedStudioVoiceInsert {
                screenplayDraftBridge.interruptSyncedVoiceTurn(reason: .cancel)
            }
            if didStartEarlyStudioDraftStream {
                cancelRealtimeStudioDraftStream(
                    restorePreview: true,
                    debugVoiceTurnToken: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
            }
            if didStartEarlyStreamPlayback {
                orbAudio.stop()
            }
            voice.markRequestFailed()
            HerLog.ui.info("talk request cancelled, resume mic")
            voice.resumeRecordingIfNeeded()
#if DEBUG || os(macOS)
            finalizeDebugVoiceTurn(status: "error", error: "Talk request cancelled.")
#endif
        } catch let queued as BackendTalkQueuedError {
            backendConnectionState = .reconnecting
            backendFailureCount = max(backendFailureCount, 1)
            offlineTalkOutboxSnapshot = queued.snapshot
            lastIssueSummary = queued.reason
            isThinking = false
            showOfflineTalkOutboxBanner(queued.localizedDescription)
            if shouldUseSyncedStudioVoiceInsert {
                screenplayDraftBridge.failSyncedVoiceTurn(reason: queued.localizedDescription)
            }
            if didStartEarlyStudioDraftStream {
                cancelRealtimeStudioDraftStream(
                    restorePreview: true,
                    debugVoiceTurnToken: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
            }
            if didStartEarlyStreamPlayback {
                orbAudio.stop()
            }
            voice.markRequestFailed()
            HerLog.ui.info("talk request queued for offline retry")
            voice.resumeRecordingIfNeeded()
#if DEBUG || os(macOS)
            finalizeDebugVoiceTurn(status: "queued", error: queued.localizedDescription)
#endif
        } catch {
            let authRequiredMessage = noteAuthRequiredIfNeeded(error)
            let failureReason = authRequiredMessage ?? error.localizedDescription
            if authRequiredMessage == nil {
                markBackendUnavailable(reason: failureReason)
                lastIssueSummary = failureReason
            }
            let committedSyncedFallback = commitSyncedVoiceFallbackIfNeeded(
                trigger: "talk_or_playback_error",
                markCompleted: true
            )
            if shouldUseSyncedStudioVoiceInsert, committedSyncedFallback == nil {
                screenplayDraftBridge.failSyncedVoiceTurn(reason: failureReason)
            }
            if didStartEarlyStudioDraftStream {
                cancelRealtimeStudioDraftStream(
                    restorePreview: true,
                    debugVoiceTurnToken: debugVoiceTurnToken,
                    promptPreviewOverride: preparedPrompt.directorText
                )
            }
            if didStartEarlyStreamPlayback {
                orbAudio.stop()
            }
            voice.markRequestFailed()
            HerLog.ui.error("playback error=\(failureReason, privacy: .public), resume mic")
            voice.resumeRecordingIfNeeded()
#if DEBUG || os(macOS)
            finalizeDebugVoiceTurn(status: "error", error: failureReason)
#endif
        }
    }

    @MainActor
    private func submitStudioPrompt(
        _ prompt: String,
        routingMode: ScreenplayStudioScreen.PromptRoutingMode = .automatic,
        requestID: String? = nil
    ) async -> String? {
        let cleanPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanPrompt.isEmpty else { return "Enter a Studio prompt first." }
#if DEBUG || os(macOS)
        setStudioDebugPreferenceString("root_submit_started", forKey: "studio_debug_root_submit_stage")
        setStudioDebugPreferenceString(cleanPrompt, forKey: "studio_debug_root_submit_prompt")
        setStudioDebugPreferenceString(requestID ?? "", forKey: "studio_debug_root_submit_request_id")
        setStudioDebugPreferenceString("", forKey: "studio_debug_root_submit_error")
        #if DEBUG
        if shouldUseDebugStudioPromptLiveBackendTransport {
            prepareBackendForStudioDebugVoiceTurn()
            setStudioDebugPreferenceString("root_submit_backend_pinned", forKey: "studio_debug_root_submit_stage")
        }
        #endif
#endif
        guard !isTurnSubmitting else {
#if DEBUG || os(macOS)
            setStudioDebugPreferenceString("root_submit_busy", forKey: "studio_debug_root_submit_stage")
#endif
            return "io.them is already working on the current turn."
        }
        let localCommand = runLocalStudioCommandIfNeeded(
            cleanPrompt,
            source: .typed,
            shouldSpeakConfirmation: false
        )
        if localCommand.handled {
#if DEBUG || os(macOS)
            setStudioDebugPreferenceString("root_submit_local_command", forKey: "studio_debug_root_submit_stage")
#endif
            return localCommand.error
        }
        if voiceTransportMode == .realtimePreview,
           realtimeTransport.isLive || realtimeTransport.isBusy {
            realtimeTransport.disconnect()
        }

        let cleanRequestID = requestID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let clientLatencyTurnID = cleanRequestID.isEmpty
            ? "studio-\(UUID().uuidString.lowercased())"
            : cleanRequestID
        let clientLatencyStartedAt = Date()
        clientLatency.beginTurn(
            id: clientLatencyTurnID,
            transport: .studioTypedSpeech,
            at: clientLatencyStartedAt
        )

        isTurnSubmitting = true
        isThinking = true
        studioTypedPromptRoutingMode = routingMode
        defer {
            isTurnSubmitting = false
            isThinking = false
            studioTypedPromptRoutingMode = .automatic
        }
        _ = await applyConversationalStudioCorrectionIfNeeded(
            cleanPrompt
        )

        let store = HerEvolutionStore.shared
        let directorText = cleanPrompt
        let memoryDomain = studioMemoryDomain(for: cleanPrompt, preferredTarget: routingMode)
        screenplayDraftBridge.latestMemoryDomain = memoryDomain
#if DEBUG || os(macOS)
        setStudioDebugPreferenceString(memoryDomain.rawValue, forKey: "studio_debug_last_memory_domain")
#endif
        if memoryDomain != .companion {
            HerEvolutionStore.shared.noteCreativeContext(from: cleanPrompt, isScreenplayMode: true)
        }
        let screenplayPhaseHint = screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
        let screenplayPackHint = screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPack.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
        let screenplayDraftExcerpt = String(
            screenplayDraftBridge.draftText
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .suffix(2200)
        )

        let director = HerDirectorContext.build(from: store, userText: directorText)
        let turnKey = "\(store.sessionCount)|\(Date().timeIntervalSince1970)|\(directorText.count)|text"
        let opening = HerMicroInitiations.openingBeat(
            context: director,
            turnKey: turnKey,
            isScreenplayMode: true
        )
        let recentTurns = studioRecentTurns(
            for: memoryDomain,
            isScreenplayMode: true
        )
        let confirmedStudioStoryContext = confirmedStudioPageWriteContext(for: cleanPrompt)
        let shouldWriteToPage = shouldRouteStudioPromptToPage(cleanPrompt, preferredTarget: routingMode)
        let renderTranscript = studioRenderTranscript(
            for: cleanPrompt,
            confirmedContext: confirmedStudioStoryContext,
            preferredTarget: shouldWriteToPage ? .page : routingMode
        )
        if !shouldWriteToPage {
            restoreRealtimeStudioDraftPreview()
        }

#if DEBUG
        if shouldUseDebugStudioPromptStubTransport {
            let requestToken = requestID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? requestID!.trimmingCharacters(in: .whitespacesAndNewlines)
                : "studio-stub-\(UUID().uuidString.lowercased())"
            let stub = makeDebugStudioPromptStubReply(
                prompt: cleanPrompt,
                memoryDomain: memoryDomain,
                shouldWriteToPage: shouldWriteToPage
            )
            applyDebugStudioPromptStubReply(
                stub,
                prompt: cleanPrompt,
                requestID: requestToken,
                memoryDomain: memoryDomain
            )
            self.transcript = cleanPrompt
            livePartialTranscript = ""
            lastNonEmptyPartialTranscriptHint = ""
            speculativeTalk.cancel()
            return nil
        }
#endif

        let promptContext = HerVoiceSpec.Context(
            stage: director.stage,
            depthScore: director.depth,
            romanceTension: director.romance,
            personaPreset: director.personaPreset,
            isLoveTopic: director.isLoveTopic,
            preferredName: director.preferredName,
            subtleMemoryCue: director.subtleMemoryCue,
            canUseRomanticAmbiguity: director.canUseRomanticAmbiguity,
            canInitiateVulnerability: director.canInitiateVulnerability,
            optionalOpeningBeat: opening,
            isScreenplayMode: true,
            screenplayPhaseHint: screenplayPhaseHint,
            screenplayPackHint: screenplayPackHint,
            screenplayDraftExcerpt: screenplayDraftExcerpt,
            screenplayGenre: director.screenplayGenre,
            isAskingForStoryHelp: director.isAskingForStoryHelp,
            isSynopsisFocused: director.isSynopsisFocused,
            isOutlineFocused: director.isOutlineFocused,
            isStoryDirectionPrompt: director.isStoryDirectionPrompt,
            isCharacterFocused: director.isCharacterFocused,
            isClimax: director.isClimax,
            isOpeningOrClosing: director.isOpeningOrClosing,
            isLongFormScreenplayRequest: director.isLongFormScreenplayRequest,
            isDirectScreenplayPageWrite: shouldWriteToPage,
            hasConfirmedScreenplayPageWrite: shouldWriteToPage || confirmedStudioStoryContext != nil,
            confirmedScreenplayStoryDirection: shouldWriteToPage ? cleanPrompt : (confirmedStudioStoryContext ?? ""),
            isUserVulnerable: director.isUserVulnerable,
            isUserPlayful: director.isUserPlayful,
            isUserDirect: director.isUserDirect,
            isNostalgic: director.isNostalgic,
            hasCommitmentSignals: director.hasCommitmentSignals,
            hasRomanticChemistrySignals: director.hasRomanticChemistrySignals,
            isLowEnergyAnalytical: director.isLowEnergyAnalytical,
            isGrief: director.isGrief,
            isAnxious: director.isAnxious,
            isCelebrating: director.isCelebrating,
            recentTurns: recentTurns,
            partialTranscriptHint: cleanPrompt,
            voicedRatio: 1.0,
            speechAgeSeconds: 2.0,
            hasStrongPartial: true
        )
        let companionSignals = CreativeCompanionSignalEngine.build(
            context: director,
            memoryDomain: memoryDomain,
            companionMode: screenplayDraftBridge.companionMode,
            isScreenplayMode: true,
            shouldWriteToPage: shouldWriteToPage,
            screenplayPhaseHint: screenplayPhaseHint,
            screenplayPackHint: screenplayPackHint,
            recentTurns: recentTurns,
            sourceText: directorText
        )
        screenplayDraftBridge.applyCompanionSignalState(companionSignals, persist: false)
        let baseSystemPrompt = ScreenplayPromptBuilder.makeLocalPersonaPrompt(
            context: promptContext,
            speakingPace: clementineSpeakingPace,
            memoryDomain: memoryDomain,
            shouldWriteToPage: shouldWriteToPage,
            companionInstruction: screenplayDraftBridge.companionMode.promptInstruction,
            companionSignals: companionSignals
        )
#if DEBUG || os(macOS)
        setStudioDebugPreferenceString("root_prompt_build_started", forKey: "studio_debug_root_submit_stage")
#endif
        let systemPrompt = await buildCanonicalModelPrompt(
            baseSystemPrompt,
            userMessage: cleanPrompt,
            isScreenplayMode: true,
            shouldWriteToPage: shouldWriteToPage,
            featureWorkflowRequestID: requestID,
            includeVisualContext: !shouldSkipVisualContextForStudioDraftTurn(
                isScreenplayMode: true,
                shouldWriteToPage: shouldWriteToPage
            )
        )
        let studioRenderMetadata = studioRenderRequestMetadata(
            promptSource: .typed,
            shouldWriteToPage: shouldWriteToPage,
            requestID: requestID
        )
#if DEBUG || os(macOS)
        setStudioDebugPreferenceString("root_prompt_build_finished", forKey: "studio_debug_root_submit_stage")
#endif

        do {
#if DEBUG || os(macOS)
            setStudioDebugPreferenceString("root_render_started", forKey: "studio_debug_root_submit_stage")
#endif
            HerLog.talk.info("STUDIO render text sending chars=\(renderTranscript.count)")

            let renderedReply: String
            #if DEBUG || os(macOS)
            _ = Self.studioPageWriteTransportRoutingChecked
            #endif
            let shouldStreamStudioPageWrite = shouldUseStreamingStudioPageWriteTransport(
                shouldWriteToPage: shouldWriteToPage
            )
            let shouldSpeakTypedReply = studioTypedReplyAudioEnabled
            if shouldSpeakTypedReply {
                orbAudio.stop()
                promptSpeaker.stop()
                typedReplySpeaker.begin(
                    turnID: clientLatencyTurnID
                )
            } else {
                typedReplySpeaker.cancel()
            }
            let studioRenderTimeoutSeconds = shouldWriteToPage ? 75.0 : 30.0
            if shouldStreamStudioPageWrite {
                realtimeStudioRenderUserMessage = cleanPrompt
                realtimeStudioRenderedReply = ""
                resetRealtimeStudioDraftPreviewThrottle()
                let requestRender = {
                    do {
                        return try await withStudioRenderTimeout(seconds: studioRenderTimeoutSeconds) {
                            let result = try await backend.streamRealtimeStudioResult(
                                transcript: renderTranscript,
                                systemPrompt: systemPrompt,
                                screenplayTarget: shouldWriteToPage ? "page" : "voice_pin",
                                studioMetadata: studioRenderMetadata,
                                onPartial: { partial in
                                    await MainActor.run {
                                        guard self.realtimeStudioRenderUserMessage == cleanPrompt else { return }
                                        self.realtimeStudioRenderedReply = partial
                                        if !partial.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                            self.clientLatency.recordFirstText(turnID: clientLatencyTurnID)
                                        }
                                        if shouldSpeakTypedReply && self.studioTypedReplyAudioEnabled {
                                            self.typedReplySpeaker.consume(cumulativeText: partial)
                                        } else if !self.studioTypedReplyAudioEnabled {
                                            self.typedReplySpeaker.cancel()
                                        }
                                        if shouldWriteToPage,
                                           self.shouldApplyRealtimeStudioDraftPreview(partial) {
                                            self.applyRealtimeStudioDraftPreview(
                                                userMessage: cleanPrompt,
                                                assistantMessage: partial
                                            )
                                        }
                                    }
                                },
                                onTrace: { trace in
                                    guard let memoryApplied = trace.memoryApplied else { return }
                                    await MainActor.run {
                                        self.screenplayDraftBridge.noteStudioAppliedMemory(
                                            memoryApplied,
                                            source: "typed_stream_\(trace.kind)"
                                        )
                                    }
                                }
                            )
                            await MainActor.run {
                                self.screenplayDraftBridge.noteStudioAppliedMemory(
                                    result.memoryApplied,
                                    source: "typed_stream_done"
                                )
                                self.applyRealtimeStudioScreenplayQuality(result.screenplayQuality)
                            }
                            return result.reply
                        }
                    } catch {
                        guard shouldFallbackToNonStreamingStudioRender(for: error) else { throw error }
                        restoreRealtimeStudioDraftPreview()
                        if shouldSpeakTypedReply {
                            typedReplySpeaker.begin(
                                turnID: clientLatencyTurnID
                            )
                        }
                        HerLog.talk.info("STUDIO render stream unconfirmed -> fallback to one-shot render")
                        return try await withStudioRenderTimeout(seconds: studioRenderTimeoutSeconds) {
                            let result = try await backend.renderRealtimeStudioResult(
                                transcript: renderTranscript,
                                systemPrompt: systemPrompt,
                                screenplayTarget: shouldWriteToPage ? "page" : "voice_pin",
                                studioMetadata: studioRenderMetadata
                            )
                            await MainActor.run {
                                self.screenplayDraftBridge.noteStudioAppliedMemory(
                                    result.memoryApplied,
                                    source: "typed_fallback"
                                )
                                self.applyRealtimeStudioScreenplayQuality(result.screenplayQuality)
                            }
                            return result.reply
                        }
                    }
                }
                do {
                    renderedReply = try await requestRender()
                } catch {
                    restoreRealtimeStudioDraftPreview()
                    guard shouldRetryTalkOnce(for: error) else { throw error }
                    if shouldSpeakTypedReply {
                        typedReplySpeaker.begin(
                            turnID: clientLatencyTurnID
                        )
                    }
                    HerLog.talk.info("transient STUDIO render failure, retrying once")
                    try await Task.sleep(nanoseconds: 250_000_000)
                    renderedReply = try await requestRender()
                }
            } else {
                let requestRender = {
                    try await withStudioRenderTimeout(seconds: studioRenderTimeoutSeconds) {
                        let result = try await backend.renderRealtimeStudioResult(
                            transcript: renderTranscript,
                            systemPrompt: systemPrompt,
                            screenplayTarget: shouldWriteToPage ? "page" : "voice_pin",
                            studioMetadata: studioRenderMetadata
                        )
                        await MainActor.run {
                            self.screenplayDraftBridge.noteStudioAppliedMemory(
                                result.memoryApplied,
                                source: "typed_sync"
                            )
                            self.applyRealtimeStudioScreenplayQuality(result.screenplayQuality)
                        }
                        return result.reply
                    }
                }

                do {
                    renderedReply = try await requestRender()
                } catch {
                    guard shouldRetryTalkOnce(for: error) else { throw error }
                    HerLog.talk.info("transient STUDIO render failure, retrying once")
                    try await Task.sleep(nanoseconds: 250_000_000)
                    renderedReply = try await requestRender()
                }
            }

            if !renderedReply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                clientLatency.recordFirstText(turnID: clientLatencyTurnID)
            }
            let cleanReply = sanitizedRealtimeStudioRenderReply(renderedReply)
#if DEBUG || os(macOS)
            setStudioDebugPreferenceString("root_render_finished", forKey: "studio_debug_root_submit_stage")
#endif
            realtimeStudioRenderUserMessage = ""
            realtimeStudioRenderedReply = ""
            resetRealtimeStudioDraftPreviewThrottle()
            guard !cleanReply.isEmpty else {
                typedReplySpeaker.cancel()
                if shouldWriteToPage {
                    restoreRealtimeStudioDraftPreview()
                }
                return "io.them didn't return a Studio reply."
            }

            backendConnectionState = .up
            backendFailureCount = 0
            lastIssueSummary = ""
            lastKnowledgeCitations = []
            lastKnowledgeConfidenceClass = "UNKNOWN"
            lastKnowledgeContradictionRisk = 0

            let result = makeRealtimeStudioTalkResult(
                userMessage: cleanPrompt,
                assistantMessage: cleanReply
            )
            let insertedScreenplayText = shouldWriteToPage
                ? applyLiveScreenplayPreview(
                    from: result,
                    promptSource: .typed,
                    memoryDomainOverride: memoryDomain,
                    preferredTargetOverride: .page
                )
                : nil
            if !shouldWriteToPage {
                screenplayDraftBridge.updateLatestVoicePinReply(cleanReply, prompt: cleanPrompt)
            }
            updateStudioAssistantPin(
                from: result,
                insertedText: insertedScreenplayText,
                promptSource: .typed,
                promptTargetOverride: shouldWriteToPage ? .page : .voicePin
            )
            finishTypedStudioReplySpeechIfNeeded(
                replyText: cleanReply,
                shouldSpeak: shouldSpeakTypedReply
            )
            recordStudioConversationMemoryIfNeeded(
                user: cleanPrompt,
                assistant: cleanReply,
                memoryDomain: memoryDomain,
                isScreenplayMode: true,
                source: .typed
            )

            self.transcript = cleanPrompt
            livePartialTranscript = ""
            lastNonEmptyPartialTranscriptHint = ""
            speculativeTalk.cancel()
            if shouldWriteToPage {
                let deferredPrompt = cleanPrompt
                let deferredReply = cleanReply
                let deferredMemoryDomain = memoryDomain
                let deferredRequestID = requestID
                let deferredInsertedText = insertedScreenplayText
                Task { @MainActor in
                    await syncEvolutionForMemoryDomain(
                        userMessage: deferredPrompt,
                        memoryDomain: deferredMemoryDomain,
                        isScreenplayMode: true
                    )
                    await commitRealtimePreviewTurnIfNeeded(
                        userMessage: deferredPrompt,
                        assistantMessage: deferredReply,
                        promptSource: .typed,
                        requestId: deferredRequestID,
                        targetOverride: .page,
                        insertedTextOverride: deferredInsertedText
                    )
                    await annotateLatestRealtimeStudioTurnIfNeeded(
                        promptSource: .typed,
                        targetOverride: .page,
                        insertedTextOverride: deferredInsertedText,
                        requestID: deferredRequestID
                    )
                }
            } else {
                await syncEvolutionForMemoryDomain(
                    userMessage: cleanPrompt,
                    memoryDomain: memoryDomain,
                    isScreenplayMode: true
                )
                await commitRealtimePreviewTurnIfNeeded(
                    userMessage: cleanPrompt,
                    assistantMessage: cleanReply,
                    promptSource: .typed,
                    requestId: requestID,
                    targetOverride: .voicePin,
                    insertedTextOverride: insertedScreenplayText
                )
            }
#if DEBUG || os(macOS)
            setStudioDebugPreferenceString("root_submit_finished", forKey: "studio_debug_root_submit_stage")
#endif
            return nil
        } catch BackendError.continueListening {
            typedReplySpeaker.cancel()
            backendConnectionState = .up
            backendFailureCount = 0
#if DEBUG || os(macOS)
            setStudioDebugPreferenceString("root_submit_continue_listening", forKey: "studio_debug_root_submit_stage")
#endif
            return "Try giving io.them a little more detail."
        } catch {
            typedReplySpeaker.cancel()
            realtimeStudioRenderUserMessage = ""
            realtimeStudioRenderedReply = ""
            if shouldWriteToPage,
               let qualityMessage = handleRealtimeStudioQualityFailure(error) {
#if DEBUG || os(macOS)
                setStudioDebugPreferenceString("root_submit_quality_rejected", forKey: "studio_debug_root_submit_stage")
                setStudioDebugPreferenceString(qualityMessage, forKey: "studio_debug_root_submit_error")
#endif
                return qualityMessage
            }
            if shouldWriteToPage {
                restoreRealtimeStudioDraftPreview()
            }
            if let authRequiredMessage = noteAuthRequiredIfNeeded(error) {
#if DEBUG || os(macOS)
                setStudioDebugPreferenceString("root_submit_auth_required", forKey: "studio_debug_root_submit_stage")
                setStudioDebugPreferenceString(authRequiredMessage, forKey: "studio_debug_root_submit_error")
#endif
                return authRequiredMessage
            }
            let failureReason = error.localizedDescription
            markBackendUnavailable(reason: failureReason)
            lastIssueSummary = failureReason
#if DEBUG || os(macOS)
            setStudioDebugPreferenceString("root_submit_error", forKey: "studio_debug_root_submit_stage")
            setStudioDebugPreferenceString(failureReason, forKey: "studio_debug_root_submit_error")
#endif
            return failureReason
        }
    }

    @MainActor
    private func finishTypedStudioReplySpeechIfNeeded(
        replyText: String,
        shouldSpeak: Bool
    ) {
        guard shouldSpeak, studioTypedReplyAudioEnabled else {
            typedReplySpeaker.cancel()
            return
        }
        let cleanReply = replyText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanReply.isEmpty else {
            typedReplySpeaker.cancel()
            return
        }
        typedReplySpeaker.finish(finalText: cleanReply)
    }

    private func shouldRetryTalkOnce(for error: Error) -> Bool {
        if error is CancellationError { return false }
        if error is BackendTalkQueuedError { return false }
        if case BackendError.continueListening = error { return false }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut,
                 .networkConnectionLost,
                 .cannotConnectToHost,
                 .cannotFindHost,
                 .dnsLookupFailed,
                 .notConnectedToInternet:
                return true
            default:
                break
            }
        }
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            return [
                NSURLErrorTimedOut,
                NSURLErrorNetworkConnectionLost,
                NSURLErrorCannotConnectToHost,
                NSURLErrorCannotFindHost,
                NSURLErrorDNSLookupFailed,
                NSURLErrorNotConnectedToInternet
            ].contains(nsError.code)
        }
        guard let backendError = error as? BackendError else { return false }
        if backendError.isProviderQuotaExhausted { return false }
        switch backendError {
        case let .http(status, _):
            return status == -1 ||
                status == 408 ||
                status == 425 ||
                status == 429 ||
                (500...599).contains(status)
        case let .stage(stage, message):
            let s = stage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if s == "tts" || s == "chat" || s == "stt" {
                return true
            }
            let m = message.lowercased()
            return m.contains("timed out") ||
                m.contains("timeout") ||
                m.contains("temporar") ||
                m.contains("upstream") ||
                m.contains("network")
        case .emptyAudio:
            return true
        case .invalidAudioType:
            return true
        case .realtimeUnavailable:
            return true
        case .studioRenderQuality:
            return false
        case .continueListening:
            return false
        }
    }

    private func withStudioRenderTimeout<T>(
        seconds: Double = 30,
        operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        let timeoutNanoseconds = UInt64(max(1, seconds) * 1_000_000_000)
        return try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: timeoutNanoseconds)
                throw BackendError.stage("studio_render", "Studio render timed out.")
            }
            guard let result = try await group.next() else {
                throw BackendError.stage("studio_render", "Studio render timed out.")
            }
            group.cancelAll()
            return result
        }
    }

    private func shouldFallbackToNonStreamingStudioRender(for error: Error) -> Bool {
        guard let backendError = error as? BackendError else { return false }
        switch backendError {
        case let .studioRenderQuality(quality, _):
            return quality.permitsSingleFallbackRender
        case let .stage(stage, message):
            let normalizedStage = stage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let normalizedMessage = message.lowercased()
            return normalizedStage == "studio_render" && (
                normalizedMessage.contains("stream response was empty") ||
                normalizedMessage.contains("quality confirmation")
            )
        case let .http(status, message):
            return status == 502 && message.lowercased().contains("stream response was empty")
        default:
            return false
        }
    }

    @MainActor
    private func onTurnCommitted(
        _ commit: BackendTurnCommitSignal?,
        userMessage: String?,
        assistantMessage: String?
    ) async {
        guard let commit else { return }
        let stateKey = commit.stateVersion.isEmpty ? commit.turnId : commit.stateVersion
        guard !stateKey.isEmpty else { return }
        if localStateVersion == stateKey { return }
        if inFlightCommitVersions.contains(stateKey) { return }
        inFlightCommitVersions.insert(stateKey)
        defer { inFlightCommitVersions.remove(stateKey) }

        localStateVersion = stateKey
        await BackendMemoryAPI.shared.onTurnCommittedBarrier(
            turnId: commit.turnId,
            requestId: commit.requestId,
            sessionId: commit.sessionId.isEmpty ? nil : commit.sessionId,
            stateVersion: commit.stateVersion.isEmpty ? nil : commit.stateVersion,
            lastUpdatedAt: commit.lastUpdatedAt > 0 ? commit.lastUpdatedAt : nil,
            historyUpdatedAt: commit.historyUpdatedAt > 0 ? commit.historyUpdatedAt : nil,
            memoryUpdatedAt: commit.memoryUpdatedAt > 0 ? commit.memoryUpdatedAt : nil,
            userMessage: userMessage,
            assistantMessage: assistantMessage
        )
    }

    @MainActor
    private func startBackendHealthMonitoring() {
        guard !IOThemRuntime.isRunningTests else { return }
        backendHealthTask?.cancel()
        backendConnectionState = .checking
        backendFailureCount = 0

        backendHealthTask = Task {
            await refreshBackendHealth()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                await refreshBackendHealth()
            }
        }
    }

    @MainActor
    private func stopBackendHealthMonitoring() {
        backendHealthTask?.cancel()
        backendHealthTask = nil
    }

    @MainActor
    private func startOfflineTalkOutbox() {
        Task { @MainActor in
            await OfflineTalkOutbox.shared.startNetworkMonitoring()
            offlineTalkOutboxSnapshot = await OfflineTalkOutbox.shared.snapshot()
            if offlineTalkOutboxSnapshot.activeCount > 0 {
                _ = await OfflineTalkOutbox.shared.drainDue()
            }
        }
    }

    @MainActor
    private func retryOfflineTalkOutbox() {
        Task { @MainActor in
            offlineTalkOutboxSnapshot = await OfflineTalkOutbox.shared.snapshot()
            guard offlineTalkOutboxSnapshot.activeCount > 0 else { return }
            offlineTalkOutboxSnapshot = await OfflineTalkOutbox.shared.drainDue()
        }
    }

    @MainActor
    private func refreshBackendHealth() async {
        guard !IOThemRuntime.isRunningTests else { return }
        do {
            let health = try await BackendMemoryAPI.shared.fetchHealth()
            lastHealthStatus = health
            let status = health.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let isUp = health.ok && status != "down" && status != "degraded" && status != "error"

            if isUp {
                backendConnectionState = .up
                backendFailureCount = 0
                await refreshOpsRouteManifestIfNeeded(force: false)
                if supportDiagnosticsEnabled {
                    await refreshTalkDiagnostics(force: false)
                }
                offlineTalkOutboxSnapshot = await OfflineTalkOutbox.shared.drainDue()
                return
            }

            markBackendUnavailable(reason: "Backend status: \(health.status)")
        } catch {
            markBackendUnavailable(reason: error.localizedDescription)
        }
    }

    @MainActor
    private func markBackendUnavailable(reason: String) {
        backendFailureCount += 1
        lastIssueSummary = reason
        if backendFailureCount >= 1 {
            backendConnectionState = .reconnecting
        }
    }

    private func authRequiredMessageIfNeeded(for error: Error) -> String? {
        if let backendError = error as? BackendError,
           backendError.requiresUserAuthentication {
            return backendError.localizedDescription
        }
        let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = message.lowercased()
        guard normalized.contains("user_auth_required") ||
              normalized.contains("expired_user_token") ||
              normalized.contains("invalid_user_token") ||
              normalized.contains("revoked_user_token") else {
            return nil
        }
        return "Sign in to use live writing, voice, and visual context."
    }

    @MainActor
    @discardableResult
    private func noteAuthRequiredIfNeeded(_ error: Error) -> String? {
        guard let message = authRequiredMessageIfNeeded(for: error) else { return nil }
        backendConnectionState = .up
        backendFailureCount = 0
        lastIssueSummary = message
        screenplayDraftBridge.autoInsertStatusText = message
        return message
    }

    @MainActor
    private func refreshOpsRouteManifestIfNeeded(force: Bool) async {
        guard !IOThemRuntime.isRunningTests else { return }
        let now = Date()
        if !force,
           let lastRefresh = lastOpsRoutesManifestRefreshedAt,
           now.timeIntervalSince(lastRefresh) < 300 {
            return
        }
        lastOpsRoutesManifestRefreshedAt = now
        do {
            lastOpsRoutesManifest = try await BackendMemoryAPI.shared.fetchOpsRoutesManifest()
            lastOpsRoutesManifestError = ""
        } catch {
            lastOpsRoutesManifestError = error.localizedDescription
        }
    }

    @MainActor
    private func refreshTalkDiagnostics(force: Bool) async {
        guard supportDiagnosticsEnabled else { return }
        guard !IOThemRuntime.isRunningTests else { return }
        let now = Date()
        if !force,
           let lastRefresh = lastTalkDiagnosticsRefreshedAt,
           now.timeIntervalSince(lastRefresh) < 120 {
            return
        }
        isRefreshingTalkDiagnostics = true
        defer { isRefreshingTalkDiagnostics = false }
        do {
            async let stats = BackendMemoryAPI.shared.fetchTalkStats()
            async let errors = BackendMemoryAPI.shared.fetchTalkErrors()
            lastTalkStats = try await stats
            lastTalkErrors = try await errors
            lastTalkDiagnosticsRefreshedAt = Date()
            lastTalkDiagnosticsError = ""
        } catch {
            lastTalkDiagnosticsError = error.localizedDescription
            lastTalkDiagnosticsRefreshedAt = Date()
        }
    }

    @MainActor
    private func updateTransientTurnBanner(from result: BackendTalkResult) {
        if let notice = result.turnMetaRateLimitNotice {
            transientTurnBannerTask?.cancel()
            withAnimation(.easeInOut(duration: 0.18)) {
                transientTurnBannerText = notice.bannerText
            }
            transientTurnBannerTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 5_400_000_000)
                guard !Task.isCancelled else { return }
                withAnimation(.easeInOut(duration: 0.22)) {
                    transientTurnBannerText = nil
                }
            }
            return
        }

        guard result.turnStatus == "error_recovered" else { return }

        let stage = (result.turnErrorStage ?? "response")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let stageLabel: String
        switch stage {
        case "stt":
            stageLabel = "voice capture"
        case "chat":
            stageLabel = "response generation"
        case "tts":
            stageLabel = "voice playback"
        case "upload":
            stageLabel = "audio upload"
        default:
            stageLabel = stage.isEmpty ? "response" : stage
        }

        let fallback = "Recovered after a \(stageLabel) hiccup. Keep going."
        let headerMessage = (result.turnErrorMessage ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedHeader = headerMessage.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        let message = normalizedHeader.isEmpty ? fallback : "Recovered (\(stageLabel)): \(normalizedHeader)"

        transientTurnBannerTask?.cancel()
        withAnimation(.easeInOut(duration: 0.18)) {
            transientTurnBannerText = message
        }
        transientTurnBannerTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_200_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.22)) {
                transientTurnBannerText = nil
            }
        }
    }

    @MainActor
    private func showOfflineTalkOutboxBanner(_ rawMessage: String) {
        let message = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }
        transientTurnBannerTask?.cancel()
        withAnimation(.easeInOut(duration: 0.18)) {
            transientTurnBannerText = message
        }
        transientTurnBannerTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_400_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.22)) {
                transientTurnBannerText = nil
            }
        }
    }

    private func studioVoiceInsertCues(from result: BackendTalkResult) -> [ScreenplayVoiceCue] {
        studioVoiceInsertCues(
            from: result.screenplayCues,
            timeline: studioDialogueTimeline(from: result.dialogueTimeline)
        )
    }

    private func syncedVoiceRenderContract(
        from renderContract: BackendTalkRenderContract
    ) -> ScreenplaySyncedVoiceRenderContract {
        ScreenplaySyncedVoiceRenderContract(
            replyRole: renderContract.previewReplyOnly ? .preview : .final,
            authoritativePageTextAvailable: renderContract.authoritativePageTextAvailable,
            syncReady: renderContract.syncReady
        )
    }

    private func studioVoiceInsertCues(
        from cues: [BackendTalkScreenplayCue],
        timeline: ScreenplayDialogueTimelineRevision? = nil
    ) -> [ScreenplayVoiceCue] {
        if let timeline, !timeline.compatibilityCues.isEmpty {
            return timeline.compatibilityCues.enumerated().map { offset, cue in
                ScreenplayVoiceCue(
                    index: offset,
                    text: cue.text,
                    elementRaw: cue.elementRaw,
                    startMs: cue.startMs,
                    endMs: cue.endMs
                )
            }
        }
        return cues.map { cue in
            ScreenplayVoiceCue(
                index: cue.index,
                text: cue.text,
                elementRaw: cue.element,
                startMs: cue.startMs,
                endMs: cue.endMs
            )
        }
    }

    private func isLegacyStudioParagraphAnchorID(_ value: String) -> Bool {
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        if clean.hasPrefix("line-") {
            return true
        }
        return clean.range(
            of: #":line:\d+$"#,
            options: .regularExpression
        ) != nil
    }

    @MainActor
    private func studioDialogueTimeline(
        from timeline: BackendTalkDialogueTimelineRevision?
    ) -> ScreenplayDialogueTimelineRevision? {
        guard let timeline else { return nil }
        let localAnchorMetadata = resolvedStudioDialogueAnchorMetadata()
        let localBaseLine = max(1, localAnchorMetadata.startLine ?? 1)
        let localDraft = screenplayDraftBridge.structuredDraft
        let localAnchorScriptNodeID = localAnchorMetadata.scriptNodeID
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let localScriptNodeBase = localAnchorScriptNodeID.isEmpty ||
            isLegacyStudioParagraphAnchorID(localAnchorScriptNodeID)
            ? (localAnchorMetadata.documentRevisionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? timeline.revisionId
                : localAnchorMetadata.documentRevisionID.trimmingCharacters(in: .whitespacesAndNewlines))
            : localAnchorScriptNodeID
        func localParagraphId(for absoluteLine: Int) -> String? {
            guard let paragraphId = localDraft.paragraphs.first(where: { $0.line == absoluteLine })?.id else {
                return nil
            }
            let cleanParagraphId = paragraphId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanParagraphId.isEmpty,
                  !isLegacyStudioParagraphAnchorID(cleanParagraphId) else {
                return nil
            }
            return cleanParagraphId
        }
        func localSceneBinding(for absoluteLine: Int) -> ScreenplayProjectSceneBindingSnapshot? {
            guard let scene = localDraft.scenes.last(where: {
                absoluteLine >= $0.line && absoluteLine <= max($0.endLine, $0.line)
            }) ?? localDraft.scenes.last(where: { $0.line <= absoluteLine }) else {
                return nil
            }
            return screenplayDraftBridge.projectBindingSnapshot(forDraftSceneID: scene.id)
        }
        func localSceneId(for absoluteLine: Int) -> String? {
            localSceneBinding(for: absoluteLine)?.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? localSceneBinding(for: absoluteLine)?.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines)
                : (localDraft.scenes.last(where: {
                    absoluteLine >= $0.line && absoluteLine <= max($0.endLine, $0.line)
                }) ?? localDraft.scenes.last(where: { $0.line <= absoluteLine }))?.id
        }
        func localBeatId(for absoluteLine: Int) -> String? {
            localSceneBinding(for: absoluteLine)?.outlineBeatIDs
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .first(where: { !$0.isEmpty })
        }
        func resolvedSceneId(_ existing: String, absoluteLine: Int) -> String {
            let cleanExisting = existing.trimmingCharacters(in: .whitespacesAndNewlines)
            if let resolvedLocalSceneID = localSceneId(for: absoluteLine), !resolvedLocalSceneID.isEmpty &&
                (cleanExisting.isEmpty || cleanExisting.hasPrefix("scene:")) {
                return resolvedLocalSceneID
            }
            if !localAnchorMetadata.draftSceneID.isEmpty &&
                (cleanExisting.isEmpty || cleanExisting.hasPrefix("scene:")) {
                return localAnchorMetadata.draftSceneID
            }
            return cleanExisting
        }
        func resolvedBeatId(_ existing: String?, absoluteLine: Int) -> String? {
            let cleanExisting = (existing ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleanExisting.isEmpty {
                return cleanExisting
            }
            return localBeatId(for: absoluteLine) ?? localAnchorMetadata.outlineBeatIDs.first
        }
        func resolvedScriptNodeId(_ existing: String, absoluteLine: Int, isInsertionAnchor: Bool) -> String {
            if let paragraphId = localParagraphId(for: absoluteLine), !paragraphId.isEmpty {
                return paragraphId
            }
            let cleanExisting = existing.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleanExisting.isEmpty &&
                !isLegacyStudioParagraphAnchorID(cleanExisting) &&
                !cleanExisting.contains(":node:") &&
                !cleanExisting.hasSuffix(":root") &&
                !cleanExisting.contains(":segment:") &&
                cleanExisting.range(of: #":line:\d+$"#, options: .regularExpression) == nil {
                return cleanExisting
            }
            if isInsertionAnchor &&
                !localAnchorScriptNodeID.isEmpty &&
                !isLegacyStudioParagraphAnchorID(localAnchorScriptNodeID) {
                return localAnchorScriptNodeID
            }
            let ordinal = max(1, absoluteLine - localBaseLine + 1)
            return "\(localScriptNodeBase):segment:\(ordinal)"
        }
        func resolvedLineId(_ existing: String, absoluteLine: Int) -> String {
            if let paragraphId = localParagraphId(for: absoluteLine), !paragraphId.isEmpty {
                return paragraphId
            }
            let cleanExisting = existing.trimmingCharacters(in: .whitespacesAndNewlines)
            if cleanExisting.isEmpty ||
                cleanExisting.hasPrefix(timeline.revisionId) ||
                isLegacyStudioParagraphAnchorID(cleanExisting) {
                let ordinal = max(1, absoluteLine - localBaseLine + 1)
                return "\(localScriptNodeBase):line:\(ordinal)"
            }
            return cleanExisting
        }
        return ScreenplayDialogueTimelineRevision(
            turnId: timeline.turnId,
            revisionId: timeline.revisionId,
            audioAssetId: timeline.audioAssetId,
            durationMs: timeline.durationMs,
            documentRevisionId: timeline.documentRevisionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? localAnchorMetadata.documentRevisionID
                : timeline.documentRevisionId,
            insertionAnchor: ScreenplayPageAnchor(
                projectId: timeline.insertionAnchor.projectId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
                    : timeline.insertionAnchor.projectId,
                sceneId: resolvedSceneId(timeline.insertionAnchor.sceneId, absoluteLine: localBaseLine),
                beatId: resolvedBeatId(timeline.insertionAnchor.beatId, absoluteLine: localBaseLine),
                scriptNodeId: resolvedScriptNodeId(
                    timeline.insertionAnchor.scriptNodeId,
                    absoluteLine: localBaseLine,
                    isInsertionAnchor: true
                ),
                pageIndex: timeline.insertionAnchor.pageIndex,
                rangeStart: timeline.insertionAnchor.rangeStart,
                rangeEnd: timeline.insertionAnchor.rangeEnd,
                anchorLine: timeline.insertionAnchor.anchorLine ?? localBaseLine,
                anchorEndLine: timeline.insertionAnchor.anchorEndLine ?? localAnchorMetadata.endLine ?? localBaseLine,
                insertMode: timeline.insertionAnchor.insertMode
            ),
            segments: timeline.segments.enumerated().map { index, segment in
                let absoluteLine = localBaseLine + index
                return ScreenplayDialogueSegment(
                    id: segment.id,
                    lineId: resolvedLineId(segment.lineId, absoluteLine: absoluteLine),
                    kind: ScreenplayDialogueSegmentKind(rawValue: segment.kind.lowercased()) ?? .action,
                    text: segment.text,
                    startMs: segment.startMs,
                    endMs: segment.endMs,
                    pageAnchor: ScreenplayPageAnchor(
                        projectId: segment.pageAnchor.projectId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
                            : segment.pageAnchor.projectId,
                        sceneId: resolvedSceneId(segment.pageAnchor.sceneId, absoluteLine: absoluteLine),
                        beatId: resolvedBeatId(segment.pageAnchor.beatId, absoluteLine: absoluteLine),
                        scriptNodeId: resolvedScriptNodeId(
                            segment.pageAnchor.scriptNodeId,
                            absoluteLine: absoluteLine,
                            isInsertionAnchor: false
                        ),
                        pageIndex: segment.pageAnchor.pageIndex,
                        rangeStart: segment.pageAnchor.rangeStart,
                        rangeEnd: segment.pageAnchor.rangeEnd,
                        anchorLine: segment.pageAnchor.anchorLine ?? absoluteLine,
                        anchorEndLine: segment.pageAnchor.anchorEndLine ?? absoluteLine,
                        insertMode: segment.pageAnchor.insertMode
                    ),
                    revealUnits: segment.revealUnits.map { unit in
                        ScreenplayRevealUnit(
                            id: unit.id,
                            text: unit.text,
                            startMs: unit.startMs,
                            endMs: unit.endMs,
                            utf16Start: unit.utf16Start,
                            utf16End: unit.utf16End
                        )
                    }
                )
            }
        )
    }

    private func audioDurationSeconds(at url: URL) -> TimeInterval? {
        do {
            let file = try AVAudioFile(forReading: url)
            let sampleRate = file.processingFormat.sampleRate
            guard sampleRate > 0 else { return nil }
            return TimeInterval(file.length) / sampleRate
        } catch {
            return nil
        }
    }

    private func estimatedStudioSpeechDurationSeconds(for text: String) -> TimeInterval {
        let wordCount = max(1, text.split { $0.isWhitespace || $0.isNewline }.count)
        let effectivePace = max(clementineSpeakingPace, 0.55)
        let wordsPerMinute = max(92.0, 148.0 * effectivePace)
        let speechSeconds = (Double(wordCount) / wordsPerMinute) * 60.0
        let lineFloor = Double(max(1, text.components(separatedBy: "\n").count)) * 0.42
        return max(speechSeconds, lineFloor, 0.75)
    }

    private func resolvedStudioVoiceInsertDuration(
        for text: String,
        audioURL: URL?,
        backendDurationMs: Int?
    ) -> TimeInterval {
        let audioDuration = audioURL.flatMap(audioDurationSeconds(at:))
        let backendDuration = backendDurationMs.map { TimeInterval($0) / 1_000.0 }
        let estimatedDuration = estimatedStudioSpeechDurationSeconds(for: text)
        return max(audioDuration ?? 0, backendDuration ?? 0, estimatedDuration)
    }

    @MainActor
    private func commitLiveScreenplayPreview(
        textToInsert: String,
        pack: String,
        phase: String,
        projectId: String,
        versionId: String,
        userTranscript: String = "",
        promptSource: ScreenplayStudioUserPrompt.Source = .voice
    ) -> String {
        let cleanText = textToInsert.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanText.isEmpty else { return "" }
        if let lastCommittedWrite = screenplayDraftBridge.lastCommittedWrite {
            let committedText = lastCommittedWrite.insertedText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !committedText.isEmpty,
               committedText == cleanText,
               abs(lastCommittedWrite.committedAt.timeIntervalSinceNow) < 8 {
                liveScreenplayText = committedText
                liveScreenplayUpdatedAt = Date()
                return committedText
            }
        }

        let cleanPack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProject = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersion = versionId.trimmingCharacters(in: .whitespacesAndNewlines)

        liveScreenplayPack = cleanPack
        liveScreenplayPhase = cleanPhase
        liveScreenplayProjectID = cleanProject
        liveScreenplayVersionID = cleanVersion
        liveScreenplayText = cleanText
        liveScreenplayUpdatedAt = Date()

        let draftForStudio = mergedStudioDraft(
            existing: screenplayDraftBridge.previewFormattingBaseDraft,
            insertion: cleanText
        )
        if screenplayDraftBridge.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            screenplayDraftBridge.draftText = draftForStudio
        }

        if screenplayDraftBridge.isStreamingDraftPreviewActive {
            screenplayDraftBridge.commitStreamingVoiceTurn(
                cleanText,
                pack: cleanPack,
                phase: cleanPhase,
                projectId: cleanProject,
                versionId: cleanVersion,
                userTranscript: userTranscript,
                forceInsert: promptSource == .typed
            )
        } else {
            screenplayDraftBridge.ingestVoiceTurn(
                cleanText,
                pack: cleanPack,
                phase: cleanPhase,
                projectId: cleanProject,
                versionId: cleanVersion,
                userTranscript: userTranscript,
                forceInsert: promptSource == .typed
            )
        }

        autoCreateStudioProjectIfNeeded(
            draft: draftForStudio,
            pack: cleanPack,
            phase: cleanPhase,
            existingProjectID: cleanProject
        )
        return cleanText
    }

    @MainActor
    private func commitCurrentStudioPagePreviewIfNeeded(
        preferredText: String? = nil,
        userTranscript: String = "",
        promptSource: ScreenplayStudioUserPrompt.Source = .voice
    ) -> String? {
        guard isStudioSurfaceActive else { return nil }
        let candidate = (preferredText ?? liveScreenplayText)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !candidate.isEmpty else { return nil }

        if let lastCommittedWrite = screenplayDraftBridge.lastCommittedWrite {
            let committedText = lastCommittedWrite.insertedText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !committedText.isEmpty,
               committedText == candidate,
               abs(lastCommittedWrite.committedAt.timeIntervalSinceNow) < 8 {
                return committedText
            }
        }

        let cleanPack = screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPack.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhase = screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProject = screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersion = screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let committedText = commitLiveScreenplayPreview(
            textToInsert: candidate,
            pack: cleanPack,
            phase: cleanPhase,
            projectId: cleanProject,
            versionId: cleanVersion,
            userTranscript: userTranscript,
            promptSource: promptSource
        )
        return committedText.isEmpty ? nil : committedText
    }

    @MainActor
    private func applyLiveScreenplayPreviewFromRawReply(
        _ rawReply: String,
        userTranscript: String = "",
        memoryDomainOverride: StudioMemoryDomain? = nil
    ) -> String? {
        guard isStudioSurfaceActive else { return nil }

        let cleanPack = screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPack.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhase = screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProject = screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersion = screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let textToInsert = resolvedStudioScreenplayInsertionText(
            reply: rawReply,
            userMessage: "",
            existingDraft: screenplayDraftBridge.previewFormattingBaseDraft,
            forceWriteToPage: true,
            memoryDomainOverride: memoryDomainOverride,
            preferredTargetOverride: .page
        ) else {
            return nil
        }

        liveScreenplayText = textToInsert
        liveScreenplayUpdatedAt = Date()
        screenplayDraftBridge.latestUserTranscript = userTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        screenplayDraftBridge.latestVoiceTurn = textToInsert
        screenplayDraftBridge.latestPack = cleanPack
        screenplayDraftBridge.latestPhase = cleanPhase
        screenplayDraftBridge.preferredProjectID = cleanProject
        screenplayDraftBridge.preferredVersionID = cleanVersion
        screenplayDraftBridge.lastUpdatedAt = Date()
        screenplayDraftBridge.cancelStreamingVoiceTurnPreview()
        screenplayDraftBridge.autoInsertStatusText = "io.them is preparing the page..."
        return textToInsert
    }

    @MainActor
    private func applyLiveScreenplayPreview(
        from result: BackendTalkResult,
        promptSource: ScreenplayStudioUserPrompt.Source = .voice,
        memoryDomainOverride: StudioMemoryDomain? = nil,
        preferredTargetOverride: ScreenplayStudioScreen.PromptRoutingMode = .automatic,
        skipCommitIfMatchesActiveText: String? = nil,
        allowImmediateCommit: Bool = true,
        requireAuthoritativePageOutput: Bool = false
    ) -> String? {
        let trace = result.screenplayTrace
        guard trace.modeEnabled || result.screenplayOutput != nil else { return nil }

        let cleanPack = trace.pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhase = trace.phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProject = (trace.projectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersion = (trace.versionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanReply = (result.reply ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        liveScreenplayPack = cleanPack
        liveScreenplayPhase = cleanPhase
        liveScreenplayProjectID = cleanProject
        liveScreenplayVersionID = cleanVersion

        guard trace.hasRenderableOutput || result.screenplayOutput?.writesToPage == true else { return nil }
        guard !cleanReply.isEmpty || result.screenplayOutput?.writesToPage == true else { return nil }
        if requireAuthoritativePageOutput, result.screenplayOutput?.writesToPage != true {
            return nil
        }

        guard let textToInsert = resolvedStudioScreenplayInsertionText(
            reply: cleanReply,
            userMessage: result.transcript ?? "",
            existingDraft: screenplayDraftBridge.previewFormattingBaseDraft,
            screenplayOutput: result.screenplayOutput,
            memoryDomainOverride: memoryDomainOverride,
            preferredTargetOverride: preferredTargetOverride
        ) else {
            restoreRealtimeStudioDraftPreview()
            return nil
        }

        liveScreenplayText = textToInsert
        liveScreenplayUpdatedAt = Date()

        let activeText = skipCommitIfMatchesActiveText?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !activeText.isEmpty, activeText == textToInsert {
            screenplayDraftBridge.latestVoiceTurn = textToInsert
            screenplayDraftBridge.latestPack = cleanPack
            screenplayDraftBridge.latestPhase = cleanPhase
            screenplayDraftBridge.latestUserTranscript = (result.transcript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            screenplayDraftBridge.preferredProjectID = cleanProject
            screenplayDraftBridge.preferredVersionID = cleanVersion
            screenplayDraftBridge.lastUpdatedAt = Date()
            return textToInsert
        }

        if !allowImmediateCommit {
            screenplayDraftBridge.latestVoiceTurn = textToInsert
            screenplayDraftBridge.latestPack = cleanPack
            screenplayDraftBridge.latestPhase = cleanPhase
            screenplayDraftBridge.latestUserTranscript = (result.transcript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            screenplayDraftBridge.preferredProjectID = cleanProject
            screenplayDraftBridge.preferredVersionID = cleanVersion
            screenplayDraftBridge.lastUpdatedAt = Date()
            return textToInsert
        }

        let committedText = commitLiveScreenplayPreview(
            textToInsert: textToInsert,
            pack: cleanPack,
            phase: cleanPhase,
            projectId: cleanProject,
            versionId: cleanVersion,
            userTranscript: result.transcript ?? "",
            promptSource: promptSource
        )
        return committedText.isEmpty ? nil : committedText
    }

    private func resolvedStudioScreenplayInsertionText(
        reply: String,
        userMessage: String,
        existingDraft: String,
        screenplayOutput: BackendTalkScreenplayOutput? = nil,
        forceWriteToPage: Bool = false,
        memoryDomainOverride: StudioMemoryDomain? = nil,
        preferredTargetOverride: ScreenplayStudioScreen.PromptRoutingMode = .automatic
    ) -> String? {
        let cleanReply = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        let typedReply = screenplayOutput?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !cleanReply.isEmpty || !typedReply.isEmpty else { return nil }
        let effectivePreferredTarget: ScreenplayStudioScreen.PromptRoutingMode =
            forceWriteToPage ? .page : preferredTargetOverride
        let effectiveMemoryDomain = memoryDomainOverride ?? studioMemoryDomain(
            for: userMessage,
            preferredTarget: effectivePreferredTarget
        )
        if effectivePreferredTarget == .voicePin && screenplayOutput?.writesToPage != true {
            return nil
        }
        if effectiveMemoryDomain == .companion && screenplayOutput?.writesToPage != true {
            return nil
        }

        if let screenplayOutput {
            let outputTarget = screenplayOutput.target
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            if outputTarget == "voice_pin" || outputTarget == "voicepin" || !screenplayOutput.writesToPage {
                return nil
            }
            let replacementTarget = isStudioSurfaceActive
                ? (screenplayDraftBridge.pendingReplacementTarget ?? screenplayDraftBridge.submittedReplacementTarget)
                : nil
            let typedTextToInsert: String
            if let replacementTarget {
                typedTextToInsert = normalizedStudioReplacementInsertionText(
                    rawReply: typedReply,
                    formattedReply: typedReply,
                    replacementTarget: replacementTarget
                )
            } else {
                typedTextToInsert = typedReply
            }
            let cleanedTypedInsertion = typedTextToInsert.trimmingCharacters(in: .whitespacesAndNewlines)
            return cleanedTypedInsertion.isEmpty ? nil : cleanedTypedInsertion
        }

        let replacementTarget = isStudioSurfaceActive
            ? (screenplayDraftBridge.pendingReplacementTarget ?? screenplayDraftBridge.submittedReplacementTarget)
            : nil
        let normalizationDraft = replacementTarget?.currentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? replacementTarget?.currentText ?? existingDraft
            : existingDraft
        let formattedReply = FountainFormatter.normalizeHollywoodDraft(
            cleanReply,
            existingDraft: normalizationDraft
        )
        let explicitPageWriteIntent = forceWriteToPage || shouldRouteStudioPromptToPage(
            userMessage,
            preferredTarget: effectivePreferredTarget
        )
        let collaborationIntent = forceWriteToPage ? false : shouldTreatStudioPromptAsCollaboration(
            userMessage,
            preferredTarget: effectivePreferredTarget
        )
        if collaborationIntent && effectiveMemoryDomain != .project {
            return nil
        }
        let allowActionOnly = effectiveMemoryDomain == .project && (forceWriteToPage || explicitPageWriteIntent)
        let shouldWriteOnPage = FountainFormatter.isStrongStudioPageWriteCandidate(
            formattedReply,
            allowActionOnly: allowActionOnly
        )

        guard shouldWriteOnPage else { return nil }

        let textToInsert: String
        if isStudioSurfaceActive {
            if let replacementTarget {
                textToInsert = normalizedStudioReplacementInsertionText(
                    rawReply: cleanReply,
                    formattedReply: formattedReply,
                    replacementTarget: replacementTarget
                )
            } else {
                textToInsert = formattedReply
            }
        } else {
            textToInsert = cleanReply
        }
        let cleanedInsertion = textToInsert.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleanedInsertion.isEmpty ? nil : cleanedInsertion
    }

    private func normalizedStudioReplacementInsertionText(
        rawReply: String,
        formattedReply: String,
        replacementTarget: ScreenplayPendingReplacementTarget
    ) -> String {
        let targetText = replacementTarget.currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        let targetIncludesHeading = studioBlockContainsSceneHeading(targetText)
        var candidate = FountainFormatter.normalizePastedScreenplayBlock(
            rawReply,
            existingDraft: targetText
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)

        if candidate.isEmpty {
            candidate = formattedReply.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if !targetIncludesHeading {
            candidate = studioStrippingLeadingSceneHeading(from: candidate)
        }

        if !candidate.isEmpty {
            candidate = FountainFormatter.normalizePastedScreenplayBlock(
                candidate,
                existingDraft: targetText
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
        }

        if candidate.isEmpty {
            candidate = formattedReply.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if !targetIncludesHeading {
            candidate = studioStrippingLeadingSceneHeading(from: candidate)
        }
        return candidate.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func studioBlockContainsSceneHeading(_ text: String) -> Bool {
        let lines = text
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return lines.contains(where: studioLooksLikeSceneHeading)
    }

    private func studioLooksLikeSceneHeading(_ line: String) -> Bool {
        let upper = line.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !upper.isEmpty else { return false }
        return upper.hasPrefix("INT.")
            || upper.hasPrefix("EXT.")
            || upper.hasPrefix("INT/EXT.")
            || upper.hasPrefix("I/E.")
    }

    private func studioStrippingLeadingSceneHeading(from text: String) -> String {
        let lines = text.components(separatedBy: "\n")
        guard let firstContentIndex = lines.firstIndex(where: {
            !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) else {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard studioLooksLikeSceneHeading(lines[firstContentIndex]) else {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        var startIndex = firstContentIndex + 1
        while startIndex < lines.count,
              lines[startIndex].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            startIndex += 1
        }
        guard startIndex < lines.count else {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return lines[startIndex...]
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func currentRealtimeStudioScreenplayTrace() -> BackendTalkScreenplayTrace {
        let pack = screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveScreenplayPack.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
        let phaseHint = screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveScreenplayPhase.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
        let phase = phaseHint.isEmpty ? "scene_draft" : phaseHint
        let projectId = screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveScreenplayProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let versionId = screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveScreenplayVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines)

        return BackendTalkScreenplayTrace(
            modeEnabled: true,
            phase: phase,
            pack: pack,
            packLock: false,
            projectId: projectId.isEmpty ? nil : projectId,
            versionId: versionId.isEmpty ? nil : versionId
        )
    }

    private func makeRealtimeStudioTalkResult(
        userMessage: String,
        assistantMessage: String
    ) -> BackendTalkResult {
        BackendTalkResult(
            audioURL: URL(fileURLWithPath: "/dev/null"),
            streamedFirstSegment: false,
            streamedRemainderURL: nil,
            audioDurationMs: nil,
            renderContract: .default,
            timingSource: nil,
            transcript: userMessage,
            reply: assistantMessage,
            screenplayOutput: nil,
            screenplayQuality: nil,
            screenplayCues: [],
            dialogueTimeline: nil,
            assistantSelfName: nil,
            userName: evolution.preferredName,
            voiceEmotionLane: lastClementineEmotionLane,
            ttsVoice: nil,
            uiReflection: uiReflection,
            knowledgeTrace: .empty,
            creativeMemoryTrace: .empty,
            screenplayTrace: currentRealtimeStudioScreenplayTrace(),
            turnStatus: "responded",
            turnContinueReason: nil,
            turnErrorStage: nil,
            turnErrorMessage: nil,
            noteAction: nil,
            taskAction: nil,
            speculativeTrace: .none,
            turnMetaRateLimitNotice: nil,
            commit: nil
        )
    }

    private func sanitizedRealtimeStudioRenderReply(_ reply: String) -> String {
        var clean = reply
            .replacingOccurrences(of: "\\r\\n", with: "\n")
            .replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.hasPrefix("```") {
            clean = clean.replacingOccurrences(
                of: #"^```[A-Za-z0-9_-]*\s*"#,
                with: "",
                options: .regularExpression
            )
            clean = clean.replacingOccurrences(
                of: #"\s*```$"#,
                with: "",
                options: .regularExpression
            )
        }
        return clean.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    @MainActor
    private func applyRealtimeStudioScreenplayQuality(
        _ quality: BackendRealtimeStudioScreenplayQuality?
    ) {
        guard let quality else { return }
        screenplayDraftBridge.updateScreenplayQualityStatus(
            quality: quality.talkQuality,
            output: nil
        )
    }

    @MainActor
    private func restoreRealtimeStudioDraftPreview(statusText: String? = nil) {
        let wasPreviewActive = screenplayDraftBridge.isStreamingDraftPreviewActive
        let baseDraft = wasPreviewActive
            ? screenplayDraftBridge.previewFormattingBaseDraft
            : nil
        screenplayDraftBridge.cancelStreamingVoiceTurnPreview()
        if let baseDraft {
            liveScreenplayText = baseDraft
            liveScreenplayUpdatedAt = Date()
        }
        if let statusText {
            let cleanStatus = statusText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleanStatus.isEmpty {
                screenplayDraftBridge.autoInsertStatusText = cleanStatus
            }
        }
    }

    @MainActor
    @discardableResult
    private func handleRealtimeStudioQualityFailure(
        _ error: Error,
        restorePreview: Bool = true
    ) -> String? {
        guard let backendError = error as? BackendError,
              case let .studioRenderQuality(quality, _) = backendError else { return nil }
        if restorePreview {
            restoreRealtimeStudioDraftPreview()
        }
        applyRealtimeStudioScreenplayQuality(quality)
        backendConnectionState = .up
        backendFailureCount = 0
        let notice = "Page held back. Your draft is unchanged."
        lastIssueSummary = error.localizedDescription
        screenplayDraftBridge.autoInsertStatusText = notice
        showStudioCommandNotice(notice)
        return error.localizedDescription
    }

    @MainActor
    private func applyRealtimeStudioDraftPreview(
        userMessage: String,
        assistantMessage: String
    ) {
        guard isStudioSurfaceActive else { return }
        let trace = currentRealtimeStudioScreenplayTrace()
        let cleanReply = sanitizedRealtimeStudioRenderReply(assistantMessage)
        guard let textToPreview = resolvedStudioScreenplayInsertionText(
            reply: cleanReply,
            userMessage: userMessage,
            existingDraft: screenplayDraftBridge.previewFormattingBaseDraft
        ) else {
            restoreRealtimeStudioDraftPreview()
            return
        }

        let cleanPack = trace.pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhase = trace.phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProject = (trace.projectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersion = (trace.versionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        liveScreenplayPack = cleanPack
        liveScreenplayPhase = cleanPhase
        liveScreenplayProjectID = cleanProject
        liveScreenplayVersionID = cleanVersion
        liveScreenplayText = textToPreview
        liveScreenplayUpdatedAt = Date()
        screenplayDraftBridge.previewVoiceTurn(
            textToPreview,
            pack: cleanPack,
            phase: cleanPhase,
            projectId: cleanProject,
            versionId: cleanVersion
        )
    }

    @MainActor
    private func resetRealtimeStudioDraftPreviewThrottle() {
        lastRealtimeStudioPreviewAt = .distantPast
        lastRealtimeStudioPreviewCharacterCount = 0
    }

    @MainActor
    private func shouldApplyRealtimeStudioDraftPreview(
        _ assistantMessage: String,
        force: Bool = false
    ) -> Bool {
        let cleanReply = sanitizedRealtimeStudioRenderReply(assistantMessage)
        guard !cleanReply.isEmpty else { return false }
        if force {
            lastRealtimeStudioPreviewAt = Date()
            lastRealtimeStudioPreviewCharacterCount = cleanReply.count
            return true
        }
        let now = Date()
        let characterDelta = cleanReply.count - lastRealtimeStudioPreviewCharacterCount
        guard lastRealtimeStudioPreviewCharacterCount == 0 ||
                characterDelta >= StudioResponseStreamingPolicy.pagePreviewCharacterDelta ||
                now.timeIntervalSince(lastRealtimeStudioPreviewAt) >= StudioResponseStreamingPolicy.pagePreviewMaximumInterval else {
            return false
        }
        lastRealtimeStudioPreviewAt = now
        lastRealtimeStudioPreviewCharacterCount = cleanReply.count
        return true
    }

    @MainActor
    private func commitActiveRealtimeStudioDraftPreviewIfNeeded() -> String? {
        guard isStudioSurfaceActive else { return nil }
        guard screenplayDraftBridge.isStreamingDraftPreviewActive else { return nil }
        let cleanUser = realtimeStudioRenderUserMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanReply = sanitizedRealtimeStudioRenderReply(realtimeStudioRenderedReply)
        guard !cleanUser.isEmpty, !cleanReply.isEmpty else { return nil }

        guard let textToCommit = resolvedStudioScreenplayInsertionText(
            reply: cleanReply,
            userMessage: cleanUser,
            existingDraft: screenplayDraftBridge.previewFormattingBaseDraft
        ) else {
            return nil
        }

        let trace = currentRealtimeStudioScreenplayTrace()
        let cleanPack = trace.pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhase = trace.phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProject = (trace.projectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersion = (trace.versionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        liveScreenplayPack = cleanPack
        liveScreenplayPhase = cleanPhase
        liveScreenplayProjectID = cleanProject
        liveScreenplayVersionID = cleanVersion
        liveScreenplayText = textToCommit
        liveScreenplayUpdatedAt = Date()
        screenplayDraftBridge.commitStreamingVoiceTurn(
            textToCommit,
            pack: cleanPack,
            phase: cleanPhase,
            projectId: cleanProject,
            versionId: cleanVersion
        )
        return textToCommit
    }

    @MainActor
    private func cancelRealtimeStudioDraftStream(
        restorePreview: Bool,
        debugVoiceTurnToken: Int? = nil,
        promptPreviewOverride: String? = nil
    ) {
        let shouldRecordBreadcrumb =
            realtimeStudioRenderTask != nil ||
            !realtimeStudioRenderUserMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !realtimeStudioRenderedReply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        realtimeStudioRenderTask?.cancel()
        realtimeStudioRenderTask = nil
        realtimeStudioRenderUserMessage = ""
        realtimeStudioRenderedReply = ""
        resetRealtimeStudioDraftPreviewThrottle()
        if restorePreview {
            restoreRealtimeStudioDraftPreview()
        }
#if DEBUG || os(macOS)
        if shouldRecordBreadcrumb {
            appendStudioDebugVoiceDraftBreadcrumb(
                event: restorePreview ? "request_cancelled" : "request_cleared",
                detail: restorePreview ? "Early Studio draft stream cancelled and preview restored." : "Early Studio draft stream cleared after final turn result.",
                restorePreview: restorePreview,
                tokenOverride: debugVoiceTurnToken,
                promptPreviewOverride: promptPreviewOverride
            )
        }
#endif
    }

    @MainActor
    private func startRealtimeStudioDraftStreamIfNeeded(
        for userMessage: String,
        debugVoiceTurnToken: Int? = nil
    ) {
        let cleanUser = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isStudioSurfaceActive else { return }
        guard !cleanUser.isEmpty else { return }
        // Reuse the same incremental Studio render path for both realtime-preview
        // and turn-based voice turns when we have enough transcript text to treat
        // the utterance as a draft-page write.
        let confirmedContext = confirmedStudioPageWriteContext(for: cleanUser)
        let renderTranscript = studioRenderTranscript(
            for: cleanUser,
            confirmedContext: confirmedContext
        )

        cancelRealtimeStudioDraftStream(
            restorePreview: true,
            debugVoiceTurnToken: debugVoiceTurnToken,
            promptPreviewOverride: cleanUser
        )
        realtimeStudioRenderUserMessage = cleanUser
        realtimeStudioRenderedReply = ""
        resetRealtimeStudioDraftPreviewThrottle()
#if DEBUG || os(macOS)
        appendStudioDebugVoiceDraftBreadcrumb(
            event: "request_started",
            detail: "Early Studio draft stream started.",
            tokenOverride: debugVoiceTurnToken,
            promptPreviewOverride: cleanUser
        )
#endif
        if let placeholderReply = realtimeStudioDraftPlaceholderReply(
            userMessage: cleanUser,
            confirmedContext: confirmedContext
        ) {
            applyRealtimeStudioDraftPreview(
                userMessage: cleanUser,
                assistantMessage: placeholderReply
            )
#if DEBUG || os(macOS)
            appendStudioDebugVoiceDraftBreadcrumb(
                event: "placeholder_inserted",
                detail: "Inserted transcript-derived placeholder while waiting for Studio render stream.",
                replyPreview: String(placeholderReply.prefix(220)),
                tokenOverride: debugVoiceTurnToken,
                promptPreviewOverride: cleanUser
            )
#endif
        }

        realtimeStudioRenderTask = Task { @MainActor in
            let systemPrompt = await buildRealtimeBootstrapSystemPrompt(isScreenplayMode: true)
            let studioRenderMetadata = studioRenderRequestMetadata(
                promptSource: .voice,
                shouldWriteToPage: true
            )
            do {
#if DEBUG || os(macOS)
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "render_request_started",
                    detail: "Studio draft render request started.",
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: cleanUser
                )
#endif
                let renderResult = try await backend.streamRealtimeStudioResult(
                    transcript: renderTranscript,
                    systemPrompt: systemPrompt,
                    screenplayTarget: "page",
                    studioMetadata: studioRenderMetadata,
                    onPartial: { partial in
                        await MainActor.run {
                            guard self.realtimeStudioRenderUserMessage == cleanUser else { return }
                            self.realtimeStudioRenderedReply = partial
#if DEBUG || os(macOS)
                            let hasRecordedFirstPartial = self.currentStudioDebugVoiceDraftBreadcrumbs().contains {
                                $0.token == (debugVoiceTurnToken ?? self.activeStudioDebugVoiceTurnToken ?? 0) &&
                                $0.event == "render_partial_received"
                            }
                            if !hasRecordedFirstPartial,
                               !partial.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                self.appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "render_partial_received",
                                    detail: "Studio draft render produced the first partial.",
                                    replyPreview: String(partial.prefix(220)),
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: cleanUser
                                )
                            }
#endif
                            guard self.shouldApplyRealtimeStudioDraftPreview(partial) else { return }
                            self.applyRealtimeStudioDraftPreview(
                                userMessage: cleanUser,
                                assistantMessage: partial
                            )
                        }
                    },
                    onTrace: { trace in
                        await MainActor.run {
                            guard self.realtimeStudioRenderUserMessage == cleanUser else { return }
                            if let memoryApplied = trace.memoryApplied {
                                self.screenplayDraftBridge.noteStudioAppliedMemory(
                                    memoryApplied,
                                    source: "voice_stream_\(trace.kind)"
                                )
                            }
#if DEBUG || os(macOS)
                            let cleanKind = trace.kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                            let requestID = trace.requestID.trimmingCharacters(in: .whitespacesAndNewlines)
                            switch cleanKind {
                            case "meta":
                                self.appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "render_stream_meta_received",
                                    detail: requestID.isEmpty
                                        ? "Studio render stream metadata received."
                                        : "Studio render stream metadata received. request_id=\(requestID)",
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: cleanUser
                                )
                            case "first_delta":
                                let firstDeltaMs = trace.firstDeltaMs.map(String.init) ?? "unknown"
                                self.appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "render_stream_first_delta_server",
                                    detail: requestID.isEmpty
                                        ? "Studio render server emitted first delta at \(firstDeltaMs)ms."
                                        : "Studio render server emitted first delta at \(firstDeltaMs)ms. request_id=\(requestID)",
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: cleanUser
                                )
                                if let debugVoiceTurnToken {
                                    self.persistStudioDebugVoiceTurnProgress(
                                        token: debugVoiceTurnToken,
                                        prompt: cleanUser,
                                        turnID: "",
                                        insertedPreview: String(self.liveScreenplayText.prefix(220)),
                                        replyPreview: String(self.realtimeStudioRenderedReply.prefix(220))
                                    )
                                }
                            case "done":
                                let totalMs = trace.totalMs.map(String.init) ?? "unknown"
                                self.appendStudioDebugVoiceDraftBreadcrumb(
                                    event: "render_stream_done_server",
                                    detail: requestID.isEmpty
                                        ? "Studio render server completed in \(totalMs)ms."
                                        : "Studio render server completed in \(totalMs)ms. request_id=\(requestID)",
                                    tokenOverride: debugVoiceTurnToken,
                                    promptPreviewOverride: cleanUser
                                )
                            default:
                                break
                            }
#endif
                        }
                    }
                )
                applyRealtimeStudioScreenplayQuality(renderResult.screenplayQuality)
                screenplayDraftBridge.noteStudioAppliedMemory(
                    renderResult.memoryApplied,
                    source: "voice_stream_done"
                )
                let sanitizedReply = sanitizedRealtimeStudioRenderReply(renderResult.reply)
                realtimeStudioRenderedReply = sanitizedReply
#if DEBUG || os(macOS)
                appendStudioDebugVoiceDraftBreadcrumb(
                    event: "render_response_received",
                    detail: "Studio draft render response completed.",
                    replyPreview: String(sanitizedReply.prefix(220)),
                    tokenOverride: debugVoiceTurnToken,
                    promptPreviewOverride: cleanUser
                )
#endif
                if let committedPreviewText = commitActiveRealtimeStudioDraftPreviewIfNeeded() {
#if DEBUG || os(macOS)
                    appendStudioDebugVoiceDraftBreadcrumb(
                        event: "request_committed",
                        detail: "Early Studio draft preview committed to the page.",
                        replyPreview: String(committedPreviewText.prefix(220)),
                        tokenOverride: debugVoiceTurnToken,
                        promptPreviewOverride: cleanUser
                    )
                    if let debugVoiceTurnToken {
                        persistStudioDebugVoiceTurnProgress(
                            token: debugVoiceTurnToken,
                            prompt: cleanUser,
                            turnID: "",
                            insertedPreview: String(committedPreviewText.prefix(220)),
                            replyPreview: String(sanitizedReply.prefix(220))
                        )
                    }
#endif
                    let realtimeStudioResult = self.makeRealtimeStudioTalkResult(
                        userMessage: cleanUser,
                        assistantMessage: sanitizedReply
                    )
                    self.updateStudioAssistantPin(
                        from: realtimeStudioResult,
                        insertedText: committedPreviewText,
                        promptSource: .voice,
                        promptTextOverride: cleanUser,
                        promptTargetOverride: .page,
                        shouldRecordPrompt: false
                    )
                }
                return sanitizedReply
            } catch is CancellationError {
                return nil
            } catch {
                if noteAuthRequiredIfNeeded(error) != nil {
                    restoreRealtimeStudioDraftPreview()
                    return nil
                }
                if shouldFallbackToNonStreamingStudioRender(for: error) {
                    let fallbackResult: BackendRealtimeStudioRenderResult
                    do {
                        fallbackResult = try await backend.renderRealtimeStudioResult(
                            transcript: renderTranscript,
                            systemPrompt: systemPrompt,
                            screenplayTarget: "page",
                            studioMetadata: studioRenderMetadata
                        )
                    } catch {
                        if handleRealtimeStudioQualityFailure(error) == nil {
                            restoreRealtimeStudioDraftPreview()
                        }
                        return nil
                    }
                    applyRealtimeStudioScreenplayQuality(fallbackResult.screenplayQuality)
                    if let memoryApplied = fallbackResult.memoryApplied {
                        screenplayDraftBridge.noteStudioAppliedMemory(
                            memoryApplied,
                            source: "voice_fallback"
                        )
                    }
                    let fallbackReply = sanitizedRealtimeStudioRenderReply(
                        fallbackResult.reply
                    )
                    guard !fallbackReply.isEmpty else {
                        restoreRealtimeStudioDraftPreview()
                        return nil
                    }
                    realtimeStudioRenderedReply = fallbackReply
                    applyRealtimeStudioDraftPreview(
                        userMessage: cleanUser,
                        assistantMessage: fallbackReply
                    )
#if DEBUG || os(macOS)
                    appendStudioDebugVoiceDraftBreadcrumb(
                        event: "render_response_received",
                        detail: "Studio draft render fallback completed.",
                        replyPreview: String(fallbackReply.prefix(220)),
                        tokenOverride: debugVoiceTurnToken,
                        promptPreviewOverride: cleanUser
                    )
#endif
                    if let committedPreviewText = commitActiveRealtimeStudioDraftPreviewIfNeeded() {
#if DEBUG || os(macOS)
                        appendStudioDebugVoiceDraftBreadcrumb(
                            event: "request_committed",
                            detail: "Early Studio draft preview committed to the page from fallback render.",
                            replyPreview: String(committedPreviewText.prefix(220)),
                            tokenOverride: debugVoiceTurnToken,
                            promptPreviewOverride: cleanUser
                        )
                        if let debugVoiceTurnToken {
                            persistStudioDebugVoiceTurnProgress(
                                token: debugVoiceTurnToken,
                                prompt: cleanUser,
                                turnID: "",
                                insertedPreview: String(committedPreviewText.prefix(220)),
                                replyPreview: String(fallbackReply.prefix(220))
                            )
                        }
#endif
                        let realtimeStudioResult = self.makeRealtimeStudioTalkResult(
                            userMessage: cleanUser,
                            assistantMessage: fallbackReply
                        )
                        self.updateStudioAssistantPin(
                            from: realtimeStudioResult,
                            insertedText: committedPreviewText,
                            promptSource: .voice,
                            promptTextOverride: cleanUser,
                            promptTargetOverride: .page,
                            shouldRecordPrompt: false
                        )
                    }
                    return fallbackReply
                }
                if handleRealtimeStudioQualityFailure(error) == nil {
                    restoreRealtimeStudioDraftPreview()
                }
                return nil
            }
        }
    }

    @MainActor
    private func renderRealtimeStudioDraftIfNeeded(
        userMessage: String,
        fallbackAssistantMessage: String
    ) async -> String {
        let cleanUser = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanFallback = fallbackAssistantMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isStudioSurfaceActive else { return cleanFallback }
        guard !cleanUser.isEmpty else { return cleanFallback }
        let confirmedContext = confirmedStudioPageWriteContext(for: cleanUser)
        let renderTranscript = studioRenderTranscript(
            for: cleanUser,
            confirmedContext: confirmedContext
        )
        let shouldWriteToPage = shouldRouteStudioPromptToPage(cleanUser, preferredTarget: .automatic)

        var renderedReply = ""
        var hasValidatedPageReply = false
        if realtimeStudioRenderUserMessage == cleanUser,
           let task = realtimeStudioRenderTask {
            renderedReply = (await task.value)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            hasValidatedPageReply = shouldWriteToPage && !renderedReply.isEmpty
        } else {
            let systemPrompt = await buildRealtimeBootstrapSystemPrompt(isScreenplayMode: true)
            let studioRenderMetadata = studioRenderRequestMetadata(
                promptSource: .voice,
                shouldWriteToPage: shouldWriteToPage
            )
            do {
                let result = try await backend.renderRealtimeStudioResult(
                    transcript: renderTranscript,
                    systemPrompt: systemPrompt,
                    screenplayTarget: shouldWriteToPage ? "page" : "voice_pin",
                    studioMetadata: studioRenderMetadata
                )
                applyRealtimeStudioScreenplayQuality(result.screenplayQuality)
                screenplayDraftBridge.noteStudioAppliedMemory(
                    result.memoryApplied,
                    source: "voice_sync"
                )
                renderedReply = sanitizedRealtimeStudioRenderReply(result.reply)
                hasValidatedPageReply = shouldWriteToPage && !renderedReply.isEmpty
            } catch {
                if handleRealtimeStudioQualityFailure(error) == nil, shouldWriteToPage {
                    restoreRealtimeStudioDraftPreview()
                }
            }
        }

        defer {
            if realtimeStudioRenderUserMessage == cleanUser {
                realtimeStudioRenderTask = nil
                realtimeStudioRenderUserMessage = ""
                realtimeStudioRenderedReply = ""
            }
        }

        let resolvedReply = renderedReply.isEmpty ? cleanFallback : renderedReply
        if !resolvedReply.isEmpty {
            let realtimeStudioResult = makeRealtimeStudioTalkResult(
                userMessage: cleanUser,
                assistantMessage: resolvedReply
            )
            let realtimeMemoryDomain = studioMemoryDomain(for: cleanUser, preferredTarget: .automatic)
            let shouldInsertValidatedPage = shouldWriteToPage && hasValidatedPageReply
            let insertedScreenplayText = shouldInsertValidatedPage
                ? applyLiveScreenplayPreview(
                    from: realtimeStudioResult,
                    promptSource: .voice,
                    memoryDomainOverride: realtimeMemoryDomain,
                    preferredTargetOverride: .page
                )
                : nil
            if !shouldInsertValidatedPage {
                screenplayDraftBridge.updateLatestVoicePinReply(resolvedReply, prompt: cleanUser)
            }
            updateStudioAssistantPin(
                from: realtimeStudioResult,
                insertedText: insertedScreenplayText,
                promptTargetOverride: shouldInsertValidatedPage ? .page : .voicePin
            )
            return resolvedReply
        }

        restoreRealtimeStudioDraftPreview()
        return cleanFallback
    }

    @MainActor
    private func handleCompletedRealtimeTurn(
        userMessage: String,
        assistantMessage: String
    ) async {
        let cleanUser = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAssistant = assistantMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUser.isEmpty, !cleanAssistant.isEmpty else { return }
        if shouldIgnoreRealtimeStudioAssistantForLocalCommand(userMessage: cleanUser) {
            return
        }

        let fingerprintSeed = "\(cleanUser)\n--assistant--\n\(cleanAssistant)"
        let fingerprint = utteranceFingerprint(Data(fingerprintSeed.utf8))
        let now = Date()
        if fingerprint == lastRealtimeHandledPairFingerprint,
           now.timeIntervalSince(lastRealtimeHandledAt) < 12 {
            return
        }
        lastRealtimeHandledPairFingerprint = fingerprint
        lastRealtimeHandledAt = now

        let contextAssistantReply: String
        if isStudioSurfaceActive {
            contextAssistantReply = await renderRealtimeStudioDraftIfNeeded(
                userMessage: cleanUser,
                fallbackAssistantMessage: cleanAssistant
            )
        } else {
            contextAssistantReply = cleanAssistant
        }

        let memoryDomain = isStudioSurfaceActive
            ? studioMemoryDomain(for: cleanUser, preferredTarget: .automatic)
            : .companion
        recordStudioConversationMemoryIfNeeded(
            user: cleanUser,
            assistant: contextAssistantReply.isEmpty ? cleanAssistant : contextAssistantReply,
            memoryDomain: memoryDomain,
            isScreenplayMode: isStudioSurfaceActive,
            source: .voice
        )
        showReplyEcho(
            user: cleanUser,
            assistant: contextAssistantReply.isEmpty ? cleanAssistant : contextAssistantReply
        )

        await commitRealtimePreviewTurnIfNeeded(
            userMessage: cleanUser,
            assistantMessage: contextAssistantReply.isEmpty ? cleanAssistant : contextAssistantReply,
            promptSource: .voice
        )
    }

    @MainActor
    private func systemPromptWithVisualContext(
        _ basePrompt: String,
        userMessage: String,
        isScreenplayMode: Bool
    ) async -> String {
        let cleanBasePrompt = basePrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanBasePrompt.isEmpty else { return basePrompt }
        guard let visualContext = await loadVisualContextIfNeeded(
            userMessage: userMessage,
            isScreenplayMode: isScreenplayMode
        ) else {
            return cleanBasePrompt
        }
        let addendum = visualContext.promptAddendum.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !addendum.isEmpty else { return cleanBasePrompt }
        return "\(cleanBasePrompt)\n\n\(addendum)"
    }

    @MainActor
    private func buildCanonicalModelPrompt(
        _ basePrompt: String,
        userMessage: String,
        isScreenplayMode: Bool,
        shouldWriteToPage: Bool,
        featureWorkflowRequestID: String? = nil,
        includeVisualContext: Bool = true
    ) async -> String {
        let projectId = screenplayDraftBridge.preferredProjectID
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayProjectID : screenplayDraftBridge.preferredProjectID
        let versionId = screenplayDraftBridge.preferredVersionID
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayVersionID : screenplayDraftBridge.preferredVersionID
        let phase = screenplayDraftBridge.latestPhase
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPhase : screenplayDraftBridge.latestPhase
        let pack = screenplayDraftBridge.latestPack
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? liveScreenplayPack : screenplayDraftBridge.latestPack
        let draftExcerpt = screenplayDraftBridge.draftText
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let promptContinuity = screenplayPromptContinuityContext(
            featureWorkflowRequestID: featureWorkflowRequestID
        )
        let result = await screenplayPromptBuilder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: basePrompt,
                // The live turn text still rides the /talk request; this endpoint assembles prompt scaffolding.
                userInput: "",
                projectId: projectId,
                versionId: versionId,
                scene: "",
                phase: phase,
                pack: pack,
                draftExcerpt: String(draftExcerpt.suffix(6_000)),
                act: promptContinuity.act,
                sceneObjective: promptContinuity.sceneObjective,
                sceneSummary: promptContinuity.sceneSummary,
                currentBeat: promptContinuity.currentBeat,
                logline: promptContinuity.logline,
                themeArgument: promptContinuity.themeArgument,
                centralQuestion: promptContinuity.centralQuestion,
                protagonistWant: promptContinuity.protagonistWant,
                protagonistNeed: promptContinuity.protagonistNeed,
                antagonisticForce: promptContinuity.antagonisticForce,
                endingImage: promptContinuity.endingImage,
                featureSequence: promptContinuity.featureSequence,
                featureObligation: promptContinuity.featureObligation,
                featureMemoryBrief: screenplayDraftBridge.latestAppliedMemory.featureMemoryBrief,
                actPressureState: promptContinuity.actPressureState,
                characterArcState: promptContinuity.characterArcState,
                lastSceneOutcome: promptContinuity.lastSceneOutcome,
                nextScenePlan: promptContinuity.nextScenePlan,
                nextSceneMoves: promptContinuity.nextSceneMoves,
                nextThreeTurns: promptContinuity.nextThreeTurns,
                actThreePayoffPath: promptContinuity.actThreePayoffPath,
                beatSequence: promptContinuity.beatSequence,
                characterFocus: promptContinuity.characterFocus,
                unresolvedSetups: promptContinuity.unresolvedSetups,
                unresolvedStoryThreads: promptContinuity.unresolvedStoryThreads,
                characterArcTurns: promptContinuity.characterArcTurns,
                imageMotifs: promptContinuity.imageMotifs,
                continuityNotes: promptContinuity.continuityNotes,
                emotionalContinuity: promptContinuity.emotionalContinuity,
                pageCount: promptContinuity.pageCount,
                targetPages: promptContinuity.targetPages,
                screenplayTaskHint: userMessage,
                isScreenplayMode: isScreenplayMode,
                shouldWriteToPage: shouldWriteToPage,
                craftFrameworkId: ""
            )
        )
#if DEBUG || os(macOS)
        setStudioDebugPreferenceString(
            result.screenplayTaskIntent,
            forKey: "studio_debug_last_screenplay_task_intent"
        )
        setStudioDebugPreferenceString(
            result.screenplayTaskLabel,
            forKey: "studio_debug_last_screenplay_task_label"
        )
        setStudioDebugPreferenceString(
            result.usedBackendAssembly ? "1" : "0",
            forKey: "studio_debug_last_prompt_backend_assembly"
        )
        setStudioDebugPreferenceString(
            result.fallbackReason,
            forKey: "studio_debug_last_prompt_fallback_reason"
        )
#endif
        let canonicalPrompt = result.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? basePrompt
            : result.prompt
        guard includeVisualContext else { return canonicalPrompt }
        return await systemPromptWithVisualContext(
            canonicalPrompt,
            userMessage: userMessage,
            isScreenplayMode: isScreenplayMode
        )
    }

    private func sessionContinuityPromptNotes(from snapshot: BackendSessionContinuitySnapshot) -> [String] {
        var notes: [String] = []
        let opening = snapshot.openingLine.trimmingCharacters(in: .whitespacesAndNewlines)
        if !opening.isEmpty {
            notes.append("Session reopen continuity: \(opening)")
        }
        let title = snapshot.projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let projectId = snapshot.projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty || !projectId.isEmpty {
            let label = title.isEmpty ? projectId : title
            notes.append("Restored feature project: \(label).")
        }
        let actTarget = [
            snapshot.act,
            snapshot.featureSequence
        ]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " / ")
        if !actTarget.isEmpty {
            notes.append("Restored act-aware target: \(actTarget).")
        }
        let restoredFirstMove = [
            snapshot.nextScenePlan,
            snapshot.nextSceneMoves.first ?? "",
            snapshot.nextThreeTurns.first ?? "",
            snapshot.actThreePayoffPath.first ?? ""
        ]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
        if !restoredFirstMove.isEmpty {
            notes.append("First restored-response target: if the user asks to continue or speaks hands-free, start from this page move before inventing a new lane: \(restoredFirstMove)")
        }
        for causalFact in snapshot.acceptedCausalFacts.filter(\.isMeaningful).prefix(2) {
            let kind = causalFact.kind.replacingOccurrences(of: "_", with: " ")
            notes.append("Accepted causal canon (\(kind)): \(causalFact.fact). Continue its consequence; never undo, replay, or erase it offscreen.")
        }
        if let due = snapshot.dueStoryThread, due.isMeaningful {
            let sentenceBoundary = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ".!?"))
            let setup = due.setup.trimmingCharacters(in: sentenceBoundary)
            let payoff = due.promisedPayoff.trimmingCharacters(in: sentenceBoundary)
            let thread = setup.isEmpty ? payoff : setup
            let age = due.ageInScenes > 0 ? " Open for \(due.ageInScenes) accepted scenes." : ""
            let promise = payoff.isEmpty ? "" : " Promised payoff: \(payoff)."
            notes.append("Oldest accepted-page story obligation: \(thread).\(age)\(promise) Pressure or pay this before inventing a replacement plot thread.")
        }
        let lastOutcome = snapshot.lastSceneOutcome.trimmingCharacters(in: .whitespacesAndNewlines)
        if !lastOutcome.isEmpty {
            notes.append("Last remembered scene outcome: \(lastOutcome)")
        }
        let featureObligation = snapshot.featureObligation.trimmingCharacters(in: .whitespacesAndNewlines)
        if !featureObligation.isEmpty {
            notes.append("Restored structural obligation: \(featureObligation)")
        }
        let actPressure = snapshot.actPressureState.trimmingCharacters(in: .whitespacesAndNewlines)
        if !actPressure.isEmpty {
            notes.append("Restored act pressure: \(actPressure)")
        }
        let characterArc = snapshot.characterArcState.trimmingCharacters(in: .whitespacesAndNewlines)
        if !characterArc.isEmpty {
            notes.append("Restored character arc pressure: \(characterArc)")
        }
        if !snapshot.nextThreeTurns.isEmpty {
            notes.append("Restored next turns: \(snapshot.nextThreeTurns.prefix(3).joined(separator: " -> "))")
        }
        if !snapshot.actThreePayoffPath.isEmpty {
            notes.append("Restored Act III payoff path: \(snapshot.actThreePayoffPath.prefix(3).joined(separator: " -> "))")
        }
        if !snapshot.unresolvedStoryThreads.isEmpty {
            notes.append("Restored unresolved story threads: \(snapshot.unresolvedStoryThreads.prefix(3).joined(separator: "; "))")
        }
        let excerpt = snapshot.memoryExcerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        if !excerpt.isEmpty {
            notes.append("Relationship memory: \(excerpt)")
        }
        if !snapshot.imageMotifs.isEmpty {
            notes.append("Restored image motifs: \(snapshot.imageMotifs.prefix(3).joined(separator: "; "))")
        }
        if snapshot.isCorrection {
            notes.append("Honor the user's latest correction as authoritative continuity.")
        }
        return Array(notes.prefix(10))
    }

    private func sessionContinuityFingerprint(_ snapshot: BackendSessionContinuitySnapshot) -> String {
        let causalFingerprint = snapshot.acceptedCausalFacts
            .filter(\.isMeaningful)
            .prefix(4)
            .map { "\($0.kind):\($0.fact):\($0.ageInScenes)" }
            .joined(separator: "/")
        return [
            snapshot.projectId,
            snapshot.projectTitle,
            snapshot.act,
            snapshot.featureSequence,
            snapshot.featureObligation,
            snapshot.actPressureState,
            snapshot.characterArcState,
            snapshot.currentBeat,
            snapshot.lastSceneOutcome,
            snapshot.nextScenePlan,
            snapshot.nextThreeTurns.joined(separator: "/"),
            snapshot.actThreePayoffPath.joined(separator: "/"),
            snapshot.dueStoryThread?.setup ?? "",
            snapshot.dueStoryThread?.promisedPayoff ?? "",
            String(snapshot.dueStoryThread?.ageInScenes ?? 0),
            causalFingerprint,
            String(Int(snapshot.updatedAt))
        ]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .joined(separator: "|")
    }

    private func sessionContinuityTitle(_ snapshot: BackendSessionContinuitySnapshot) -> String {
        let title = snapshot.projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty { return title }
        let projectId = snapshot.projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !projectId.isEmpty { return projectId }
        let act = snapshot.act.trimmingCharacters(in: .whitespacesAndNewlines)
        if !act.isEmpty { return act }
        return "Your screenplay"
    }

    private func sessionContinuityBody(_ snapshot: BackendSessionContinuitySnapshot) -> String {
        let opening = snapshot.openingLine.trimmingCharacters(in: .whitespacesAndNewlines)
        if !opening.isEmpty { return opening }

        let position = [
            snapshot.act,
            snapshot.featureSequence
        ]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " / ")
        let lastThread = [
            snapshot.lastSceneOutcome,
            snapshot.currentBeat,
            snapshot.actPressureState,
            snapshot.characterArcState,
            snapshot.memoryExcerpt
        ]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
        let nextMove = [
            snapshot.nextScenePlan,
            snapshot.nextThreeTurns.first ?? "",
            snapshot.actThreePayoffPath.first ?? ""
        ]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
        let dueThread = snapshot.dueStoryThread?.setup.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let dueAge = snapshot.dueStoryThread?.ageInScenes ?? 0
        let causalFact = snapshot.acceptedCausalFacts
            .first(where: \.isMeaningful)?
            .fact
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        var parts: [String] = []
        if !position.isEmpty { parts.append(position) }
        if !lastThread.isEmpty { parts.append(lastThread) }
        if !dueThread.isEmpty {
            parts.append("Oldest open thread: \(dueThread)\(dueAge > 0 ? " (\(dueAge) accepted scenes)" : "")")
        }
        if !causalFact.isEmpty { parts.append("Binding consequence: \(causalFact)") }
        if !nextMove.isEmpty { parts.append("Next: \(nextMove)") }
        return parts.isEmpty ? "Clementine restored your latest writing context." : parts.joined(separator: " ")
    }

    @MainActor
    private func screenplayPromptContinuityContext(
        featureWorkflowRequestID: String? = nil
    ) -> (
        act: String,
        sceneObjective: String,
        sceneSummary: String,
        currentBeat: String,
        logline: String,
        themeArgument: String,
        centralQuestion: String,
        protagonistWant: String,
        protagonistNeed: String,
        antagonisticForce: String,
        endingImage: String,
        featureSequence: String,
        featureObligation: String,
        nextScenePlan: String,
        nextSceneMoves: [String],
        nextThreeTurns: [String],
        actThreePayoffPath: [String],
        actPressureState: String,
        characterArcState: String,
        characterArcMemory: BackendScreenplayCharacterArcMemory?,
        characterVoiceMemories: [BackendScreenplayCharacterVoiceMemory],
        lastSceneOutcome: String,
        beatSequence: [String],
        characterFocus: [String],
        unresolvedSetups: [String],
        unresolvedStoryThreads: [String],
        characterArcTurns: [String],
        imageMotifs: [String],
        continuityNotes: [String],
        emotionalContinuity: String,
        pageCount: Int,
        targetPages: Int
    ) {
        let bindingSnapshot = screenplayDraftBridge.projectBinding
        let featureSpine = screenplayDraftBridge.featureSpine
        let structuredDraft = screenplayDraftBridge.structuredDraft
        let currentLine = max(1, screenplayDraftBridge.currentCursorLine)
        let activeBinding = bindingSnapshot.sceneBindings.last(where: { binding in
            currentLine >= binding.draftLine && currentLine <= max(binding.draftLine, binding.draftEndLine)
        }) ?? bindingSnapshot.sceneBindings.last
        let activeDraftScene = activeBinding.flatMap { binding in
            structuredDraft.scenes.first(where: { $0.id == binding.draftSceneID })
        } ?? structuredDraft.activeScene(containingOrBefore: currentLine)
        let draftBeatSequence = structuredDraft.recentActionBeatSequence(
            endingAtLine: currentLine,
            limit: 8
        )
        let draftCurrentBeat = structuredDraft.currentActionBeat(endingAtLine: currentLine)

        var characterFocus: [String] = []
        for character in (activeDraftScene?.characterCues ?? []) + structuredDraft.characters {
            let clean = character.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            if !characterFocus.contains(where: { $0.caseInsensitiveCompare(clean) == .orderedSame }) {
                characterFocus.append(clean)
            }
            if characterFocus.count >= 8 { break }
        }

        var promptLogline = featureSpine.logline
        var promptThemeArgument = featureSpine.themeArgument
        var promptCentralQuestion = featureSpine.centralQuestion
        var promptProtagonistWant = featureSpine.protagonistWant
        var promptProtagonistNeed = featureSpine.protagonistNeed
        var promptAntagonisticForce = featureSpine.antagonisticForce
        var promptEndingImage = featureSpine.endingImage
        var promptUnresolvedSetups = featureSpine.unresolvedSetups

        var continuityNotes: [String] = []
        if bindingSnapshot.draftSceneCount > 0 || bindingSnapshot.outlineSceneCount > 0 {
            continuityNotes.append(
                "Draft-outline binding: \(bindingSnapshot.boundSceneCount)/\(max(bindingSnapshot.outlineSceneCount, bindingSnapshot.draftSceneCount)) scenes aligned."
            )
        }
        let unboundDraftSceneLabels = bindingSnapshot.sceneBindings
            .filter { !$0.isBound }
            .prefix(4)
            .map(\.draftShortLabel)
        if !unboundDraftSceneLabels.isEmpty {
            continuityNotes.append(
                "Draft-outline alignment pending: \(unboundDraftSceneLabels.joined(separator: ", "))."
            )
        }
        if bindingSnapshot.draftCharacterCount > 0 || bindingSnapshot.projectCharacterCount > 0 {
            continuityNotes.append(
                "Character tracking: \(bindingSnapshot.boundCharacterCount)/\(max(bindingSnapshot.projectCharacterCount, bindingSnapshot.draftCharacterCount)) project characters matched."
            )
        }

        let currentBeat = activeBinding?.outlineBeatLabels.first?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? draftCurrentBeat
        let sceneObjective = activeBinding?.outlineSceneObjective?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let sceneSummary = activeBinding?.outlineSceneSummary?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? [
                activeDraftScene?.slugline.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
                draftCurrentBeat
            ]
                .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                .joined(separator: ": ")
        let emotionalContinuity = [sceneObjective, sceneSummary]
            .first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) ?? ""
        let estimatedPageCount = structuredDraft.lineCount > 0
            ? max(1, Int(ceil(Double(structuredDraft.lineCount) / 55.0)))
            : 0
        let activeActTitle = activeBinding?.actTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let resolvedAct = activeActTitle.isEmpty ? featureSpine.actPosition : activeActTitle
        let hasFeatureGuideContext = !resolvedAct.isEmpty ||
            estimatedPageCount > 0 ||
            !featureSpine.isEmpty ||
            bindingSnapshot.draftSceneCount > 0 ||
            bindingSnapshot.outlineSceneCount > 0
        let featureGuide = hasFeatureGuideContext
            ? ScreenplayFeatureProgressionGuide.guide(
                actPosition: resolvedAct,
                currentPage: estimatedPageCount,
                targetPages: ScreenplayFeatureProgressionGuide.defaultTargetPages
            )
            : nil
        if let featureGuide {
            continuityNotes.append("Feature sequence: \(featureGuide.currentAct) - \(featureGuide.sequenceLabel) (\(featureGuide.pageRangeText)).")
            continuityNotes.append("Structural obligation due now: \(featureGuide.dueNow)")
            continuityNotes.append("Next scene planner: \(featureGuide.nextScenePlan)")
        }

        var promptAct = resolvedAct
        var promptSceneObjective = sceneObjective
        var promptSceneSummary = sceneSummary
        var promptCurrentBeat = currentBeat
        var promptFeatureSequence = featureGuide.map { "\($0.currentAct) - \($0.sequenceLabel) (\($0.pageRangeText))" } ?? ""
        var promptFeatureObligation = featureGuide?.dueNow ?? ""
        var promptActPressureState = featureGuide?.dueNow ?? ""
        var promptCharacterArcState = promptProtagonistNeed.isEmpty ? promptThemeArgument : "Need: \(promptProtagonistNeed)"
        var promptLastSceneOutcome = screenplayDraftBridge.lastCommittedWrite.map {
            clippedStudioAssistantText($0.insertedText, limit: 240)
        } ?? ""
        var promptNextScenePlan = featureGuide?.nextScenePlan ?? ""
        var promptNextSceneMoves = featureGuide?.nextMoves ?? []
        var promptNextThreeTurns = Array((featureGuide?.nextMoves ?? []).prefix(3))
        var promptActThreePayoffPath: [String] = []
        var promptUnresolvedStoryThreads: [String] = []
        var promptCharacterArcTurns: [String] = []
        var promptImageMotifs: [String] = []
        var promptEmotionalContinuity = emotionalContinuity
        var promptPageCount = estimatedPageCount
        var promptTargetPages = hasFeatureGuideContext ? ScreenplayFeatureProgressionGuide.defaultTargetPages : 0
        var promptBeatSequence: [String] = []

        if promptSceneObjective.isEmpty {
            promptSceneObjective = featureGuide?.dueNow ?? ""
        }
        if promptCurrentBeat.isEmpty {
            promptCurrentBeat = draftCurrentBeat
        }
        if promptEmotionalContinuity.isEmpty {
            promptEmotionalContinuity = [promptCurrentBeat, promptSceneObjective, promptSceneSummary]
                .first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) ?? ""
        }

        func mergedContextList(_ primary: [String], _ secondary: [String], limit: Int) -> [String] {
            var seen = Set<String>()
            var result: [String] = []
            for item in primary + secondary {
                let clean = item
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                guard !clean.isEmpty else { continue }
                let key = clean.lowercased()
                guard seen.insert(key).inserted else { continue }
                result.append(clean)
                if result.count >= limit { break }
            }
            return result
        }

        promptBeatSequence = mergedContextList(
            Array((activeBinding?.outlineBeatLabels ?? []).prefix(8)),
            draftBeatSequence,
            limit: 8
        )
        promptActThreePayoffPath = mergedContextList(
            promptUnresolvedSetups,
            promptEndingImage.isEmpty ? [] : ["Final image: \(promptEndingImage)"],
            limit: 5
        )
        promptUnresolvedStoryThreads = mergedContextList(
            [
                promptCentralQuestion.isEmpty ? "" : "Central question: \(promptCentralQuestion)",
                promptAntagonisticForce.isEmpty ? "" : "Opposition: \(promptAntagonisticForce)"
            ],
            promptUnresolvedSetups,
            limit: 8
        )
        promptCharacterArcTurns = mergedContextList(
            [
                promptProtagonistNeed.isEmpty ? "" : "Need: \(promptProtagonistNeed)",
                promptThemeArgument.isEmpty ? "" : "Theme: \(promptThemeArgument)"
            ],
            [],
            limit: 6
        )
        promptImageMotifs = mergedContextList(
            promptEndingImage.isEmpty ? [] : ["Ending image: \(promptEndingImage)"],
            [],
            limit: 6
        )

        if let sessionContinuitySnapshot, sessionContinuitySnapshot.isMeaningful {
            let sessionNotes = sessionContinuityPromptNotes(from: sessionContinuitySnapshot)
            continuityNotes = mergedContextList(sessionNotes, continuityNotes, limit: 8)
            if promptAct.isEmpty { promptAct = sessionContinuitySnapshot.act }
            if promptSceneObjective.isEmpty { promptSceneObjective = sessionContinuitySnapshot.sceneObjective }
            if promptSceneSummary.isEmpty { promptSceneSummary = sessionContinuitySnapshot.sceneSummary }
            if promptFeatureSequence.isEmpty { promptFeatureSequence = sessionContinuitySnapshot.featureSequence }
            if promptFeatureObligation.isEmpty { promptFeatureObligation = sessionContinuitySnapshot.featureObligation }
            if promptCurrentBeat.isEmpty { promptCurrentBeat = sessionContinuitySnapshot.currentBeat }
            if promptLogline.isEmpty { promptLogline = sessionContinuitySnapshot.logline }
            if promptThemeArgument.isEmpty { promptThemeArgument = sessionContinuitySnapshot.themeArgument }
            if promptCentralQuestion.isEmpty { promptCentralQuestion = sessionContinuitySnapshot.centralQuestion }
            if promptProtagonistWant.isEmpty { promptProtagonistWant = sessionContinuitySnapshot.protagonistWant }
            if promptProtagonistNeed.isEmpty { promptProtagonistNeed = sessionContinuitySnapshot.protagonistNeed }
            if promptAntagonisticForce.isEmpty { promptAntagonisticForce = sessionContinuitySnapshot.antagonisticForce }
            if promptEndingImage.isEmpty { promptEndingImage = sessionContinuitySnapshot.endingImage }
            if promptSceneSummary.isEmpty { promptSceneSummary = sessionContinuitySnapshot.lastSceneOutcome }
            if promptActPressureState.isEmpty { promptActPressureState = sessionContinuitySnapshot.actPressureState }
            if promptCharacterArcState.isEmpty { promptCharacterArcState = sessionContinuitySnapshot.characterArcState }
            if promptLastSceneOutcome.isEmpty { promptLastSceneOutcome = sessionContinuitySnapshot.lastSceneOutcome }
            if promptNextScenePlan.isEmpty { promptNextScenePlan = sessionContinuitySnapshot.nextScenePlan }
            if promptNextSceneMoves.isEmpty {
                promptNextSceneMoves = mergedContextList(
                    sessionContinuitySnapshot.nextSceneMoves,
                    sessionContinuitySnapshot.nextThreeTurns,
                    limit: 5
                )
            } else {
                promptNextSceneMoves = mergedContextList(
                    promptNextSceneMoves,
                    sessionContinuitySnapshot.nextSceneMoves + sessionContinuitySnapshot.nextThreeTurns,
                    limit: 5
                )
            }
            promptNextThreeTurns = mergedContextList(
                sessionContinuitySnapshot.nextThreeTurns,
                promptNextThreeTurns,
                limit: 3
            )
            promptActThreePayoffPath = mergedContextList(
                sessionContinuitySnapshot.actThreePayoffPath,
                promptActThreePayoffPath,
                limit: 5
            )
            promptUnresolvedSetups = mergedContextList(
                sessionContinuitySnapshot.unresolvedSetups,
                promptUnresolvedSetups,
                limit: 8
            )
            promptUnresolvedStoryThreads = mergedContextList(
                sessionContinuitySnapshot.unresolvedStoryThreads,
                promptUnresolvedStoryThreads,
                limit: 8
            )
            promptCharacterArcTurns = mergedContextList(
                sessionContinuitySnapshot.characterArcTurns,
                promptCharacterArcTurns,
                limit: 6
            )
            promptImageMotifs = mergedContextList(
                sessionContinuitySnapshot.imageMotifs,
                promptImageMotifs,
                limit: 6
            )
            if promptEmotionalContinuity.isEmpty {
                promptEmotionalContinuity = [
                    sessionContinuitySnapshot.emotionalContinuity,
                    sessionContinuitySnapshot.lastSceneOutcome,
                    sessionContinuitySnapshot.memoryExcerpt,
                    sessionContinuitySnapshot.currentBeat
                ]
                    .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? ""
            }
            characterFocus = mergedContextList(
                characterFocus,
                sessionContinuitySnapshot.characterFocus,
                limit: 8
            )
            if promptPageCount <= 0 { promptPageCount = sessionContinuitySnapshot.pageCount }
            if promptTargetPages <= 0 { promptTargetPages = sessionContinuitySnapshot.targetPages }
        }

        if let workflowContext = screenplayDraftBridge.featureWorkflowContext(for: featureWorkflowRequestID) {
            if !workflowContext.act.isEmpty { promptAct = workflowContext.act }
            if !workflowContext.sceneObjective.isEmpty { promptSceneObjective = workflowContext.sceneObjective }
            if !workflowContext.sceneSummary.isEmpty { promptSceneSummary = workflowContext.sceneSummary }
            if !workflowContext.currentBeat.isEmpty { promptCurrentBeat = workflowContext.currentBeat }
            if !workflowContext.featureSequence.isEmpty { promptFeatureSequence = workflowContext.featureSequence }
            if !workflowContext.featureObligation.isEmpty { promptFeatureObligation = workflowContext.featureObligation }
            if !workflowContext.actPressureState.isEmpty { promptActPressureState = workflowContext.actPressureState }
            if !workflowContext.characterArcState.isEmpty { promptCharacterArcState = workflowContext.characterArcState }
            if !workflowContext.lastSceneOutcome.isEmpty { promptLastSceneOutcome = workflowContext.lastSceneOutcome }
            if !workflowContext.nextScenePlan.isEmpty { promptNextScenePlan = workflowContext.nextScenePlan }
            promptNextSceneMoves = mergedContextList(workflowContext.nextSceneMoves, promptNextSceneMoves, limit: 5)
            promptNextThreeTurns = mergedContextList(workflowContext.nextThreeTurns, promptNextThreeTurns, limit: 3)
            promptActThreePayoffPath = mergedContextList(workflowContext.actThreePayoffPath, promptActThreePayoffPath, limit: 5)
            continuityNotes = mergedContextList(workflowContext.continuityNotes, continuityNotes, limit: 8)
            if !workflowContext.logline.isEmpty { promptLogline = workflowContext.logline }
            if !workflowContext.themeArgument.isEmpty { promptThemeArgument = workflowContext.themeArgument }
            if !workflowContext.centralQuestion.isEmpty { promptCentralQuestion = workflowContext.centralQuestion }
            if !workflowContext.protagonistWant.isEmpty { promptProtagonistWant = workflowContext.protagonistWant }
            if !workflowContext.protagonistNeed.isEmpty { promptProtagonistNeed = workflowContext.protagonistNeed }
            if !workflowContext.antagonisticForce.isEmpty { promptAntagonisticForce = workflowContext.antagonisticForce }
            if !workflowContext.endingImage.isEmpty { promptEndingImage = workflowContext.endingImage }
            promptUnresolvedSetups = mergedContextList(
                workflowContext.unresolvedSetups,
                promptUnresolvedSetups,
                limit: 8
            )
            promptUnresolvedStoryThreads = mergedContextList(
                workflowContext.unresolvedStoryThreads,
                promptUnresolvedStoryThreads,
                limit: 8
            )
            promptCharacterArcTurns = mergedContextList(
                workflowContext.characterArcTurns,
                promptCharacterArcTurns,
                limit: 6
            )
            promptImageMotifs = mergedContextList(
                workflowContext.imageMotifs,
                promptImageMotifs,
                limit: 6
            )
            if !workflowContext.emotionalContinuity.isEmpty {
                promptEmotionalContinuity = workflowContext.emotionalContinuity
            }
            if workflowContext.pageCount > 0 { promptPageCount = workflowContext.pageCount }
            if workflowContext.targetPages > 0 { promptTargetPages = workflowContext.targetPages }
        }

        if promptBeatSequence.isEmpty {
            promptBeatSequence = draftBeatSequence
        }
        if promptNextThreeTurns.isEmpty {
            promptNextThreeTurns = Array(promptNextSceneMoves.prefix(3))
        }
        if promptActPressureState.isEmpty {
            promptActPressureState = promptFeatureObligation
        }
        if promptCharacterArcState.isEmpty {
            promptCharacterArcState = [promptProtagonistNeed, promptThemeArgument]
                .first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) ?? ""
        }
        if promptActThreePayoffPath.isEmpty, !promptEndingImage.isEmpty {
            promptActThreePayoffPath = ["Final image: \(promptEndingImage)"]
        }
        if promptUnresolvedStoryThreads.isEmpty {
            promptUnresolvedStoryThreads = mergedContextList(
                [
                    promptCentralQuestion.isEmpty ? "" : "Central question: \(promptCentralQuestion)",
                    promptAntagonisticForce.isEmpty ? "" : "Opposition: \(promptAntagonisticForce)"
                ],
                promptUnresolvedSetups,
                limit: 8
            )
        }
        if promptCharacterArcTurns.isEmpty {
            promptCharacterArcTurns = mergedContextList(
                [
                    promptProtagonistNeed.isEmpty ? "" : "Need: \(promptProtagonistNeed)",
                    promptThemeArgument.isEmpty ? "" : "Theme: \(promptThemeArgument)"
                ],
                [],
                limit: 6
            )
        }
        if promptImageMotifs.isEmpty, !promptEndingImage.isEmpty {
            promptImageMotifs = ["Ending image: \(promptEndingImage)"]
        }
        let promptCharacterArcMemory = BackendScreenplayCharacterArcMemory(
            character: characterFocus.first ?? "",
            act: promptAct,
            want: promptProtagonistWant,
            need: promptProtagonistNeed,
            relationshipPressure: promptAntagonisticForce,
            currentTactic: promptCurrentBeat.isEmpty ? promptSceneObjective : promptCurrentBeat,
            nextEmotionalTurn: promptCharacterArcTurns.first ?? promptNextThreeTurns.first ?? promptNextScenePlan
        )
        let promptCharacterVoiceMemories = screenplayDraftBridge.screenplayCharacterVoiceMemories(
            matching: characterFocus
        )

        return (
            act: promptAct,
            sceneObjective: promptSceneObjective,
            sceneSummary: promptSceneSummary,
            currentBeat: promptCurrentBeat,
            logline: promptLogline,
            themeArgument: promptThemeArgument,
            centralQuestion: promptCentralQuestion,
            protagonistWant: promptProtagonistWant,
            protagonistNeed: promptProtagonistNeed,
            antagonisticForce: promptAntagonisticForce,
            endingImage: promptEndingImage,
            featureSequence: promptFeatureSequence,
            featureObligation: promptFeatureObligation,
            nextScenePlan: promptNextScenePlan,
            nextSceneMoves: promptNextSceneMoves,
            nextThreeTurns: promptNextThreeTurns,
            actThreePayoffPath: promptActThreePayoffPath,
            actPressureState: promptActPressureState,
            characterArcState: promptCharacterArcState,
            characterArcMemory: promptCharacterArcMemory.isMeaningful ? promptCharacterArcMemory : nil,
            characterVoiceMemories: promptCharacterVoiceMemories,
            lastSceneOutcome: promptLastSceneOutcome,
            beatSequence: promptBeatSequence,
            characterFocus: characterFocus,
            unresolvedSetups: promptUnresolvedSetups,
            unresolvedStoryThreads: promptUnresolvedStoryThreads,
            characterArcTurns: promptCharacterArcTurns,
            imageMotifs: promptImageMotifs,
            continuityNotes: continuityNotes,
            emotionalContinuity: promptEmotionalContinuity,
            pageCount: promptPageCount,
            targetPages: promptTargetPages
        )
    }

    @MainActor
    private func loadVisualContextIfNeeded(
        userMessage: String,
        isScreenplayMode: Bool
    ) async -> ClementineVisualContextEnvelope? {
        guard visualContextEnabled else {
            lastVisualContextError = ""
            return nil
        }
        #if os(macOS)
        do {
            let captured = try await ClementineVisualContextCapture.captureFrontmostWindowJPEG()
            let captureFingerprint = utteranceFingerprint(captured.imageData)
            let now = Date()

            if let cached = lastVisualContextEnvelope,
               captureFingerprint == lastVisualContextFingerprint,
               now.timeIntervalSince(lastVisualContextCapturedAt) < 12 {
                return cached
            }

            let backendEnvelope = try await backend.summarizeVisualContext(
                imageData: captured.imageData,
                mimeType: captured.mimeType,
                transcript: userMessage,
                appName: captured.appName,
                windowTitle: captured.windowTitle,
                isScreenplayMode: isScreenplayMode
            )
            let envelope = ClementineVisualContextEnvelope(
                promptAddendum: backendEnvelope.promptAddendum,
                summary: backendEnvelope.summary,
                appName: backendEnvelope.appName.isEmpty ? captured.appName : backendEnvelope.appName,
                windowTitle: backendEnvelope.windowTitle.isEmpty ? captured.windowTitle : backendEnvelope.windowTitle,
                source: backendEnvelope.source.isEmpty ? captured.source : backendEnvelope.source,
                capturedAt: visualContextDate(from: backendEnvelope.capturedAt, fallback: now)
            )
            lastVisualContextEnvelope = envelope
            lastVisualContextFingerprint = captureFingerprint
            lastVisualContextCapturedAt = now
            lastVisualContextError = ""
            return envelope
        } catch {
            let authRequiredMessage = authRequiredMessageIfNeeded(for: error)
            lastVisualContextError = authRequiredMessage ?? error.localizedDescription
            if let authRequiredMessage {
                backendConnectionState = .up
                backendFailureCount = 0
                lastIssueSummary = authRequiredMessage
            }
            if let cached = lastVisualContextEnvelope,
               Date().timeIntervalSince(lastVisualContextCapturedAt) < 20 {
                return cached
            }
            return nil
        }
        #else
        lastVisualContextError = ""
        return nil
        #endif
    }

    private func visualContextDate(from rawValue: TimeInterval, fallback: Date) -> Date {
        let raw = max(0, rawValue)
        guard raw > 0 else { return fallback }
        if raw > 100_000_000_000 {
            return Date(timeIntervalSince1970: raw / 1000)
        }
        return Date(timeIntervalSince1970: raw)
    }

    private func relativeTimestamp(_ date: Date) -> String {
        guard date > .distantPast else { return "just now" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    @MainActor
    @discardableResult
    private func prewarmRealtimeIfNeeded(
        isScreenplayMode: Bool,
        forceCredentialRefresh: Bool = false
    ) async -> BackendRealtimeBootstrap? {
        guard voiceTransportMode == .realtimePreview else {
            realtimePreviewStandardFallbackActive = false
            realtimeVoice.clear()
            realtimeTransport.disconnect()
            realtimeBridgeRequest = nil
            return nil
        }
        do {
            realtimeBridgeRequest = try await backend.realtimeBridgeRequest()
        } catch {
            realtimeBridgeRequest = nil
        }
        let systemPrompt = await buildRealtimeBootstrapSystemPrompt(isScreenplayMode: isScreenplayMode)
        let projectIdentity = isScreenplayMode
            ? activeRealtimeScreenplayProjectIdentity()
            : (id: "", title: "")
        let bootstrap = await realtimeVoice.prepareIfNeeded(
            backend: backend,
            systemPrompt: systemPrompt,
            userName: evolution.preferredName,
            isScreenplayMode: isScreenplayMode,
            screenplayProjectId: projectIdentity.id,
            screenplayProjectTitle: projectIdentity.title,
            emotionLane: lastClementineEmotionLane,
            supplierMode: realtimeSupplierMode,
            forceRefresh: forceCredentialRefresh
        )
        return bootstrap
    }

    @MainActor
    private func activeRealtimeScreenplayProjectIdentity() -> (id: String, title: String) {
        let projectId = screenplayDraftBridge.committedWriteProjectIDSnapshot()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let boundProjectId = screenplayDraftBridge.projectBinding.projectID
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let projectTitle = !projectId.isEmpty &&
            boundProjectId.caseInsensitiveCompare(projectId) == .orderedSame
            ? screenplayDraftBridge.projectBinding.projectTitle
                .trimmingCharacters(in: .whitespacesAndNewlines)
            : ""
        return (projectId, projectTitle)
    }

    @MainActor
    private func scheduleRealtimeProjectGroundingRefresh(
        reason: String,
        stateVersion: String,
        projectId: String,
        projectTitle: String
    ) {
        guard voiceTransportMode == .realtimePreview,
              isStudioSurfaceActive,
              realtimeTransport.isLive else {
            return
        }
        let activeProject = activeRealtimeScreenplayProjectIdentity()
        let expectedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !expectedProjectId.isEmpty,
           !activeProject.id.isEmpty,
           expectedProjectId.caseInsensitiveCompare(activeProject.id) != .orderedSame {
            return
        }
        let resolvedProjectId = activeProject.id.isEmpty ? expectedProjectId : activeProject.id
        let resolvedProjectTitle = activeProject.title.isEmpty
            ? projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            : activeProject.title
        guard !resolvedProjectId.isEmpty || !resolvedProjectTitle.isEmpty else { return }

        let cleanReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanStateVersion = stateVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        let revision = [
            cleanStateVersion.isEmpty ? String(Date().timeIntervalSince1970) : cleanStateVersion,
            cleanReason.isEmpty ? "project_memory_changed" : cleanReason,
            resolvedProjectId.lowercased(),
        ].joined(separator: "|")
        guard revision != lastRealtimeGroundingRevision,
              revision != pendingRealtimeGroundingRevision else {
            return
        }

        pendingRealtimeGroundingRevision = revision
        realtimeGroundingRefreshTask?.cancel()
        realtimeGroundingRefreshTask = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: 120_000_000)
            } catch {
                return
            }
            guard pendingRealtimeGroundingRevision == revision,
                  realtimeTransport.isLive,
                  voiceTransportMode == .realtimePreview,
                  isStudioSurfaceActive else {
                return
            }

            let currentProject = activeRealtimeScreenplayProjectIdentity()
            if !resolvedProjectId.isEmpty,
               !currentProject.id.isEmpty,
               resolvedProjectId.caseInsensitiveCompare(currentProject.id) != .orderedSame {
                pendingRealtimeGroundingRevision = ""
                return
            }

            do {
                let baseInstructions = await buildRealtimeBootstrapSystemPrompt(
                    isScreenplayMode: true
                )
                let grounding = try await backend.fetchRealtimeProjectGrounding(
                    systemPrompt: baseInstructions,
                    screenplayProjectId: currentProject.id.isEmpty
                        ? resolvedProjectId
                        : currentProject.id,
                    screenplayProjectTitle: currentProject.title.isEmpty
                        ? resolvedProjectTitle
                        : currentProject.title
                )
                guard !Task.isCancelled,
                      pendingRealtimeGroundingRevision == revision,
                      realtimeTransport.isLive else {
                    return
                }
                let latestProject = activeRealtimeScreenplayProjectIdentity()
                if !grounding.projectId.isEmpty,
                   !latestProject.id.isEmpty,
                   grounding.projectId.caseInsensitiveCompare(latestProject.id) != .orderedSame {
                    pendingRealtimeGroundingRevision = ""
                    return
                }
                guard realtimeTransport.updateInstructions(
                    grounding.instructions,
                    revision: revision
                ) else {
                    pendingRealtimeGroundingRevision = ""
                    return
                }
            } catch {
                if pendingRealtimeGroundingRevision == revision {
                    pendingRealtimeGroundingRevision = ""
                }
                HerLog.talk.error(
                    "realtime project grounding fetch failed revision=\(revision, privacy: .public) error=\(error.localizedDescription, privacy: .public)"
                )
            }
        }
    }

    private func buildRealtimeBootstrapSystemPrompt(isScreenplayMode: Bool) async -> String {
        let partialHint = currentPartialHintForTalk()
        let prepared = buildPreparedTurnPrompt(
            confirmedTranscript: transcript,
            partialHint: partialHint,
            isScreenplayModeOverride: isScreenplayMode,
            turnKeyNamespace: "realtime"
        )
        if let prompt = speculativeTalk.preparedPromptIfCompatible(
            finalText: prepared.directorText,
            isScreenplayMode: prepared.useScreenplayMode,
            shouldWriteToPage: prepared.shouldWriteToPage
        ) {
            return prompt
        }
        if shouldSkipVisualContextForStudioDraftTurn(
            isScreenplayMode: prepared.useScreenplayMode,
            shouldWriteToPage: prepared.shouldWriteToPage
        ) {
            return await buildCanonicalModelPrompt(
                prepared.baseSystemPrompt,
                userMessage: prepared.directorText,
                isScreenplayMode: prepared.useScreenplayMode,
                shouldWriteToPage: prepared.shouldWriteToPage,
                includeVisualContext: false
            )
        }
        return await buildCanonicalModelPrompt(
            prepared.baseSystemPrompt,
            userMessage: prepared.directorText,
            isScreenplayMode: prepared.useScreenplayMode,
            shouldWriteToPage: prepared.shouldWriteToPage
        )
    }

    private func shouldSkipVisualContextForStudioDraftTurn(
        isScreenplayMode: Bool,
        shouldWriteToPage: Bool
    ) -> Bool {
        isStudioSurfaceActive && isScreenplayMode && shouldWriteToPage
    }

    private var connectionBannerText: String? {
        if let outboxStatus = offlineTalkOutboxSnapshot.userVisibleStatus {
            return outboxStatus
        }
        switch backendConnectionState {
        case .up:
            return nil
        case .checking:
            return "Checking connection…"
        case .reconnecting:
            return "Reconnecting… talk is paused."
        }
    }

    private func supportEmailAddress() -> String {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SUPPORT_EMAIL") as? String {
            let clean = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !clean.isEmpty { return clean }
        }
        return "support@yourdomain.com"
    }

    private func reportProblem() {
        let body = diagnosticsSummaryBody()

        var components = URLComponents()
        components.scheme = "mailto"
        components.path = supportEmailAddress()
        components.queryItems = [
            URLQueryItem(name: "subject", value: "io.them Problem Report"),
            URLQueryItem(name: "body", value: body)
        ]

        guard let url = components.url else { return }
        openURL(url)
    }

    @MainActor
    private func handleNoteCaptureIfNeeded(_ action: BackendNoteCaptureAction?, turnId: String?) {
        guard let action else { return }
        let logStatus = action.status.isEmpty ? "unknown" : action.status
        let logTarget = action.target.isEmpty ? "none" : action.target
        let logFallback = action.fallbackFrom ?? "none"
        HerLog.ui.info("note capture status=\(logStatus, privacy: .public) target=\(logTarget, privacy: .public) fallback=\(logFallback, privacy: .public)")

        guard action.captured else { return }

        if action.status == "opened", action.target == "apple_notes" {
            if let turnId, !turnId.isEmpty, turnId == lastOpenedNoteTurnID {
                return
            }
            if let turnId, !turnId.isEmpty {
                lastOpenedNoteTurnID = turnId
            }
            openAppleNotesApp()
            return
        }

        guard action.status == "saved" else { return }

        InAppNotesStore.shared.addCapturedNote(
            title: action.title,
            body: action.noteText,
            source: action.target,
            linkedPath: action.path,
            turnID: turnId,
            createdAtMs: action.createdAt
        )

        if let turnId, !turnId.isEmpty, turnId == lastOpenedNoteTurnID {
            return
        }
        if let turnId, !turnId.isEmpty {
            lastOpenedNoteTurnID = turnId
        }

        if action.target == "apple_notes" {
            openAppleNotesApp()
            return
        }

        guard action.target == "file" else { return }
        guard let rawPath = action.path, !rawPath.isEmpty else { return }
        if rawPath == lastOpenedNotePath {
            return
        }
        lastOpenedNotePath = rawPath
        openURL(URL(fileURLWithPath: rawPath))
    }

    @MainActor
    private func openAppleNotesApp() {
        if let notesSchemeURL = URL(string: "notes://") {
            openURL(notesSchemeURL)
            return
        }
        #if os(macOS)
        if let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Notes") {
            let configuration = NSWorkspace.OpenConfiguration()
            NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { _, error in
                if let error {
                    HerLog.ui.error("failed to open Notes app via bundle ID error=\(String(describing: error), privacy: .public)")
                }
            }
        }
        #endif
    }

    @MainActor
    private func sendDebugBundle() async {
        guard supportDiagnosticsEnabled else { return }
        do {
            let bundleURL = try await buildDebugBundleFile()
            #if os(iOS)
            debugBundleShareItems = [bundleURL]
            showingDebugBundleShareSheet = true
            #elseif os(macOS)
            let savePanel = NSSavePanel()
            savePanel.title = "Save Debug Bundle"
            savePanel.nameFieldStringValue = bundleURL.lastPathComponent
            savePanel.allowedContentTypes = [UTType.json]
            savePanel.canCreateDirectories = true
            guard savePanel.runModal() == .OK, let destination = savePanel.url else {
                return
            }
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: bundleURL, to: destination)
            debugBundleNoticeMessage = "Debug bundle saved to:\n\(destination.path)"
            showingDebugBundleNotice = true
            #endif
        } catch {
            debugBundleNoticeMessage = "Could not create debug bundle: \(error.localizedDescription)"
            showingDebugBundleNotice = true
        }
    }

    @MainActor
    private func buildDebugBundleFile() async throws -> URL {
        await refreshOpsRouteManifestIfNeeded(force: true)
        let now = Date()
        let formatter = ISO8601DateFormatter()
        let sync = await BackendMemoryAPI.shared.currentSyncState()
        let health = lastHealthStatus
        let routeManifest = lastOpsRoutesManifest
        let talkStats = lastTalkStats
        let talkErrors = lastTalkErrors

        let snapshot = DebugBundleSnapshot(
            generatedAtISO8601: formatter.string(from: now),
            appBundleID: Bundle.main.bundleIdentifier ?? "unknown",
            appVersion: (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "unknown",
            appBuild: (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "unknown",
            platform: {
                #if os(iOS)
                return "iOS"
                #elseif os(macOS)
                return "macOS"
                #else
                return "unknown"
                #endif
            }(),
            visualContextEnabled: visualContextEnabled,
            visualContextStatus: visualContextStatusText,
            lastVisualContextError: lastVisualContextError,
            voiceTransportMode: voiceTransportMode.rawValue,
            realtimePreviewStatus: realtimePreviewStatusText,
            realtimePreviewLive: realtimeTransport.isLive,
            lastRealtimeCommitTurnId: lastRealtimeCommittedTurnID,
            lastRealtimeCommitError: lastRealtimeCommitError,
            connectionState: backendConnectionState.rawValue,
            backendFailureCount: backendFailureCount,
            isTurnSubmitting: isTurnSubmitting,
            localStateVersion: localStateVersion,
            lastIssueSummary: lastIssueSummary,
            diagnosticsSummary: diagnosticsSummaryBody(at: now),
            speculative: DebugBundleSpeculativeSnapshot(
                silenceWindowTriggerCount: speculativeTalk.telemetry.silenceWindowTriggerCount,
                backendPrepareAttemptCount: speculativeTalk.telemetry.backendPrepareAttemptCount,
                backendPrepareSuccessCount: speculativeTalk.telemetry.backendPrepareSuccessCount,
                compatiblePreparedPromptReuseCount: speculativeTalk.telemetry.compatiblePreparedPromptReuseCount,
                lastCompatiblePreparedPromptReused: speculativeTalk.telemetry.lastCompatiblePreparedPromptReused,
                lastBackendReuseHit: speculativeTalk.telemetry.lastBackendReuseHit,
                lastSpeculativeKey: speculativeTalk.telemetry.lastSpeculativeKey,
                lastPreparedPromptHash: speculativeTalk.telemetry.lastPreparedPromptHash,
                lastTriggerAt: speculativeTalk.telemetry.lastTriggerAt
            ),
            backendHealth: health.map {
                DebugBundleHealthSnapshot(
                    ok: $0.ok,
                    status: $0.status,
                    sessionId: $0.sessionId,
                    stateVersion: $0.stateVersion,
                    backendBootId: $0.backendBootId,
                    backendBuild: $0.backendBuild,
                    lastTurnId: $0.lastTurnId,
                    lastUpdatedAt: $0.lastUpdatedAt,
                    historyUpdatedAt: $0.historyUpdatedAt,
                    memoryUpdatedAt: $0.memoryUpdatedAt
                )
            },
            backendRoutes: routeManifest.map {
                DebugBundleRoutesSnapshot(
                    schemaVersion: $0.schemaVersion,
                    scope: $0.scope,
                    total: $0.routeCountForDiagnostics,
                    diagnosticsSummary: $0.diagnosticsSummary,
                    groups: $0.groupNamesForDiagnostics,
                    routes: $0.routes,
                    refreshedAtISO8601: formatter.string(from: lastOpsRoutesManifestRefreshedAt ?? now),
                    lastError: lastOpsRoutesManifestError
                )
            },
            backendTalkDiagnostics: {
                guard talkStats != nil || talkErrors != nil || !lastTalkDiagnosticsError.isEmpty else {
                    return nil
                }
                return DebugBundleTalkDiagnosticsSnapshot(
                    statsSummary: talkStats?.diagnosticsSummary ?? "n/a",
                    errorSummary: talkErrors?.diagnosticsSummary ?? "n/a",
                    refreshedAtISO8601: formatter.string(from: lastTalkDiagnosticsRefreshedAt ?? now),
                    lastError: lastTalkDiagnosticsError
                )
            }(),
            clientLatency: {
                let summary = clientLatency.summary
                let health = clientLatency.health
                return DebugBundleClientLatencySnapshot(
                    sampleCount: summary.sampleCount,
                    healthLevel: health.level.rawValue,
                    healthSummary: health.diagnosticsSummary,
                    evaluatedMetricCount: health.evaluatedMetricCount,
                    pendingMetricCount: health.pendingMetricCount,
                    breaches: health.breaches,
                    latestFirstTextMs: summary.latestFirstTextMs,
                    latestFirstAudioMs: summary.latestFirstAudioMs,
                    latestBargeInAckMs: summary.latestBargeInAckMs,
                    medianFirstTextMs: summary.medianFirstTextMs,
                    p95FirstTextMs: summary.p95FirstTextMs,
                    medianFirstAudioMs: summary.medianFirstAudioMs,
                    p95FirstAudioMs: summary.p95FirstAudioMs,
                    samples: clientLatency.samples
                )
            }(),
            backendSync: DebugBundleSyncSnapshot(
                status: sync.status,
                sessionId: sync.sessionId,
                schemaVersion: sync.schemaVersion,
                backendBuild: sync.backendBuild,
                backendBootId: sync.backendBootId,
                lastTurnId: sync.lastTurnId,
                lastUpdatedAt: sync.lastUpdatedAt,
                historyUpdatedAt: sync.historyUpdatedAt,
                memoryUpdatedAt: sync.memoryUpdatedAt,
                stateVersion: sync.stateVersion
            )
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(snapshot)
        let fileName = "io.them-DebugBundle-\(Int(now.timeIntervalSince1970)).json"
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try data.write(to: fileURL, options: [.atomic])
        return fileURL
    }

    private func diagnosticsSummaryBody(at date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        let health = lastHealthStatus
        return [
            "Time: \(formatter.string(from: date))",
            "Connection: \(backendConnectionState.rawValue)",
            "Last issue: \(lastIssueSummary.isEmpty ? "n/a" : lastIssueSummary)",
            "State version: \(localStateVersion.isEmpty ? "n/a" : localStateVersion)",
            "Speculative silence hits: \(speculativeTalk.telemetry.silenceWindowTriggerCount)",
            "Speculative prompt reuse: \(speculativeTalk.telemetry.lastCompatiblePreparedPromptReused ? "yes" : "no")",
            "Backend speculative reuse: \(speculativeTalk.telemetry.lastBackendReuseHit ? "hit" : "miss")",
            "Backend status: \(health?.status ?? "n/a")",
            "Backend boot id: \(health?.backendBootId ?? "n/a")",
            "Last turn: \(health?.lastTurnId ?? "n/a")",
            "Backend routes: \(lastOpsRoutesManifest?.diagnosticsSummary ?? "n/a")",
            "Backend route error: \(lastOpsRoutesManifestError.isEmpty ? "n/a" : lastOpsRoutesManifestError)",
            "Talk stats: \(lastTalkStats?.diagnosticsSummary ?? "n/a")",
            "Talk errors: \(lastTalkErrors?.diagnosticsSummary ?? "n/a")",
            "Talk diagnostics error: \(lastTalkDiagnosticsError.isEmpty ? "n/a" : lastTalkDiagnosticsError)",
            "Client latency: \(clientLatency.summary.diagnosticsSummary)",
            "Client latency SLO: \(clientLatency.health.diagnosticsSummary)"
        ].joined(separator: "\n")
    }

    private func utteranceFingerprint(_ data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.prefix(12).map { String(format: "%02x", $0) }.joined()
    }

    private func richerTurnText(confirmedTranscript: String, partialHint: String) -> String {
        let transcript = confirmedTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        let partial = partialHint.trimmingCharacters(in: .whitespacesAndNewlines)

        if transcript.isEmpty { return partial }
        if partial.isEmpty { return transcript }

        let transcriptWords = transcript.split(whereSeparator: \.isWhitespace).count
        let partialWords = partial.split(whereSeparator: \.isWhitespace).count

        // Prefer the partial hint when it clearly carries richer current-turn detail.
        if partialWords >= transcriptWords + 2 { return partial }
        if partial.count >= transcript.count + 18 { return partial }
        if transcriptWords <= 1 && partialWords >= 2 { return partial }

        return transcript
    }

    private func currentRealtimePendingUserMessage() -> String {
        let pendingUser = realtimePendingUserTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !pendingUser.isEmpty {
            return pendingUser
        }
        return transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func showReplyEcho(user: String, assistant: String, debugToken: Int? = nil) {
        let cleanUser = user.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAssistant = assistant.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanAssistant.isEmpty else { return }
        replyEchoClearTask?.cancel()
        replyEchoClearTask = nil
        userReplyEcho = String(cleanUser.prefix(120))
        assistantReplyEcho = String(cleanAssistant.prefix(220))
        withAnimation(.easeIn(duration: 0.35)) {
            replyEchoOpacity = 1
        }
        #if DEBUG || os(macOS)
        writeOrbEchoDebugState(token: debugToken, stage: "shown")
        #endif
    }

    private func hideReplyEcho(debugToken: Int? = nil) {
        guard replyEchoOpacity > 0 || !assistantReplyEcho.isEmpty || !userReplyEcho.isEmpty else { return }
        replyEchoClearTask?.cancel()
        withAnimation(.easeOut(duration: 0.25)) {
            replyEchoOpacity = 0
        }
        #if DEBUG || os(macOS)
        writeOrbEchoDebugState(token: debugToken, stage: "hiding")
        #endif
        replyEchoClearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 320_000_000)
            guard !Task.isCancelled else { return }
            guard replyEchoOpacity <= 0.001 else { return }
            userReplyEcho = ""
            assistantReplyEcho = ""
            #if DEBUG || os(macOS)
            writeOrbEchoDebugState(token: debugToken, stage: "hidden")
            #endif
            replyEchoClearTask = nil
        }
    }

    #if DEBUG || os(macOS)
    private func writeOrbEchoDebugState(token: Int?, stage: String) {
        let defaults = UserDefaults.standard
        if let token, token > 0 {
            defaults.set(token, forKey: "orb_echo_debug_ack_token")
        }
        defaults.set(stage, forKey: "orb_echo_debug_stage")
        defaults.set(String(format: "%.3f", replyEchoOpacity), forKey: "orb_echo_debug_opacity")
        defaults.set(userReplyEcho, forKey: "orb_echo_debug_user_ack")
        defaults.set(assistantReplyEcho, forKey: "orb_echo_debug_assistant_ack")
        defaults.set(replyEchoOpacity > 0.01 && !assistantReplyEcho.isEmpty, forKey: "orb_echo_debug_visible")
        defaults.set(Date().timeIntervalSince1970, forKey: "orb_echo_debug_updated_at")
    }

    private func writeHomeTurnCueDebugState(
        token: Int,
        probeText: String,
        prepared: PreparedTurnPrompt
    ) {
        let defaults = UserDefaults.standard
        let expectedCue = "this person is a screenwriter — they think in scenes and characters"
        defaults.set(token, forKey: "home_turn_cue_debug_ack_token")
        defaults.set(probeText, forKey: "home_turn_cue_debug_ack_text")
        defaults.set(prepared.director.subtleMemoryCue, forKey: "home_turn_cue_debug_ack_cue")
        defaults.set(prepared.useScreenplayMode, forKey: "home_turn_cue_debug_ack_is_screenplay_mode")
        defaults.set(isStudioSurfaceActive ? "studio" : "home", forKey: "home_turn_cue_debug_ack_surface")
        defaults.set(
            prepared.baseSystemPrompt.localizedCaseInsensitiveContains(expectedCue),
            forKey: "home_turn_cue_debug_ack_prompt_contains_screenwriter_cue"
        )
        defaults.set(Date().timeIntervalSince1970, forKey: "home_turn_cue_debug_ack_updated_at")
    }
    #endif

    private func appendRecentTurnWindow(user: String, assistant: String) {
        let cleanUser = user.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAssistant = assistant.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUser.isEmpty, !cleanAssistant.isEmpty else { return }

        recentTurnWindow.append((
            user: String(cleanUser.prefix(320)),
            assistant: String(cleanAssistant.prefix(320))
        ))

        if recentTurnWindow.count > 3 {
            recentTurnWindow.removeFirst(recentTurnWindow.count - 3)
        }
    }

    @MainActor
    private func hydrateRecentTurnWindowFromBackend(
        sync: BackendSyncState? = nil,
        force: Bool = false
    ) async {
        let currentSync: BackendSyncState
        if let sync {
            currentSync = sync
        } else {
            currentSync = await BackendMemoryAPI.shared.currentSyncState()
        }
        let historyUpdatedAt = currentSync.historyUpdatedAt

        if !force,
           !recentTurnWindow.isEmpty,
           historyUpdatedAt > 0,
           historyUpdatedAt <= recentTurnWindowHistoryUpdatedAt {
            return
        }

        do {
            let history = try await BackendMemoryAPI.shared.fetchHistory(limit: 3, force: force)
            let hydrated = history.payload.threads
                .sorted {
                    if $0.updatedAt == $1.updatedAt {
                        return $0.turn < $1.turn
                    }
                    return $0.updatedAt < $1.updatedAt
                }
                .compactMap { thread -> (user: String, assistant: String)? in
                    let cleanUser = thread.user.trimmingCharacters(in: .whitespacesAndNewlines)
                    let cleanAssistant = thread.assistant.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !cleanUser.isEmpty, !cleanAssistant.isEmpty else { return nil }
                    return (
                        user: String(cleanUser.prefix(320)),
                        assistant: String(cleanAssistant.prefix(320))
                    )
                }

            recentTurnWindow = Array(hydrated.suffix(3))
            recentTurnWindowHistoryUpdatedAt = max(
                history.sync.historyUpdatedAt,
                history.payload.historyUpdatedAt ?? 0,
                history.payload.lastUpdatedAt ?? 0
            )
        } catch {
            if historyUpdatedAt > recentTurnWindowHistoryUpdatedAt {
                recentTurnWindowHistoryUpdatedAt = historyUpdatedAt
            }
        }
    }

    @MainActor
    private func startConversationLoopIfNeeded() {
        conversationLoopEnabled = true
        pendingGoodbyeStopAfterPlayback = false
        if voiceTransportMode == .realtimePreview,
           !realtimePreviewStandardFallbackActive {
            Task { @MainActor in
                await startRealtimePreviewConversationIfNeeded()
            }
            return
        }
        if voice.mode == .idle {
            voice.armOnce()
        } else {
            voice.resumeRecordingIfNeeded()
        }
    }

    @MainActor
    private func startRealtimePreviewConversationIfNeeded() async {
        guard !realtimeTransport.isLive, !realtimeTransport.isBusy else { return }

        cancelRealtimeRecovery(clearTurn: true)
        voice.stopRecording()
        voice.teardown()
        orbAudio.stop()
        promptSpeaker.stop()
        typedReplySpeaker.cancel()
        realtimeAssistantTranscriptFallbackTask?.cancel()
        realtimeAssistantTranscriptFallbackTask = nil
        realtimePendingUserTranscript = ""

        let bootstrap = await prewarmRealtimeIfNeeded(isScreenplayMode: isStudioSurfaceActive)
        guard let realtimeBridgeRequest, let bootstrap else {
            activateRealtimePreviewStandardFallback()
            return
        }
        realtimePreviewStandardFallbackActive = false
        realtimeTransport.connect(
            bootstrap: bootstrap,
            bridgeRequest: realtimeBridgeRequest
        )
    }

    @MainActor
    private func activateRealtimePreviewStandardFallback() {
        guard !realtimePreviewStandardFallbackActive else { return }
        let outcomeAlreadyResolved = realtimeRecoveryTurnWasInterrupted &&
            realtimeRecoveryOutcomeGate.isResolved
        let repairTranscript = realtimeRecoveryTranscriptIsFinal && !outcomeAlreadyResolved
            ? realtimePendingUserTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
            : ""
        if realtimeRecoveryTurnWasInterrupted,
           !realtimeRecoveryOutcomeGate.isResolved {
            guard realtimeRecoveryOutcomeGate.accept(.standardVoiceFallback) else { return }
        }
        cancelRealtimeRecovery(clearTurn: false)
        realtimePreviewStandardFallbackActive = true
        realtimeTransport.disconnect()
        if repairTranscript.isEmpty {
            showStudioCommandNotice("Live voice switched to standard voice.")
        } else {
            showStudioCommandNotice("Live voice switched to standard voice and kept your turn.")
        }
#if DEBUG
        if uiTestRealtimeNetworkFaultStage != nil {
            publishUITestRealtimeNetworkFaultResult()
            clearRealtimeRecoveryTurn()
            return
        }
#endif
        if voice.mode == .idle {
            voice.armOnce()
        } else {
            voice.resumeRecordingIfNeeded()
        }

        guard !repairTranscript.isEmpty, inFlightTalkTask == nil else { return }
        let fingerprint = utteranceFingerprint(Data(repairTranscript.utf8))
        let now = Date()
        guard fingerprint != lastRealtimeFallbackRepairFingerprint ||
                now.timeIntervalSince(lastRealtimeFallbackRepairAt) >= 30 else {
            clearRealtimeRecoveryTurn()
            return
        }

        lastRealtimeFallbackRepairFingerprint = fingerprint
        lastRealtimeFallbackRepairAt = now
        transcript = repairTranscript
        livePartialTranscript = ""
        cancelRealtimeStudioDraftStream(restorePreview: true)
        clearRealtimeRecoveryTurn()
        inFlightTalkTask = Task { @MainActor in
            await sendUtterance(
                silentTalkWavData(durationMs: 180),
                clientTranscriptOverride: repairTranscript
            )
        }
    }

    @MainActor
    private func handleRealtimeConnectionLoss(_ loss: ClementineRealtimeConnectionLoss) {
        guard voiceTransportMode == .realtimePreview,
              conversationLoopEnabled,
              !realtimePreviewStandardFallbackActive else { return }

        realtimeRecoveryTurnWasInterrupted = true
        realtimeAssistantTranscriptFallbackTask?.cancel()
        realtimeAssistantTranscriptFallbackTask = nil
        let pendingTranscript = realtimePendingUserTranscript
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !pendingTranscript.isEmpty {
            realtimeRecoveryTranscriptIsFinal = true
            realtimeRecoveryNeedsTurnRepair = true
        } else if loss.hasRepairableTurn {
            let recoveredTranscript = loss.userTranscript
                .trimmingCharacters(in: .whitespacesAndNewlines)
            realtimePendingUserTranscript = recoveredTranscript
            transcript = recoveredTranscript
            livePartialTranscript = ""
            lastNonEmptyPartialTranscriptHint = String(recoveredTranscript.prefix(320))
            realtimeRecoveryTranscriptIsFinal = true
            realtimeRecoveryNeedsTurnRepair = true
        } else {
            let partial = loss.userTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
            if !partial.isEmpty {
                livePartialTranscript = String(partial.prefix(320))
                lastNonEmptyPartialTranscriptHint = String(partial.prefix(320))
            }
        }
        if !loss.turnID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            realtimeRecoveryTurnID = loss.turnID.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        realtimeRecoveryOutcomeGate.begin(
            turnID: realtimeRecoveryTurnID,
            transcript: realtimePendingUserTranscript.isEmpty
                ? loss.userTranscript
                : realtimePendingUserTranscript
        )

        if loss.requiresStandardVoiceFallback {
            activateRealtimePreviewStandardFallback()
            return
        }
        if realtimeRecoveryOutcomeGate.outcome == .repairedResponse {
            realtimeRecoveryNeedsTurnRepair = false
        } else if realtimeRecoveryNeedsTurnRepair,
                  !lastRealtimeRepairDispatchKey.isEmpty,
                  lastRealtimeRepairDispatchKey == realtimeRecoveryOutcomeGate.turnKey {
            activateRealtimePreviewStandardFallback()
            return
        }

        guard loss.recoverable else {
            activateRealtimePreviewStandardFallback()
            return
        }
        scheduleRealtimeReconnect(after: loss)
    }

    @MainActor
    private func scheduleRealtimeReconnect(after loss: ClementineRealtimeConnectionLoss) {
        realtimeRecoveryTask?.cancel()
        realtimeRecoveryTask = nil
        realtimeRecoveryGeneration += 1
        let generation = realtimeRecoveryGeneration
        let nextAttempt = realtimeReconnectAttempt + 1
        guard ClementineRealtimeRecoveryPolicy.shouldReconnect(
            after: loss,
            attempt: nextAttempt
        ), let delay = ClementineRealtimeRecoveryPolicy.delayNanoseconds(forAttempt: nextAttempt) else {
            activateRealtimePreviewStandardFallback()
            return
        }

        realtimeReconnectAttempt = nextAttempt
        if nextAttempt == 1 {
            showStudioCommandNotice("Reconnecting live voice…")
        }
#if DEBUG
        if uiTestRealtimeNetworkFaultStage != nil {
            realtimeRecoveryTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 40_000_000)
                guard !Task.isCancelled,
                      generation == realtimeRecoveryGeneration else { return }
                handleRealtimeConnectionRestored()
            }
            return
        }
#endif
        realtimeRecoveryTask = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: delay)
            } catch {
                return
            }
            guard generation == realtimeRecoveryGeneration,
                  voiceTransportMode == .realtimePreview,
                  conversationLoopEnabled,
                  !realtimePreviewStandardFallbackActive else { return }

            let bootstrap = await prewarmRealtimeIfNeeded(
                isScreenplayMode: isStudioSurfaceActive,
                forceCredentialRefresh: true
            )
            guard generation == realtimeRecoveryGeneration else { return }
            guard let bootstrap, let realtimeBridgeRequest else {
                realtimeRecoveryTask = nil
                scheduleRealtimeReconnect(
                    after: .local(
                        cause: .negotiationFailed,
                        message: "Could not refresh the Realtime session."
                    )
                )
                return
            }

            realtimeTransport.connect(
                bootstrap: bootstrap,
                bridgeRequest: realtimeBridgeRequest
            )
            do {
                try await Task.sleep(
                    nanoseconds: ClementineRealtimeRecoveryPolicy.connectionTimeoutNanoseconds
                )
            } catch {
                return
            }
            guard generation == realtimeRecoveryGeneration,
                  !realtimeTransport.isLive else { return }
            realtimeRecoveryTask = nil
            scheduleRealtimeReconnect(
                after: .local(
                    cause: .connectionTimeout,
                    message: "Realtime reconnection timed out."
                )
            )
        }
    }

    @MainActor
    private func handleRealtimeConnectionRestored() {
        let wasRecovering = realtimeReconnectAttempt > 0
        let repairTranscript = realtimePendingUserTranscript
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let shouldRepairTurn = wasRecovering &&
            realtimeRecoveryTranscriptIsFinal &&
            realtimeRecoveryNeedsTurnRepair &&
            !realtimeRecoveryOutcomeGate.isResolved &&
            !repairTranscript.isEmpty
        let repairTurnID = realtimeRecoveryTurnID

        realtimeRecoveryGeneration += 1
        realtimeRecoveryTask?.cancel()
        realtimeRecoveryTask = nil
        realtimeReconnectAttempt = 0
        realtimePreviewStandardFallbackActive = false

        if shouldRepairTurn {
            realtimeRecoveryNeedsTurnRepair = false
            lastRealtimeRepairDispatchKey = realtimeRecoveryOutcomeGate.turnKey
#if DEBUG
            if uiTestRealtimeNetworkFaultStage != nil {
                _ = realtimeRecoveryOutcomeGate.accept(.repairedResponse)
                _ = realtimeRecoveryOutcomeGate.accept(.repairedResponse)
                publishUITestRealtimeNetworkFaultResult()
                clearRealtimeRecoveryTurn()
                return
            }
#endif
            realtimeTransport.repairInterruptedTurn(
                userTranscript: repairTranscript,
                turnID: repairTurnID
            )
        }
        if wasRecovering {
            showStudioCommandNotice(
                shouldRepairTurn ? "Live voice restored. Continuing your thought." : "Live voice restored."
            )
        }
    }

    @MainActor
    private func cancelRealtimeRecovery(clearTurn: Bool) {
        realtimeRecoveryGeneration += 1
        realtimeRecoveryTask?.cancel()
        realtimeRecoveryTask = nil
        realtimeReconnectAttempt = 0
        if clearTurn {
            clearRealtimeRecoveryTurn()
            realtimeRecoveryTurnWasInterrupted = false
            realtimeRecoveryOutcomeGate.reset()
            lastRealtimeRepairDispatchKey = ""
        }
    }

    @MainActor
    private func clearRealtimeRecoveryTurn() {
        realtimePendingUserTranscript = ""
        realtimeRecoveryTurnID = ""
        realtimeRecoveryTranscriptIsFinal = false
        realtimeRecoveryNeedsTurnRepair = false
    }

    @MainActor
    private func resetRealtimeRecoveryOutcome(turnID: String, transcript: String = "") {
        realtimeRecoveryTurnWasInterrupted = false
        realtimeRecoveryOutcomeGate.reset()
        realtimeRecoveryOutcomeGate.begin(turnID: turnID, transcript: transcript)
        lastRealtimeRepairDispatchKey = ""
    }

    @MainActor
    private func acceptRealtimeRecoveryResponseIfNeeded() -> Bool {
        guard realtimeRecoveryTurnWasInterrupted else { return true }
        return realtimeRecoveryOutcomeGate.accept(.repairedResponse)
    }

#if DEBUG
    @MainActor
    private func publishUITestRealtimeNetworkFaultResult() {
        guard let stage = uiTestRealtimeNetworkFaultStage else { return }
        let expectedOutcome: ClementineRealtimeRecoveryOutcome = stage == .speech || stage == .transcription
            ? .standardVoiceFallback
            : .repairedResponse
        let responseCount = realtimeRecoveryOutcomeGate.outcome == .repairedResponse ? 1 : 0
        let fallbackCount = realtimeRecoveryOutcomeGate.outcome == .standardVoiceFallback ? 1 : 0
        let outcomeValue = realtimeRecoveryOutcomeGate.outcome?.rawValue ?? "none"
        let duplicateExpectationMet = expectedOutcome != .repairedResponse ||
            realtimeRecoveryOutcomeGate.suppressedCount == 1
        let complete = realtimeRecoveryOutcomeGate.outcome == expectedOutcome &&
            realtimeRecoveryOutcomeGate.acceptedCount == 1 &&
            responseCount + fallbackCount == 1 &&
            duplicateExpectationMet
        uiTestRealtimeNetworkFaultResult = [
            "stage=\(stage.rawValue)",
            "outcome=\(outcomeValue)",
            "response_count=\(responseCount)",
            "fallback_count=\(fallbackCount)",
            "duplicate_suppressed=\(realtimeRecoveryOutcomeGate.suppressedCount)",
            "complete=\(complete)",
        ].joined(separator: " ")
    }
#endif

    @MainActor
    private struct StudioDialogueAnchorMetadata {
        let startLine: Int?
        let endLine: Int?
        let sceneLabel: String
        let draftSceneID: String
        let outlineSceneID: String
        let outlineBeatIDs: [String]
        let scriptNodeID: String
        let documentRevisionID: String
    }

    @MainActor
    private func resolvedStudioDialogueAnchorMetadata(
        startLine: Int? = nil,
        endLine: Int? = nil,
        sceneLabelOverride: String? = nil,
        writeID: String = ""
    ) -> StudioDialogueAnchorMetadata {
        let fallbackTarget: (start: Int, end: Int?) = {
            if let replacement = screenplayDraftBridge.pendingReplacementTarget
                ?? screenplayDraftBridge.submittedReplacementTarget {
                return (replacement.startLine, replacement.endLine)
            }
            if let selection = screenplayDraftBridge.selectedEditorSnapshot() {
                return (selection.startLine, selection.endLine)
            }
            let line = max(1, screenplayDraftBridge.currentCursorLine)
            return (line, line)
        }()
        let safeStartLine = max(1, startLine ?? fallbackTarget.start)
        let safeEndLine = max(safeStartLine, endLine ?? fallbackTarget.end ?? safeStartLine)
        let resolvedScene = screenplayDraftBridge.structuredDraft.scenes.last(where: {
            safeStartLine >= $0.line && safeStartLine <= max($0.endLine, $0.line)
        }) ?? screenplayDraftBridge.structuredDraft.scenes.last(where: { $0.line <= safeStartLine })
        let resolvedParagraph = screenplayDraftBridge.structuredDraft.paragraphs.first(where: {
            $0.line == safeStartLine
        }) ?? screenplayDraftBridge.structuredDraft.paragraphs.first(where: {
            $0.line >= safeStartLine && $0.line <= safeEndLine
        })
        let binding = resolvedScene.flatMap { screenplayDraftBridge.projectBindingSnapshot(forDraftSceneID: $0.id) }
        let cleanSceneLabelOverride = (sceneLabelOverride ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedSceneLabel = cleanSceneLabelOverride.isEmpty
            ? (resolvedScene?.slugline ?? studioSceneLabelForDraftLine(safeStartLine) ?? "")
            : cleanSceneLabelOverride
        let resolvedDocumentRevisionID = screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveScreenplayVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedDraftSceneID = resolvedScene?.id.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let resolvedOutlineSceneID = binding?.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let resolvedOutlineBeatIDs = (binding?.outlineBeatIDs ?? []).map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.filter { !$0.isEmpty }
        let cleanWriteID = writeID.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackScriptNodeBase = !resolvedDraftSceneID.isEmpty
            ? resolvedDraftSceneID
            : (!cleanWriteID.isEmpty ? cleanWriteID : (!resolvedDocumentRevisionID.isEmpty ? resolvedDocumentRevisionID : "draft"))
        let resolvedParagraphID = resolvedParagraph?.id.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let resolvedScriptNodeID = !resolvedParagraphID.isEmpty &&
            !isLegacyStudioParagraphAnchorID(resolvedParagraphID)
            ? resolvedParagraphID
            : "\(fallbackScriptNodeBase):line:\(safeStartLine)"
        return StudioDialogueAnchorMetadata(
            startLine: safeStartLine,
            endLine: safeEndLine,
            sceneLabel: resolvedSceneLabel,
            draftSceneID: resolvedDraftSceneID,
            outlineSceneID: resolvedOutlineSceneID,
            outlineBeatIDs: resolvedOutlineBeatIDs,
            scriptNodeID: resolvedScriptNodeID,
            documentRevisionID: resolvedDocumentRevisionID
        )
    }

    @MainActor
    private func initialStudioTalkMetadata(from preparedPrompt: PreparedTurnPrompt) -> BackendStudioThreadCommitMetadata? {
        guard preparedPrompt.useScreenplayMode else { return nil }
        let projectId = screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveScreenplayProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let target = preparedPrompt.shouldWriteToPage ? "page" : "voice_pin"
        let anchorMetadata = preparedPrompt.shouldWriteToPage
            ? resolvedStudioDialogueAnchorMetadata()
            : nil
        let insertionMode = (screenplayDraftBridge.pendingReplacementTarget ?? screenplayDraftBridge.submittedReplacementTarget) != nil
            ? "replace_selection"
            : "insert_after_anchor"
        let promptContinuity = screenplayPromptContinuityContext()
        let draftExcerpt = String(
            screenplayDraftBridge.draftText
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .suffix(6_000)
        )
        let metadata = BackendStudioThreadCommitMetadata(
            screenplayProjectId: projectId,
            screenplayDocumentRevisionId: anchorMetadata?.documentRevisionID ?? "",
            screenplayTarget: target,
            screenplayPromptSource: ScreenplayStudioUserPrompt.Source.voice.rawValue,
            screenplayWriteId: "",
            screenplayAnchorLine: anchorMetadata?.startLine,
            screenplayAnchorEndLine: anchorMetadata?.endLine,
            screenplayInsertionMode: preparedPrompt.shouldWriteToPage ? insertionMode : "",
            screenplayAnchorSceneLabel: anchorMetadata?.sceneLabel ?? "",
            screenplayAnchorDraftSceneId: anchorMetadata?.draftSceneID ?? "",
            screenplayAnchorOutlineSceneId: anchorMetadata?.outlineSceneID ?? "",
            screenplayAnchorOutlineBeatIds: anchorMetadata?.outlineBeatIDs ?? [],
            screenplayAnchorScriptNodeId: anchorMetadata?.scriptNodeID ?? "",
            screenplayNoteTitle: "",
            screenplayNoteBody: "",
            screenplayInsertedText: "",
            screenplayReplacementApplied: false,
            screenplayReplacedWriteId: "",
            screenplayRevisedBlockText: "",
            screenplayResolvedAnchorExcerpt: "",
            screenplayDraftExcerpt: draftExcerpt,
            screenplayAct: promptContinuity.act,
            screenplaySceneObjective: promptContinuity.sceneObjective,
            screenplaySceneSummary: promptContinuity.sceneSummary,
            screenplayCurrentBeat: promptContinuity.currentBeat,
            screenplayLogline: promptContinuity.logline,
            screenplayThemeArgument: promptContinuity.themeArgument,
            screenplayCentralQuestion: promptContinuity.centralQuestion,
            screenplayProtagonistWant: promptContinuity.protagonistWant,
            screenplayProtagonistNeed: promptContinuity.protagonistNeed,
            screenplayAntagonisticForce: promptContinuity.antagonisticForce,
            screenplayEndingImage: promptContinuity.endingImage,
            screenplayFeatureSequence: promptContinuity.featureSequence,
            screenplayFeatureObligation: promptContinuity.featureObligation,
            screenplayActPressureState: promptContinuity.actPressureState,
            screenplayCharacterArcState: promptContinuity.characterArcState,
            screenplayCharacterArcMemory: promptContinuity.characterArcMemory,
            screenplayCharacterVoiceMemories: promptContinuity.characterVoiceMemories,
            screenplayLastSceneOutcome: promptContinuity.lastSceneOutcome,
            screenplayNextScenePlan: promptContinuity.nextScenePlan,
            screenplayNextSceneMoves: promptContinuity.nextSceneMoves,
            screenplayNextThreeTurns: promptContinuity.nextThreeTurns,
            screenplayActThreePayoffPath: promptContinuity.actThreePayoffPath,
            screenplayBeatSequence: promptContinuity.beatSequence,
            screenplayCharacterFocus: promptContinuity.characterFocus,
            screenplayUnresolvedSetups: promptContinuity.unresolvedSetups,
            screenplayUnresolvedStoryThreads: promptContinuity.unresolvedStoryThreads,
            screenplayCharacterArcTurns: promptContinuity.characterArcTurns,
            screenplayImageMotifs: promptContinuity.imageMotifs,
            screenplayContinuityNotes: promptContinuity.continuityNotes,
            screenplayEmotionalContinuity: promptContinuity.emotionalContinuity,
            screenplayPageCount: promptContinuity.pageCount > 0 ? promptContinuity.pageCount : nil,
            screenplayTargetPages: promptContinuity.targetPages > 0 ? promptContinuity.targetPages : nil
        )
        return metadata.isMeaningful ? metadata : nil
    }

    @MainActor
    private func studioRenderRequestMetadata(
        promptSource: ScreenplayStudioUserPrompt.Source,
        shouldWriteToPage: Bool,
        requestID: String? = nil
    ) -> BackendStudioThreadCommitMetadata? {
        guard isStudioSurfaceActive else { return nil }
        let projectId = screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveScreenplayProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let anchorMetadata = shouldWriteToPage
            ? resolvedStudioDialogueAnchorMetadata()
            : nil
        let insertionMode = (screenplayDraftBridge.pendingReplacementTarget ?? screenplayDraftBridge.submittedReplacementTarget) != nil
            ? "replace_selection"
            : "insert_after_anchor"
        let promptContinuity = screenplayPromptContinuityContext(featureWorkflowRequestID: requestID)
        let metadata = BackendStudioThreadCommitMetadata(
            screenplayProjectId: projectId,
            screenplayDocumentRevisionId: anchorMetadata?.documentRevisionID ?? "",
            screenplayTarget: shouldWriteToPage ? "page" : "voice_pin",
            screenplayPromptSource: promptSource.rawValue,
            screenplayWriteId: "",
            screenplayAnchorLine: anchorMetadata?.startLine,
            screenplayAnchorEndLine: anchorMetadata?.endLine,
            screenplayInsertionMode: shouldWriteToPage ? insertionMode : "",
            screenplayAnchorSceneLabel: anchorMetadata?.sceneLabel ?? "",
            screenplayAnchorDraftSceneId: anchorMetadata?.draftSceneID ?? "",
            screenplayAnchorOutlineSceneId: anchorMetadata?.outlineSceneID ?? "",
            screenplayAnchorOutlineBeatIds: anchorMetadata?.outlineBeatIDs ?? [],
            screenplayAnchorScriptNodeId: anchorMetadata?.scriptNodeID ?? "",
            screenplayNoteTitle: "",
            screenplayNoteBody: "",
            screenplayInsertedText: "",
            screenplayReplacementApplied: false,
            screenplayReplacedWriteId: "",
            screenplayRevisedBlockText: "",
            screenplayResolvedAnchorExcerpt: "",
            screenplayDraftExcerpt: String(
                screenplayDraftBridge.draftText
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .suffix(6_000)
            ),
            screenplayAct: promptContinuity.act,
            screenplaySceneObjective: promptContinuity.sceneObjective,
            screenplaySceneSummary: promptContinuity.sceneSummary,
            screenplayCurrentBeat: promptContinuity.currentBeat,
            screenplayLogline: promptContinuity.logline,
            screenplayThemeArgument: promptContinuity.themeArgument,
            screenplayCentralQuestion: promptContinuity.centralQuestion,
            screenplayProtagonistWant: promptContinuity.protagonistWant,
            screenplayProtagonistNeed: promptContinuity.protagonistNeed,
            screenplayAntagonisticForce: promptContinuity.antagonisticForce,
            screenplayEndingImage: promptContinuity.endingImage,
            screenplayFeatureSequence: promptContinuity.featureSequence,
            screenplayFeatureObligation: promptContinuity.featureObligation,
            screenplayActPressureState: promptContinuity.actPressureState,
            screenplayCharacterArcState: promptContinuity.characterArcState,
            screenplayCharacterArcMemory: promptContinuity.characterArcMemory,
            screenplayCharacterVoiceMemories: promptContinuity.characterVoiceMemories,
            screenplayLastSceneOutcome: promptContinuity.lastSceneOutcome,
            screenplayNextScenePlan: promptContinuity.nextScenePlan,
            screenplayNextSceneMoves: promptContinuity.nextSceneMoves,
            screenplayNextThreeTurns: promptContinuity.nextThreeTurns,
            screenplayActThreePayoffPath: promptContinuity.actThreePayoffPath,
            screenplayBeatSequence: promptContinuity.beatSequence,
            screenplayCharacterFocus: promptContinuity.characterFocus,
            screenplayUnresolvedSetups: promptContinuity.unresolvedSetups,
            screenplayUnresolvedStoryThreads: promptContinuity.unresolvedStoryThreads,
            screenplayCharacterArcTurns: promptContinuity.characterArcTurns,
            screenplayImageMotifs: promptContinuity.imageMotifs,
            screenplayContinuityNotes: promptContinuity.continuityNotes,
            screenplayEmotionalContinuity: promptContinuity.emotionalContinuity,
            screenplayPageCount: promptContinuity.pageCount > 0 ? promptContinuity.pageCount : nil,
            screenplayTargetPages: promptContinuity.targetPages > 0 ? promptContinuity.targetPages : nil
        )
        return metadata.isMeaningful ? metadata : nil
    }

    @MainActor
    private func annotateStudioTalkTurnIfNeeded(
        result: BackendTalkResult,
        promptSource: ScreenplayStudioUserPrompt.Source,
        targetOverride: ScreenplayStudioUserPrompt.Target? = nil,
        insertedTextOverride: String? = nil
    ) async {
        guard isStudioSurfaceActive || result.screenplayTrace.modeEnabled else { return }
        guard let rawTurnId = result.commit?.turnId else { return }
        let turnId = rawTurnId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !turnId.isEmpty else { return }
        await waitForStudioPageWriteCommitIfNeeded(
            targetOverride: targetOverride,
            insertedTextOverride: insertedTextOverride
        )
        guard let studioMetadata = studioThreadCommitMetadata(
            promptSource: promptSource,
            targetOverride: targetOverride,
            insertedTextOverride: insertedTextOverride
        ) else { return }

        do {
            let annotation = try await BackendMemoryAPI.shared.annotateTurnHistory(
                turnId: turnId,
                studioMetadata: studioMetadata
            )
            if !annotation.sync.stateVersion.isEmpty {
                localStateVersion = annotation.sync.stateVersion
            }
        } catch {
            HerLog.talk.error("studio turn metadata annotate error=\(error.localizedDescription, privacy: .public)")
        }
    }

    @MainActor
    private func studioThreadCommitMetadata(
        promptSource: ScreenplayStudioUserPrompt.Source,
        targetOverride: ScreenplayStudioUserPrompt.Target? = nil,
        insertedTextOverride: String? = nil,
        requestID: String? = nil
    ) -> BackendStudioThreadCommitMetadata? {
        guard isStudioSurfaceActive else { return nil }

        let projectId = screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveScreenplayProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            : screenplayDraftBridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanInsertedTextOverride = (insertedTextOverride ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let hasInsertedTextOverride = !cleanInsertedTextOverride.isEmpty
        let pin = screenplayDraftBridge.assistantPin
        let pinMode = pin.mode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let latestCommittedWrite = screenplayDraftBridge.lastCommittedWrite?.isAuthoritativeWrite == true
            ? screenplayDraftBridge.lastCommittedWrite
            : nil
        let explicitPageWrite = targetOverride == .page && (hasInsertedTextOverride || latestCommittedWrite != nil)
        let isPageWrite: Bool
        if targetOverride == .voicePin {
            isPageWrite = false
        } else {
            isPageWrite = pinMode == "page" || explicitPageWrite
        }
        let committedWrite = isPageWrite ? latestCommittedWrite : nil
        let noteTitle: String
        let noteBody: String

        if let committedWrite {
            noteTitle = "Wrote to page"
            noteBody = clippedStudioAssistantText(committedWrite.insertedText, limit: 280)
        } else if isPageWrite && hasInsertedTextOverride {
            noteTitle = "Wrote to page"
            noteBody = clippedStudioAssistantText(cleanInsertedTextOverride, limit: 280)
        } else {
            let cleanTitle = pin.title.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanBody = pin.body.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanFullBody = pin.fullBody.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanActionSummary = pin.actionSummary.trimmingCharacters(in: .whitespacesAndNewlines)
            noteTitle = cleanTitle.isEmpty ? "io.them" : cleanTitle
            noteBody = clippedStudioAssistantText(
                cleanFullBody.isEmpty ? (cleanBody.isEmpty ? cleanActionSummary : cleanBody) : cleanFullBody,
                limit: 280
            )
        }

        let anchorLine = committedWrite?.startLine
        let anchorEndLine = committedWrite?.endLine
        let anchorMetadata = resolvedStudioDialogueAnchorMetadata(
            startLine: anchorLine,
            endLine: anchorEndLine,
            sceneLabelOverride: committedWrite.flatMap { studioSceneLabelForDraftLine($0.startLine) },
            writeID: committedWrite?.writeID ?? ""
        )
        let anchorSceneLabel = anchorMetadata.sceneLabel
        let replacementApplied = committedWrite?.replacementApplied == true
        let replacedWriteID = replacementApplied ? (committedWrite?.replacedWriteID ?? "") : ""
        let revisedBlockText = replacementApplied ? (committedWrite?.insertedText ?? "") : ""
        let resolvedAnchorExcerpt = committedWrite.map { clippedStudioAssistantText($0.insertedText, limit: 220) }
            ?? (isPageWrite && hasInsertedTextOverride
                ? clippedStudioAssistantText(cleanInsertedTextOverride, limit: 220)
                : "")
        let promptContinuity = screenplayPromptContinuityContext(
            featureWorkflowRequestID: requestID
        )
        let metadata = BackendStudioThreadCommitMetadata(
            screenplayProjectId: projectId,
            screenplayDocumentRevisionId: anchorMetadata.documentRevisionID,
            screenplayTarget: isPageWrite ? "page" : "voice_pin",
            screenplayPromptSource: promptSource.rawValue,
            screenplayWriteId: committedWrite?.writeID ?? "",
            screenplayAnchorLine: anchorMetadata.startLine,
            screenplayAnchorEndLine: anchorMetadata.endLine,
            screenplayInsertionMode: replacementApplied ? "replace_selection" : "insert_after_anchor",
            screenplayAnchorSceneLabel: anchorSceneLabel,
            screenplayAnchorDraftSceneId: anchorMetadata.draftSceneID,
            screenplayAnchorOutlineSceneId: anchorMetadata.outlineSceneID,
            screenplayAnchorOutlineBeatIds: anchorMetadata.outlineBeatIDs,
            screenplayAnchorScriptNodeId: anchorMetadata.scriptNodeID,
            screenplayNoteTitle: noteTitle,
            screenplayNoteBody: noteBody,
            screenplayInsertedText: committedWrite?.insertedText ?? (isPageWrite ? cleanInsertedTextOverride : ""),
            screenplayReplacementApplied: replacementApplied,
            screenplayReplacedWriteId: replacedWriteID,
            screenplayRevisedBlockText: revisedBlockText,
            screenplayResolvedAnchorExcerpt: resolvedAnchorExcerpt,
            screenplayDraftExcerpt: String(
                screenplayDraftBridge.draftText
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .suffix(6_000)
            ),
            screenplayAct: promptContinuity.act,
            screenplaySceneObjective: promptContinuity.sceneObjective,
            screenplaySceneSummary: promptContinuity.sceneSummary,
            screenplayCurrentBeat: promptContinuity.currentBeat,
            screenplayLogline: promptContinuity.logline,
            screenplayThemeArgument: promptContinuity.themeArgument,
            screenplayCentralQuestion: promptContinuity.centralQuestion,
            screenplayProtagonistWant: promptContinuity.protagonistWant,
            screenplayProtagonistNeed: promptContinuity.protagonistNeed,
            screenplayAntagonisticForce: promptContinuity.antagonisticForce,
            screenplayEndingImage: promptContinuity.endingImage,
            screenplayFeatureSequence: promptContinuity.featureSequence,
            screenplayFeatureObligation: promptContinuity.featureObligation,
            screenplayActPressureState: promptContinuity.actPressureState,
            screenplayCharacterArcState: promptContinuity.characterArcState,
            screenplayCharacterArcMemory: promptContinuity.characterArcMemory,
            screenplayCharacterVoiceMemories: promptContinuity.characterVoiceMemories,
            screenplayLastSceneOutcome: promptContinuity.lastSceneOutcome,
            screenplayNextScenePlan: promptContinuity.nextScenePlan,
            screenplayNextSceneMoves: promptContinuity.nextSceneMoves,
            screenplayNextThreeTurns: promptContinuity.nextThreeTurns,
            screenplayActThreePayoffPath: promptContinuity.actThreePayoffPath,
            screenplayBeatSequence: promptContinuity.beatSequence,
            screenplayCharacterFocus: promptContinuity.characterFocus,
            screenplayUnresolvedSetups: promptContinuity.unresolvedSetups,
            screenplayUnresolvedStoryThreads: promptContinuity.unresolvedStoryThreads,
            screenplayCharacterArcTurns: promptContinuity.characterArcTurns,
            screenplayImageMotifs: promptContinuity.imageMotifs,
            screenplayContinuityNotes: promptContinuity.continuityNotes,
            screenplayEmotionalContinuity: promptContinuity.emotionalContinuity,
            screenplayPageCount: promptContinuity.pageCount > 0 ? promptContinuity.pageCount : nil,
            screenplayTargetPages: promptContinuity.targetPages > 0 ? promptContinuity.targetPages : nil
        )
        return metadata.isMeaningful ? metadata : nil
    }

    @MainActor
    private func waitForStudioPageWriteCommitIfNeeded(
        targetOverride: ScreenplayStudioUserPrompt.Target? = nil,
        insertedTextOverride: String? = nil,
        timeoutMs: UInt64 = 8_000
    ) async {
        guard isStudioSurfaceActive else { return }
        let shouldWaitForPageWrite = targetOverride == .page
            || !(insertedTextOverride ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard shouldWaitForPageWrite else { return }

        let expectedInsertedText = (insertedTextOverride ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let deadline = ContinuousClock.now + .milliseconds(timeoutMs)

        while ContinuousClock.now < deadline {
            if let committedWrite = screenplayDraftBridge.lastCommittedWrite {
                guard committedWrite.isAuthoritativeWrite else {
                    try? await Task.sleep(nanoseconds: 50_000_000)
                    continue
                }
                let committedText = committedWrite.insertedText.trimmingCharacters(in: .whitespacesAndNewlines)
                let normalizedCommitted = committedText.replacingOccurrences(of: "\r\n", with: "\n")
                let normalizedExpected = expectedInsertedText.replacingOccurrences(of: "\r\n", with: "\n")
                if normalizedExpected.isEmpty
                    || normalizedCommitted == normalizedExpected
                    || normalizedCommitted.contains(normalizedExpected)
                    || normalizedExpected.contains(normalizedCommitted) {
                    return
                }
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    @MainActor
    private func studioSceneLabelForDraftLine(_ line: Int) -> String? {
        if let scene = screenplayDraftBridge.structuredDraft.scenes.last(where: { $0.line <= max(1, line) }) {
            return scene.slugline
        }
        let cleanDraft = screenplayDraftBridge.draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanDraft.isEmpty else { return nil }
        let lines = cleanDraft.components(separatedBy: .newlines)
        guard !lines.isEmpty else { return nil }
        let clampedIndex = max(0, min(max(1, line) - 1, lines.count - 1))
        for index in stride(from: clampedIndex, through: 0, by: -1) {
            let candidate = lines[index].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !candidate.isEmpty else { continue }
            let upper = candidate.uppercased()
            if upper.hasPrefix("INT.") ||
                upper.hasPrefix("EXT.") ||
                upper.hasPrefix("INT./EXT.") ||
                upper.hasPrefix("EXT./INT.") ||
                upper.hasPrefix("INT/EXT.") ||
                upper.hasPrefix("I/E.") {
                return candidate
            }
        }
        return nil
    }

    @MainActor
    private func commitRealtimePreviewTurnIfNeeded(
        userMessage: String,
        assistantMessage: String,
        promptSource: ScreenplayStudioUserPrompt.Source = .voice,
        requestId: String? = nil,
        targetOverride: ScreenplayStudioUserPrompt.Target? = nil,
        insertedTextOverride: String? = nil
    ) async {
        let cleanUser = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAssistant = assistantMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUser.isEmpty, !cleanAssistant.isEmpty else { return }

        let fingerprintSeed = "\(cleanUser)\n--assistant--\n\(cleanAssistant)"
        let fingerprint = utteranceFingerprint(Data(fingerprintSeed.utf8))
        let now = Date()
        if fingerprint == lastRealtimeCommittedPairFingerprint,
           now.timeIntervalSince(lastRealtimeCommitAt) < 12 {
            return
        }

        lastRealtimeCommittedPairFingerprint = fingerprint
        lastRealtimeCommitError = ""
        let memoryDomain = isStudioSurfaceActive
            ? studioMemoryDomain(for: cleanUser, preferredTarget: .automatic)
            : .companion

        do {
            await waitForStudioPageWriteCommitIfNeeded(
                targetOverride: targetOverride,
                insertedTextOverride: insertedTextOverride
            )
            let studioMetadata = studioThreadCommitMetadata(
                promptSource: promptSource,
                targetOverride: targetOverride,
                insertedTextOverride: insertedTextOverride,
                requestID: requestId
            )
            let result = try await BackendMemoryAPI.shared.commitRealtimeTurn(
                userMessage: cleanUser,
                assistantMessage: cleanAssistant,
                requestId: requestId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? requestId?.trimmingCharacters(in: .whitespacesAndNewlines)
                    : "rt-\(fingerprint)",
                studioMetadata: studioMetadata
            )
            presentCanonClarificationIfNeeded(result.payload.canonClarification)
            lastRealtimeCommittedTurnID = result.payload.turnId ?? result.payload.lastTurnId ?? result.sync.lastTurnId
            lastRealtimeCommitAt = now
            lastRealtimeCommitError = ""
            if !result.sync.stateVersion.isEmpty {
                localStateVersion = result.sync.stateVersion
            }
            if result.payload.memoryGroundingChanged == true {
                let activeProject = activeRealtimeScreenplayProjectIdentity()
                scheduleRealtimeProjectGroundingRefresh(
                    reason: result.payload.memoryGroundingReason ?? "project_memory_changed",
                    stateVersion: result.sync.stateVersion,
                    projectId: result.payload.memoryGroundingProjectId ??
                        studioMetadata?.screenplayProjectId ?? "",
                    projectTitle: result.payload.memoryGroundingProjectTitle ??
                        activeProject.title
                )
            }
            await syncEvolutionForMemoryDomain(
                userMessage: cleanUser,
                memoryDomain: memoryDomain,
                isScreenplayMode: isStudioSurfaceActive
            )
        } catch {
            lastRealtimeCommitError = error.localizedDescription
        }
    }

    @MainActor
    private func annotateLatestRealtimeStudioTurnIfNeeded(
        promptSource: ScreenplayStudioUserPrompt.Source,
        targetOverride: ScreenplayStudioUserPrompt.Target? = nil,
        insertedTextOverride: String? = nil,
        requestID: String? = nil,
        turnIdOverride: String? = nil
    ) async {
        let turnId = (turnIdOverride ?? lastRealtimeCommittedTurnID)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !turnId.isEmpty else { return }
        await waitForStudioPageWriteCommitIfNeeded(
            targetOverride: targetOverride,
            insertedTextOverride: insertedTextOverride
        )
        guard let studioMetadata = studioThreadCommitMetadata(
            promptSource: promptSource,
            targetOverride: targetOverride,
            insertedTextOverride: insertedTextOverride,
            requestID: requestID
        ) else { return }

        do {
            let annotation = try await BackendMemoryAPI.shared.annotateTurnHistory(
                turnId: turnId,
                studioMetadata: studioMetadata
            )
            if !annotation.sync.stateVersion.isEmpty {
                localStateVersion = annotation.sync.stateVersion
            }
        } catch {
            HerLog.talk.error("studio turn post-commit annotate error=\(error.localizedDescription, privacy: .public)")
        }
    }

    private func containsStudioOpenCommand(_ text: String) -> Bool {
        let normalized = " \(text.lowercased()) "
        guard normalized.contains("studio") else { return false }
        let commandCues = [
            "open",
            "go to",
            "take me to",
            "switch to",
            "bring up",
            "launch"
        ]
        return commandCues.contains { normalized.contains($0) }
    }

    private func shouldAutoOpenStudioForScriptIntent(_ text: String) -> Bool {
        let normalized = " \(text.lowercased()) "
        guard !normalized.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        if containsStudioOpenCommand(text) { return true }

        let directIntentPhrases = [
            " write a script ",
            " write the script ",
            " write my script ",
            " write a screenplay ",
            " work on my script ",
            " work on the script ",
            " work on a script ",
            " help me write a script ",
            " help me write my script ",
            " help me write a screenplay ",
            " let's write a script ",
            " lets write a script ",
            " let's write my script ",
            " lets write my script ",
            " let's write a screenplay ",
            " lets write a screenplay ",
            " start a script ",
            " start my script ",
            " start a screenplay ",
            " draft a scene ",
            " write a scene ",
            " outline my script ",
            " outline a screenplay ",
            " build this scene ",
            " develop this scene "
        ]
        if directIntentPhrases.contains(where: normalized.contains) {
            return true
        }

        let writingVerbs = [
            " write ",
            " drafting ",
            " draft ",
            " outline ",
            " outlining ",
            " revise ",
            " rewriting ",
            " rewrite ",
            " edit ",
            " editing ",
            " polish ",
            " finish ",
            " build ",
            " develop ",
            " brainstorming ",
            " brainstorm "
        ]
        let scriptObjects = [
            " script ",
            " screenplay ",
            " scene ",
            " beat ",
            " slugline ",
            " dialogue ",
            " pilot ",
            " short film ",
            " feature ",
            " movie ",
            " film "
        ]
        return writingVerbs.contains(where: normalized.contains) &&
            scriptObjects.contains(where: normalized.contains)
    }

    private func isGoodbyeIntent(_ text: String) -> Bool {
        let normalized = " \(text.lowercased()) "
        let signals = [
            " goodbye ",
            " bye ",
            " talk later ",
            " see you ",
            " good night ",
            " gotta go ",
            " have to go ",
            " catch you later "
        ]
        return signals.contains { normalized.contains($0) }
    }

    private var studioTalkStatusText: String {
        if isTurnSubmitting || isThinking {
            return "Thinking…"
        }
        if voiceTransportMode == .realtimePreview {
            if realtimePreviewStandardFallbackActive {
                switch voice.mode {
                case .capturingSpeech:
                    return "Listening…"
                case .assistantSpeaking:
                    return "Speaking…"
                case .armedListening:
                    return "Ready"
                case .muted:
                    return "Muted"
                case .idle:
                    return "Standby"
                }
            }
            if realtimeReconnectAttempt > 0 {
                return "Reconnecting…"
            }
            switch realtimeTransport.status {
            case .idle:
                return "Standby"
            case .loadingBridge:
                return "Loading live voice…"
            case .ready:
                return "Ready"
            case .connecting:
                return "Connecting…"
            case .live:
                return realtimeTransport.activity.label + "…"
            case .failed:
                return "Offline"
            }
        }
        switch voice.mode {
        case .capturingSpeech:
            return "Listening…"
        case .assistantSpeaking:
            return "Speaking…"
        case .armedListening:
            return "Ready"
        case .muted:
            return "Muted"
        case .idle:
            return "Standby"
        }
    }

    private var studioTalkIsActive: Bool {
        if voiceTransportMode == .realtimePreview {
            if realtimePreviewStandardFallbackActive {
                switch voice.mode {
                case .capturingSpeech, .assistantSpeaking, .armedListening:
                    return true
                case .idle, .muted:
                    return false
                }
            }
            if realtimeReconnectAttempt > 0 {
                return true
            }
            switch realtimeTransport.status {
            case .ready, .connecting, .live:
                return true
            case .idle, .loadingBridge, .failed:
                return false
            }
        }
        switch voice.mode {
        case .capturingSpeech, .assistantSpeaking, .armedListening:
            return true
        case .idle, .muted:
            return false
        }
    }

    @MainActor
    private func stopStudioTalkFlow() {
        conversationLoopEnabled = false
        pendingGoodbyeStopAfterPlayback = false
        inFlightTalkTask?.cancel()
        inFlightTalkTask = nil
        isTurnSubmitting = false
        isThinking = false
        realtimeAssistantTranscriptFallbackTask?.cancel()
        realtimeAssistantTranscriptFallbackTask = nil
        cancelRealtimeRecovery(clearTurn: true)
        cancelRealtimeStudioDraftStream(restorePreview: true)
        realtimeTransport.disconnect()
        speculativeTalk.cancel()
        orbAudio.stop()
        promptSpeaker.stop()
        typedReplySpeaker.cancel()
        voice.markRequestFailed()
        if voiceTransportMode == .realtimePreview {
            voice.stopRecording()
            voice.teardown()
            return
        }
        voice.resumeRecordingIfNeeded()
    }
}

private struct TasksPanel: View {
    let onDone: () -> Void

    @State private var tasks: [BackendTaskItem] = []
    @State private var recap: BackendDailyRecapResponse?
    @State private var newTaskTitle = ""
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var errorText = ""
    @FocusState private var newTaskFocused: Bool

    private var openTasks: [BackendTaskItem] {
        tasks.filter { $0.status == "open" }
    }

    private var completedTasks: [BackendTaskItem] {
        tasks.filter { $0.status == "completed" }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(spacing: 18) {
                    header
                    composer
                    if isLoading {
                        ProgressView().controlSize(.large)
                    } else {
                        taskList
                    }
                    Spacer(minLength: 0)
                }
                .padding(24)
            }
            .task {
                await reload()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Tasks")
                    .font(.system(size: 30, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.95))
                Spacer()
                Button("Return", action: onDone)
                    .buttonStyle(.borderedProminent)
                    .tint(.white.opacity(0.22))
                    .foregroundColor(.herText.opacity(0.92))
            }

            if let recap {
                Text(recap.recap)
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.80))
                    .lineLimit(2)
            } else {
                Text("Capture tasks as you talk. io.them keeps open items and recap outcomes.")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.80))
            }

            if !errorText.isEmpty {
                Text(errorText)
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundColor(.red.opacity(0.9))
            }
        }
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Add a task", text: $newTaskTitle)
                .textFieldStyle(.roundedBorder)
                .focused($newTaskFocused)
                .onSubmit {
                    Task { await addTask() }
                }
            Button {
                Task { await addTask() }
            } label: {
                Text(isSubmitting ? "Adding…" : "Add")
                    .font(.system(size: 14, weight: .semibold, design: .default))
            }
            .buttonStyle(.borderedProminent)
            .tint(.white.opacity(0.22))
            .disabled(isSubmitting || newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private var taskList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Open (\(openTasks.count))")
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.9))
                if openTasks.isEmpty {
                    Text("No open tasks.")
                        .font(.system(size: 14, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.70))
                } else {
                    ForEach(openTasks, id: \.id) { task in
                        taskRow(task, actionLabel: "Done", action: "complete")
                    }
                }

                Text("Completed (\(completedTasks.count))")
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.9))
                    .padding(.top, 6)
                if completedTasks.isEmpty {
                    Text("No completed tasks yet.")
                        .font(.system(size: 14, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.70))
                } else {
                    ForEach(completedTasks.prefix(12), id: \.id) { task in
                        taskRow(task, actionLabel: "Reopen", action: "reopen")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
    }

    private func taskRow(_ task: BackendTaskItem, actionLabel: String, action: String) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.93))
                if task.dueAt > 0 {
                    Text("Due \(Date(timeIntervalSince1970: task.dueAt / 1000).formatted(date: .abbreviated, time: .shortened))")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.74))
                }
            }
            Spacer(minLength: 0)
            Button(actionLabel) {
                Task { await mutateTask(action: action, taskID: task.id) }
            }
            .buttonStyle(.bordered)
            .tint(.white.opacity(0.22))
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.11))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
        )
    }

    @MainActor
    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let taskResult = BackendMemoryAPI.shared.fetchTasks(limit: 96, status: "all")
            async let recapResult = BackendMemoryAPI.shared.fetchDailyRecap()
            let tasksRead = try await taskResult
            let recapRead = try await recapResult
            tasks = tasksRead.payload.tasks
            recap = recapRead.payload
            errorText = ""
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func addTask() async {
        let title = newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            _ = try await BackendMemoryAPI.shared.updateTask(
                action: "add",
                taskID: nil,
                title: title,
                query: nil,
                dueAt: nil,
                priority: "normal"
            )
            newTaskTitle = ""
            await reload()
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func mutateTask(action: String, taskID: String) async {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            _ = try await BackendMemoryAPI.shared.updateTask(
                action: action,
                taskID: taskID,
                title: nil,
                query: taskID,
                dueAt: nil,
                priority: nil
            )
            await reload()
        } catch {
            errorText = error.localizedDescription
        }
    }
}

private struct RecapPanel: View {
    private enum RecapWindow: String, CaseIterable, Identifiable {
        case today = "today"
        case yesterday = "yesterday"
        case last7Days = "last_7_days"

        var id: String { rawValue }

        var title: String {
            switch self {
            case .today: return "Today"
            case .yesterday: return "Yesterday"
            case .last7Days: return "7 Days"
            }
        }
    }

    let onDone: () -> Void

    @State private var recap: BackendDailyRecapResponse?
    @State private var selectedWindow: RecapWindow = .today
    @State private var isLoading = false
    @State private var errorText = ""

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(spacing: 16) {
                    header
                    if isLoading {
                        ProgressView().controlSize(.large)
                    } else {
                        content
                    }
                    Spacer(minLength: 0)
                }
                .padding(24)
            }
            .task {
                await reload()
            }
            .onChange(of: selectedWindow) { _, _ in
                Task { await reload() }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Recap")
                    .font(.system(size: 30, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.95))
                Spacer(minLength: 0)
                Button("Refresh") {
                    Task { await reload() }
                }
                .buttonStyle(.bordered)
                .tint(.white.opacity(0.24))
                Button("Return", action: onDone)
                    .buttonStyle(.borderedProminent)
                    .tint(.white.opacity(0.24))
                    .foregroundColor(.herText.opacity(0.92))
            }
            Picker("Window", selection: $selectedWindow) {
                ForEach(RecapWindow.allCases) { window in
                    Text(window.title).tag(window)
                }
            }
            .pickerStyle(.segmented)
            if let recap {
                let label = recap.windowLabel ?? recap.localDay
                Text("\(selectedWindow.title) • \(label)")
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.74))
                Text(recap.recap)
                    .font(.system(size: 15, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.88))
            } else {
                Text("Daily recap of highlights, outcomes, and next actions.")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.74))
            }
            if !errorText.isEmpty {
                Text(errorText)
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundColor(.red.opacity(0.9))
            }
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let recap {
                    statsRow(recap.stats)
                    recapSection("Highlights", items: recap.highlights)
                    recapSection("Outcomes", items: recap.outcomes)
                    recapSection("Next Actions", items: recap.nextActions)
                    recapTaskSection("Open Tasks", tasks: recap.openTasks)
                    recapTaskSection(completedSectionTitle, tasks: recap.completedToday)
                } else {
                    Text("No recap available yet.")
                        .font(.system(size: 14, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.74))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 6)
        }
    }

    private func statsRow(_ stats: BackendDailyRecapStats) -> some View {
        HStack(spacing: 10) {
            statChip("Turns", value: "\(stats.turnsToday)")
            statChip("Open", value: "\(stats.openTasks)")
            statChip("Done", value: "\(stats.completedToday)")
            statChip("Total", value: "\(stats.totalTasks)")
        }
    }

    private func statChip(_ label: String, value: String) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.76))
            Text(value)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.94))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        )
    }

    private func recapSection(_ title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 16, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.92))
            if items.isEmpty {
                Text("No items yet.")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.68))
            } else {
                ForEach(Array(items.prefix(6).enumerated()), id: \.offset) { _, item in
                    Text("• \(item)")
                        .font(.system(size: 14, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.84))
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.11))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.15), lineWidth: 1)
        )
    }

    private func recapTaskSection(_ title: String, tasks: [BackendTaskItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 16, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.92))
            if tasks.isEmpty {
                Text("No items yet.")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.68))
            } else {
                ForEach(Array(tasks.prefix(8)), id: \.id) { task in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(task.title)
                            .font(.system(size: 14, weight: .semibold, design: .default))
                            .foregroundColor(.herText.opacity(0.90))
                        if task.dueAt > 0 {
                            Text("Due \(Date(timeIntervalSince1970: task.dueAt / 1000).formatted(date: .abbreviated, time: .shortened))")
                                .font(.system(size: 12, weight: .regular, design: .default))
                                .foregroundColor(.herText.opacity(0.72))
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.11))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.15), lineWidth: 1)
        )
    }

    private var completedSectionTitle: String {
        switch selectedWindow {
        case .today:
            return "Completed Today"
        case .yesterday:
            return "Completed Yesterday"
        case .last7Days:
            return "Completed in 7 Days"
        }
    }

    @MainActor
    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await BackendMemoryAPI.shared.fetchDailyRecap(window: selectedWindow.rawValue)
            recap = result.payload
            errorText = ""
        } catch {
            errorText = error.localizedDescription
        }
    }
}

private struct TrustCenterScreen: View {
    let onDone: () -> Void
    let onOpenDataControls: () -> Void
    let onOpenPrivacyPolicy: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header
                        trustBlock(
                            title: "Non-Manipulative Policy",
                            lines: [
                                "io.them does not encourage emotional exclusivity.",
                                "io.them does not present itself as your only source of meaning.",
                                "io.them redirects dependency loops toward user agency.",
                                "io.them does not claim a human body or human consciousness."
                            ]
                        )
                        trustBlock(
                            title: "Conversation Boundaries",
                            lines: [
                                "If a loop is detected, io.them names it gently and gives one concrete next step.",
                                "If distress is high, responses shift to calm, specific, stabilizing language.",
                                "One thoughtful question maximum per reply."
                            ]
                        )
                        trustBlock(
                            title: "Control and Transparency",
                            lines: [
                                "Use Data Controls to clear history, delete memories, or export your memory ledger.",
                                "Privacy policy explains what is local vs backend vs sent to providers."
                            ]
                        )
                        actionRow
                    }
                    .padding(24)
                    .frame(maxWidth: 980, alignment: .topLeading)
                }
            }
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Done", action: onDone)
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Trust Center")
                .font(.system(size: 34, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.95))
            Text("How io.them is designed to stay emotionally mature, safe, and non-possessive.")
                .font(.system(size: 15, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.76))
        }
    }

    private func trustBlock(title: String, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 16, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.92))
            ForEach(lines, id: \.self) { line in
                Text("• \(line)")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.82))
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
        )
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Button("Open Data Controls", action: onOpenDataControls)
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.24))
            Button("Open Privacy Policy", action: onOpenPrivacyPolicy)
                .buttonStyle(.bordered)
        }
        .foregroundColor(.herText.opacity(0.92))
    }
}

#if os(iOS)
private struct DebugBundleActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
#endif

@MainActor
private final class PersonalityPromptSpeaker: NSObject {
    private let synthesizer = AVSpeechSynthesizer()

    var isSpeaking: Bool {
        synthesizer.isSpeaking || synthesizer.isPaused
    }

    func speak(_ text: String, style: ScreenplayAuditionVoiceStyle = .natural) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        // Avoid blocking the interactive thread with an immediate stop.
        // This prompt is optional, so if it is already speaking we skip re-queueing.
        guard !synthesizer.isSpeaking else { return }

        let utterance = AVSpeechUtterance(string: clean)
        let configured = voiceConfiguration(for: style)
        utterance.rate = configured.rate
        utterance.pitchMultiplier = configured.pitch
        utterance.volume = configured.volume
        utterance.preUtteranceDelay = 0.02
        utterance.postUtteranceDelay = 0.05
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        synthesizer.speak(utterance)
    }

    func estimatedDuration(
        for text: String,
        style: ScreenplayAuditionVoiceStyle = .natural
    ) -> TimeInterval {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return 0.95 }
        let wordCount = max(1, clean.split(whereSeparator: \.isWhitespace).count)
        let wordsPerSecond: Double
        switch style {
        case .natural:
            wordsPerSecond = 2.7
        case .faster:
            wordsPerSecond = 3.4
        case .colder:
            wordsPerSecond = 2.9
        case .vulnerable:
            wordsPerSecond = 2.3
        }
        return max(0.95, Double(wordCount) / wordsPerSecond)
    }

    func stop() {
        guard synthesizer.isSpeaking else { return }
        // Defer stop off the current interaction stack to avoid QoS inversion warnings.
        DispatchQueue.main.async { [weak self] in
            guard let self, self.synthesizer.isSpeaking else { return }
            _ = self.synthesizer.stopSpeaking(at: .word)
        }
    }

    private func voiceConfiguration(
        for style: ScreenplayAuditionVoiceStyle
    ) -> (rate: Float, pitch: Float, volume: Float) {
        let voiceSpeed = ClementineVoiceSettings.voiceSpeed()
        let baseRate = Float(min(max(0.48 * voiceSpeed, 0.30), 0.72))
        switch style {
        case .natural:
            return (rate: baseRate, pitch: 1.08, volume: 0.95)
        case .faster:
            return (rate: min(baseRate * 1.18, 0.78), pitch: 1.04, volume: 0.94)
        case .colder:
            return (rate: min(baseRate * 1.04, 0.74), pitch: 0.96, volume: 0.90)
        case .vulnerable:
            return (rate: max(baseRate * 0.88, 0.30), pitch: 1.02, volume: 0.92)
        }
    }
}
