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

// Moved verbatim from RootExperienceView.swift (T-decompose-root-experience-view, phase 0 slice).

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
