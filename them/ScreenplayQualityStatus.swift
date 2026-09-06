// D009 I4: moved verbatim out of ScreenplayLiveDraftBridge.swift (no behaviour change).
import Foundation
import ScreenplayStudio

struct ScreenplayQualityStatus: Equatable {
    let resolution: ScreenplayQualityResolution
    let reason: String
    let confidence: String
    let source: String
    let featureAct: String
    let matchedTokens: [String]
    let minimumSpecificActions: Int?
    let repairDirectives: [String]
    let updatedAt: Date

    init?(
        quality: BackendTalkScreenplayQuality?,
        output: BackendTalkScreenplayOutput?,
        updatedAt: Date = Date()
    ) {
        let resolvedQuality = quality ?? output?.quality
        let cleanTarget = (output?.target ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let writesToPage = output?.writesToPage == true
        guard resolvedQuality != nil || !cleanTarget.isEmpty else { return nil }

        let cleanConfidence = (resolvedQuality?.confidence ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let cleanSource = (resolvedQuality?.source ?? output?.source ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let ok = resolvedQuality?.ok ?? writesToPage
        if ok {
            self.resolution = cleanConfidence.contains("repair") || cleanSource.contains("repair")
                ? .repaired
                : .accepted
        } else if cleanConfidence == "blocked" || cleanTarget == "voice_pin" || cleanTarget == "voicepin" {
            self.resolution = .blocked
        } else {
            self.resolution = .needsRepair
        }

        self.reason = (resolvedQuality?.reason ?? (ok ? "ok" : "unknown"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.confidence = cleanConfidence
        self.source = cleanSource
        self.featureAct = (resolvedQuality?.featureAct ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.matchedTokens = (resolvedQuality?.matchedTokens ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.minimumSpecificActions = resolvedQuality?.minimumSpecificActions
        self.repairDirectives = (resolvedQuality?.repairDirectives ?? [])
            .map {
                $0.trimmingCharacters(in: .whitespacesAndNewlines)
                    .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            }
            .filter { !$0.isEmpty }
        self.updatedAt = updatedAt
    }

    var chipTitle: String {
        switch resolution {
        case .accepted:
            return featureAct.isEmpty ? "Page accepted" : "\(displayFeatureAct) accepted"
        case .repaired:
            return featureAct.isEmpty ? "Page repaired" : "\(displayFeatureAct) repaired"
        case .needsRepair:
            return "Page needs repair"
        case .blocked:
            return "Voice pin"
        }
    }

    var title: String {
        switch resolution {
        case .accepted:
            return "Page accepted"
        case .repaired:
            return "Page repaired"
        case .needsRepair:
            return "Page needs revision"
        case .blocked:
            return "Saved as voice note"
        }
    }

    var detail: String {
        let cleanReason = Self.displayReason(reason)
        let actSuffix = featureAct.isEmpty ? "." : " for \(displayFeatureAct)."
        let directiveSuffix = primaryRepairDirective.isEmpty ? "" : " Repair focus: \(primaryRepairDirective)"
        switch resolution {
        case .accepted:
            return "Clementine passed the screenplay guard\(actSuffix)"
        case .repaired:
            return "Clementine repaired the page before it reached the draft\(actSuffix)\(directiveSuffix)"
        case .needsRepair:
            return cleanReason.isEmpty
                ? "The page guard rejected the draft before it could write to the script.\(directiveSuffix)"
                : "The page guard rejected it: \(cleanReason).\(directiveSuffix)"
        case .blocked:
            return cleanReason.isEmpty
                ? "The turn stayed conversational instead of writing to the page.\(directiveSuffix)"
                : "The turn stayed conversational: \(cleanReason).\(directiveSuffix)"
        }
    }

    private var primaryRepairDirective: String {
        repairDirectives.first ?? ""
    }

    private var displayFeatureAct: String {
        switch featureAct.lowercased() {
        case "act1":
            return "Act I"
        case "act2":
            return "Act II"
        case "act3":
            return "Act III"
        default:
            return featureAct
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
        }
    }

    private static func displayReason(_ raw: String) -> String {
        let clean = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.lowercased() != "ok" else { return "" }
        switch clean {
        case "empty_page_text":
            return "empty page text"
        case "non_screenplay_output":
            return "not screenplay-formatted"
        case "outline_or_craft_artifact":
            return "outline or craft notes instead of playable pages"
        case "placeholder_page_text":
            return "placeholder page text"
        case "low_dramatic_density":
            return "low dramatic density"
        case "underfilled_page_text":
            return "underfilled requested pages"
        case "summary_like_page_batch":
            return "summary instead of playable pages"
        case "thin_long_page_batch":
            return "not enough concrete page turns"
        case "static_dialogue_batch":
            return "static dialogue without enough visible action"
        case "on_the_nose_dialogue":
            return "on-the-nose dialogue"
        case "missing_playable_content":
            return "missing playable scene behavior"
        case "missing_screenplay_shape":
            return "missing screenplay shape"
        case "missing_act_one_commitment":
            return "missing Act I commitment pressure"
        case "missing_act_two_reversal":
            return "missing Act II reversal pressure"
        case "missing_act_three_payoff":
            return "missing Act III payoff"
        case "missing_act_three_changed_behavior":
            return "missing changed behavior in the payoff"
        case "voice_pin_target":
            return "voice pin target"
        default:
            return clean.replacingOccurrences(of: "_", with: " ")
        }
    }
}
