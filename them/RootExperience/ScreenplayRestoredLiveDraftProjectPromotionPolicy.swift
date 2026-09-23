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

