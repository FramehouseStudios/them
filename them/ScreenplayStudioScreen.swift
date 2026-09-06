import SwiftUI
import ScreenplayStudio
import Combine
import PDFKit
import UniformTypeIdentifiers
import Vision
#if os(macOS)
import AppKit
#endif
#if os(iOS)
import UIKit
#endif
struct ScreenplayStudioScreen: View {
    private static let crossDeviceRefreshTimer = Timer
        .publish(every: 3, on: .main, in: .common)
        .autoconnect()

    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    var onDone: () -> Void
    @ObservedObject var liveDraftBridge: ScreenplayLiveDraftBridge
    var onArmTalk: () -> Void
    var onStopTalk: () -> Void
    var onOpenVoiceSettings: () -> Void
    var canTalk: Bool
    var talkStatusText: String
    var talkIsActive: Bool
    var debugVoicePartialStableSeconds: Double
    var debugVoicePartialStabilityWindowSeconds: Double
    var isSubmittingPrompt: Bool
    @Binding var typedReplyAudioEnabled: Bool
    var streamingAssistantReply: String
    var onSubmitPrompt: @MainActor (String, PromptRoutingMode, String) async -> String?
    var shouldRoutePromptToPage: (String, PromptRoutingMode) -> Bool

    init(
        onDone: @escaping () -> Void,
        liveDraftBridge: ScreenplayLiveDraftBridge,
        onArmTalk: @escaping () -> Void,
        onStopTalk: @escaping () -> Void,
        onOpenVoiceSettings: @escaping () -> Void,
        canTalk: Bool,
        talkStatusText: String,
        talkIsActive: Bool,
        debugVoicePartialStableSeconds: Double,
        debugVoicePartialStabilityWindowSeconds: Double,
        isSubmittingPrompt: Bool,
        typedReplyAudioEnabled: Binding<Bool>,
        streamingAssistantReply: String,
        onSubmitPrompt: @escaping @MainActor (String, PromptRoutingMode, String) async -> String?,
        shouldRoutePromptToPage: @escaping (String, PromptRoutingMode) -> Bool
    ) {
        self.onDone = onDone
        self.liveDraftBridge = liveDraftBridge
        self.onArmTalk = onArmTalk
        self.onStopTalk = onStopTalk
        self.onOpenVoiceSettings = onOpenVoiceSettings
        self.canTalk = canTalk
        self.talkStatusText = talkStatusText
        self.talkIsActive = talkIsActive
        self.debugVoicePartialStableSeconds = debugVoicePartialStableSeconds
        self.debugVoicePartialStabilityWindowSeconds = debugVoicePartialStabilityWindowSeconds
        self.isSubmittingPrompt = isSubmittingPrompt
        self._typedReplyAudioEnabled = typedReplyAudioEnabled
        self.streamingAssistantReply = streamingAssistantReply
        self.onSubmitPrompt = onSubmitPrompt
        self.shouldRoutePromptToPage = shouldRoutePromptToPage
    }

    @StateObject private var vm = ScreenplayStudioViewModel()
    @StateObject private var creativeInstincts = StudioCreativeInstinctsModel()
    @AppStorage("studio_debug_overlay_enabled") private var studioDebugOverlayEnabled = false
    @State private var navigatorRootURL: URL?
    @State private var navigatorCurrentURL: URL?
    @State private var navigatorBackStack: [URL] = []
    @State private var navigatorForwardStack: [URL] = []
    @State private var navigatorEntries: [StudioFileEntry] = []
    @State private var navigatorFilterText: String = ""
    @State private var navigatorShowHidden: Bool = false
    @State private var navigatorNewFolderName: String = ""
    @State private var navigatorDropIsTargeted: Bool = false
    @State private var isDirectionOneSidebarVisible = true
    @State private var isDirectionOneCompactLayout = false
    @State private var directionOneWorkspaceMode: DirectionOneWorkspaceMode = .draft
    @State private var directionOneRightPanelTab: DirectionOneRightPanelTab = .them
    @State private var isDirectionOneRightRailExpanded = true
    @State private var isDirectionOneComposerExpanded = false
    @State private var showingDirectionOneSettings = false
    @State private var lastVoiceFeedback: String = ""
    @State private var voiceFeedbackOpacity: Double = 0
    @State private var isDirectionOnePageFocusTransitionVisible = false
    @State private var directionOnePageFocusTransitionTask: Task<Void, Never>?
    @State private var draftDropIsTargeted: Bool = false
    @State private var studioPromptSeed: String = ""
    @State private var studioPromptIntent: StudioPromptIntent = .advice
    @State private var isSubmittingStudioPrompt: Bool = false
    @State private var isResolvingPendingScreenplayQuestion: Bool = false
    @State private var perceivedSpeedState: StudioPerceivedSpeedState = .idle
    @State private var sendingVoicePinSuggestionID: String?
    @State private var pendingDraftImportURL: URL?
    @State private var pendingDraftImportSourceName: String = ""
    @State private var showingDraftImportChoice = false
    @State private var showingDraftFileImporter = false
    @State private var hoveredDirectionOneDraftShortcut: DirectionOneDraftShortcut?
    @State private var selectedBeatInspectorID: String = ""
    @State private var draggedBeatID: String?
    @State private var draggedActID: String?
    @State private var draggedSceneID: String?
    @State private var beatDropTargetID: String = ""
    @State private var actDropTargetID: String = ""
    @State private var sceneDropTargetID: String = ""
    @State private var inspectorSettledAnchorID: String = ""
    @State private var inspectorSettledAnchorClearTask: Task<Void, Never>?
    @State private var isBeatListDropTargeted = false
    @State private var isActListDropTargeted = false
    @State private var sceneGroupDropTargetID: String = ""
    @State private var inspectorAutoScrollTask: Task<Void, Never>?
    @State private var isRestoringInspectorWorkspaceState = false
    @State private var beatComposerProvenance: BeatProvenanceSource = .manual
    @State private var shouldRestoreInspectorWorkspaceOnNextOutlineChange = false
    @State private var selectedSidebarSection: SidebarSection = .projects
    @State private var selectedInspectorSection: InspectorSection = .comments
    @State private var selectedDraftToolsSection: DraftToolsSection = .pages
    @State private var queuedIntelligenceFixes: [IntelligenceFixQueueItem] = []
    @State private var lastAppliedIntelligenceFixBatch: IntelligenceFixBatchSnapshot?
    @State private var studioAppliedMemoryCorrectionDraft = ""
    @State private var isSavingStudioAppliedMemoryCorrection = false
    @State private var correctingStudioStoryObligationID = ""
    @State private var isPageCommitNoticeVisible = false
    @State private var pageCommitNoticeTask: Task<Void, Never>?
    @State private var isLastCommittedWriteActionVisible = false
    @State private var isLastCommittedWriteToastCollapsed = false
    @State private var lastCommittedWriteCollapseTask: Task<Void, Never>?
    @State private var suppressLastCommittedWriteAutoReveal = false
    @State private var lastCommittedStudioPrompt: String = ""
    @State private var lastCommittedStudioPromptTarget: StudioTarget = .voicePin
    @State private var lastCommittedStudioPromptSource: StudioPromptSource = .typed
    @State private var studioAskNoteHistory: [StudioAskNoteExchange] = []
    @State private var pendingVoiceStudioPrompt: ScreenplayStudioUserPrompt?
    @State private var expandedVoicePinTurnID: UUID?
    @State private var showFullVoicePinThread = false
    @State private var didAutoOpenVoicePinOnFirstVoiceTurn = false
    @State private var showingFullStudioThread = false
    @State private var fullStudioThreadSearchText = ""
    @State private var selectedFullThreadFilter: FullThreadFilter = .all
    @State private var selectedFullThreadSceneKey: String = ""
    @State private var fullThreadScrollTargetKey: String = ""
    @State private var collapsedFullThreadSectionKeys: Set<String> = []
    @State private var focusedPageDiffExchangeID: UUID?
    @State private var focusedPageDiffPersistentKey: String = ""
    @State private var isFocusedPageDiffOverlayPresented = false
    @State private var acknowledgedDiffExchangeKeys: Set<String> = []
    @State private var acknowledgedDiffFingerprints: [String: String] = [:]
    @State private var acknowledgedDiffWriteIDs: [String: String] = [:]
    @State private var reopenedDiffExchangeKeys: Set<String> = []
    @State private var isRestoringReopenedDiffState = false
    @State private var isAwaitingInitialAcknowledgedDiffHydration = false
    @State private var pendingStudioTurnEvents: [BackendTurnCommittedEvent] = []
    @State private var backendThreadViewStatePersistTask: Task<Void, Never>?
    @State private var backendAskNoteHistoryPersistTask: Task<Void, Never>?
    @State private var studioBackgroundSyncNoticeText = ""
    @State private var isRestoringFullThreadBrowseState = false
    @State private var isAwaitingInitialFullThreadRestore = true
    @State private var studioDebugSessionID = UUID().uuidString
    @State private var studioDebugInitialLoadSettled = false
    @State private var isSceneQuickInsertVisible = false
    @State private var highlightedSceneInspectorKey: String = ""
    @State private var highlightedStudioExchangeID: UUID?
    @AppStorage("studio.ask.note.history.v2") private var studioAskNoteHistoryStorage = ""
    @AppStorage("studio.ask.note.selection.v1") private var studioAskNoteSelectionStorage = ""
    @AppStorage("studio.ask.note.cleared.backend.voicepin.ids.v1") private var studioClearedBackendVoicePinIDsStorage = ""
    @AppStorage("studio.write.anchor.records.v1") private var studioWriteAnchorStorage = ""
    @AppStorage("studio.diff.keep-current.v1") private var studioDiffAcknowledgedStorage = ""
    @AppStorage("studio.diff.keep-current.writeids.v1") private var studioDiffAcknowledgedWriteIDStorage = ""
    @AppStorage("studio.full.thread.state.v1") private var studioFullThreadStateStorage = ""
    @AppStorage("studio.prompt.routing.mode") private var studioPromptRoutingModeRaw = PromptRoutingMode.automatic.rawValue
    @AppStorage("studio.inspector.workspace.v1") private var studioInspectorWorkspaceStorage = ""
    @AppStorage("studio.inspector.beat.provenance.v1") private var studioInspectorBeatProvenanceStorage = ""
    @AppStorage("studio.inspector.beat.provenance.history.v1") private var studioInspectorBeatProvenanceHistoryStorage = ""
    @AppStorage(ScreenplayFeaturePlannerActionRecoveryStore.defaultKey) private var featurePlannerPendingActionStorage = ""
#if DEBUG || os(macOS)
    @AppStorage("studio_debug_voice_turn_result_json") private var studioDebugVoiceTurnResultJSON = ""
    @AppStorage("studio_debug_prepare_token") private var studioDebugPrepareToken: Int = 0
    @AppStorage("studio_debug_prepare_text") private var studioDebugPrepareText = ""
    @AppStorage("studio_debug_prepare_routing") private var studioDebugPrepareRoutingRaw = PromptRoutingMode.automatic.rawValue
    @AppStorage("studio_debug_prepare_replacement_mode") private var studioDebugPrepareReplacementMode = "none"
    @AppStorage("studio_debug_prepare_ack_token") private var studioDebugPrepareAckToken: Int = 0
    @AppStorage("studio_debug_prepare_ack_text") private var studioDebugPrepareAckText = ""
    @AppStorage("studio_debug_prepare_ack_routing") private var studioDebugPrepareAckRoutingRaw = PromptRoutingMode.automatic.rawValue
    @AppStorage("studio_debug_prepare_ack_replacement_mode") private var studioDebugPrepareAckReplacementMode = "none"
    @AppStorage("studio_debug_diff_state_json") private var studioDebugDiffStateJSON = ""
    @AppStorage("studio_debug_acknowledge_diff_token") private var studioDebugAcknowledgeDiffToken: Int = 0
    @AppStorage("studio_debug_acknowledge_diff_key") private var studioDebugAcknowledgeDiffKey = ""
    @AppStorage("studio_debug_acknowledge_diff_ack_token") private var studioDebugAcknowledgeDiffAckToken: Int = 0
    @AppStorage("studio_debug_focus_diff_token") private var studioDebugFocusDiffToken: Int = 0
    @AppStorage("studio_debug_focus_diff_key") private var studioDebugFocusDiffKey = ""
    @AppStorage("studio_debug_focus_diff_ack_token") private var studioDebugFocusDiffAckToken: Int = 0
    @AppStorage("studio_debug_submit_token") private var studioDebugSubmitToken: Int = 0
    @AppStorage("studio_debug_submit_command_received_token") private var studioDebugSubmitCommandReceivedToken: Int = 0
    @AppStorage("studio_debug_submit_text") private var studioDebugSubmitText = ""
    @AppStorage("studio_debug_submit_routing") private var studioDebugSubmitRoutingRaw = PromptRoutingMode.automatic.rawValue
    @AppStorage("studio_debug_submit_replacement_mode") private var studioDebugSubmitReplacementMode = "none"
    @AppStorage("studio_debug_submit_ack_token") private var studioDebugSubmitAckToken: Int = 0
    @AppStorage("studio_debug_submit_ack_text") private var studioDebugSubmitAckText = ""
    @AppStorage("studio_debug_submit_ack_routing") private var studioDebugSubmitAckRoutingRaw = PromptRoutingMode.automatic.rawValue
    @AppStorage("studio_debug_submit_ack_replacement_mode") private var studioDebugSubmitAckReplacementMode = "none"
    @AppStorage("studio_debug_submit_ack_request_id") private var studioDebugSubmitAckRequestID = ""
    @AppStorage("studio_debug_submit_result_token") private var studioDebugSubmitResultToken: Int = 0
    @AppStorage("studio_debug_submit_result_status") private var studioDebugSubmitResultStatus = ""
    @AppStorage("studio_debug_submit_result_error") private var studioDebugSubmitResultError = ""
    @AppStorage("studio_debug_submit_result_json") private var studioDebugSubmitResultJSON = ""
    @AppStorage("studio_debug_submit_transport_mode") private var studioDebugSubmitTransportModeRaw = "live"
    @AppStorage("studio_debug_keyboard_submit_ack_token") private var studioDebugKeyboardSubmitAckToken: Int = 0
    @AppStorage("studio_debug_keyboard_submit_ack_text") private var studioDebugKeyboardSubmitAckText = ""
    @AppStorage("studio_debug_keyboard_submit_ack_routing") private var studioDebugKeyboardSubmitAckRoutingRaw = PromptRoutingMode.automatic.rawValue
    @AppStorage("studio_debug_keyboard_submit_ack_replacement_mode") private var studioDebugKeyboardSubmitAckReplacementMode = "none"
    @AppStorage("studio_debug_load_project_token") private var studioDebugLoadProjectToken: Int = 0
    @AppStorage("studio_debug_load_project_id") private var studioDebugLoadProjectID = ""
    @AppStorage("studio_debug_load_project_version_id") private var studioDebugLoadProjectVersionID = ""
    @AppStorage("studio_debug_load_project_ack_token") private var studioDebugLoadProjectAckToken: Int = 0
    @AppStorage("studio_debug_project_load_trace_json") private var studioDebugProjectLoadTraceJSON = "[]"
    @AppStorage("studio_debug_focus_page_token") private var studioDebugFocusPageToken: Int = 0
    @AppStorage("studio_debug_focus_page_ack_token") private var studioDebugFocusPageAckToken: Int = 0
    @AppStorage("studio_debug_manual_edit_token") private var studioDebugManualEditToken: Int = 0
    @AppStorage("studio_debug_manual_edit_text") private var studioDebugManualEditText = ""
    @AppStorage("studio_debug_manual_edit_ack_token") private var studioDebugManualEditAckToken: Int = 0
    @AppStorage("studio_debug_autosave_toggle_token") private var studioDebugAutosaveToggleToken: Int = 0
    @AppStorage("studio_debug_autosave_enabled") private var studioDebugAutosaveEnabled: Bool = true
    @AppStorage("studio_debug_autosave_toggle_ack_token") private var studioDebugAutosaveToggleAckToken: Int = 0
    @AppStorage("studio_debug_force_hydrate_token") private var studioDebugForceHydrateToken: Int = 0
    @AppStorage("studio_debug_force_hydrate_ack_token") private var studioDebugForceHydrateAckToken: Int = 0
    @AppStorage("studio_debug_save_token") private var studioDebugSaveToken: Int = 0
    @AppStorage("studio_debug_save_ack_token") private var studioDebugSaveAckToken: Int = 0
    @AppStorage("studio_debug_local_command_token") private var studioDebugLocalCommandToken: Int = 0
    @AppStorage("studio_debug_local_command_text") private var studioDebugLocalCommandText = ""
    @AppStorage("studio_debug_local_command_source") private var studioDebugLocalCommandSourceRaw = StudioPromptSource.voice.rawValue
    @AppStorage("studio_debug_local_command_ack_token") private var studioDebugLocalCommandAckToken: Int = 0
    @AppStorage("studio_debug_local_command_result_token") private var studioDebugLocalCommandResultToken: Int = 0
    @AppStorage("studio_debug_local_command_result_status") private var studioDebugLocalCommandResultStatus = ""
    @AppStorage("studio_debug_local_command_result_error") private var studioDebugLocalCommandResultError = ""
    @AppStorage("studio_debug_local_command_result_json") private var studioDebugLocalCommandResultJSON = ""
    @AppStorage("studio_debug_select_lines_token") private var studioDebugSelectLinesToken: Int = 0
    @AppStorage("studio_debug_select_lines_start") private var studioDebugSelectLinesStartLine: Int = 0
    @AppStorage("studio_debug_select_lines_end") private var studioDebugSelectLinesEndLine: Int = 0
    @AppStorage("studio_debug_select_lines_ack_token") private var studioDebugSelectLinesAckToken: Int = 0
    @AppStorage("studio_debug_seed_structural_token") private var studioDebugSeedStructuralToken: Int = 0
    @AppStorage("studio_debug_seed_structural_ack_token") private var studioDebugSeedStructuralAckToken: Int = 0
    @AppStorage("studio_debug_draft_inspector_token") private var studioDebugDraftInspectorToken: Int = 0
    @AppStorage("studio_debug_draft_inspector_section") private var studioDebugDraftInspectorSectionRaw = DraftToolsSection.pages.rawValue
    @AppStorage("studio_debug_draft_inspector_ack_token") private var studioDebugDraftInspectorAckToken: Int = 0
    @AppStorage("studio_debug_shell_visibility_token") private var studioDebugShellVisibilityToken: Int = 0
    @AppStorage("studio_debug_shell_visibility_sidebar") private var studioDebugShellVisibilitySidebarRaw = "keep"
    @AppStorage("studio_debug_shell_visibility_inspector") private var studioDebugShellVisibilityInspectorRaw = "keep"
    @AppStorage("studio_debug_shell_visibility_ack_token") private var studioDebugShellVisibilityAckToken: Int = 0
    @AppStorage("studio_debug_right_panel_tab_token") private var studioDebugRightPanelTabToken: Int = 0
    @AppStorage("studio_debug_right_panel_tab") private var studioDebugRightPanelTabRaw = DirectionOneRightPanelTab.beats.rawValue
    @AppStorage("studio_debug_right_panel_tab_ack_token") private var studioDebugRightPanelTabAckToken: Int = 0
    @AppStorage("studio_debug_command_bar_token") private var studioDebugCommandBarToken: Int = 0
    @AppStorage("studio_debug_command_bar_ack_token") private var studioDebugCommandBarAckToken: Int = 0
    @AppStorage("studio_debug_seed_route_metadata_token") private var studioDebugSeedRouteMetadataToken: Int = 0
    @AppStorage("studio_debug_seed_route_metadata_ack_token") private var studioDebugSeedRouteMetadataAckToken: Int = 0
    @AppStorage("studio_debug_companion_mode_token") private var studioDebugCompanionModeToken: Int = 0
    @AppStorage("studio_debug_companion_mode_value") private var studioDebugCompanionModeRaw = StudioCompanionMode.coach.rawValue
    @AppStorage("studio_debug_companion_mode_ack_token") private var studioDebugCompanionModeAckToken: Int = 0
    @AppStorage("studio_debug_intelligence_queue_token") private var studioDebugIntelligenceQueueToken: Int = 0
    @AppStorage("studio_debug_intelligence_queue_action") private var studioDebugIntelligenceQueueActionRaw = ""
    @AppStorage("studio_debug_intelligence_queue_item_id") private var studioDebugIntelligenceQueueItemID = ""
    @AppStorage("studio_debug_intelligence_queue_ack_token") private var studioDebugIntelligenceQueueAckToken: Int = 0
    @AppStorage("studio_debug_intelligence_queue_result_token") private var studioDebugIntelligenceQueueResultToken: Int = 0
    @AppStorage("studio_debug_intelligence_queue_result_status") private var studioDebugIntelligenceQueueResultStatus = ""
    @AppStorage("studio_debug_intelligence_queue_result_error") private var studioDebugIntelligenceQueueResultError = ""
    @AppStorage("studio_debug_intelligence_queue_result_json") private var studioDebugIntelligenceQueueResultJSON = ""
    @AppStorage("studio_debug_page_write_toast_token") private var studioDebugPageWriteToastToken: Int = 0
    @AppStorage("studio_debug_page_write_toast_mode") private var studioDebugPageWriteToastModeRaw = "expanded"
    @AppStorage("studio_debug_page_write_toast_source") private var studioDebugPageWriteToastSourceRaw = StudioPromptSource.typed.rawValue
    @AppStorage("studio_debug_page_write_toast_ack_token") private var studioDebugPageWriteToastAckToken: Int = 0
    @AppStorage("studio_debug_page_write_toast_interaction_token") private var studioDebugPageWriteToastInteractionToken: Int = 0
    @AppStorage("studio_debug_page_write_toast_interaction_action") private var studioDebugPageWriteToastInteractionActionRaw = ""
    @AppStorage("studio_debug_page_write_toast_interaction_ack_token") private var studioDebugPageWriteToastInteractionAckToken: Int = 0
    @AppStorage("studio_debug_page_write_toast_interaction_result_token") private var studioDebugPageWriteToastInteractionResultToken: Int = 0
    @AppStorage("studio_debug_page_write_toast_interaction_result_status") private var studioDebugPageWriteToastInteractionResultStatus = ""
    @AppStorage("studio_debug_page_write_toast_interaction_result_error") private var studioDebugPageWriteToastInteractionResultError = ""
    @AppStorage("studio_debug_page_write_toast_interaction_result_json") private var studioDebugPageWriteToastInteractionResultJSON = ""
    @AppStorage("studio_debug_shortcut_token") private var studioDebugShortcutToken: Int = 0
    @AppStorage("studio_debug_shortcut_action") private var studioDebugShortcutActionRaw = ""
    @AppStorage("studio_debug_shortcut_ack_token") private var studioDebugShortcutAckToken: Int = 0
    @AppStorage("studio_debug_shortcut_result_token") private var studioDebugShortcutResultToken: Int = 0
    @AppStorage("studio_debug_shortcut_result_status") private var studioDebugShortcutResultStatus = ""
    @AppStorage("studio_debug_shortcut_result_error") private var studioDebugShortcutResultError = ""
    @AppStorage("studio_debug_shortcut_result_json") private var studioDebugShortcutResultJSON = ""
    @AppStorage("studio_debug_inspector_interaction_token") private var studioDebugInspectorInteractionToken: Int = 0
    @AppStorage("studio_debug_inspector_interaction_action") private var studioDebugInspectorInteractionActionRaw = ""
    @AppStorage("studio_debug_inspector_interaction_primary") private var studioDebugInspectorInteractionPrimary = ""
    @AppStorage("studio_debug_inspector_interaction_secondary") private var studioDebugInspectorInteractionSecondary = ""
    @AppStorage("studio_debug_inspector_interaction_ack_token") private var studioDebugInspectorInteractionAckToken: Int = 0
    @AppStorage("studio_debug_inspector_interaction_result_token") private var studioDebugInspectorInteractionResultToken: Int = 0
    @AppStorage("studio_debug_inspector_interaction_result_status") private var studioDebugInspectorInteractionResultStatus = ""
    @AppStorage("studio_debug_inspector_interaction_result_error") private var studioDebugInspectorInteractionResultError = ""
    @AppStorage("studio_debug_inspector_interaction_result_json") private var studioDebugInspectorInteractionResultJSON = ""
    @State private var didRunStudioThreadViewStateRegressionSmoke = false
#endif
    @State private var restoredStudioDebugStateSourceRaw = StudioThreadViewStateSource.none.rawValue
    @State private var restoredStudioDebugFocusedDiffSourceRaw = StudioThreadViewStateSource.none.rawValue
    @State private var restoredStudioDebugReopenedSourceRaw = StudioThreadViewStateSource.none.rawValue
    @State private var restoredStudioDebugFocusedDiffKey = ""
    @State private var restoredStudioDebugReopenedLineageKeys: [String] = []
    @State private var restoredStudioDebugLatestReopenedWriteID = ""
    @FocusState private var studioPromptFocused: Bool
    @FocusState private var sceneInspectorTitleFocused: Bool
    @FocusState private var studioThreadListFocused: Bool
    @FocusState private var studioInspectorFocused: Bool
#if DEBUG || os(macOS)
    @State private var lastAppliedStudioDebugAcknowledgeToken: Int = 0
    @State private var lastAppliedStudioDebugFocusDiffToken: Int = 0
    @State private var lastAppliedStudioDebugSubmitToken: Int = 0
    @State private var lastAppliedStudioDebugLoadProjectToken: Int = 0
    @State private var lastAppliedBridgeDebugProjectLoadToken: Int = 0
    @State private var lastAppliedStudioDebugFocusPageToken: Int = 0
    @State private var lastAppliedStudioDebugManualEditToken: Int = 0
    @State private var lastAppliedStudioDebugAutosaveToggleToken: Int = 0
    @State private var lastAppliedStudioDebugForceHydrateToken: Int = 0
    @State private var lastAppliedStudioDebugSaveToken: Int = 0
    @State private var lastAppliedStudioDebugLocalCommandToken: Int = 0
    @State private var lastAppliedStudioDebugSelectLinesToken: Int = 0
    @State private var lastAppliedStudioDebugSeedStructuralToken: Int = 0
    @State private var lastAppliedStudioDebugDraftInspectorToken: Int = 0
    @State private var lastAppliedStudioDebugShellVisibilityToken: Int = 0
    @State private var lastAppliedStudioDebugRightPanelTabToken: Int = 0
    @State private var lastAppliedStudioDebugCommandBarToken: Int = 0
    @State private var lastAppliedStudioDebugSeedRouteMetadataToken: Int = 0
    @State private var lastAppliedStudioDebugCompanionModeToken: Int = 0
    @State private var lastAppliedStudioDebugIntelligenceQueueToken: Int = 0
    @State private var lastAppliedStudioDebugPageWriteToastToken: Int = 0
    @State private var lastAppliedStudioDebugPageWriteToastInteractionToken: Int = 0
    @State private var lastAppliedStudioDebugShortcutToken: Int = 0
    @State private var lastAppliedStudioDebugInspectorInteractionToken: Int = 0
    @State private var didApplyUITestLaunchActions = false
    @State private var didApplyUITestDraftConflictFixture = false
    @State private var didApplyUITestSaveNetworkFault = false
    @State private var didResolveUITestPendingQuestionFixture = false
    @State private var trackedStudioDebugProjectLoadToken: Int = 0
    @State private var trackedStudioDebugProjectLoadRequestedProjectID = ""
    @State private var trackedStudioDebugProjectLoadRequestedVersionID = ""
    @State private var trackedStudioDebugProjectLoadStage = ""
    @State private var trackedStudioDebugProjectLoadReady = false
    @State private var trackedStudioDebugProjectLoadError = ""
    @State private var studioDebugProjectLoadInFlight = false
    @State private var activeStudioDebugProjectLoadOperationID: UUID?
    @State private var uiTestManualSaveTriggerCount = 0
    #if os(macOS)
    @State private var studioDebugPreparePollTask: Task<Void, Never>?
    @State private var studioCommandReturnKeyMonitor: Any?
    #endif
#endif

    var body: some View {
        studioConfiguredView
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("studio.surface")
            .task(id: uiTestLiveMemoryRefreshEnabled) {
                guard uiTestLiveMemoryRefreshEnabled else { return }
                await vm.refreshCharacterTraits(
                    source: "Manual cross-device memory smoke",
                    allowDuringTests: true
                )
            }
            .onReceive(
                NotificationCenter.default.publisher(for: .themOfflineTalkOutboxUpdated)
            ) { _ in
                Task { await vm.refreshPendingScreenplayQuestion() }
            }
            .onReceive(
                NotificationCenter.default.publisher(for: .themScreenplayQuestionResolved)
            ) { _ in
                Task { await vm.refreshPendingScreenplayQuestion() }
            }
            .onReceive(
                NotificationCenter.default.publisher(for: .themScreenplayDraftSaveOutboxUpdated)
            ) { _ in
                Task { await vm.refreshDraftSaveOutboxStatus() }
            }
            .onReceive(
                NotificationCenter.default.publisher(for: .themScreenplayDraftSaveOutboxRetryRequested)
            ) { _ in
                Task { await vm.reconnectAndResumeQueuedDraftSaves() }
            }
            .onReceive(
                NotificationCenter.default.publisher(for: .themScreenplayOutlineMutationOutboxUpdated)
            ) { _ in
                Task { await vm.refreshOutlineMutationOutboxStatus() }
            }
            .onReceive(
                NotificationCenter.default.publisher(for: .themScreenplayOutlineMutationOutboxRetryRequested)
            ) { _ in
                Task { await vm.reconnectAndResumeQueuedOutlineMutations() }
            }
            .overlay(alignment: .topLeading) {
                #if DEBUG
                if IOThemRuntime.isRunningUITests {
                    Text(uiTestStudioRestoreSnapshotJSON)
                        .font(.system(size: 1))
                        .frame(width: 1, height: 1)
                        .opacity(0.01)
                        .accessibilityIdentifier("studio.restore.snapshot")
                }
                #endif
            }
    }

    private var uiTestLiveMemoryRefreshEnabled: Bool {
        #if DEBUG
        IOThemRuntime.isRunningUITests &&
            ProcessInfo.processInfo.arguments.contains("--ui-live-memory")
        #else
        false
        #endif
    }

    #if DEBUG
    private var uiTestStudioRestoreSnapshotJSON: String {
        let normalizedDraft = vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let backendAskNoteHistory = backendStudioAskNoteHistory(for: activeStudioAskNoteHistoryKey)
        return studioDebugJSONString(from: [
            "project_key": activeStudioAskNoteHistoryKey,
            "selected_project_id": vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines),
            "selected_project_present": vm.selectedProject != nil,
            "latest_version_id": vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines),
            "conflict_project_id": vm.conflictState?.projectId ?? "",
            "conflict_server_version_id": vm.conflictState?.serverVersionId ?? "",
            "conflict_fixture_applied": didApplyUITestDraftConflictFixture,
            "loaded_draft_project_id": vm.debugLoadedDraftProjectID,
            "load_project_token": trackedStudioDebugProjectLoadToken,
            "load_project_ack_token": studioDebugLoadProjectAckToken,
            "load_project_stage": trackedStudioDebugProjectLoadStage,
            "load_project_ready": trackedStudioDebugProjectLoadReady,
            "load_project_error": trackedStudioDebugProjectLoadError,
            "restored_state_source": restoredStudioDebugStateSourceRaw,
            "restored_focused_diff_source": restoredStudioDebugFocusedDiffSourceRaw,
            "restored_reopened_source": restoredStudioDebugReopenedSourceRaw,
            "restored_focused_diff_key": restoredStudioDebugFocusedDiffKey,
            "restored_reopened_lineage_keys": restoredStudioDebugReopenedLineageKeys,
            "restored_latest_reopened_write_id": restoredStudioDebugLatestReopenedWriteID,
            "reopened_diff_count": reopenedDiffExchangeKeys.count,
            "acknowledged_diff_count": acknowledgedDiffExchangeKeys.count,
            "ask_note_history_count": studioAskNoteHistory.count,
            "backend_ask_note_history_count": backendAskNoteHistory.count,
            "latest_ask_note_prompt": studioAskNoteHistory.first?.prompt ?? "",
            "latest_ask_note_inserted_text": studioAskNoteHistory.first?.insertedText ?? "",
            "draft_preview": String(normalizedDraft.prefix(260)),
            "draft_tail_preview": String(normalizedDraft.suffix(260)),
            "draft_character_count": normalizedDraft.count,
            "draft_fingerprint": ScreenplayDraftIntegrityFingerprint.value(for: normalizedDraft),
            "has_unsaved_draft_changes": vm.hasUnsavedDraftChanges,
            "is_manual_draft_editing": vm.isManualDraftEditing,
            "is_saving": vm.isSaving,
            "queued_draft_save_count": vm.queuedDraftSaveCount,
            "parked_draft_save_count": vm.parkedDraftSaveCount,
            "manual_save_trigger_count": uiTestManualSaveTriggerCount,
            "debug_automation_session": IOThemRuntime.isStudioAutomationSession,
            "debug_auth_session_authenticated": BackendAuthClient.currentAuthSessionState().isAuthenticated,
            "debug_auth_header_present": BackendAuthClient.authorizationHeaderValue() != nil,
            "debug_project_client_owner": liveDraftBridge.usesDebugClientTokenOwner(
                forProjectID: vm.selectedProjectID
            ),
            "debug_project_client_token_present": liveDraftBridge.debugClientTokenOwnerToken(
                forProjectID: vm.selectedProjectID
            ) != nil,
            "outline_revision": vm.outlineRevision,
            "queued_outline_mutation_count": vm.queuedOutlineMutationCount,
            "parked_outline_mutation_count": vm.parkedOutlineMutationCount,
            "outline_mutation_drain_inflight": vm.isOutlineMutationDrainInFlight,
            "autosave_status_text": vm.autosaveStatusText,
            "info_text": vm.infoText,
            "error_text": vm.errorText,
            "collaborator_count": vm.collaborators.count,
            "approved_emails": vm.approvedEmails,
            "comment_count": vm.comments.count,
            "latest_comment_text": vm.comments.first?.text ?? "",
            "latest_comment_author": vm.comments.first?.authorEmail ?? "",
            "latest_comment_resolved": vm.comments.first?.resolved ?? false,
            "latest_comment_deleted": vm.comments.first?.isDeleted ?? false,
            "character_memory_loading": vm.isCharacterTraitsLoading,
            "character_memory_count": vm.characterTraits?.characters.count ?? 0,
            "character_memory_error": vm.characterTraitsErrorText.trimmingCharacters(in: .whitespacesAndNewlines),
            "character_memory_source": vm.characterTraitsInfoText.trimmingCharacters(in: .whitespacesAndNewlines),
            "pending_screenplay_question_id": vm.pendingScreenplayQuestion?.id ?? "",
            "pending_screenplay_question_project_id": vm.pendingScreenplayQuestion?.projectId ?? "",
            "applied_memory_has_content": liveDraftBridge.latestAppliedMemory.hasContent,
            "story_obligation_count": liveDraftBridge.latestAppliedMemory.storyObligationChanges?.count ?? 0,
            "story_obligation_status": liveDraftBridge.latestAppliedMemory.currentStoryObligationChange?.status ?? "",
            "story_obligation_result": liveDraftBridge.latestAppliedMemory.currentStoryObligationChange?.result ?? "",
            "story_obligation_evidence": liveDraftBridge.latestAppliedMemory.currentStoryObligationChange?.evidence ?? ""
        ])
    }
    #endif

    private var studioConfiguredView: some View {
        studioPresentationBoundView
            .confirmationDialog(
                "Import Draft",
                isPresented: $showingDraftImportChoice,
                titleVisibility: .visible
            ) {
                NumberedChoiceActionButton(
                    number: "1",
                    title: "Replace Current Draft (Recommended)",
                    prominence: .prominent
                ) {
                    confirmDraftImport(.replace)
                }
                NumberedChoiceActionButton(number: "2", title: "Append To Draft") {
                    confirmDraftImport(.append)
                }
                Button("Cancel", role: .cancel) {
                    clearPendingDraftImport()
                }
            } message: {
                Text(
                    """
Import \(pendingDraftImportSourceName.isEmpty ? "this file" : pendingDraftImportSourceName) by replacing the current draft or appending to it.

Press 1 to replace or 2 to append.

Replace is best when this file should become the script you edit. Append is safest only for partial scenes, selected pages, or fragments you intentionally want to add after the current draft.
"""
                )
            }
            .fileImporter(
                isPresented: $showingDraftFileImporter,
                allowedContentTypes: Self.draftImportContentTypes,
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    guard let url = urls.first else { return }
                    queueDraftImport(from: url)
                case .failure(let error):
                    vm.errorText = error.localizedDescription
                }
            }
    }

    private var studioPresentationBoundView: some View {
        studioLifecycleBoundView
            .sheet(isPresented: $showingFullStudioThread) {
                fullStudioThreadSheet
            }
            .background(studioFocusShortcutLayer)
    }

    private var studioLifecycleBoundView: some View {
        studioLifecycleInteractionBoundView
            .onReceive(NotificationCenter.default.publisher(for: .themTurnCommitted)) { notification in
                guard let event = BackendTurnCommittedEvent(notification: notification) else { return }
                handleStudioTurnCommittedEvent(event)
            }
            .onChange(of: backendAskNoteHistorySignature(for: activeStudioAskNoteHistoryKey)) { _, newValue in
                guard !newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                Task {
                    await restoreStudioAskNoteHistory(for: activeStudioAskNoteHistoryKey)
                    publishDebugStudioDiffState()
                }
            }
            .onChange(of: backendThreadViewRestoreSignature(for: activeStudioAskNoteHistoryKey)) { _, newValue in
                guard shouldRetryFullThreadBrowseStateRestore(
                    for: activeStudioAskNoteHistoryKey,
                    backendSignature: newValue
                ) else { return }
                restoreFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
                publishDebugStudioDiffState()
            }
            .onChange(of: backendAcknowledgedStudioDiffSignature(for: activeStudioAskNoteHistoryKey)) { _, newValue in
                guard shouldRetryAcknowledgedStudioDiffRestore(
                    for: activeStudioAskNoteHistoryKey,
                    backendSignature: newValue
                ) else { return }
                let restoredAcknowledgements = restoredAcknowledgedStudioDiffRecords(for: activeStudioAskNoteHistoryKey)
                acknowledgedDiffFingerprints = restoredAcknowledgements
                acknowledgedDiffExchangeKeys = Set(restoredAcknowledgements.keys)
                acknowledgedDiffWriteIDs = restoredAcknowledgedStudioDiffWriteIDs(for: activeStudioAskNoteHistoryKey)
                isAwaitingInitialAcknowledgedDiffHydration =
                    !restoredAcknowledgements.isEmpty
                    || !acknowledgedDiffWriteIDs.isEmpty
                    || !reopenedDiffExchangeKeys.isEmpty
                refreshAcknowledgedDiffState()
                publishDebugStudioDiffState()
            }
            .onChange(of: rawBackendProjectMetadataDebugSignature(for: activeStudioAskNoteHistoryKey)) { _, _ in
                let backendSignature = backendThreadViewRestoreSignature(for: activeStudioAskNoteHistoryKey)
                if shouldRetryFullThreadBrowseStateRestore(
                    for: activeStudioAskNoteHistoryKey,
                    backendSignature: backendSignature
                ) {
                    restoreFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
                }
                if !backendAskNoteHistorySignature(for: activeStudioAskNoteHistoryKey).isEmpty {
                    Task {
                        await restoreStudioAskNoteHistory(for: activeStudioAskNoteHistoryKey)
                    }
                }
                publishDebugStudioDiffState()
            }
    }

    private var studioLifecycleInteractionBoundView: some View {
        studioLifecycleDebugBoundView
            .onChange(of: studioPromptFocused) { _, _ in
                publishDebugStudioDiffState()
            }
            .onChange(of: isSubmittingStudioPrompt) { _, newValue in
                publishDebugStudioDiffState()
                if newValue == false {
                    applyDebugSubmittedStudioPromptIfNeeded()
                }
            }
            .onChange(of: liveDraftBridge.pendingStudioActionPreview?.id) { _, newValue in
                guard newValue != nil else { return }
                withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                    isDirectionOneRightRailExpanded = true
                    directionOneRightPanelTab = .them
                }
            }
    }

    #if DEBUG
    private var studioLifecycleDebugPrimaryBoundView: some View {
        studioLifecycleTaskBoundView
            .onChange(of: studioDebugPrepareToken) { _, _ in
                applyDebugPreparedStudioPromptIfNeeded()
            }
            .onChange(of: studioDebugAcknowledgeDiffToken) { _, _ in
                applyDebugAcknowledgedDiffIfNeeded()
            }
            .onChange(of: studioDebugFocusDiffToken) { _, _ in
                applyDebugFocusedDiffIfNeeded()
            }
            .onChange(of: studioDebugSubmitToken) { _, _ in
                applyDebugSubmittedStudioPromptIfNeeded()
            }
            .onChange(of: studioDebugLoadProjectToken) { _, _ in
                applyDebugLoadProjectIfNeeded()
            }
            .onChange(of: studioDebugFocusPageToken) { _, _ in
                applyDebugFocusPageIfNeeded()
            }
            .onChange(of: studioDebugManualEditToken) { _, _ in
                applyDebugManualDraftEditIfNeeded()
            }
            .onChange(of: studioDebugAutosaveToggleToken) { _, _ in
                applyDebugAutosaveToggleIfNeeded()
            }
            .onChange(of: studioDebugForceHydrateToken) { _, _ in
                applyDebugForceHydrateIfNeeded()
            }
            .onChange(of: studioDebugSaveToken) { _, _ in
                applyDebugManualSaveIfNeeded()
            }
    }

    private var studioLifecycleDebugBoundView: some View {
        studioLifecycleDebugPrimaryBoundView
            .onChange(of: studioDebugSelectLinesToken) { _, _ in
                applyDebugSelectedLinesIfNeeded()
            }
            .onChange(of: studioDebugLocalCommandToken) { _, _ in
                applyDebugLocalStudioCommandIfNeeded()
            }
            .onChange(of: studioDebugSeedStructuralToken) { _, _ in
                applyDebugStructuralSeedIfNeeded()
            }
            .onChange(of: studioDebugDraftInspectorToken) { _, _ in
                applyDebugDraftInspectorIfNeeded()
            }
            .onChange(of: studioDebugShellVisibilityToken) { _, _ in
                applyDebugShellVisibilityIfNeeded()
            }
            .onChange(of: studioDebugRightPanelTabToken) { _, _ in
                applyDebugRightPanelTabIfNeeded()
            }
            .onChange(of: studioDebugCommandBarToken) { _, _ in
                applyDebugCommandBarIfNeeded()
            }
            .onChange(of: studioDebugSeedRouteMetadataToken) { _, _ in
                applyDebugRouteMetadataSeedIfNeeded()
            }
            .onChange(of: studioDebugCompanionModeToken) { _, _ in
                applyDebugCompanionModeIfNeeded()
            }
            .onChange(of: studioDebugIntelligenceQueueToken) { _, _ in
                applyDebugIntelligenceQueueIfNeeded()
            }
            .onChange(of: studioDebugPageWriteToastToken) { _, _ in
                applyDebugPageWriteToastIfNeeded()
            }
            .onChange(of: studioDebugPageWriteToastInteractionToken) { _, _ in
                applyDebugPageWriteToastInteractionIfNeeded()
            }
            .onChange(of: studioDebugShortcutToken) { _, _ in
                applyDebugShortcutIfNeeded()
            }
            .onChange(of: studioDebugInspectorInteractionToken) { _, _ in
                applyDebugInspectorInteractionIfNeeded()
            }
            .onReceive(
                NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)
                    .receive(on: DispatchQueue.main)
            ) { _ in
                applyDebugPageWriteToastInteractionIfNeeded()
                applyDebugShortcutIfNeeded()
            }
    }
    #else
    private var studioLifecycleDebugBoundView: some View {
        studioLifecycleTaskBoundView
    }
    #endif

    private var studioLifecycleTaskBoundView: some View {
        studioStateBoundView
            .onDisappear {
                backendThreadViewStatePersistTask?.cancel()
                backendAskNoteHistoryPersistTask?.cancel()
                liveDraftBridge.clearAnchoredTextRect()
                isSceneQuickInsertVisible = false
                clearWriteCommitUI()
                #if os(macOS)
                #if DEBUG
                if IOThemRuntime.isStudioAutomationSession {
                    stopStudioDebugPreparePolling()
                }
                #endif
                removeStudioCommandReturnKeyMonitor()
                #endif
            }
            .task {
                studioDebugSessionID = UUID().uuidString
                #if os(macOS)
                #if DEBUG
                if IOThemRuntime.isStudioAutomationSession {
                    startStudioDebugPreparePollingIfNeeded()
                }
                #endif
                installStudioCommandReturnKeyMonitorIfNeeded()
                #endif
                restoreFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
                let restoredAcknowledgements = restoredAcknowledgedStudioDiffRecords(for: activeStudioAskNoteHistoryKey)
                acknowledgedDiffFingerprints = restoredAcknowledgements
                acknowledgedDiffExchangeKeys = Set(restoredAcknowledgements.keys)
                acknowledgedDiffWriteIDs = restoredAcknowledgedStudioDiffWriteIDs(for: activeStudioAskNoteHistoryKey)
                isAwaitingInitialAcknowledgedDiffHydration =
                    !restoredAcknowledgements.isEmpty
                    || !acknowledgedDiffWriteIDs.isEmpty
                    || !reopenedDiffExchangeKeys.isEmpty
#if DEBUG
                if !didRunStudioThreadViewStateRegressionSmoke {
                    runStudioThreadViewStateDecodeMergeRegressionSmoke()
                    didRunStudioThreadViewStateRegressionSmoke = true
                }
#endif
                applyDebugLoadProjectIfNeeded()
                applyDebugPreparedStudioPromptIfNeeded()
                applyDebugSubmittedStudioPromptIfNeeded()
                applyDebugAcknowledgedDiffIfNeeded()
                applyDebugFocusedDiffIfNeeded()
                applyDebugFocusPageIfNeeded()
                applyDebugManualDraftEditIfNeeded()
                applyDebugAutosaveToggleIfNeeded()
                applyDebugForceHydrateIfNeeded()
                applyDebugManualSaveIfNeeded()
                applyDebugSelectedLinesIfNeeded()
                applyDebugLocalStudioCommandIfNeeded()
                applyDebugStructuralSeedIfNeeded()
                applyDebugDraftInspectorIfNeeded()
                applyDebugRightPanelTabIfNeeded()
                applyDebugCommandBarIfNeeded()
                applyDebugRouteMetadataSeedIfNeeded()
                applyDebugIntelligenceQueueIfNeeded()
                applyDebugShortcutIfNeeded()
                applyUITestLaunchActionsIfNeeded()
                publishDebugStudioDiffState()
            }
    }

    private var studioStateBoundView: some View {
        studioInspectorWorkspaceBoundView
            .onChange(of: vm.fountainDraft) { _, newValue in
                if liveDraftBridge.draftText != newValue {
                    liveDraftBridge.draftText = newValue
                }
                if let committed = liveDraftBridge.lastCommittedWrite,
                   newValue != committed.committedDraft {
                    dismissLastCommittedWriteActions()
                }
                refreshStudioAskNoteAnchorsAgainstDraft(newValue)
                refreshAcknowledgedDiffState()
                syncPreferredFocusedRevisedDiffIfNeeded()
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
                syncFocusedPageDiffAnchorRequest()
                publishDebugStudioDiffState()
            }
            .onChange(of: vm.latestVersionID) { _, newValue in
                persistStudioWriteAnchorSnapshot(
                    from: studioAskNoteHistory,
                    for: activeStudioAskNoteHistoryKey,
                    versionID: newValue
                )
                vm.studioWriteAnchors = currentStudioWriteAnchorPayload(from: studioAskNoteHistory)
                vm.screenplayBindings = currentScreenplayBindingPayload()
                if directionOneRightPanelTab == .craft {
                    vm.resetCraftReportForProjectChange()
                    Task {
                        await vm.loadCraftReport(force: true)
                        await vm.refreshAcceptedCraftTwists(source: "Version")
                    }
                    Task { await vm.refreshCraftLogline(source: "Version") }
                }
                publishDebugStudioDiffState()
            }
            .onChange(of: vm.isSaving) { _, _ in
                publishDebugStudioDiffState()
            }
            .onChange(of: vm.isManualDraftEditing) { _, _ in
                publishDebugStudioDiffState()
            }
            .onChange(of: vm.hasUnsavedDraftChanges) { _, _ in
                publishDebugStudioDiffState()
            }
            .onChange(of: vm.autosaveStatusText) { _, _ in
                publishDebugStudioDiffState()
            }
            .onChange(of: vm.infoText) { _, _ in
                publishDebugStudioDiffState()
            }
            .onChange(of: vm.linesPerPage) { _, _ in
                Task { await vm.refreshDraftInsights() }
            }
            .onChange(of: vm.revisionColor) { _, _ in
                Task { await vm.refreshRevisionColor() }
            }
            .onChange(of: navigatorShowHidden) { _, _ in
                refreshNavigatorEntries()
            }
    }

    private var studioInspectorWorkspaceBoundView: some View {
        studioProjectStateBoundView
            .onChange(of: vm.selectedProjectID) { _, _ in
                restoreInspectorWorkspaceState()
                publishDebugStudioDiffState()
                creativeInstincts.activate(
                    projectID: vm.selectedProjectID,
                    projectTitle: vm.selectedProject?.title ?? ""
                )
                Task {
                    await refreshStudioCreativeInstincts(force: true)
                }
            }
            .onChange(of: vm.outline) { _, _ in
                if shouldRestoreInspectorWorkspaceOnNextOutlineChange {
                    shouldRestoreInspectorWorkspaceOnNextOutlineChange = false
                    restoreInspectorWorkspaceState()
                    publishDebugStudioDiffState()
                    return
                }
                reapplyPersistedInspectorBeatOrderIfNeeded()
                sanitizeInspectorWorkspaceStateAfterOutlineChange()
                persistInspectorWorkspaceState()
                publishDebugStudioDiffState()
            }
            .onChange(of: directionOneRightPanelTab) { _, newValue in
                if let mode = DirectionOneWorkspaceMode(tab: newValue) {
                    directionOneWorkspaceMode = mode
                }
                #if DEBUG
                let shouldRefreshThemRail = !UITestLaunchConfiguration.hasStructuralStudioFixture()
                #else
                let shouldRefreshThemRail = true
                #endif
                if newValue == .them, shouldRefreshThemRail {
                    Task {
                        await refreshStudioCreativeInstincts(force: true)
                        await vm.refreshBlockSignal(source: "io.them rail")
                        if !IOThemRuntime.isRunningUITests {
                            await vm.refreshCharacterTraits(source: "io.them rail")
                        }
                        await vm.refreshCraftTwists(source: "io.them rail")
                        await vm.refreshAcceptedCraftTwists(source: "io.them rail")
                    }
                }
                if newValue == .craft {
                    Task {
                        await vm.loadCraftReport()
                        await vm.refreshAcceptedCraftTwists(source: "Craft rail")
                    }
                    Task { await vm.refreshCraftLogline(source: "Craft rail") }
                }
                persistInspectorWorkspaceState()
                publishDebugStudioDiffState()
            }
            .onChange(of: selectedInspectorSection) { _, _ in
                persistInspectorWorkspaceState()
            }
            .onChange(of: vm.selectedCraftFrameworkID) { _, _ in
                guard directionOneRightPanelTab == .craft else { return }
                vm.noteCraftFrameworkSelectionChanged()
            }
            .onChange(of: selectedBeatInspectorID) { _, _ in
                persistInspectorWorkspaceState()
            }
            .onChange(of: highlightedSceneInspectorKey) { _, _ in
                persistInspectorWorkspaceState()
            }
            .onChange(of: vm.editingBeatID) { _, _ in
                if !vm.editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    selectedBeatInspectorID = vm.editingBeatID
                }
                persistInspectorWorkspaceState()
            }
            .onChange(of: vm.newBeatLabel) { _, _ in
                persistInspectorWorkspaceState()
            }
            .onChange(of: vm.newBeatSummary) { _, _ in
                persistInspectorWorkspaceState()
            }
            .onChange(of: vm.newBeatSceneID) { _, _ in
                persistInspectorWorkspaceState()
            }
            .onChange(of: vm.newBeatActID) { _, _ in
                persistInspectorWorkspaceState()
            }
    }

    private var studioProjectStateBoundView: some View {
        studioBrowseStateBoundView
            .onChange(of: activeStudioAskNoteHistoryKey) { oldValue, newValue in
                handleActiveStudioAskNoteHistoryKeyChange(from: oldValue, to: newValue)
            }
    }

    private func handleActiveStudioAskNoteHistoryKeyChange(from oldValue: String, to newValue: String) {
        persistStudioAskNoteHistory(studioAskNoteHistory, for: oldValue)
        persistSelectedStudioThreadID(highlightedStudioExchangeID, for: oldValue)
        persistAcknowledgedStudioDiffs(currentAcknowledgedStudioDiffRecords(), for: oldValue)
        persistAcknowledgedStudioDiffWriteIDs(currentAcknowledgedStudioDiffWriteIDs(), for: oldValue)
        persistFullThreadBrowseState(for: oldValue)
        let migratedLiveDraftHistory = migrateLiveDraftHistoryToProjectIfNeeded(from: oldValue, to: newValue)
        restoreFullThreadBrowseState(for: newValue)
        focusedPageDiffExchangeID = nil
        let restoredAcknowledgements = restoredAcknowledgedStudioDiffRecords(for: newValue)
        acknowledgedDiffFingerprints = restoredAcknowledgements
        acknowledgedDiffExchangeKeys = Set(restoredAcknowledgements.keys)
        acknowledgedDiffWriteIDs = restoredAcknowledgedStudioDiffWriteIDs(for: newValue)
        isAwaitingInitialAcknowledgedDiffHydration =
            !restoredAcknowledgements.isEmpty
            || !acknowledgedDiffWriteIDs.isEmpty
            || !reopenedDiffExchangeKeys.isEmpty
        publishDebugStudioDiffState()
        Task {
            await restoreStudioAskNoteHistory(for: newValue)
            if migratedLiveDraftHistory,
               isCurrentStudioAskNoteHistoryRestore(key: newValue) {
                vm.infoText = "Carried this first Studio thread into the new project."
            }
        }
    }

    private var studioBrowseStateBoundView: some View {
        studioThreadStateBoundView
            .onChange(of: fullStudioThreadSearchText) { _, _ in
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
            }
            .onChange(of: selectedFullThreadFilter) { _, _ in
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
            }
            .onChange(of: selectedFullThreadSceneKey) { _, _ in
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
            }
            .onChange(of: fullThreadScrollTargetKey) { _, _ in
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
            }
            .onChange(of: collapsedFullThreadSectionKeys) { _, _ in
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
            }
            .onChange(of: focusedPageDiffPersistentKey) { _, _ in
                publishDebugStudioDiffState()
            }
    }

    private var studioThreadStateBoundView: some View {
        studioObservedView
            .onChange(of: studioAskNoteHistory) { _, newValue in
                persistStudioAskNoteHistory(newValue, for: activeStudioAskNoteHistoryKey)
                persistStudioWriteAnchorSnapshot(
                    from: newValue,
                    for: activeStudioAskNoteHistoryKey,
                    versionID: vm.latestVersionID
                )
                vm.studioWriteAnchors = currentStudioWriteAnchorPayload(from: newValue)
                vm.screenplayBindings = currentScreenplayBindingPayload()
                syncLatestCommittedPrompt(from: newValue.first)
                if let highlightedStudioExchangeID,
                   !newValue.contains(where: { $0.id == highlightedStudioExchangeID }) {
                    self.highlightedStudioExchangeID = nil
                }
                if let focusedPageDiffExchangeID,
                   !newValue.contains(where: { $0.id == focusedPageDiffExchangeID }) {
                    self.focusedPageDiffExchangeID = nil
                }
                if !focusedPageDiffPersistentKey.isEmpty,
                   let matched = newValue.first(where: {
                       studioExchangePersistentActionKey($0) == focusedPageDiffPersistentKey
                   }) {
                    self.focusedPageDiffExchangeID = matched.id
                }
                migrateAcknowledgedStudioDiffStorageKeysIfNeeded(entries: newValue)
                refreshAcknowledgedDiffState()
                syncPreferredFocusedRevisedDiffIfNeeded()
                syncFocusedPageDiffAnchorRequest()
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
                applyDebugPreparedStudioPromptIfNeeded()
                publishDebugStudioDiffState()
            }
            .onChange(of: liveDraftBridge.projectBinding) { _, _ in
                vm.screenplayBindings = currentScreenplayBindingPayload()
            }
            .onChange(of: highlightedStudioExchangeID) { _, newValue in
                persistSelectedStudioThreadID(newValue, for: activeStudioAskNoteHistoryKey)
                if let newValue,
                   let exchange = studioAskNoteHistory.first(where: { $0.id == newValue }) {
                    expandFullThreadSectionIfNeeded(for: exchange)
                    fullThreadScrollTargetKey = persistentStudioThreadSelectionKey(for: exchange)
                }
            }
            .onChange(of: focusedPageDiffExchangeID) { _, newValue in
                if let newValue,
                   let exchange = studioAskNoteHistory.first(where: { $0.id == newValue }) {
                    focusedPageDiffPersistentKey = studioExchangePersistentActionKey(exchange)
                    expandFullThreadSectionIfNeeded(for: exchange)
                } else {
                    isFocusedPageDiffOverlayPresented = false
                    let clearContext = StudioThreadViewPersistDeferralContext(
                        hasProjectKey: screenplayProjectIdFromHistoryKey(activeStudioAskNoteHistoryKey) != nil,
                        isRestoringFullThreadBrowseState: isRestoringFullThreadBrowseState,
                        isAwaitingInitialFullThreadRestore: isAwaitingInitialFullThreadRestore,
                        isAwaitingInitialAcknowledgedDiffHydration: isAwaitingInitialAcknowledgedDiffHydration,
                        isRestoringReopenedDiffState: isRestoringReopenedDiffState
                    )
                    if StudioThreadFocusRestorePolicy.shouldClearPersistentFocusKey(clearContext) {
                        focusedPageDiffPersistentKey = ""
                    }
                }
                syncFocusedPageDiffAnchorRequest()
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
                publishDebugStudioDiffState()
            }
            .onChange(of: acknowledgedDiffExchangeKeys) { _, newValue in
                persistAcknowledgedStudioDiffs(currentAcknowledgedStudioDiffRecords(), for: activeStudioAskNoteHistoryKey)
                _ = newValue
                publishDebugStudioDiffState()
            }
            .onChange(of: acknowledgedDiffFingerprints) { _, _ in
                persistAcknowledgedStudioDiffs(currentAcknowledgedStudioDiffRecords(), for: activeStudioAskNoteHistoryKey)
                publishDebugStudioDiffState()
            }
            .onChange(of: acknowledgedDiffWriteIDs) { _, _ in
                persistAcknowledgedStudioDiffWriteIDs(
                    currentAcknowledgedStudioDiffWriteIDs(),
                    for: activeStudioAskNoteHistoryKey
                )
                publishDebugStudioDiffState()
            }
            .onChange(of: reopenedDiffExchangeKeys) { _, _ in
                persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
                publishDebugStudioDiffState()
            }
    }

    private var studioCreativeInstinctsBoundView: some View {
        studioBaseLayout
            .task {
                #if DEBUG
                if IOThemRuntime.isRunningUITests,
                   UITestLaunchConfiguration.shouldBypassStudioHydration() {
                    return
                }
                #endif
                await vm.load()
                _ = await selectPreferredProjectIfNeeded(liveDraftBridge.preferredProjectID)
                _ = await applyBridgeDebugProjectLoadIfNeeded(force: true)
                await restoreStudioWorkspaceAfterProjectHydration()
                #if DEBUG
                studioDebugInitialLoadSettled = true
                publishDebugStudioDiffState()
                #endif
                #if DEBUG
                await applyUITestSaveNetworkFaultIfNeeded()
                #endif
                await vm.refreshScreenplayExportFormatsAutomatically()
                if directionOneRightPanelTab == .them {
                    await refreshStudioCreativeInstincts(force: true)
                    await vm.refreshBlockSignal(source: "Studio open")
                    await vm.refreshCraftTwists(source: "Studio open")
                    await vm.refreshAcceptedCraftTwists(source: "Studio open")
                }
            }
            .onReceive(Self.crossDeviceRefreshTimer) { _ in
                guard !IOThemRuntime.isRunningTests else { return }
                Task {
                    await vm.refreshCrossDeviceStateIfNeeded()
                    if directionOneRightPanelTab == .them {
                        await refreshStudioCreativeInstincts(
                            force: false,
                            reportErrors: false
                        )
                    }
                }
            }
    }

    private var studioObservedView: some View {
        studioCreativeInstinctsBoundView
            .onChange(of: liveDraftBridge.preferredProjectID) { _, newValue in
                #if DEBUG
                if IOThemRuntime.isRunningUITests,
                   ProcessInfo.processInfo.arguments.contains("--ui-show-draft-conflict") {
                    return
                }
                #endif
                Task {
                    if await selectPreferredProjectIfNeeded(newValue) {
                        await restoreStudioWorkspaceAfterProjectHydration()
                    }
                }
            }
            .onChange(of: liveDraftBridge.debugProjectLoadToken) { _, _ in
                Task {
                    if await applyBridgeDebugProjectLoadIfNeeded() {
                        await restoreStudioWorkspaceAfterProjectHydration()
                    }
                }
            }
            .onChange(of: liveDraftBridge.debugRequestedProjectID) { _, _ in
                Task {
                    if await applyBridgeDebugProjectLoadIfNeeded(force: true) {
                        await restoreStudioWorkspaceAfterProjectHydration()
                    }
                }
            }
            .onChange(of: liveDraftBridge.draftText) { _, newValue in
                vm.replaceDraftFromVoiceBridgeIfNeeded(
                    newValue,
                    draftOriginProjectID: liveDraftBridge.draftOriginProjectIDSnapshot()
                )
            }
            .onChange(of: liveDraftBridge.isStreamingDraftPreviewActive) { _, isActive in
                vm.setStreamingDraftPreviewActive(isActive)
            }
            .onChange(of: liveDraftBridge.latestVoiceTurn) { _, newValue in
                let firstLine = newValue
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .components(separatedBy: .newlines)
                    .first ?? ""
                guard !firstLine.isEmpty else { return }
                lastVoiceFeedback = String(firstLine.prefix(84))
                withAnimation(.easeIn(duration: 0.18)) {
                    voiceFeedbackOpacity = 1
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
                    withAnimation(.easeOut(duration: 0.55)) {
                        voiceFeedbackOpacity = 0
                    }
                }
            }
            .onChange(of: liveDraftBridge.pendingInsertion) { _, request in
                switch request?.mode {
                case .streamPreview:
                    clearWriteCommitUI()
                case .streamCancel:
                    clearWriteCommitUI()
                default:
                    break
                }
            }
            .onChange(of: liveDraftBridge.latestStudioUserPrompt) { _, prompt in
                guard let prompt else { return }
                guard prompt.source == .voice else { return }
                pendingVoiceStudioPrompt = prompt
                if prompt.target == .page,
                   liveDraftBridge.lastCommittedWrite != nil {
                    appendPendingVoicePageWriteIfNeeded()
                }
            }
            .onChange(of: liveDraftBridge.assistantPin) { _, pin in
                appendPendingVoicePinExchangeIfNeeded(pin)
            }
            .onChange(of: liveDraftBridge.lastCommittedWrite) { _, committedWrite in
                guard let committedWrite else { return }
                vm.adoptCommittedPageWriteIfNeeded(committedWrite)
                if suppressLastCommittedWriteAutoReveal {
                    suppressLastCommittedWriteAutoReveal = false
                    publishDebugStudioDiffState()
                    return
                }
                dismissFocusedPageDiffAfterCommittedWrite()
                showPageCommitNotice()
                revealLastCommittedWriteActions()
                appendPendingVoicePageWriteIfNeeded()
                applyDebugPreparedStudioPromptIfNeeded()
            }
            .onChange(of: liveDraftBridge.pendingStudioAction) { _, request in
                guard let request else { return }
                Task { await handleBridgeStudioAction(request) }
            }
            .onChange(of: liveDraftBridge.currentCursorLine) { _, _ in
                guard !highlightedSceneInspectorKey.isEmpty else { return }
                let activeKey = normalizedSceneNavigatorKey(activeDraftSceneNavigatorItem?.label ?? "")
                if activeKey != highlightedSceneInspectorKey {
                    highlightedSceneInspectorKey = ""
                }
            }
            .onChange(of: vm.editingSceneID) { _, newValue in
                if newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    sceneInspectorTitleFocused = false
                    return
                }
                selectedInspectorSection = .scenes
                Task { @MainActor in
                    sceneInspectorTitleFocused = false
                    try? await Task.sleep(nanoseconds: 40_000_000)
                    sceneInspectorTitleFocused = true
                }
            }
    }

    @MainActor
    private func handleBridgeStudioAction(_ request: ScreenplayStudioActionRequest) async {
        switch request.action {
        case .saveDraft:
            await vm.manualSaveDraft()
        case .saveRevisionSnapshot:
            await vm.createRevisionSnapshot()
        case .undoLastPageWrite:
            if let committedWrite = liveDraftBridge.lastCommittedWrite {
                undoLastCommittedWrite(committedWrite)
            } else {
                vm.infoText = "There isn't a recent page write to undo."
            }
        case .moveCurrentSceneAfterScene:
            await moveCurrentSceneAfterRequestedScene(request)
        case .moveSelectionAfterScene:
            await moveSelectionAfterRequestedScene(request)
        case .splitSelectionIntoNewScene:
            await splitSelectionIntoNewScene(request)
        case .promoteSelectionToBeat:
            await promoteSelectionIntoBeat(request)
        case .makeBeatFromSelection:
            handleSelectionQuickBeatCapture()
        case .updateSelectedBeatFromSelection:
            handleSelectedBeatQuickUpdate()
        case .deleteCurrentBeat:
            await deleteCurrentBeat(request)
        case .duplicateCurrentScene:
            await duplicateCurrentScene(request)
        case .promoteParagraphToDialogue:
            await promoteParagraphToDialogue(request)
        case .demoteCurrentBeat:
            await demoteCurrentBeat(request)
        case .acceptFocusedRewrite:
            acceptFocusedRewrite(request)
        case .mergeCurrentSceneForward:
            await mergeCurrentSceneForward(request)
        }
        if liveDraftBridge.pendingStudioAction?.id == request.id {
            liveDraftBridge.pendingStudioAction = nil
        }
    }

    private func moveSelectionAfterRequestedScene(_ request: ScreenplayStudioActionRequest) async {
        guard let selection = liveDraftBridge.selectedEditorSnapshot() else {
            vm.infoText = "Select the block you want to move first."
            return
        }

        let targetScene = resolvedTargetScene(for: request)
        guard let targetScene else {
            vm.infoText = "I couldn't find the destination scene for that move."
            return
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        let selectionStart = max(0, selection.startLine - 1)
        let selectionEnd = min(lines.count, selection.endLine)
        guard selectionStart < selectionEnd else {
            vm.infoText = "I couldn't resolve that selected block on the page."
            return
        }
        guard let targetRange = draftSceneLineRange(for: targetScene, in: lines) else {
            vm.infoText = "I couldn't resolve the destination scene on the page."
            return
        }
        let selectionRange = selectionStart..<selectionEnd
        guard !selectionRange.overlaps(targetRange) else {
            vm.infoText = "Choose a destination scene outside the selected block so I don't collapse the page order."
            return
        }

        var nextLines = lines
        let movedBlock = Array(nextLines[selectionRange])
        nextLines.removeSubrange(selectionRange)

        var insertionIndex = targetRange.upperBound
        if selectionRange.lowerBound < targetRange.lowerBound {
            insertionIndex -= selectionRange.count
        }
        insertionIndex = max(0, min(insertionIndex, nextLines.count))
        nextLines.insert(contentsOf: movedBlock, at: insertionIndex)

        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Moved the selected block after \(targetScene.shortLabel).",
            jumpStartLine: insertionIndex + 1,
            jumpEndLine: insertionIndex + movedBlock.count
        )
    }

    private func moveCurrentSceneAfterRequestedScene(_ request: ScreenplayStudioActionRequest) async {
        guard let currentScene = liveDraftBridge.currentSceneSnapshot() else {
            vm.infoText = "I couldn't find the current scene to move."
            return
        }

        let targetScene: ScreenplayDraftSceneSnapshot?
        if let ordinal = request.intValue, ordinal > 0 {
            targetScene = liveDraftBridge.sceneSnapshotForOrdinal(ordinal)
        } else if let label = request.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty {
            targetScene = liveDraftBridge.sceneSnapshotMatching(label)
        } else {
            targetScene = nil
        }

        guard let targetScene else {
            vm.infoText = "I couldn't find the scene to move this after."
            return
        }
        guard currentScene.id != targetScene.id else {
            vm.infoText = "That scene is already in place."
            return
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard
            let currentRange = draftSceneLineRange(for: currentScene, in: lines),
            let targetRange = draftSceneLineRange(for: targetScene, in: lines)
        else {
            vm.infoText = "I couldn't resolve the scene ranges on the page."
            return
        }

        var nextLines = lines
        let movedBlock = Array(nextLines[currentRange])
        nextLines.removeSubrange(currentRange)

        var insertionIndex = targetRange.upperBound
        if currentRange.lowerBound < targetRange.lowerBound {
            insertionIndex -= currentRange.count
        }
        insertionIndex = max(0, min(insertionIndex, nextLines.count))
        nextLines.insert(contentsOf: movedBlock, at: insertionIndex)

        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Moved \(currentScene.shortLabel) after \(targetScene.shortLabel).",
            jumpStartLine: insertionIndex + 1,
            jumpEndLine: insertionIndex + movedBlock.count
        )

        guard
            let currentBinding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: currentScene.id),
            let targetBinding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: targetScene.id),
            let movingSceneID = currentBinding.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines),
            let targetSceneID = targetBinding.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines),
            !movingSceneID.isEmpty,
            !targetSceneID.isEmpty
        else {
            return
        }

        let reorderedScenes = reorderedOutlineScenes(
            movingSceneID: movingSceneID,
            targetSceneID: targetSceneID,
            scenes: vm.outline.scenes
        )
        guard !reorderedScenes.isEmpty else { return }
        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: reorderedScenes.count,
            beatCount: vm.outline.beats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: reorderedScenes),
            scenes: reorderedScenes,
            beats: vm.outline.beats
        )
        await vm.pushOutlineSnapshot()
        vm.infoText = "Moved \(currentScene.shortLabel) after \(targetScene.shortLabel) and updated the outline order."
    }

    private func splitSelectionIntoNewScene(_ request: ScreenplayStudioActionRequest) async {
        guard let selection = liveDraftBridge.selectedEditorSnapshot() else {
            vm.infoText = "Select the block you want to split first."
            return
        }

        let insertionIndex = max(0, selection.startLine - 1)
        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        let headingSeed = request.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let heading = normalizedSceneInsertSlugline(
            headingSeed.isEmpty ? suggestedSceneNavigatorSlugline() : headingSeed
        )
        guard !heading.isEmpty else {
            vm.infoText = "I couldn't build a new scene heading for that split."
            return
        }

        var nextLines = lines
        var insertionLines: [String] = []
        if insertionIndex > 0,
           !lines[insertionIndex - 1].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            insertionLines.append("")
        }
        insertionLines.append(heading)
        nextLines.insert(contentsOf: insertionLines, at: min(insertionIndex, nextLines.count))
        let headingLine = insertionIndex + insertionLines.count

        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Split the selected block into a new scene: \(compactSceneNavigatorLabel(heading)).",
            jumpStartLine: headingLine,
            jumpEndLine: headingLine
        )

        guard vm.selectedProject != nil else { return }
        let error = await vm.addSceneFromNavigator(slugline: heading)
        if let error, !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            vm.infoText = "Split the page into \(compactSceneNavigatorLabel(heading)), but the outline sync failed: \(error)"
        } else {
            vm.infoText = "Split the page into \(compactSceneNavigatorLabel(heading)) and added the new scene to the outline."
        }
    }

    private func promoteSelectionIntoBeat(_ request: ScreenplayStudioActionRequest) async {
        guard let project = vm.selectedProject else {
            vm.infoText = "Select a Studio project before promoting a beat."
            return
        }
        guard let selection = liveDraftBridge.selectedEditorSnapshot() else {
            vm.infoText = "Select the block you want to promote into a beat first."
            return
        }

        let currentScene = liveDraftBridge.currentSceneSnapshot()
        let binding = currentScene.flatMap { liveDraftBridge.projectBindingSnapshot(forDraftSceneID: $0.id) }
        let summary = selection.trimmedText
        let label = BeatQuickCaptureSeedPlanner.makeLabel(
            from: summary,
            sceneLabel: selection.sceneLabel ?? currentScene?.shortLabel
        )
        let result: BackendReadResult<BackendScreenplayBeatMutationResponse>
        do {
            result = try await BackendMemoryAPI.shared.upsertScreenplayBeat(
                projectId: project.id,
                beat: BackendScreenplayBeatDraft(
                    label: label,
                    summary: String(summary.prefix(280)),
                    sceneId: binding?.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                        ? binding?.outlineSceneID
                        : nil,
                    actId: nil
                ),
                title: project.title
            )
        } catch {
            vm.errorText = error.localizedDescription
            vm.infoText = "I couldn't promote that selection into a beat."
            return
        }

        vm.adoptCanonicalOutlineState(
            result.payload.outlineRevision,
            outline: result.payload.outline,
            project: result.payload.project,
            projectId: project.id
        )
        await vm.reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
        let scenePhrase = binding?.outlineSceneTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? binding?.outlineSceneTitle ?? ""
            : (selection.sceneLabel ?? currentScene?.shortLabel ?? "")
        vm.infoText = scenePhrase.isEmpty
            ? "Promoted the selected block into beat \(label)."
            : "Promoted the selected block into beat \(label) in \(scenePhrase)."
    }

    private func deleteCurrentBeat(_ request: ScreenplayStudioActionRequest) async {
        guard let resolved = resolvedBeatContext() else {
            vm.infoText = "I couldn't resolve which beat to delete from the current scene."
            return
        }

        let filteredBeats = vm.outline.beats.filter { $0.id != resolved.beat.id }
        let filteredScenes = vm.outline.scenes.enumerated().map { index, scene in
            let beatIDs = (scene.beatIds ?? []).filter { $0 != resolved.beat.id }
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: beatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }

        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: filteredScenes.count,
            beatCount: filteredBeats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: filteredScenes),
            scenes: filteredScenes,
            beats: filteredBeats
        )
        await vm.pushOutlineSnapshot()
        vm.refreshLiveDraftBridgeContext()
        directionOneRightPanelTab = .beats
        vm.infoText = "Deleted beat \(resolved.beat.label)."
    }

    private func duplicateCurrentScene(_ request: ScreenplayStudioActionRequest) async {
        guard let currentScene = liveDraftBridge.currentSceneSnapshot() else {
            vm.infoText = "I couldn't find the current scene to duplicate."
            return
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard let currentRange = draftSceneLineRange(for: currentScene, in: lines) else {
            vm.infoText = "I couldn't resolve the current scene on the page."
            return
        }

        let block = Array(lines[currentRange])
        guard !block.isEmpty else {
            vm.infoText = "The current scene is empty, so there's nothing to duplicate yet."
            return
        }

        var insertedBlock: [String] = []
        if let last = block.last, !last.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            insertedBlock.append("")
        }
        insertedBlock.append(contentsOf: block)

        var nextLines = lines
        nextLines.insert(contentsOf: insertedBlock, at: currentRange.upperBound)
        let duplicatedStartLine = currentRange.upperBound + insertedBlock.count - block.count + 1
        let duplicatedEndLine = duplicatedStartLine + block.count - 1
        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Duplicated \(currentScene.shortLabel).",
            jumpStartLine: duplicatedStartLine,
            jumpEndLine: duplicatedEndLine
        )

        guard
            let binding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: currentScene.id),
            let outlineSceneID = binding.outlineSceneID,
            let sourceIndex = vm.outline.scenes.firstIndex(where: { $0.id == outlineSceneID })
        else {
            return
        }

        let sourceScene = vm.outline.scenes[sourceIndex]
        let cloneID = "scene-\(UUID().uuidString.lowercased())"
        let cloneTitle = sourceScene.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "\(currentScene.shortLabel) Copy"
            : "\(sourceScene.title) Copy"
        let cloneScene = BackendScreenplayScene(
            id: cloneID,
            slugline: sourceScene.slugline,
            title: cloneTitle,
            objective: sourceScene.objective,
            summary: sourceScene.summary,
            actId: sourceScene.actId,
            order: sourceIndex + 1,
            status: sourceScene.status,
            beatIds: [],
            createdAt: Date().timeIntervalSince1970 * 1000,
            updatedAt: Date().timeIntervalSince1970 * 1000
        )

        var clonedScenes = vm.outline.scenes
        clonedScenes.insert(cloneScene, at: sourceIndex + 1)
        let reindexedScenes = clonedScenes.enumerated().map { index, scene in
            BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: scene.beatIds,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }

        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: reindexedScenes.count,
            beatCount: vm.outline.beatCount,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: reindexedScenes),
            scenes: reindexedScenes,
            beats: vm.outline.beats
        )
        await vm.pushOutlineSnapshot()
        vm.refreshLiveDraftBridgeContext()
        vm.infoText = "Duplicated \(currentScene.shortLabel) and added a matching outline scene."
    }

    private func promoteParagraphToDialogue(_ request: ScreenplayStudioActionRequest) async {
        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard !lines.isEmpty else {
            vm.infoText = "There isn't enough draft text on the page to promote yet."
            return
        }

        let startLine = max(1, request.intValue ?? liveDraftBridge.selectedEditorSnapshot()?.startLine ?? liveDraftBridge.currentCursorLine)
        let endLine = max(startLine, request.secondaryIntValue ?? liveDraftBridge.selectedEditorSnapshot()?.endLine ?? startLine)
        let startIndex = max(0, startLine - 1)
        let endIndex = min(lines.count, endLine)
        guard startIndex < endIndex else {
            vm.infoText = "I couldn't resolve that paragraph on the page."
            return
        }

        let selectionRange = startIndex..<endIndex
        let extractedDialogue = lines[selectionRange]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !extractedDialogue.isEmpty else {
            vm.infoText = "That paragraph is empty, so there isn't anything to promote into dialogue."
            return
        }

        let previousParagraph = liveDraftBridge.structuredDraft.paragraphs.first(where: { $0.line == startLine - 1 })
        let cue = preferredDialogueCue(beforeLine: startLine)
        let needsCue = previousParagraph?.element != .character

        var replacement: [String] = []
        if startIndex > 0, !lines[startIndex - 1].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            replacement.append("")
        }
        if needsCue {
            replacement.append(cue)
        }
        replacement.append(contentsOf: extractedDialogue)
        if endIndex < lines.count, !lines[endIndex].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            replacement.append("")
        }

        var nextLines = lines
        nextLines.replaceSubrange(selectionRange, with: replacement)
        let jumpStartLine = startIndex + (needsCue ? 2 : 1)
        let jumpEndLine = max(jumpStartLine, jumpStartLine + extractedDialogue.count - 1)
        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Promoted that paragraph into dialogue for \(cue).",
            jumpStartLine: jumpStartLine,
            jumpEndLine: jumpEndLine
        )
        liveDraftBridge.setActiveScreenplayElement(.dialogue)
    }

    private func demoteCurrentBeat(_ request: ScreenplayStudioActionRequest) async {
        guard let resolved = resolvedBeatContext() else {
            vm.infoText = "I couldn't resolve which beat to demote from the current scene."
            return
        }

        let parentScene = vm.outline.scenes.first(where: { $0.id == resolved.sceneID })
        let updatedBeats = vm.outline.beats.enumerated().map { index, beat in
            guard beat.id == resolved.beat.id else { return beat }
            return BackendScreenplayBeat(
                id: beat.id,
                label: beat.label,
                summary: beat.summary,
                sceneId: nil,
                actId: beat.actId ?? parentScene?.actId,
                order: beat.order ?? index,
                status: beat.status,
                createdAt: beat.createdAt,
                updatedAt: Date().timeIntervalSince1970 * 1000
            )
        }
        let updatedScenes = vm.outline.scenes.enumerated().map { index, scene in
            let beatIDs = (scene.beatIds ?? []).filter { $0 != resolved.beat.id }
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: beatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }

        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: updatedScenes.count,
            beatCount: updatedBeats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: updatedScenes),
            scenes: updatedScenes,
            beats: updatedBeats
        )
        await vm.pushOutlineSnapshot()
        vm.refreshLiveDraftBridgeContext()
        directionOneRightPanelTab = .beats
        vm.infoText = "Demoted beat \(resolved.beat.label) out of the scene and kept it in the outline."
    }

    private func acceptFocusedRewrite(_ request: ScreenplayStudioActionRequest) {
        guard let targetExchange = focusedPageDiffExchange ?? preferredRevisedDiffExchange(in: studioAskNoteHistory) else {
            vm.infoText = "There isn't a revised write selected to accept yet."
            return
        }
        acknowledgeCurrentDraftVersion(for: targetExchange)
        focusedPageDiffExchangeID = targetExchange.id
        focusedPageDiffPersistentKey = studioExchangePersistentActionKey(targetExchange)
        isFocusedPageDiffOverlayPresented = false
        isLastCommittedWriteActionVisible = false
        isPageCommitNoticeVisible = false
        highlightedStudioExchangeID = targetExchange.id
        vm.infoText = "Keeping only that rewrite."
    }

    private func mergeCurrentSceneForward(_ request: ScreenplayStudioActionRequest) async {
        let currentScene = request.intValue.flatMap { _ in liveDraftBridge.currentSceneSnapshot() } ?? liveDraftBridge.currentSceneSnapshot()
        guard let currentScene else {
            vm.infoText = "I couldn't find the current scene to merge."
            return
        }
        guard let nextScene = liveDraftBridge.nextSceneSnapshot(after: currentScene) else {
            vm.infoText = "There isn't a following scene to merge into this one."
            return
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard
            let currentRange = draftSceneLineRange(for: currentScene, in: lines),
            let nextRange = draftSceneLineRange(for: nextScene, in: lines)
        else {
            vm.infoText = "I couldn't resolve those scenes on the page."
            return
        }

        var currentBlock = Array(lines[currentRange])
        var nextBlock = Array(lines[nextRange])
        if !nextBlock.isEmpty {
            nextBlock.removeFirst()
        }
        while let first = nextBlock.first, first.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            nextBlock.removeFirst()
        }
        while let last = currentBlock.last, last.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            currentBlock.removeLast()
        }
        if !currentBlock.isEmpty, !nextBlock.isEmpty {
            currentBlock.append("")
        }
        currentBlock.append(contentsOf: nextBlock)

        var nextLines = lines
        nextLines.replaceSubrange(currentRange.lowerBound..<nextRange.upperBound, with: currentBlock)
        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Merged \(currentScene.shortLabel) with \(nextScene.shortLabel).",
            jumpStartLine: currentScene.line,
            jumpEndLine: currentScene.line + currentBlock.count - 1
        )

        guard
            let currentBinding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: currentScene.id),
            let nextBinding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: nextScene.id),
            let currentOutlineID = currentBinding.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines),
            let nextOutlineID = nextBinding.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines),
            !currentOutlineID.isEmpty,
            !nextOutlineID.isEmpty
        else {
            return
        }

        let mergedBeats = vm.outline.beats.enumerated().map { index, beat in
            BackendScreenplayBeat(
                id: beat.id,
                label: beat.label,
                summary: beat.summary,
                sceneId: (beat.sceneId ?? "") == nextOutlineID ? currentOutlineID : beat.sceneId,
                actId: beat.actId,
                order: beat.order ?? index,
                status: beat.status,
                createdAt: beat.createdAt,
                updatedAt: beat.updatedAt
            )
        }
        let mergedScenesSource = vm.outline.scenes.filter { $0.id != nextOutlineID }
        let mergedScenes = mergedScenesSource.enumerated().map { index, scene in
            let mergedBeatIDs = mergedBeats
                .filter { ($0.sceneId ?? "") == scene.id }
                .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
                .map(\.id)
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: mergedBeatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: mergedScenes.count,
            beatCount: mergedBeats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: mergedScenes),
            scenes: mergedScenes,
            beats: mergedBeats
        )
        await vm.pushOutlineSnapshot()
        vm.infoText = "Merged \(currentScene.shortLabel) with \(nextScene.shortLabel) and updated the outline."
    }

    private func applyStructuralDraftMutation(
        _ nextDraft: String,
        infoText: String,
        jumpStartLine: Int,
        jumpEndLine: Int
    ) {
        vm.errorText = ""
        vm.fountainDraft = nextDraft
        vm.noteManualDraftEdit()
        liveDraftBridge.jumpToLine(max(1, jumpStartLine))
        liveDraftBridge.highlightLineRange(startLine: max(1, jumpStartLine), endLine: max(jumpStartLine, jumpEndLine))
        liveDraftBridge.requestEditorFocus()
        vm.infoText = infoText
    }

    private func resolvedTargetScene(for request: ScreenplayStudioActionRequest) -> ScreenplayDraftSceneSnapshot? {
        if let ordinal = request.intValue, ordinal > 0 {
            return liveDraftBridge.sceneSnapshotForOrdinal(ordinal)
        }
        if let label = request.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
           !label.isEmpty {
            return liveDraftBridge.sceneSnapshotMatching(label)
        }
        return nil
    }

    private func preferredDialogueCue(beforeLine line: Int) -> String {
        let paragraphs = liveDraftBridge.structuredDraft.paragraphs.sorted { lhs, rhs in
            lhs.line < rhs.line
        }
        if let paragraph = paragraphs.last(where: { $0.line < line && $0.element == .character }) {
            let cue = paragraph.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cue.isEmpty {
                return cue.uppercased()
            }
        }
        if let scene = liveDraftBridge.currentSceneSnapshot(),
           let cue = scene.characterCues.last,
           !cue.isEmpty {
            return cue.uppercased()
        }
        return "VOICE"
    }

    private func resolvedBeatContext() -> (beat: BackendScreenplayBeat, sceneID: String)? {
        guard let currentScene = liveDraftBridge.currentSceneSnapshot(),
              let binding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: currentScene.id) else {
            return nil
        }
        let candidateIDs = Set(binding.outlineBeatIDs)
        let candidateBeats = vm.outline.beats.filter { candidateIDs.contains($0.id) }
        guard !candidateBeats.isEmpty else { return nil }
        if candidateBeats.count == 1, let beat = candidateBeats.first {
            return (beat, binding.outlineSceneID ?? "")
        }

        let contextText = [
            liveDraftBridge.selectedEditorSnapshot()?.trimmedText ?? "",
            currentScene.shortLabel,
            currentScene.slugline
        ]
        .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        .joined(separator: " ")
        let contextTokens = normalizedBeatMatchTokens(contextText)

        let scored = candidateBeats.map { beat -> (BackendScreenplayBeat, Int) in
            let beatTokens = normalizedBeatMatchTokens([beat.label, beat.summary ?? ""].joined(separator: " "))
            return (beat, beatTokens.intersection(contextTokens).count)
        }
        let sorted = scored.sorted { lhs, rhs in
            if lhs.1 == rhs.1 {
                return lhs.0.label < rhs.0.label
            }
            return lhs.1 > rhs.1
        }
        guard let best = sorted.first, best.1 > 0 else { return nil }
        return (best.0, binding.outlineSceneID ?? "")
    }

    private func normalizedBeatMatchTokens(_ raw: String) -> Set<String> {
        let normalized = raw
            .lowercased()
            .replacingOccurrences(of: #"[^\p{L}\p{N}\s]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return [] }
        return Set(normalized.split(separator: " ").map(String.init).filter { $0.count > 2 })
    }

    private func draftSceneLineRange(
        for scene: ScreenplayDraftSceneSnapshot,
        in lines: [String]
    ) -> Range<Int>? {
        let startIndex = max(0, scene.line - 1)
        let endIndex = min(lines.count, scene.endLine)
        guard startIndex < endIndex else { return nil }
        return startIndex..<endIndex
    }

    private func reorderedOutlineScenes(
        movingSceneID: String,
        targetSceneID: String,
        scenes: [BackendScreenplayScene]
    ) -> [BackendScreenplayScene] {
        guard
            let movingIndex = scenes.firstIndex(where: { $0.id == movingSceneID }),
            let targetIndex = scenes.firstIndex(where: { $0.id == targetSceneID })
        else {
            return []
        }
        var reordered = scenes
        let movingScene = reordered.remove(at: movingIndex)
        let adjustedTargetIndex = movingIndex < targetIndex ? targetIndex - 1 : targetIndex
        let targetActID = reordered[adjustedTargetIndex].actId
        let moved = BackendScreenplayScene(
            id: movingScene.id,
            slugline: movingScene.slugline,
            title: movingScene.title,
            objective: movingScene.objective,
            summary: movingScene.summary,
            actId: targetActID,
            order: movingScene.order,
            status: movingScene.status,
            beatIds: movingScene.beatIds,
            createdAt: movingScene.createdAt,
            updatedAt: movingScene.updatedAt
        )
        reordered.insert(moved, at: min(adjustedTargetIndex + 1, reordered.count))
        return reordered.enumerated().map { index, scene in
            BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: scene.beatIds,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
    }

    private func rebuiltOutlineActs(
        from acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene]
    ) -> [BackendScreenplayAct] {
        acts.enumerated().map { index, act in
            let sceneIDs = InspectorOrderSupport.sceneIDs(for: act.id, scenes: scenes)
            return BackendScreenplayAct(
                id: act.id,
                title: act.title,
                summary: act.summary,
                order: act.order ?? index,
                sceneIds: sceneIDs,
                createdAt: act.createdAt,
                updatedAt: act.updatedAt
            )
        }
    }

    private var studioBaseLayout: some View {
        directionOneStudioLayout
    }

    private var directionOneStudioLayout: some View {
        GeometryReader { geometry in
            let usesDrawers = StudioResponsiveLayout.usesDrawers(containerWidth: geometry.size.width)
            let compactTopInset: CGFloat = {
                #if os(iOS)
                usesDrawers
                    ? StudioResponsiveLayout.compactTopInset(
                        safeAreaInset: geometry.safeAreaInsets.top,
                        isPhone: UIDevice.current.userInterfaceIdiom == .phone
                    )
                    : 0
                #else
                0
                #endif
            }()

            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .saturation(0.40)
                .brightness(0.07)
                .overlay(Color.black.opacity(0.03))
                .ignoresSafeArea()

                VStack(spacing: 0) {
                    directionOneHeader(usesDrawers: usesDrawers)
                        .frame(height: usesDrawers ? 46 : nil)
                        .zIndex(2)
                    directionOneBodyColumns(
                        usesDrawers: usesDrawers,
                        availableWidth: geometry.size.width
                    )
                    if directionOneTransientStatusIsVisible {
                        directionOneTransientStatusBar
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .padding(.top, compactTopInset)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                if let conflict = vm.conflictState {
                    Color.black.opacity(0.12)
                        .ignoresSafeArea()

                    draftConflictBanner(conflict)
                        .frame(maxWidth: 560)
                        .padding(.horizontal, 20)
                        .padding(.top, 70 + compactTopInset)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .transition(.move(edge: .top).combined(with: .opacity))
                } else if let recovery = vm.recoveryCandidate {
                    Color.black.opacity(0.08)
                        .ignoresSafeArea()

                    draftRecoveryBanner(recovery)
                        .frame(maxWidth: 560)
                        .padding(.horizontal, 20)
                        .padding(.top, 70 + compactTopInset)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.18), value: vm.conflictState != nil)
            .animation(.easeOut(duration: 0.18), value: vm.recoveryCandidate != nil)
            .onAppear {
                configureDirectionOneResponsiveLayout(usesDrawers: usesDrawers)
            }
            .onChange(of: usesDrawers) { _, nextUsesDrawers in
                configureDirectionOneResponsiveLayout(usesDrawers: nextUsesDrawers)
            }
            .onChange(of: isDirectionOneSidebarVisible) { _, isVisible in
                guard isDirectionOneCompactLayout, isVisible else { return }
                isDirectionOneRightRailExpanded = false
            }
            .onChange(of: isDirectionOneRightRailExpanded) { _, isVisible in
                guard isDirectionOneCompactLayout, isVisible else { return }
                isDirectionOneSidebarVisible = false
            }
        }
    }

    @ViewBuilder
    private func directionOneBodyColumns(
        usesDrawers: Bool,
        availableWidth: CGFloat
    ) -> some View {
        if usesDrawers {
            ZStack {
                directionOneScriptEditor
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                if isDirectionOneCompactLayout,
                   isDirectionOneSidebarVisible || isDirectionOneRightRailExpanded {
                    Color.black.opacity(0.10)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            closeDirectionOneCompactDrawers()
                        }
                        .accessibilityIdentifier("studio.compact.drawer.backdrop")
                }

                if isDirectionOneCompactLayout, isDirectionOneRightRailExpanded {
                    HStack(spacing: 0) {
                        Spacer(minLength: 0)
                        directionOneInspectorColumn(
                            width: StudioResponsiveLayout.inspectorDrawerWidth(
                                containerWidth: availableWidth
                            )
                        )
                    }
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                } else if isDirectionOneCompactLayout, isDirectionOneSidebarVisible {
                    HStack(spacing: 0) {
                        directionOneSidebarColumn(
                            width: StudioResponsiveLayout.sidebarDrawerWidth(
                                containerWidth: availableWidth
                            )
                        )
                        Spacer(minLength: 0)
                    }
                    .transition(.move(edge: .leading).combined(with: .opacity))
                }
            }
            .clipped()
        } else {
            HStack(spacing: 0) {
                if isDirectionOneSidebarVisible {
                    directionOneSidebarColumn(width: 208)
                        .transition(.move(edge: .leading).combined(with: .opacity))
                }

                directionOneScriptEditor
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                if isDirectionOneRightRailExpanded {
                    directionOneInspectorColumn(width: 248)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
        }
    }

    private func directionOneSidebarColumn(width: CGFloat) -> some View {
        VStack(spacing: 0) {
            sidebarModeTabs
                .padding(.horizontal, 12)
                .padding(.top, 14)
                .padding(.bottom, 10)

            Group {
                switch selectedSidebarSection {
                case .projects:
                    projectsSidebarContent
                case .files:
                    filesSidebarContent
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.horizontal, 10)
            .padding(.vertical, 12)
        }
        .frame(width: width)
        .background(directionOneColumnSurface)
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(directionOneChromeStroke.opacity(0.22))
                .frame(width: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.sidebar.left.drawer")
    }

    private func directionOneInspectorColumn(width: CGFloat) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 12) {
                    directionOneRightPanelTabs
                    if let preview = liveDraftBridge.pendingStudioActionPreview {
                        pendingStudioActionPreviewCard(preview)
                    }
                    directionOneRightPanelContent
                    if !vm.infoText.isEmpty || !vm.errorText.isEmpty {
                        studioRailStatusStrip
                    }
                }
                .padding(12)
            }
            .onChange(of: beatDropTargetID) { _, _ in
                syncInspectorDropTargetScroll(proxy: proxy)
            }
            .onChange(of: actDropTargetID) { _, _ in
                syncInspectorDropTargetScroll(proxy: proxy)
            }
            .onChange(of: sceneDropTargetID) { _, _ in
                syncInspectorDropTargetScroll(proxy: proxy)
            }
            .onChange(of: sceneGroupDropTargetID) { _, _ in
                syncInspectorDropTargetScroll(proxy: proxy)
            }
            .onChange(of: isBeatListDropTargeted) { _, _ in
                updateInspectorAutoScroll(proxy: proxy)
            }
            .onChange(of: isActListDropTargeted) { _, _ in
                updateInspectorAutoScroll(proxy: proxy)
            }
            .onChange(of: draggedBeatID) { _, _ in
                updateInspectorAutoScroll(proxy: proxy)
            }
            .onChange(of: draggedActID) { _, _ in
                updateInspectorAutoScroll(proxy: proxy)
            }
            .onChange(of: draggedSceneID) { _, _ in
                updateInspectorAutoScroll(proxy: proxy)
            }
            .onChange(of: vm.pendingScreenplayQuestion?.id) { _, pendingID in
                guard pendingID != nil else { return }
                withAnimation(.easeOut(duration: 0.20)) {
                    proxy.scrollTo("studio.pending-question.anchor", anchor: .top)
                }
            }
            .onChange(of: isDirectionOneComposerExpanded) { _, isExpanded in
                guard isExpanded else { return }
                Task { @MainActor in
                    await Task.yield()
                    withAnimation(.easeOut(duration: 0.20)) {
                        proxy.scrollTo("studio.composer.anchor", anchor: .top)
                    }
                }
            }
            .onChange(of: studioPromptFocused) { _, isFocused in
                guard isFocused else { return }
                Task { @MainActor in
                    await Task.yield()
                    withAnimation(.easeOut(duration: 0.20)) {
                        proxy.scrollTo("studio.prompt.anchor", anchor: .center)
                    }
                }
            }
            .onDisappear {
                inspectorAutoScrollTask?.cancel()
                inspectorAutoScrollTask = nil
            }
        }
        .frame(width: width)
        .background(directionOneColumnSurface)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(directionOneChromeStroke.opacity(0.22))
                .frame(width: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.sidebar.right.drawer")
    }

    private var directionOneComposerClusterIsActive: Bool {
        studioPromptFocused || isSubmittingStudioPrompt || isSubmittingPrompt
    }

    private var directionOneCompactComposerSection: some View {
        let shouldShowComposer = isDirectionOneComposerExpanded
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("Ask io.them")
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.74))
                Spacer(minLength: 0)
                Button(isDirectionOneComposerExpanded ? "Hide" : "⌘K") {
                    if isDirectionOneComposerExpanded {
                        collapseStudioCommandBar()
                    } else {
                        openStudioCommandBar()
                    }
                }
                .buttonStyle(.borderless)
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.68))
                .accessibilityIdentifier("studio.commandbar.toggle")
            }
            if shouldShowComposer {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Intent")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.52))
                    studioPromptIntentControl
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Destination")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.52))
                    promptRoutingControl
                }

                HStack(alignment: .center, spacing: 10) {
                    TextField(
                        studioPromptPlaceholder,
                        text: $studioPromptSeed,
                        axis: .vertical
                    )
                    .textFieldStyle(.plain)
                    .focused($studioPromptFocused)
                    .lineLimit(1...3)
                    .submitLabel(.send)
                    .onSubmit {
                        submitStudioPromptSeed()
                    }
                    .accessibilityIdentifier("studio.prompt.field")
#if os(iOS)
                    .toolbar {
                        ToolbarItemGroup(placement: .keyboard) {
                            Spacer()
                            Button("Send") {
                                submitStudioPromptSeed()
                            }
                            .accessibilityIdentifier("studio.prompt.keyboard-send")
                            .disabled(
                                isSubmittingStudioPrompt ||
                                isSubmittingPrompt ||
                                studioPromptSeed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            )
                        }
                    }
#endif

                    Button(isSubmittingStudioPrompt || isSubmittingPrompt ? "Sending…" : "Send") {
                        submitStudioPromptSeed()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .accessibilityIdentifier("studio.prompt.send")
                    .disabled(
                        isSubmittingStudioPrompt ||
                        isSubmittingPrompt ||
                        studioPromptSeed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
                .id("studio.prompt.anchor")
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(
                            directionOneComposerClusterIsActive
                            ? Color.herShellPanel.opacity(0.98)
                            : Color.herShellPanel.opacity(0.90)
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(
                            directionOneComposerClusterIsActive
                            ? Color.accentColor.opacity(0.20)
                            : Color.herShellStroke.opacity(0.16),
                            lineWidth: 1
                        )
                )
                .shadow(
                    color: directionOneComposerClusterIsActive ? Color.accentColor.opacity(0.08) : .clear,
                    radius: 10,
                    y: 3
                )
                .animation(.easeOut(duration: 0.16), value: directionOneComposerClusterIsActive)

                HStack(alignment: .center, spacing: 10) {
                    Text(studioPromptHelperText)
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.68))
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .help(studioPromptHelperText)
                    Spacer(minLength: 0)
                    Toggle(isOn: $typedReplyAudioEnabled) {
                        Text("Speak Replies")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.78))
                    }
                    .toggleStyle(.switch)
                    .controlSize(.small)
                }
            } else {
                Button {
                    openStudioCommandBar()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 12, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.58))
                        Text("Open Command Bar")
                            .font(.system(size: 12, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.82))
                        Spacer(minLength: 0)
                        Text("⌘K")
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundStyle(Color.herText.opacity(0.54))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.herShellPanel.opacity(0.84))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("studio.commandbar.open")
            }
        }
    }

private var directionOneColumnSurface: some View {
    Rectangle()
        .fill(directionOneChromePanelSoft.opacity(0.98))
}
    private var isDirectionOneRailOverlayPresented: Bool {
        showingDirectionOneSettings || isFocusedPageDiffOverlayPresented
    }

    private func dismissDirectionOneRailOverlays() {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) {
            showingDirectionOneSettings = false
            isFocusedPageDiffOverlayPresented = false
            focusedPageDiffExchangeID = nil
        }
    }

@ViewBuilder
private func directionOneHeader(usesDrawers: Bool) -> some View {
    if usesDrawers {
        directionOneCompactHeader
    } else {
        directionOneExpandedHeader
    }
}

private var directionOneExpandedHeader: some View {
    HStack(spacing: 12) {
        directionOneHeaderLeftToggle
        directionOneHeaderProjectBlock

        Spacer(minLength: 0)

        directionOneHeaderDraftShortcuts
        directionOneHeaderDraftButton
        directionOneTalkButton
        directionOneHeaderRightToggle
        directionOneHeaderSettingsButton
        directionOneHeaderDoneButton
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 9)
    .background(directionOneChromeTopBar)
    .overlay(alignment: .bottom) {
        Rectangle()
            .fill(directionOneChromeStroke.opacity(0.55))
            .frame(height: 1)
    }
}

private var directionOneCompactHeader: some View {
    HStack(spacing: 8) {
        directionOneHeaderLeftToggle
            .fixedSize()
            .layoutPriority(2)

        directionOneHeaderProjectBlock
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .clipped()

        directionOneCompactTalkButton
            .fixedSize()
            .layoutPriority(2)
        directionOneHeaderRightToggle
            .fixedSize()
            .layoutPriority(2)
        directionOneHeaderSettingsButton
            .fixedSize()
            .layoutPriority(2)
        directionOneCompactDoneButton
            .fixedSize()
            .layoutPriority(2)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 9)
    .background(directionOneChromeTopBar)
    .overlay(alignment: .bottom) {
        Rectangle()
            .fill(directionOneChromeStroke.opacity(0.55))
            .frame(height: 1)
    }
}

private var directionOneHeaderLeftToggle: some View {
    Button {
        toggleDirectionOneSidebarVisibility()
    } label: {
        Image(systemName: "sidebar.left")
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(directionOneChromeText.opacity(0.90))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isDirectionOneSidebarVisible ? directionOneChromeSelectionFill : directionOneChromePanelSoft)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(isDirectionOneSidebarVisible ? directionOneChromeSelectionStroke : directionOneChromeStroke.opacity(0.55), lineWidth: 1)
            )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(isDirectionOneSidebarVisible ? "Close project drawer" : "Open project drawer")
    .accessibilityIdentifier("studio.sidebar.left.toggle")
}

private var directionOneHeaderProjectBlock: some View {
    VStack(alignment: .leading, spacing: 2) {
        Text(directionOneProjectTitle)
            .font(.system(size: 14, weight: .semibold, design: .default))
            .foregroundStyle(directionOneChromeText.opacity(0.96))
            .lineLimit(1)
        HStack(spacing: 5) {
            Circle()
                .fill(vm.hasUnsavedDraftChanges ? Color.orange.opacity(0.88) : Color.green.opacity(0.72))
                .frame(width: 5, height: 5)
            Text(vm.isSaving ? "Saving…" : (vm.hasUnsavedDraftChanges ? "Unsaved" : "Saved"))
                .font(.system(size: 10, weight: .regular, design: .default))
                .foregroundStyle(directionOneChromeSecondaryText)
            if vm.isLoading {
                ProgressView()
                    .controlSize(.mini)
                    .tint(directionOneChromeSecondaryText)
            }
        }
    }
}

private var directionOneHeaderDraftShortcuts: some View {
    HStack(spacing: 3) {
        ForEach(DirectionOneDraftShortcut.allCases) { shortcut in
            directionOneDraftShortcutDot(shortcut)
        }
    }
    .overlay(alignment: .bottom) {
        if let hoveredDirectionOneDraftShortcut {
            Text(hoveredDirectionOneDraftShortcut.hoverLabel)
                .font(.system(size: 10, weight: .medium, design: .default))
                .foregroundStyle(Color.white.opacity(0.86))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(
                    Capsule()
                        .stroke(Color.white.opacity(0.16), lineWidth: 0.7)
                )
                .shadow(color: Color.black.opacity(0.14), radius: 8, y: 4)
                .offset(y: 20)
                .allowsHitTesting(false)
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
        }
    }
    .animation(.easeInOut(duration: 0.16), value: hoveredDirectionOneDraftShortcut)
}

private func directionOneDraftShortcutDot(_ shortcut: DirectionOneDraftShortcut) -> some View {
    let isActive = isDirectionOneDraftShortcutActive(shortcut)
    let dotSize: CGFloat = isActive ? 8.5 : 7.5
    let fillOpacity: Double = isActive ? 0.82 : 0.20
    let ringOpacity: Double = isActive ? 0.34 : 0.08
    return Button {
        openDirectionOneDraftShortcut(shortcut)
    } label: {
        ZStack {
            Circle()
                .fill(Color.white.opacity(isActive ? 0.14 : 0.05))
                .frame(width: 13.5, height: 13.5)

            Circle()
                .fill(shortcut.color.opacity(fillOpacity))
                .frame(width: dotSize, height: dotSize)
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(ringOpacity), lineWidth: isActive ? 0.9 : 0.65)
                )
        }
        .frame(width: 14, height: 14)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .animation(.easeInOut(duration: 0.14), value: isActive)
    .onHover { hovering in
        hoveredDirectionOneDraftShortcut = hovering
            ? shortcut
            : (hoveredDirectionOneDraftShortcut == shortcut ? nil : hoveredDirectionOneDraftShortcut)
    }
    .accessibilityLabel(shortcut.label)
    .accessibilityHint("Opens \(shortcut.hoverLabel.lowercased()) in the Studio inspector.")
    .accessibilityValue(isActive ? "Selected" : "Not selected")
    .accessibilityIdentifier("studio.draft-shortcut.\(shortcut.rawValue)")
    .accessibilityAddTraits(isActive ? .isSelected : [])
    .help(shortcut.hoverLabel)
}

private var directionOneHeaderDraftButton: some View {
    Button {
        toggleDraftInspector()
    } label: {
        HStack(spacing: 5) {
            Image(systemName: "doc.text")
                .font(.system(size: 11, weight: .regular))
            Text("Draft")
                .font(.system(size: 11, weight: .medium, design: .default))
        }
        .foregroundStyle(draftInspectorIsPresented ? directionOneChromeText.opacity(0.94) : directionOneChromeSecondaryText)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(draftInspectorIsPresented ? directionOneChromeSelectionFill : directionOneChromePanelSoft)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(draftInspectorIsPresented ? directionOneChromeSelectionStroke : directionOneChromeStroke.opacity(0.55), lineWidth: 1)
        )
    }
    .buttonStyle(.plain)
}

private var directionOneHeaderRightToggle: some View {
    Button {
        toggleDirectionOneRightRailVisibility()
    } label: {
        Image(systemName: "sidebar.right")
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(directionOneChromeText.opacity(0.90))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isDirectionOneRightRailExpanded ? directionOneChromeSelectionFill : directionOneChromePanelSoft)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(isDirectionOneRightRailExpanded ? directionOneChromeSelectionStroke : directionOneChromeStroke.opacity(0.55), lineWidth: 1)
            )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(isDirectionOneRightRailExpanded ? "Close Studio inspector" : "Open Studio inspector")
    .accessibilityIdentifier("studio.sidebar.right.toggle")
}

private var directionOneHeaderSettingsButton: some View {
    Button {
        showingDirectionOneSettings.toggle()
    } label: {
        Image(systemName: "gearshape")
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(directionOneChromeSecondaryText)
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(directionOneChromePanelSoft)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(directionOneChromeStroke.opacity(0.55), lineWidth: 1)
            )
    }
    .buttonStyle(.plain)
    .popover(isPresented: $showingDirectionOneSettings, arrowEdge: .top) {
        directionOneSettingsPopover
    }
}

private var directionOneHeaderDoneButton: some View {
    Button("Done") {
        onDone()
    }
    .font(.system(size: 12, weight: .semibold, design: .default))
    .foregroundStyle(directionOneChromeText.opacity(0.92))
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .background(
        RoundedRectangle(cornerRadius: 9, style: .continuous)
            .fill(directionOneChromePanelSoft)
    )
    .overlay(
        RoundedRectangle(cornerRadius: 9, style: .continuous)
            .stroke(directionOneChromeStroke.opacity(0.55), lineWidth: 1)
    )
    .buttonStyle(.plain)
}

private var directionOneCompactTalkButton: some View {
    Button {
        if talkIsActive {
            onStopTalk()
        } else if canTalk {
            onArmTalk()
        }
    } label: {
        Image(systemName: talkIsActive ? "stop.fill" : "waveform")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(
                talkIsActive
                    ? Color.red.opacity(0.86)
                    : (canTalk ? directionOneChromeText.opacity(0.90) : directionOneChromeSecondaryText)
            )
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(talkIsActive ? Color.red.opacity(0.10) : directionOneChromePanelSoft)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(
                        talkIsActive
                            ? Color.red.opacity(0.22)
                            : directionOneChromeStroke.opacity(0.55),
                        lineWidth: 1
                    )
            )
    }
    .buttonStyle(.plain)
    .disabled(!canTalk && !talkIsActive)
    .accessibilityLabel(talkIsActive ? "Stop talking" : "Start talking")
    .accessibilityIdentifier("studio.compact.talk")
    .help(talkIsActive ? "Stop talking" : "Start talking")
}

private var directionOneCompactDoneButton: some View {
    Button {
        onDone()
    } label: {
        Image(systemName: "xmark")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(directionOneChromeText.opacity(0.90))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(directionOneChromePanelSoft)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(directionOneChromeStroke.opacity(0.55), lineWidth: 1)
            )
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Close Studio")
    .accessibilityIdentifier("studio.compact.done")
    .help("Close Studio")
}

private var directionOneTalkButton: some View {
    Button {
        if talkIsActive {
            onStopTalk()
        } else if canTalk {
            onArmTalk()
        }
    } label: {
        HStack(spacing: 6) {
            Circle()
                .fill(talkIsActive ? Color.white.opacity(0.92) : (canTalk ? Color.white.opacity(0.92) : Color.herStudioActiveFill.opacity(0.30)))
                .frame(width: 8, height: 8)
            Text(talkIsActive ? "Stop" : "Talk")
                .font(.system(size: 11, weight: .semibold, design: .default))
        }
        .foregroundStyle(
            talkIsActive
                ? Color.red.opacity(0.86)
                : (canTalk ? Color.white : Color.herText.opacity(0.42))
        )
        .padding(.horizontal, 11)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(
                    talkIsActive
                        ? Color.red.opacity(0.10)
                        : (canTalk ? Color.accentColor.opacity(0.92) : directionOneChromePanelSoft)
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(
                    talkIsActive
                        ? Color.red.opacity(0.22)
                        : (canTalk ? Color.accentColor.opacity(0.94) : directionOneChromeStroke.opacity(0.55)),
                    lineWidth: 1
                )
        )
    }
    .buttonStyle(.plain)
    .disabled(!canTalk && !talkIsActive)
}
private var directionOneScriptEditor: some View {
    GeometryReader { proxy in
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                if vm.isLoading {
                    ProgressView("Loading screenplay projects…")
                        .controlSize(.large)
                        .frame(width: proxy.size.width, height: max(proxy.size.height * 0.6, 360))
                } else {
                    directionOnePageEditor(proxy.size)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 28)
            .padding(.top, 34)
            .padding(.bottom, 28)
        }
        .background(Color.clear)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .onChange(of: liveDraftBridge.pendingEditorFocus?.id) { _, newValue in
        guard newValue != nil else { return }
        triggerDirectionOnePageFocusTransition()
    }
}
    private func directionOnePageEditor(_ size: CGSize) -> some View {
        let verticalBreathingRoom = min(max(size.height * 0.07, 52), 86)
        let pageWidth = StudioResponsiveLayout.pageWidth(editorWidth: size.width)
        let pageMinHeight = max(size.height - (verticalBreathingRoom * 1.5), 660)
        let pageMaxHeight = max(size.height - 34, 940)
        let integrityIssues = screenplayIntegrityIssues

        return VStack(spacing: 14) {
            if !integrityIssues.isEmpty {
                ScreenplayStudioPageIntegrityBanner(
                    issues: integrityIssues,
                    actions: draftIntegrityActions
                )
                    .frame(width: pageWidth)
                    .frame(maxWidth: .infinity)
            }


            screenplayPageSurface(
                minHeight: pageMinHeight,
                maxHeight: pageMaxHeight,
                isDropTargeted: draftDropIsTargeted,
                isDraftingPreviewActive: liveDraftBridge.isStreamingDraftPreviewActive,
                isCommitNoticeVisible: isPageCommitNoticeVisible
            ) {
                CursorInsertTextEditor(
                    text: $vm.fountainDraft,
                    activeScreenplayElement: $liveDraftBridge.activeScreenplayElement,
                    insertionRequest: $liveDraftBridge.pendingInsertion,
                    lineJumpRequest: $liveDraftBridge.pendingLineJump,
                    lineHighlightRequest: $liveDraftBridge.pendingLineHighlight,
                    anchoredTextRectRequest: $liveDraftBridge.pendingAnchoredTextRectRequest,
                    anchoredTextRectSnapshot: $liveDraftBridge.anchoredTextRectSnapshot,
                    editorFocusRequest: $liveDraftBridge.pendingEditorFocus,
                    editorActionRequest: $liveDraftBridge.pendingEditorAction,
                    editorSelection: $liveDraftBridge.editorSelection,
                    currentCursorLine: $liveDraftBridge.currentCursorLine,
                    lastCommittedWrite: $liveDraftBridge.lastCommittedWrite,
                    pendingReplacementTarget: $liveDraftBridge.pendingReplacementTarget,
                    submittedReplacementTarget: $liveDraftBridge.submittedReplacementTarget,
                    onUserEdit: vm.noteManualDraftEdit
                )
                .overlay(alignment: .topLeading) {
                    focusedPageDiffAnchoredOverlay
                }
                .overlay(alignment: .topTrailing) {
                    if perceivedSpeedState.isActive && perceivedSpeedState.target == .page {
                        studioPerceivedPageSkeleton
                            .padding(.top, 18)
                            .padding(.trailing, 18)
                    }
                }
            }
            .frame(width: pageWidth)
            .frame(maxWidth: .infinity)
            .padding(.vertical, verticalBreathingRoom)
            .overlay(alignment: .bottomTrailing) {
                if isLastCommittedWriteActionVisible {
                    lastCommittedWriteInlineActions
                        .padding(.trailing, max((size.width - pageWidth) * 0.5 + 26, 26))
                        .padding(.bottom, verticalBreathingRoom + 18)
                }
            }
            .onDrop(of: [UTType.fileURL], isTargeted: $draftDropIsTargeted) { providers in
                handleDraftDrop(providers: providers)
            }
            if !liveDraftBridge.nextBeats.isEmpty {
                ScreenplayNextBeatPillsView(
                    beats: liveDraftBridge.nextBeats,
                    isBusy: isSubmittingStudioPrompt,
                    onPick: { beat in
                        // Same path as a typed prompt, routed to the page lane. The pills
                        // clear immediately so a double tap cannot submit twice; they come
                        // back only if the submit fails before reaching the backend.
                        let pending = liveDraftBridge.nextBeats
                        liveDraftBridge.nextBeats = []
                        submitStudioPromptText(
                            ScreenplayNextBeatPills.prompt(for: beat),
                            displayText: ScreenplayNextBeatPills.label(for: beat),
                            source: .typed,
                            routingMode: .page,
                            successMessage: "Writing the next beat to the page.",
                            clearSeedOnSuccess: false,
                            sendingSuggestionID: nil,
                            completion: { error in
                                if let error, !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                    liveDraftBridge.nextBeats = pending
                                }
                            }
                        )
                    },
                    onDismiss: {
                        liveDraftBridge.nextBeats = []
                    }
                )
                .padding(.horizontal, max((size.width - pageWidth) * 0.5, 16))
                .padding(.top, 8)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
                .animation(.easeInOut(duration: 0.18), value: liveDraftBridge.nextBeats)
            }
        }
    }


    private var studioPerceivedPageSkeleton: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                ProgressView()
                    .controlSize(.small)
                Text(perceivedSpeedState.statusText)
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.72))
            }

            ForEach(perceivedSpeedState.skeletonLines, id: \.self) { line in
                Text(line)
                    .font(.system(size: line == line.uppercased() ? 9 : 10, weight: line == line.uppercased() ? .semibold : .regular, design: .monospaced))
                    .foregroundStyle(Color.herText.opacity(line == line.uppercased() ? 0.54 : 0.42))
                    .lineLimit(1)
            }
        }
        .padding(12)
        .frame(width: 238, alignment: .leading)
        .background(Color.white.opacity(0.72))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.herText.opacity(0.10), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 8)
    }






    private func studioCompanionMetaPill(_ label: String, value: String) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .medium, design: .default))
                .foregroundStyle(Color.herText.opacity(0.40))
            Text(value)
                .font(.system(size: 9, weight: .regular, design: .monospaced))
                .foregroundStyle(Color.herText.opacity(0.54))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(Color.white.opacity(0.06))
        .clipShape(Capsule())
    }

    private func studioOutputValue(for target: StudioTarget) -> String {
        switch target {
        case .page:
            return "Page"
        case .voicePin:
            return "Pin"
        }
    }

    @ViewBuilder
    private func studioRouteMetaStrip(
        memory: StudioMemoryDomain,
        output: StudioTarget,
        mode: StudioCompanionMode? = nil
    ) -> some View {
        HStack(spacing: 8) {
            studioCompanionMetaPill("Memory", value: memory.title)
            studioCompanionMetaPill("Output", value: studioOutputValue(for: output))
            if let mode, memory != .project {
                studioCompanionMetaPill("Mode", value: mode.shortTitle)
            }
        }
    }

    private func studioRouteMetaStrip(for exchange: StudioAskNoteExchange) -> some View {
        studioRouteMetaStrip(
            memory: resolvedMemoryDomain(for: exchange),
            output: exchange.target,
            mode: resolvedCompanionMode(for: exchange)
        )
    }

    private func studioActionPreviewTransactionID(_ preview: ScreenplayStudioActionPreview) -> String {
        "TXN \(String(preview.id.uuidString.prefix(8)).uppercased())"
    }

    private func studioActionPreviewDiffRows(for preview: ScreenplayStudioActionPreview) -> [StudioActionPreviewDiffRow] {
        let before = preview.beforeLines
        let after = preview.afterLines
        let count = max(before.count, after.count)
        guard count > 0 else { return [] }

        return (0..<count).map { index in
            let beforeText = index < before.count ? before[index] : ""
            let afterText = index < after.count ? after[index] : ""
            let beforeExists = index < before.count
            let afterExists = index < after.count
            let kind: StudioActionPreviewDiffKind
            if beforeExists && afterExists {
                kind = beforeText == afterText ? .unchanged : .changed
            } else if beforeExists {
                kind = .removed
            } else {
                kind = .added
            }
            return StudioActionPreviewDiffRow(
                kind: kind,
                beforeLineNumber: beforeExists ? index + 1 : nil,
                afterLineNumber: afterExists ? index + 1 : nil,
                beforeText: beforeText,
                afterText: afterText
            )
        }
    }

    private func studioActionPreviewIsDestructive(_ preview: ScreenplayStudioActionPreview) -> Bool {
        switch preview.actionRequest.action {
        case .moveCurrentSceneAfterScene, .moveSelectionAfterScene:
            return false
        default:
            return true
        }
    }

    private func studioActionPreviewDiffSummary(
        for preview: ScreenplayStudioActionPreview,
        diffRows: [StudioActionPreviewDiffRow]
    ) -> StudioActionPreviewDiffSummary {
        StudioActionPreviewDiffSummary(
            unchangedCount: diffRows.filter { $0.kind == .unchanged }.count,
            addedCount: diffRows.filter { $0.kind == .added }.count,
            removedCount: diffRows.filter { $0.kind == .removed }.count,
            changedCount: diffRows.filter { $0.kind == .changed }.count,
            isDestructive: studioActionPreviewIsDestructive(preview)
        )
    }

    private func studioActionPreviewChangeSummaryText(_ summary: StudioActionPreviewDiffSummary) -> String {
        var parts: [String] = []
        if summary.changedCount > 0 {
            parts.append("\(summary.changedCount) changed")
        }
        if summary.addedCount > 0 {
            parts.append("\(summary.addedCount) added")
        }
        if summary.removedCount > 0 {
            parts.append("\(summary.removedCount) removed")
        }
        if parts.isEmpty, summary.unchangedCount > 0 {
            parts.append("\(summary.unchangedCount) unchanged")
        }
        return parts.isEmpty ? "No line changes" : parts.joined(separator: " · ")
    }

    private func studioActionPreviewRiskTint(_ summary: StudioActionPreviewDiffSummary) -> Color {
        summary.isDestructive
            ? Color.orange.opacity(0.90)
            : Color.green.opacity(0.92)
    }

    private func pendingStudioActionPreviewCard(_ preview: ScreenplayStudioActionPreview) -> some View {
        let diffRows = studioActionPreviewDiffRows(for: preview)
        let diffSummary = studioActionPreviewDiffSummary(for: preview, diffRows: diffRows)

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(preview.title)
                        .font(.system(size: 12, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.90))
                    Text(studioActionPreviewTransactionID(preview))
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.herText.opacity(0.46))
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 6) {
                    HStack(spacing: 6) {
                        Text(diffSummary.isDestructive ? "DESTRUCTIVE" : "SAFE")
                            .font(.system(size: 9, weight: .semibold, design: .default))
                            .foregroundStyle(studioActionPreviewRiskTint(diffSummary))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(studioActionPreviewRiskTint(diffSummary).opacity(0.12))
                            .clipShape(Capsule())

                        Text("Needs confirmation")
                            .font(.system(size: 9, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herStudioActiveFill.opacity(0.82))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.herStudioActiveFill.opacity(0.12))
                            .clipShape(Capsule())
                    }

                    Text(studioActionPreviewChangeSummaryText(diffSummary))
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.herText.opacity(0.46))
                }
            }

            if !diffRows.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(
                        diffSummary.impactedCount > 0
                            ? "Transaction Diff · \(diffSummary.impactedCount) impacted line\(diffSummary.impactedCount == 1 ? "" : "s")"
                            : "Transaction Diff"
                    )
                        .font(.system(size: 10, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.44))
                        .textCase(.uppercase)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(diffRows) { row in
                            studioActionPreviewDiffRowView(row)
                        }
                    }
                }
            }

            if let warning = preview.warning, !warning.isEmpty {
                Text(warning)
                    .font(.system(size: 10, weight: .medium, design: .default))
                    .foregroundStyle(Color(red: 0.88, green: 0.50, blue: 0.42))
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                Button("Confirm") {
                    guard let confirmed = liveDraftBridge.confirmPendingStudioActionPreview() else { return }
                    vm.infoText = "Confirmed \(confirmed.title.lowercased())."
                }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.22))

                Button("Cancel") {
                    guard let canceled = liveDraftBridge.cancelPendingStudioActionPreview() else { return }
                    vm.infoText = "Canceled \(canceled.title.lowercased())."
                }
                .buttonStyle(.bordered)
            }
            .foregroundStyle(Color.herText.opacity(0.90))
        }
        .padding(12)
        .background(Color.herShellPanelSoft.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.herStudioActiveStroke.opacity(0.24), lineWidth: 1)
        )
    }

    private var availableIntelligenceFixQueueItems: [IntelligenceFixQueueItem] {
        buildIntelligenceFixQueueItems(from: liveDraftBridge.intelligenceReport)
    }

    private func buildIntelligenceFixQueueItems(
        from report: ScreenplayIntelligenceReport
    ) -> [IntelligenceFixQueueItem] {
        var items: [IntelligenceFixQueueItem] = []
        var seenIDs: Set<String> = []

        func append(_ item: IntelligenceFixQueueItem?) {
            guard let item else { return }
            guard seenIDs.insert(item.id).inserted else { return }
            items.append(item)
        }

        for issue in report.continuityIssues {
            append(intelligenceFixQueueItem(for: issue))
        }
        for issue in report.duplicateBeatIssues {
            append(intelligenceFixQueueItem(for: issue))
        }
        for drift in report.sceneGoalDrift {
            append(intelligenceFixQueueItem(for: drift))
        }

        return items
    }

    private func intelligenceFixQueueItem(for issue: ScreenplayIntelligenceIssue) -> IntelligenceFixQueueItem? {
        if issue.id.hasPrefix("unbound-") {
            return IntelligenceFixQueueItem(
                id: issue.id,
                title: issue.title,
                detail: issue.detail,
                actionTitle: "Bind Scene",
                kind: .bindScene,
                issue: issue,
                drift: nil
            )
        }
        if issue.id.hasPrefix("character-") {
            return IntelligenceFixQueueItem(
                id: issue.id,
                title: issue.title,
                detail: issue.detail,
                actionTitle: "Attach Character",
                kind: .attachCharacter,
                issue: issue,
                drift: nil
            )
        }
        if issue.id.hasPrefix("duplicate-beat-") {
            return IntelligenceFixQueueItem(
                id: issue.id,
                title: issue.title,
                detail: issue.detail,
                actionTitle: "Merge Beats",
                kind: .mergeDuplicateBeats,
                issue: issue,
                drift: nil
            )
        }
        if issue.id.hasPrefix("beatless-") || issue.severity == .critical || issue.severity == .warning {
            return IntelligenceFixQueueItem(
                id: issue.id,
                title: issue.title,
                detail: issue.detail,
                actionTitle: "Rewrite Brief",
                kind: .rewriteBrief,
                issue: issue,
                drift: nil
            )
        }
        return nil
    }

    private func intelligenceFixQueueItem(for drift: ScreenplaySceneDriftSummary) -> IntelligenceFixQueueItem {
        IntelligenceFixQueueItem(
            id: drift.id,
            title: drift.sceneLabel,
            detail: "Goal: \(drift.objective) · Draft signal: \(drift.draftSignal)",
            actionTitle: "Re-anchor Scene",
            kind: .reanchorScene,
            issue: nil,
            drift: drift
        )
    }
    @MainActor
    private func bindUnboundSceneFromIssue(_ issue: ScreenplayIntelligenceIssue) async -> Bool {
        guard let project = vm.selectedProject else {
            vm.infoText = "Select a Studio project before binding scenes."
            return false
        }
        let draftSceneID = String(issue.id.dropFirst("unbound-".count))
        guard let binding = liveDraftBridge.projectBinding.sceneBindings.first(where: { $0.draftSceneID == draftSceneID }) else {
            vm.infoText = "I couldn't resolve that draft scene anymore."
            return false
        }
        let excerpt = draftExcerpt(startLine: binding.draftLine, endLine: binding.draftEndLine, maxCharacters: 220)
        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayScene(
                projectId: project.id,
                scene: BackendScreenplaySceneDraft(
                    slugline: binding.draftSlugline,
                    title: binding.draftShortLabel,
                    objective: "",
                    summary: excerpt
                ),
                title: project.title,
                phase: project.lastPhase
            )
            vm.adoptCanonicalOutlineState(
                result.payload.outlineRevision,
                outline: result.payload.outline,
                project: result.payload.project,
                projectId: project.id
            )
            await vm.reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
            selectedInspectorSection = .scenes
            highlightedSceneInspectorKey = normalizedSceneNavigatorKey(binding.draftSlugline)
            liveDraftBridge.jumpToLine(binding.draftLine)
            liveDraftBridge.highlightLineRange(startLine: binding.draftLine, endLine: binding.draftEndLine)
            vm.infoText = "Bound \(binding.draftShortLabel) to a new outline scene."
            return true
        } catch {
            vm.errorText = error.localizedDescription
            vm.infoText = "I couldn't bind that draft scene yet."
            return false
        }
    }

    @MainActor
    private func attachOrphanCharacterFromIssue(_ issue: ScreenplayIntelligenceIssue) async -> Bool {
        guard let project = vm.selectedProject else {
            vm.infoText = "Select a Studio project before attaching characters."
            return false
        }
        let fallbackCharacter = issue.detail
            .components(separatedBy: " appears on the page")
            .first?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rawCharacter = String(issue.id.dropFirst("character-".count))
        let character = rawCharacter.isEmpty ? fallbackCharacter : rawCharacter
        let cleanCharacter = character.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCharacter.isEmpty else {
            vm.infoText = "I couldn't resolve that character name anymore."
            return false
        }
        var characters = project.characters ?? []
        if !characters.contains(where: { $0.caseInsensitiveCompare(cleanCharacter) == .orderedSame }) {
            characters.append(cleanCharacter)
        }
        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayProject(
                projectId: project.id,
                title: project.title,
                phase: project.lastPhase ?? "scene_draft",
                tags: project.tags ?? [],
                characters: characters,
                setting: project.setting ?? "",
                tone: project.tone ?? "",
                studioThreadViewState: project.studioThreadViewState,
                studioDiffAcknowledgedKeys: project.studioDiffAcknowledged?.keys,
                studioDiffAcknowledgedEntries: project.studioDiffAcknowledged?.entries
            )
            if let nextProject = result.payload.project {
                vm.applyProjectMetadataUpdate(nextProject)
            }
            vm.refreshLiveDraftBridgeContext()
            vm.infoText = "Attached \(cleanCharacter) to the project character set."
            return true
        } catch {
            vm.errorText = error.localizedDescription
            vm.infoText = "I couldn't attach that character yet."
            return false
        }
    }

    @MainActor
    private func mergeDuplicateBeatsFromIssue(_ issue: ScreenplayIntelligenceIssue) async -> Bool {
        let normalizedKey = String(issue.id.dropFirst("duplicate-beat-".count))
        guard !normalizedKey.isEmpty else {
            vm.infoText = "I couldn't resolve that duplicate beat group."
            return false
        }
        let grouped: [String: [BackendScreenplayBeat]] = Dictionary(grouping: vm.outline.beats) {
            normalizedDuplicateBeatKey($0.label)
        }
        guard let duplicateGroup = grouped[normalizedKey], duplicateGroup.count > 1 else {
            vm.infoText = "Those duplicate beats already look merged."
            return false
        }
        let orderedGroup: [BackendScreenplayBeat] = duplicateGroup.sorted { lhs, rhs in
            let lhsOrder = lhs.order ?? Int.max
            let rhsOrder = rhs.order ?? Int.max
            if lhsOrder == rhsOrder {
                return lhs.label < rhs.label
            }
            return lhsOrder < rhsOrder
        }
        guard let survivor = orderedGroup.first else { return false }
        let mergedSummary = orderedGroup
            .compactMap { $0.summary?.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines) }
            .max(by: { $0.count < $1.count }) ?? ""
        let duplicateIDs = Set<String>(orderedGroup.dropFirst().map { $0.id })
        let updatedSurvivor = BackendScreenplayBeat(
            id: survivor.id,
            label: survivor.label,
            summary: mergedSummary.isEmpty ? survivor.summary : mergedSummary,
            sceneId: survivor.sceneId ?? orderedGroup.compactMap { $0.sceneId }.first,
            actId: survivor.actId ?? orderedGroup.compactMap { $0.actId }.first,
            order: survivor.order,
            status: survivor.status,
            createdAt: survivor.createdAt,
            updatedAt: Date().timeIntervalSince1970 * 1000
        )
        let updatedBeats = vm.outline.beats.compactMap { beat -> BackendScreenplayBeat? in
            if duplicateIDs.contains(beat.id) {
                return nil
            }
            if beat.id == survivor.id {
                return updatedSurvivor
            }
            return beat
        }
        let updatedScenes = vm.outline.scenes.enumerated().map { index, scene in
            let remappedBeatIDs = (scene.beatIds ?? []).map { duplicateIDs.contains($0) ? survivor.id : $0 }
            var seenBeatIDs: Set<String> = []
            let dedupedBeatIDs = remappedBeatIDs.filter { seenBeatIDs.insert($0).inserted }
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: dedupedBeatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: updatedScenes.count,
            beatCount: updatedBeats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: updatedScenes),
            scenes: updatedScenes,
            beats: updatedBeats
        )
        await vm.pushOutlineSnapshot()
        vm.refreshLiveDraftBridgeContext()
        directionOneRightPanelTab = .beats
        vm.infoText = "Merged duplicate beats into \(survivor.label)."
        return true
    }

    private func normalizedDuplicateBeatKey(_ text: String) -> String {
        text
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    @discardableResult
    private func reanchorDriftedScene(_ item: ScreenplaySceneDriftSummary) -> Bool {
        let draftSceneID = String(item.id.dropFirst("drift-".count))
        guard let binding = liveDraftBridge.projectBinding.sceneBindings.first(where: { $0.draftSceneID == draftSceneID }) else {
            vm.infoText = "I couldn't resolve that drifted scene anymore."
            return false
        }
        let currentText = draftExcerpt(startLine: binding.draftLine, endLine: binding.draftEndLine, maxCharacters: 1200)
        guard !currentText.isEmpty else {
            vm.infoText = "That scene doesn't have enough draft text to re-anchor yet."
            return false
        }
        liveDraftBridge.prepareNextPageWriteReplacement(
            sourceWriteID: "drift:\(binding.draftSceneID)",
            startLine: binding.draftLine,
            endLine: binding.draftEndLine,
            currentText: currentText
        )
        liveDraftBridge.jumpToLine(binding.draftLine)
        liveDraftBridge.highlightLineRange(startLine: binding.draftLine, endLine: binding.draftEndLine)
        liveDraftBridge.requestEditorFocus()
        studioPromptRoutingMode = .page
        studioPromptSeed = """
Rewrite this scene so it realigns with its bound objective.

Objective:
\(item.objective)

Current draft signal:
\(item.draftSignal)

Return revised screenplay lines only for the armed scene.
"""
        studioPromptFocused = true
        selectedInspectorSection = .scenes
        highlightedSceneInspectorKey = normalizedSceneNavigatorKey(binding.draftSlugline)
        vm.infoText = "Armed \(binding.draftShortLabel) for a focused re-anchor rewrite."
        return true
    }

    @discardableResult
    private func loadContinuityRewriteBrief(for issue: ScreenplayIntelligenceIssue) -> Bool {
        studioPromptRoutingMode = .voicePin
        studioPromptSeed = """
Create a focused screenplay rewrite brief for this issue. Give three concrete craft notes and one next move. Do not write screenplay lines yet.

Issue:
\(issue.title)

Detail:
\(issue.detail)
"""
        studioPromptFocused = true
        directionOneRightPanelTab = .them
        vm.infoText = "Loaded a continuity rewrite brief into the composer."
        return true
    }

    @discardableResult
    private func previewAllSuggestedIntelligenceFixes() -> Int {
        let available = availableIntelligenceFixQueueItems
        queuedIntelligenceFixes = available
        directionOneRightPanelTab = .them
        if available.isEmpty {
            vm.infoText = "No suggested fixes are ready right now."
        } else {
            vm.infoText = "Queued \(available.count) suggested fixes for review."
        }
        return available.count
    }

    private func captureIntelligenceFixBatchSnapshot(
        appliedFixIDs: [String]
    ) -> IntelligenceFixBatchSnapshot? {
        guard let project = vm.selectedProject else { return nil }
        return IntelligenceFixBatchSnapshot(
            id: UUID().uuidString.lowercased(),
            createdAt: Date(),
            project: project,
            outline: vm.outline,
            queuedFixesBefore: queuedIntelligenceFixes,
            appliedFixIDs: appliedFixIDs,
            studioPromptSeed: studioPromptSeed,
            studioPromptRoutingModeRaw: studioPromptRoutingMode.rawValue,
            selectedInspectorSectionRaw: selectedInspectorSection.rawValue,
            highlightedSceneInspectorKey: highlightedSceneInspectorKey
        )
    }

    @MainActor
    private func performQueuedIntelligenceFix(_ item: IntelligenceFixQueueItem) async -> Bool {
        switch item.kind {
        case .bindScene:
            guard let issue = item.issue else { return false }
            return await bindUnboundSceneFromIssue(issue)
        case .attachCharacter:
            guard let issue = item.issue else { return false }
            return await attachOrphanCharacterFromIssue(issue)
        case .mergeDuplicateBeats:
            guard let issue = item.issue else { return false }
            return await mergeDuplicateBeatsFromIssue(issue)
        case .reanchorScene:
            guard let drift = item.drift else { return false }
            return reanchorDriftedScene(drift)
        case .rewriteBrief:
            guard let issue = item.issue else { return false }
            return loadContinuityRewriteBrief(for: issue)
        }
    }

    @MainActor
    @discardableResult
    private func applyQueuedIntelligenceFix(_ item: IntelligenceFixQueueItem) async -> Bool {
        guard let snapshot = captureIntelligenceFixBatchSnapshot(appliedFixIDs: [item.id]) else {
            vm.infoText = "Select a project before applying suggested fixes."
            return false
        }
        let didApply = await performQueuedIntelligenceFix(item)
        guard didApply else { return false }
        lastAppliedIntelligenceFixBatch = snapshot
        queuedIntelligenceFixes.removeAll { $0.id == item.id }
        if queuedIntelligenceFixes.isEmpty {
            queuedIntelligenceFixes = availableIntelligenceFixQueueItems.filter { $0.id != item.id }
        }
        return true
    }

    @MainActor
    @discardableResult
    private func applyAllSafeQueuedIntelligenceFixes() async -> Int {
        let safeItems = queuedIntelligenceFixes.filter(\.isSafe)
        guard !safeItems.isEmpty else {
            vm.infoText = "No safe fixes are queued right now."
            return 0
        }
        guard let snapshot = captureIntelligenceFixBatchSnapshot(appliedFixIDs: safeItems.map(\.id)) else {
            vm.infoText = "Select a project before applying suggested fixes."
            return 0
        }

        var appliedIDs: [String] = []
        for item in safeItems {
            if await performQueuedIntelligenceFix(item) {
                appliedIDs.append(item.id)
            }
        }

        guard !appliedIDs.isEmpty else {
            vm.infoText = "None of the queued safe fixes could be applied."
            return 0
        }

        lastAppliedIntelligenceFixBatch = IntelligenceFixBatchSnapshot(
            id: snapshot.id,
            createdAt: snapshot.createdAt,
            project: snapshot.project,
            outline: snapshot.outline,
            queuedFixesBefore: snapshot.queuedFixesBefore,
            appliedFixIDs: appliedIDs,
            studioPromptSeed: snapshot.studioPromptSeed,
            studioPromptRoutingModeRaw: snapshot.studioPromptRoutingModeRaw,
            selectedInspectorSectionRaw: snapshot.selectedInspectorSectionRaw,
            highlightedSceneInspectorKey: snapshot.highlightedSceneInspectorKey
        )
        queuedIntelligenceFixes.removeAll { appliedIDs.contains($0.id) }
        vm.infoText = appliedIDs.count == 1
            ? "Applied 1 safe fix."
            : "Applied \(appliedIDs.count) safe fixes."
        return appliedIDs.count
    }

    @MainActor
    @discardableResult
    private func rollbackLastIntelligenceFixBatch() async -> Int {
        guard let snapshot = lastAppliedIntelligenceFixBatch else {
            vm.infoText = "No suggested-fix batch is available to roll back."
            return 0
        }

        do {
            let projectResult = try await BackendMemoryAPI.shared.upsertScreenplayProject(
                projectId: snapshot.project.id,
                title: snapshot.project.title,
                phase: snapshot.project.lastPhase ?? "scene_draft",
                tags: snapshot.project.tags ?? [],
                characters: snapshot.project.characters ?? [],
                setting: snapshot.project.setting ?? "",
                tone: snapshot.project.tone ?? "",
                studioThreadViewState: snapshot.project.studioThreadViewState,
                studioDiffAcknowledgedKeys: snapshot.project.studioDiffAcknowledged?.keys,
                studioDiffAcknowledgedEntries: snapshot.project.studioDiffAcknowledged?.entries
            )
            if let nextProject = projectResult.payload.project {
                vm.applyProjectMetadataUpdate(nextProject)
            } else {
                vm.applyProjectMetadataUpdate(snapshot.project)
            }
            let accepted = await vm.persistOutlineMutation(
                acts: snapshot.outline.acts,
                scenes: snapshot.outline.scenes,
                beats: snapshot.outline.beats,
                successMessage: snapshot.appliedFixIDs.count == 1
                    ? "Rolled back 1 suggested fix."
                    : "Rolled back \(snapshot.appliedFixIDs.count) suggested fixes.",
                source: "studio_intelligence_rollback"
            )
            guard accepted else {
                vm.errorText = "The project details rolled back, but the outline rollback could not be accepted safely."
                vm.infoText = "Partial rollback saved. The outline change is parked for review, and this fix batch remains available to retry."
                return 0
            }

            queuedIntelligenceFixes = snapshot.queuedFixesBefore
            studioPromptSeed = snapshot.studioPromptSeed
            studioPromptRoutingMode = PromptRoutingMode(rawValue: snapshot.studioPromptRoutingModeRaw) ?? .automatic
            selectedInspectorSection = InspectorSection(rawValue: snapshot.selectedInspectorSectionRaw) ?? .scenes
            highlightedSceneInspectorKey = snapshot.highlightedSceneInspectorKey
            directionOneRightPanelTab = .them
            vm.refreshLiveDraftBridgeContext()
            lastAppliedIntelligenceFixBatch = nil
            vm.infoText = snapshot.appliedFixIDs.count == 1
                ? "Rolled back 1 suggested fix."
                : "Rolled back \(snapshot.appliedFixIDs.count) suggested fixes."
            return snapshot.appliedFixIDs.count
        } catch {
            vm.errorText = error.localizedDescription
            vm.infoText = "I couldn't roll back that fix batch yet."
            return 0
        }
    }

    private func draftExcerpt(startLine: Int, endLine: Int, maxCharacters: Int) -> String {
        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard !lines.isEmpty else { return "" }
        let safeStart = max(0, startLine - 1)
        let safeEnd = min(lines.count, max(safeStart, endLine))
        guard safeStart < safeEnd else { return "" }
        let excerpt = lines[safeStart..<safeEnd]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String(excerpt.prefix(maxCharacters))
    }

    private func resolvedMemoryDomain(for exchange: StudioAskNoteExchange) -> StudioMemoryDomain {
        if let raw = exchange.memoryDomainRaw?.trimmingCharacters(in: .whitespacesAndNewlines),
           let domain = StudioMemoryDomain(rawValue: raw) {
            return domain
        }
        switch exchange.target {
        case .page:
            return .project
        case .voicePin:
            let combined = " \(exchange.prompt.lowercased()) \(exchange.noteBody.lowercased()) "
            if combined.contains(" screenwrit") || combined.contains(" scene ") || combined.contains(" beat ") {
                return .mixed
            }
            return .companion
        }
    }

    private func resolvedCompanionMode(for exchange: StudioAskNoteExchange) -> StudioCompanionMode? {
        if let raw = exchange.companionModeRaw?.trimmingCharacters(in: .whitespacesAndNewlines),
           let mode = StudioCompanionMode(rawValue: raw) {
            return mode
        }
        let domain = resolvedMemoryDomain(for: exchange)
        guard domain == .companion || domain == .mixed else { return nil }
        return liveDraftBridge.companionMode
    }

    private var hasCompanionThreadHistory: Bool {
        studioAskNoteHistory.contains { $0.target == .voicePin }
    }

    private func clearCompanionThreadHistory() {
        guard hasCompanionThreadHistory else {
            vm.infoText = "There is no companion thread to clear."
            return
        }

        let clearedBackendIDs = Set(
            studioAskNoteHistory
                .filter { $0.target == .voicePin }
                .map { normalizedBackendThreadID($0.backendThreadID) }
                .filter { !$0.isEmpty }
        )
        addClearedBackendVoicePinIDs(clearedBackendIDs)
        studioAskNoteHistory.removeAll { $0.target == .voicePin }
        liveDraftBridge.clearCompanionPinHistory()
        highlightedStudioExchangeID = studioAskNoteHistory.first?.id
        persistStudioAskNoteHistory(studioAskNoteHistory, for: activeStudioAskNoteHistoryKey)
        vm.infoText = "Cleared the Voice Pin thread. Screenplay pages were kept."
    }

    private func clearCreativePartnerMemory() {
        let hasMemory = liveDraftBridge.companionSignalState.hasContent ||
            !liveDraftBridge.companionRecentTurns.isEmpty
        guard hasMemory else {
            vm.infoText = "There is no companion memory to clear."
            return
        }

        Task { @MainActor in
            do {
                try await liveDraftBridge.clearCompanionMemoryAndSync()
                vm.infoText = "Cleared companion memory. Screenplay pages and project facts were kept."
            } catch {
                vm.infoText = "Could not clear companion memory. Try again when io.them is online."
            }
        }
    }

    private func useLiveIntentPrompt(
        _ rawPrompt: String,
        intentKind: CreativeIntentKind?
    ) {
        guard let plan = ScreenplayStudioLiveIntentComposerPlanner.make(
            rawPrompt: rawPrompt,
            intentKind: intentKind
        ) else {
            vm.infoText = "No live ask is available yet."
            return
        }

        openStudioCommandBar(
            prefill: plan.prompt,
            routingMode: plan.routingMode,
            intent: plan.intent
        )
        vm.infoText = plan.routingMode == .page
            ? "Loaded the live page move into the composer."
            : "Loaded the live ask into the companion composer."
    }

    private func selectCreativePartnerMode(rawValue: String) {
        guard let mode = StudioCompanionMode(rawValue: rawValue) else { return }
        liveDraftBridge.setCompanionMode(mode)
    }

    private func reuseCreativePartnerVoicePin(exchangeID: UUID) {
        guard let exchange = studioAskNoteHistory.first(where: { $0.id == exchangeID }),
              exchange.target == .voicePin else { return }
        reloadStudioAskNoteExchange(exchange)
    }

    private func sendCreativePartnerVoicePinToPage(exchangeID: UUID) {
        guard let exchange = studioAskNoteHistory.first(where: { $0.id == exchangeID }),
              exchange.target == .voicePin else { return }
        openStudioCommandBar(
            prefill: exchange.prompt,
            routingMode: .page,
            intent: .rewrite,
            focusComposer: false
        )
    }

    private var directionOneRightPanelTabs: some View {
        ScreenplayStudioRightPanelTabs(
            selection: $directionOneRightPanelTab,
            textColor: directionOneChromeText,
            secondaryTextColor: directionOneChromeSecondaryText,
            panelColor: directionOneChromePanel,
            panelSoftColor: directionOneChromePanelSoft,
            selectionStrokeColor: directionOneChromeSelectionStroke,
            strokeColor: directionOneChromeStroke
        )
    }

    @ViewBuilder
    private var directionOneRightPanelContent: some View {
        switch directionOneRightPanelTab {
        case .draft:
            draftToolsCard
        case .beats:
            directionOneBeatsPanel
        case .craft:
            directionOneCraftPanel
        case .outline:
            directionOneOutlinePanel
        case .them:
            directionOneThemPanel
        case .saved:
            directionOneSavedPanel
        }
    }

    private var directionOneBeatsPanel: some View {
        sectionCard(title: "Beats") {
            inspectorPanelLead(
                title: "Build the story turn by turn.",
                detail: "Add, link, reorder, and refine beats without leaving the screenplay page."
            )
            .accessibilityIdentifier("studio.beats.panel")

            beatsInspectorContent
        }
    }

    private var directionOneCraftPanel: some View {
        ScreenplayCraftRailView(
            projectTitle: vm.selectedProject?.title ?? "",
            versionId: vm.latestVersionID,
            selectedFrameworkID: $vm.selectedCraftFrameworkID,
            frameworks: vm.craftFrameworks,
            report: vm.craftReport,
            isLoading: vm.isCraftLoading,
            isAnalyzing: vm.isCraftAnalyzing,
            errorText: vm.craftErrorText,
            infoText: vm.craftInfoText,
            fallbackPageCount: vm.craftFallbackPageCount,
            isSavingOverride: vm.isCraftOverrideSaving,
            logline: vm.craftLogline,
            loglineDrift: vm.craftLoglineDrift,
            loglineHistory: vm.craftLoglineHistory,
            isLoglineLoading: vm.isCraftLoglineLoading,
            loglineErrorText: vm.craftLoglineErrorText,
            loglineInfoText: vm.craftLoglineInfoText,
            formatLintCards: vm.formatLintCards,
            isFormatLinting: vm.isFormatLinting,
            formatLintErrorText: vm.formatLintErrorText,
            formatLintSource: vm.formatLintSourceText,
            coverageSimulationReport: vm.coverageSimulationReport,
            isCoverageSimulating: vm.isCoverageSimulating,
            coverageSimulationErrorText: vm.coverageSimulationErrorText,
            coverageSimulationSource: vm.coverageSimulationSourceText,
            canSimulateCoverage: vm.canSimulateCraftCoverage,
            isCoverageSimulationCurrent: vm.isCoverageSimulationCurrent,
            onRefresh: {
                Task { await vm.loadCraftReport(force: true) }
            },
            onRefreshLogline: {
                Task { await vm.refreshCraftLogline(source: "Manual check") }
            },
            onRefreshFormatLint: {
                Task { await vm.refreshFormatLint(source: "Manual check") }
            },
            onSimulateCoverage: {
                Task { await vm.refreshCraftCoverage(source: "Manual check") }
            },
            onAnalyze: {
                Task { await vm.analyzeCraftReport() }
            },
            onCreateOverride: { override in
                Task { await vm.createCraftTurnOverride(override) }
            }
        )
    }

    private var directionOneOutlinePanel: some View {
        sectionCard(title: "Outline") {
            let featureSnapshot = featureWorkflowSnapshot

            inspectorPanelLead(
                title: "See the whole movie at a glance.",
                detail: "Track structural progress, choose the next move, and keep the story spine connected to the page."
            )
            .accessibilityIdentifier("studio.outline.panel")

            ScreenplayStudioOutlineInspectorLayout(
                actCount: vm.outline.acts.count,
                sceneCount: vm.outline.scenes.count,
                beatCount: vm.outline.beats.count,
                hasOutline: !vm.outline.acts.isEmpty || !vm.outline.scenes.isEmpty,
                hasFocusedScene: currentSceneInspectorSelection != nil,
                compass: {
                    featureWorkflowCompassCard(featureSnapshot)
                },
                storySpine: {
                    ScreenplayStudioOutlineStorySpine(
                        acts: vm.outline.acts,
                        scenes: vm.outline.scenes,
                        isActDragActive: draggedActID != nil,
                        isSceneDragActive: draggedSceneID != nil,
                        settledAnchorID: inspectorSettledAnchorID,
                        isSceneActive: { scene in
                            isSceneInspectorRowActive(scene)
                        },
                        actDropTargetID: $actDropTargetID,
                        sceneDropTargetID: $sceneDropTargetID,
                        sceneGroupDropTargetID: $sceneGroupDropTargetID,
                        isActEndDropTargeted: $isActListDropTargeted,
                        actions: ScreenplayStudioOutlineStorySpineActions(
                            onMoveAct: { act, direction in
                                Task { await vm.moveAct(act, direction: direction) }
                            },
                            onBeginActDrag: { act in
                                draggedActID = act.id
                            },
                            onDropActBefore: { act in
                                handleActDrop(before: act)
                            },
                            onDropActAtEnd: {
                                guard let draggedActID else { return false }
                                settleInspectorDrop(at: inspectorScrollAnchorID(forActID: draggedActID))
                                Task { await vm.moveAct(id: draggedActID, before: nil) }
                                self.draggedActID = nil
                                actDropTargetID = ""
                                return true
                            },
                            onSelectScene: { scene in
                                revealSceneInInspector(scene)
                            },
                            onMoveScene: { scene, direction in
                                Task { await vm.moveScene(scene, direction: direction) }
                            },
                            onBeginSceneDrag: { scene in
                                draggedSceneID = scene.id
                            },
                            onDropSceneBefore: { scene in
                                handleSceneDrop(before: scene)
                            },
                            onDropSceneAtEndOfAct: { act in
                                guard let draggedSceneID else { return false }
                                settleInspectorDrop(at: inspectorScrollAnchorID(forSceneID: draggedSceneID))
                                Task { await vm.moveScene(id: draggedSceneID, before: nil, targetActID: act.id) }
                                self.draggedSceneID = nil
                                sceneDropTargetID = ""
                                sceneGroupDropTargetID = ""
                                return true
                            },
                            onDropSceneAtEndOfLoose: {
                                guard let draggedSceneID else { return false }
                                settleInspectorDrop(at: inspectorScrollAnchorID(forSceneID: draggedSceneID))
                                Task { await vm.moveScene(id: draggedSceneID, before: nil, targetActID: nil) }
                                self.draggedSceneID = nil
                                sceneDropTargetID = ""
                                sceneGroupDropTargetID = ""
                                return true
                            }
                        )
                    )
                },
                focusedScene: {
                    if let selectedScene = currentSceneInspectorSelection {
                        outlineFocusedSceneCard(selectedScene)
                    }
                }
            )
        }
    }

    private var acceptedStudioPageWriteExchanges: [StudioAskNoteExchange] {
        studioAskNoteHistory.filter { exchange in
            exchange.target == .page &&
                (!exactInsertedText(for: exchange).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                 !(exchange.insertedText ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                 exchange.anchorLine != nil)
        }
    }

    private var featureWorkflowSnapshot: ScreenplayFeatureWorkflowSnapshot {
        ScreenplayFeatureWorkflowPlanner.buildSnapshot(
            project: vm.selectedProject,
            outline: vm.outline,
            structuredDraft: liveDraftBridge.structuredDraft,
            projectBinding: liveDraftBridge.projectBinding,
            featureSpine: liveDraftBridge.featureSpine,
            lastCommittedWrite: liveDraftBridge.lastCommittedWrite,
            acceptedPageBatchCount: acceptedStudioPageWriteExchanges.count,
            currentCursorLine: liveDraftBridge.currentCursorLine,
            draftText: vm.fountainDraft
        )
    }

    private var restoredStudioPromptContinuityContext: [String] {
        studioPromptContinuityContext(from: studioAskNoteHistory)
    }

    private func studioPromptContinuityContext(
        from entries: [StudioAskNoteExchange],
        limit: Int = 5
    ) -> [String] {
        var seen = Set<String>()
        var result: [String] = []

        for exchange in entries.prefix(12) {
            let prompt = compactStudioContinuitySnippet(exchange.prompt, limit: 110)
            let responseSource = [
                exactInsertedText(for: exchange),
                exchange.revisedBlockText ?? "",
                exchange.developmentText ?? "",
                exchange.noteBody,
                exchange.resolvedAnchorExcerpt ?? "",
                exchange.anchorExcerpt ?? ""
            ]
                .map { compactStudioContinuitySnippet($0, limit: 140) }
                .first(where: { !$0.isEmpty }) ?? ""

            guard !prompt.isEmpty || !responseSource.isEmpty else { continue }
            let label = exchange.target == .page ? "Prior page direction" : "Prior Clementine note"
            let scene = compactStudioContinuitySnippet(exchange.anchorSceneLabel ?? "", limit: 60)
            let core = prompt.isEmpty ? responseSource : prompt
            var line = "\(label): \(core)"
            if !scene.isEmpty {
                line += " [\(scene)]"
            }
            if !prompt.isEmpty, !responseSource.isEmpty {
                line += " -> \(responseSource)"
            }
            let key = line.lowercased()
            guard seen.insert(key).inserted else { continue }
            result.append(line)
            if result.count >= limit { break }
        }

        return result
    }

    private func compactStudioContinuitySnippet(_ value: String, limit: Int) -> String {
        let compact = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        guard !compact.isEmpty else { return "" }
        return String(compact.prefix(max(0, limit))).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func featureWorkflowCompassCard(_ snapshot: ScreenplayFeatureWorkflowSnapshot) -> some View {
        ScreenplayStudioFeatureCompassCard(
            snapshot: snapshot,
            acceptedPageBatchCount: acceptedStudioPageWriteExchanges.count,
            isWriteDisabled: isSubmittingStudioPrompt || isSubmittingPrompt,
            canPolishLastBatch: liveDraftBridge.lastCommittedWrite != nil,
            onWriteNextPages: {
                submitFeatureWorkflowPageWrite(
                    snapshot.pageWritePrompt,
                    displayText: "Continue feature: \(snapshot.nextSceneTitle)"
                )
            },
            onPlan: {
                openStudioCommandBar(
                    prefill: snapshot.planningPrompt,
                    routingMode: .voicePin,
                    intent: .advice
                )
                vm.infoText = "Loaded a next-three-turns plan for Clementine."
            },
            onDoctor: {
                openStudioCommandBar(
                    prefill: snapshot.sceneDoctorPrompt,
                    routingMode: .voicePin,
                    intent: .advice
                )
                vm.infoText = "Loaded a feature scene-doctor brief."
            },
            onReviewBatch: {
                revealFeatureWorkflowAcceptedBatch(snapshot)
            },
            onPolishLastBatch: {
                guard let committedWrite = liveDraftBridge.lastCommittedWrite else { return }
                reviseLastCommittedWrite(committedWrite, preset: .moreVisual)
            },
            onWriteMove: { move in
                submitFeatureWorkflowPageWrite(move.prompt, displayText: move.shortTitle)
            }
        )
    }

    private func submitFeatureWorkflowPageWrite(_ prompt: String, displayText: String) {
        submitStudioPromptText(
            prompt,
            displayText: displayText,
            source: .typed,
            routingMode: .page,
            successMessage: "Asked Clementine to continue the feature on the page.",
            clearSeedOnSuccess: false,
            sendingSuggestionID: nil
        )
    }

    private func revealFeatureWorkflowAcceptedBatch(_ snapshot: ScreenplayFeatureWorkflowSnapshot) {
        guard let lineRange = snapshot.acceptedBatchLineRange else {
            vm.infoText = "No accepted page batch is available yet."
            return
        }
        liveDraftBridge.jumpToLine(lineRange.lowerBound)
        liveDraftBridge.highlightLineRange(startLine: lineRange.lowerBound, endLine: lineRange.upperBound)
        expandLastCommittedWriteActions()
        vm.infoText = "Opened the latest accepted page batch."
    }

private var directionOneThemPanel: some View {
    let blockSignalNudge = BackendBlockSignalNudgeState.make(signal: vm.blockSignal)
    let blockSignalHistoryTrend = BackendBlockSignalHistoryTrendState.make(history: vm.blockSignalHistory)
    let presentation = ScreenplayStudioThemRailPresentationPlanner.make(
        signalState: liveDraftBridge.companionSignalState,
        analytics: liveDraftBridge.companionAnalytics,
        isBlockSignalLoading: vm.isBlockSignalLoading,
        blockSignalErrorText: vm.blockSignalErrorText,
        blockSignalNudge: blockSignalNudge,
        blockSignalHistory: blockSignalHistoryTrend
    )
    let characterTraitCards = BackendCharacterTraitCardState.make(response: vm.characterTraits, archetypes: vm.characterArchetypes)
    let twistCards = ScreenplayCraftTwistCardState.cards(from: vm.craftTwists, acceptedTwists: vm.acceptedCraftTwists)
    let characterMemoryPresentation = ScreenplayStudioCharacterMemoryPresentationPlanner.make(
        isLoading: vm.isCharacterTraitsLoading,
        errorText: vm.characterTraitsErrorText,
        hasResponse: vm.characterTraits != nil,
        cards: characterTraitCards
    )
    let reversalCardsPresentation = ScreenplayStudioReversalCardsPresentationPlanner.make(
        beatLabel: vm.craftTwistBeatLabel,
        acceptedErrorText: vm.acceptedCraftTwistErrorText,
        acceptedCount: vm.acceptedCraftTwists.count,
        isLoading: vm.isCraftTwistLoading,
        errorText: vm.craftTwistErrorText,
        hasResponse: vm.craftTwists != nil,
        cards: twistCards,
        isMutating: vm.isAcceptedCraftTwistMutating,
        hasSelectedProject: vm.selectedProject != nil
    )
    let hasCompanionMemory = liveDraftBridge.companionSignalState.hasContent ||
        !liveDraftBridge.companionRecentTurns.isEmpty
    let creativePartnerPresentation = ScreenplayStudioCreativePartnerPresentationPlanner.make(
        modes: StudioCompanionMode.allCases.map { mode in
            ScreenplayStudioCreativePartnerModeInput(
                rawValue: mode.rawValue,
                title: mode.title,
                shortTitle: mode.shortTitle,
                summary: mode.summary
            )
        },
        selectedModeRawValue: liveDraftBridge.companionMode.rawValue,
        routesToPage: currentStudioPromptTarget == .page,
        recentTurnCount: liveDraftBridge.companionRecentTurns.count,
        queuedFixCount: queuedIntelligenceFixes.count,
        hasCompanionThread: hasCompanionThreadHistory,
        hasCompanionMemory: hasCompanionMemory,
        voicePinTurns: voicePinTurns.map { turn in
            ScreenplayStudioCreativePartnerVoicePinTurnInput(
                id: turn.id,
                exchangeID: turn.exchangeID,
                userAskLabel: turn.userAskLabel,
                fountainOutput: turn.fountainOutput,
                timestamp: turn.timestamp
            )
        },
        exchanges: studioAskNoteHistory.map { exchange in
            ScreenplayStudioCreativePartnerVoicePinExchangeInput(
                id: exchange.id,
                prompt: exchange.prompt,
                source: exchange.source == .voice ? .voice : .typed,
                developmentText: exchange.developmentText
            )
        },
        now: Date()
    )

    return ScreenplayStudioThemRailView(
        presentation: presentation,
        actions: ScreenplayStudioThemRailActions(
            onRefreshMomentum: {
                Task { await vm.refreshBlockSignal(source: "Manual check") }
            },
            onUseLiveIntentPrompt: { prompt, intentKind in
                useLiveIntentPrompt(prompt, intentKind: intentKind)
            }
        )
    ) {
        if liveDraftBridge.latestAppliedMemory.hasContent {
            studioAppliedMemoryBanner
        }

        pendingScreenplayQuestionPrompt
        directionOneCompactComposerSection
            .id("studio.composer.anchor")

        // Keep the current creative exchange and its Reuse/To Page actions
        // adjacent to the composer on compact iPhone rails. Passive memory and
        // craft collections can grow much taller and must not bury this live
        // routing control below the reachable scroll range.
        ScreenplayStudioCreativePartnerView(
            presentation: creativePartnerPresentation,
            actions: ScreenplayStudioCreativePartnerActions(
                onSelectMode: selectCreativePartnerMode,
                onReuseVoicePin: reuseCreativePartnerVoicePin,
                onSendVoicePinToPage: sendCreativePartnerVoicePinToPage,
                onClearThread: clearCompanionThreadHistory,
                onClearMemory: clearCreativePartnerMemory
            )
        )

        directionOneCreativeInstinctsCard

        ScreenplayStudioCharacterMemoryView(
            presentation: characterMemoryPresentation,
            actions: ScreenplayStudioCharacterMemoryActions(
                onRefresh: {
                    Task { await vm.refreshCharacterTraits(source: "Manual check") }
                }
            )
        )
    } trailingContent: {
        ScreenplayStudioReversalCardsView(
            presentation: reversalCardsPresentation,
            actions: ScreenplayStudioReversalCardsActions(
                onRefresh: {
                    Task {
                        await vm.refreshCraftTwists(source: "Manual check")
                        await vm.refreshAcceptedCraftTwists(source: "Manual check")
                    }
                },
                onKeep: { card in
                    Task { await vm.acceptCraftTwist(card) }
                },
                onDismiss: { card in
                    if card.isAccepted {
                        Task { await vm.dismissAcceptedCraftTwist(card) }
                    } else {
                        vm.dismissCraftTwistSuggestion(card)
                    }
                }
            )
        )
    }
    .task {
        if !IOThemRuntime.isRunningUITests {
            await vm.refreshCharacterTraits(source: "io.them rail")
        }
    }
}

private var directionOneCreativeInstinctsCard: some View {
    intelligenceCollectionCard(title: "Creative Instincts", icon: "brain.head.profile") {
        StudioCreativeInstinctsView(
            projectTitle: vm.selectedProject?.title ?? "",
            hasSelectedProject: vm.selectedProject != nil,
            preferences: creativeInstincts.preferences,
            isLoading: creativeInstincts.isLoading,
            updatingFamily: creativeInstincts.updatingFamily,
            errorText: creativeInstincts.errorText,
            onRefresh: {
                Task {
                    await refreshStudioCreativeInstincts(force: true)
                }
            },
            onUpdate: { preference, action in
                Task {
                    await creativeInstincts.update(preference, action: action)
                    await vm.refreshBlockSignal(source: "Creative Instinct correction")
                    await vm.refreshCraftTwists(source: "Creative Instinct correction")
                }
            },
            onResetAll: {
                Task {
                    await creativeInstincts.resetAll()
                    await vm.refreshBlockSignal(source: "Creative Instinct reset")
                    await vm.refreshCraftTwists(source: "Creative Instinct reset")
                }
            }
        )
    }
}

private func refreshStudioCreativeInstincts(
    force: Bool,
    reportErrors: Bool = true
) async {
    await creativeInstincts.load(
        projectID: vm.selectedProjectID,
        projectTitle: vm.selectedProject?.title ?? "",
        force: force,
        reportErrors: reportErrors
    )
}

    private var directionOneSavedPanel: some View {
        sectionCard(title: "Saved") {
            ScreenplayStudioSavedPanel(
                presentation: savedPanelPresentation,
                actions: savedPanelActions
            )
        }
    }

    private var savedPanelPresentation: ScreenplayStudioSavedPanelPresentation {
        ScreenplayStudioSavedPanelPresentation(
            isSaving: vm.isSaving,
            hasDraft: !vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            autosaveStatusText: vm.autosaveStatusText,
            latestVersionID: vm.latestVersionID,
            backgroundSyncNoticeText: studioBackgroundSyncNoticeText,
            hasSelectedProject: vm.selectedProject != nil,
            snapshotVersions: draftSnapshotPresentations
        )
    }

    private var savedPanelActions: ScreenplayStudioSavedPanelActions {
        ScreenplayStudioSavedPanelActions(
            onSave: {
                triggerStudioManualSave(revealSavedTab: false)
            },
            onRetryBackgroundSync: {
                retryStudioBackgroundPersistence()
            },
            onRestore: { version in
                vm.loadSnapshot(version)
            }
        )
    }


    private func triggerDirectionOnePageFocusTransition() {
        directionOnePageFocusTransitionTask?.cancel()
        directionOnePageFocusTransitionTask = Task { @MainActor in
            withAnimation(.easeOut(duration: 0.16)) {
                isDirectionOnePageFocusTransitionVisible = true
            }
            try? await Task.sleep(nanoseconds: 240_000_000)
            withAnimation(.easeOut(duration: 0.24)) {
                isDirectionOnePageFocusTransitionVisible = false
            }
        }
    }

    private var directionOneTransientStatusIsVisible: Bool {
        talkIsActive ||
        vm.isSaving ||
        liveDraftBridge.isStreamingDraftPreviewActive ||
        voiceFeedbackOpacity > 0.01 ||
        !vm.errorText.isEmpty ||
        !vm.infoText.isEmpty
    }

    private var directionOneTransientStatusBar: some View {
        HStack(spacing: 10) {
            if talkIsActive {
                Label(talkStatusText, systemImage: "waveform")
                    .font(.system(size: 11, weight: .medium, design: .default))
                    .foregroundStyle(directionOneChromeText.opacity(0.82))
            }

            if liveDraftBridge.isStreamingDraftPreviewActive {
                screenplayPageStatusChip(
                    title: "Drafting",
                    systemImage: "pencil.and.outline",
                    tint: Color.green.opacity(0.82),
                    fill: Color.green.opacity(0.08),
                    stroke: Color.green.opacity(0.18)
                )
            }

            if vm.isSaving {
                screenplayPageStatusChip(
                    title: "Saving",
                    systemImage: "arrow.triangle.2.circlepath",
                    tint: Color.accentColor.opacity(0.82),
                    fill: Color.accentColor.opacity(0.08),
                    stroke: Color.accentColor.opacity(0.18)
                )
            }

            if !vm.errorText.isEmpty {
                Text(vm.errorText)
                    .font(.system(size: 11, weight: .medium, design: .default))
                    .foregroundStyle(Color.red.opacity(0.82))
                    .lineLimit(1)
            } else if voiceFeedbackOpacity > 0.01 && !lastVoiceFeedback.isEmpty {
                Text(lastVoiceFeedback)
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(directionOneChromeSecondaryText)
                    .lineLimit(1)
                    .opacity(voiceFeedbackOpacity)
            } else if !vm.infoText.isEmpty {
                Text(vm.infoText)
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(directionOneChromeSecondaryText)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(directionOneChromeTopBar.opacity(0.72))
        )
        .overlay(alignment: .top) {
            Rectangle()
                .fill(directionOneChromeStroke.opacity(0.24))
                .frame(height: 1)
        }
    }

    private var directionOneSettingsPopover: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Studio Settings")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.92))

            Toggle("Auto-insert voice turns", isOn: $liveDraftBridge.autoInsertEnabled)
                .font(.system(size: 12, weight: .regular, design: .default))
                .toggleStyle(.switch)

            Toggle("Autosave draft", isOn: $vm.autosaveEnabled)
                .font(.system(size: 12, weight: .regular, design: .default))
                .toggleStyle(.switch)

            Divider()

            if vm.recoveryCandidate != nil {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Local draft recovery available")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(Color.orange.opacity(0.90))
                    HStack(spacing: 8) {
                        Button("Recover") {
                            vm.restoreDraftFromRecovery()
                        }
                        .buttonStyle(.borderedProminent)
                        Button("Discard") {
                            vm.discardLocalRecoveryCopy()
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(10)
                .background(Color.orange.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            if vm.conflictState != nil {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Save conflict — server changed this draft")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(Color.red.opacity(0.90))
                    HStack(spacing: 8) {
                        Button("Load Server") {
                            vm.applyServerVersionFromConflict()
                        }
                        .buttonStyle(.bordered)
                        Button("Keep Mine") {
                            Task { await vm.keepLocalDraftAfterConflict() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding(10)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Divider()

            Button("Reload Project") {
                if let id = vm.selectedProject?.id {
                    Task { await vm.selectProject(id) }
                }
                showingDirectionOneSettings = false
            }
            .font(.system(size: 12, weight: .regular, design: .default))

            Button("Clear Draft") {
                vm.clearDraft()
                liveDraftBridge.clearDraft()
                showingDirectionOneSettings = false
            }
            .font(.system(size: 12, weight: .regular, design: .default))
            .foregroundStyle(Color.red.opacity(0.76))
            .disabled(vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(16)
        .frame(width: 280)
    }

    private var directionOneProjectTitle: String {
        let explicit = vm.selectedProject?.title.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !explicit.isEmpty { return explicit }
        if !vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Live Draft"
        }
        return "Screenplay Studio"
    }

    private var directionOneChromeTopBar: Color {
        Color(.sRGB, red: 0.93, green: 0.925, blue: 0.918, opacity: 0.88)
    }

    private var directionOneChromePanel: Color {
        Color(.sRGB, red: 0.935, green: 0.934, blue: 0.936, opacity: 0.86)
    }

    private var directionOneChromePanelSoft: Color {
        Color(.sRGB, red: 0.955, green: 0.953, blue: 0.950, opacity: 0.90)
    }

    private var directionOneChromeStroke: Color {
        Color.black.opacity(0.09)
    }

    private var directionOneChromeText: Color {
        Color.black.opacity(0.74)
    }

    private var directionOneChromeSecondaryText: Color {
        Color.black.opacity(0.52)
    }

    private var directionOneChromeTertiaryText: Color {
        Color.black.opacity(0.34)
    }

    private var directionOneChromeSelectionFill: Color {
        Color.accentColor.opacity(0.11)
    }

    private var directionOneChromeSelectionStroke: Color {
        Color.accentColor.opacity(0.24)
    }

private var sidebarModeTabs: some View {
    ScreenplayStudioSidebarModeTabs(
        selection: $selectedSidebarSection,
        secondaryTextColor: directionOneChromeSecondaryText
    )
}
    private var directionOneSortedProjects: [BackendScreenplayProjectSummary] {
        vm.projects.sorted { lhs, rhs in
            let lhsStamp = directionOneProjectRecency(lhs)
            let rhsStamp = directionOneProjectRecency(rhs)
            if lhsStamp == rhsStamp {
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
            return lhsStamp > rhsStamp
        }
    }


    private func directionOneProjectRecency(_ project: BackendScreenplayProjectSummary) -> TimeInterval {
        project.updatedAt ?? project.lastVersionAt ?? project.createdAt ?? 0
    }


private var projectsSidebarContent: some View {
    ScreenplayStudioProjectsSidebar(
        projects: directionOneSortedProjects,
        selectedProjectID: vm.selectedProjectID,
        hasSelectedProject: vm.selectedProject != nil,
        newProjectTitle: $vm.newProjectTitle,
        isSaving: vm.isSaving,
        isLoading: vm.isLoading,
        errorText: vm.errorText,
        textColor: directionOneChromeText,
        secondaryTextColor: directionOneChromeSecondaryText,
        tertiaryTextColor: directionOneChromeTertiaryText,
        selectionFill: directionOneChromeSelectionFill,
        onCreate: {
            Task { await vm.createProject() }
        },
        onSelect: { projectID in
            Task { await vm.selectProject(projectID) }
        },
        featureSpine: {
            featureSpineSidebarEditor
        }
    )
}

    private var featureSpineSidebarEditor: some View {
        let pendingAction = pendingFeaturePlannerActionForSelectedProject()
        return ScreenplayStudioFeatureSpineEditor(
            logline: $vm.featureLogline,
            themeArgument: $vm.featureThemeArgument,
            centralQuestion: $vm.featureCentralQuestion,
            protagonistWant: $vm.featureProtagonistWant,
            protagonistNeed: $vm.featureProtagonistNeed,
            antagonisticForce: $vm.featureAntagonisticForce,
            actPosition: $vm.featureActPosition,
            endingImage: $vm.featureEndingImage,
            unresolvedSetupsText: $vm.featureUnresolvedSetupsText,
            guide: vm.featureProgressionGuide,
            pendingAction: pendingAction,
            pendingActionTimestampText: pendingAction.map { relativeTimestamp($0.submittedDate) } ?? "",
            hasSelectedProject: vm.selectedProject != nil,
            isSaving: vm.isSaving,
            isSubmitting: isSubmittingStudioPrompt || isSubmittingPrompt,
            textColor: directionOneChromeText,
            secondaryTextColor: directionOneChromeSecondaryText,
            tertiaryTextColor: directionOneChromeTertiaryText,
            onSave: {
                Task { await vm.saveFeatureSpineMetadata() }
            },
            onCommand: { command, guide in
                submitFeatureProgressionCommand(command, guide: guide)
            },
            onRetry: retryFeaturePlannerAction,
            onClear: clearFeaturePlannerActionSnapshot
        )
    }

    private func featureActionContext() -> ScreenplayFeatureActionContext {
        ScreenplayFeatureActionContext(
            logline: vm.featureLogline,
            themeArgument: vm.featureThemeArgument,
            centralQuestion: vm.featureCentralQuestion,
            protagonistWant: vm.featureProtagonistWant,
            protagonistNeed: vm.featureProtagonistNeed,
            antagonisticForce: vm.featureAntagonisticForce,
            endingImage: vm.featureEndingImage,
            unresolvedSetups: vm.featureUnresolvedSetups
        )
    }

    private func submitFeatureProgressionCommand(
        _ command: ScreenplayFeatureActionCommand,
        guide: ScreenplayFeatureProgressionGuide
    ) {
        let projectId = selectedFeaturePlannerProjectID()
        guard !projectId.isEmpty else {
            vm.errorText = "Select a project first."
            return
        }
        let prompt = ScreenplayFeatureActionPromptBuilder.prompt(
            for: command,
            guide: guide,
            context: featureActionContext()
        )
        let requestID = "feature-planner-\(UUID().uuidString.lowercased())"
        let snapshot = ScreenplayFeaturePlannerActionSnapshot(
            id: requestID,
            projectId: projectId,
            projectTitle: selectedFeaturePlannerProjectTitle(),
            commandRawValue: command.rawValue,
            displayText: command.displayText,
            prompt: prompt,
            currentAct: guide.currentAct,
            sequenceLabel: guide.sequenceLabel,
            pageRangeText: guide.pageRangeText,
            requestID: requestID,
            submittedAt: Date().timeIntervalSince1970,
            routingModeRawValue: command.routingModeRawValue
        )
        persistFeaturePlannerActionSnapshot(snapshot)
        submitStudioPromptText(
            prompt,
            displayText: command.displayText,
            source: .typed,
            routingMode: featurePlannerRoutingMode(for: command),
            successMessage: command.successMessage,
            clearSeedOnSuccess: false,
            sendingSuggestionID: nil,
            requestIDOverride: requestID,
            completion: { error in
                handleFeaturePlannerActionCompletion(snapshot, error: error)
            }
        )
    }

    private func selectedFeaturePlannerProjectID() -> String {
        let selectedProjectID = (vm.selectedProject?.id ?? vm.selectedProjectID)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return selectedProjectID
    }

    private func selectedFeaturePlannerProjectTitle() -> String {
        let title = vm.selectedProject?.title.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? "Untitled screenplay" : title
    }

    private func featurePlannerRoutingMode(for command: ScreenplayFeatureActionCommand) -> PromptRoutingMode {
        PromptRoutingMode(rawValue: command.routingModeRawValue) ?? .page
    }

    private func featurePlannerRoutingMode(for snapshot: ScreenplayFeaturePlannerActionSnapshot) -> PromptRoutingMode {
        PromptRoutingMode(rawValue: snapshot.resolvedRoutingModeRawValue) ?? .page
    }

    private func pendingFeaturePlannerActionForSelectedProject() -> ScreenplayFeaturePlannerActionSnapshot? {
        ScreenplayFeaturePlannerActionRecoveryStore.pendingSnapshot(
            projectId: selectedFeaturePlannerProjectID(),
            in: featurePlannerPendingActionStorage
        )
    }

    private func persistFeaturePlannerActionSnapshot(_ snapshot: ScreenplayFeaturePlannerActionSnapshot) {
        featurePlannerPendingActionStorage = ScreenplayFeaturePlannerActionRecoveryStore.save(
            snapshot,
            in: featurePlannerPendingActionStorage
        )
    }

    private func clearFeaturePlannerActionSnapshot(_ snapshot: ScreenplayFeaturePlannerActionSnapshot) {
        featurePlannerPendingActionStorage = ScreenplayFeaturePlannerActionRecoveryStore.clear(
            id: snapshot.id,
            in: featurePlannerPendingActionStorage
        )
        vm.infoText = "Cleared the saved feature planner action."
    }

    private func handleFeaturePlannerActionCompletion(
        _ snapshot: ScreenplayFeaturePlannerActionSnapshot,
        error: String?
    ) {
        let cleanError = (error ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanError.isEmpty {
            featurePlannerPendingActionStorage = ScreenplayFeaturePlannerActionRecoveryStore.clear(
                id: snapshot.id,
                in: featurePlannerPendingActionStorage
            )
        } else {
            persistFeaturePlannerActionSnapshot(snapshot)
            vm.infoText = "\(cleanError) Saved this feature planner action so you can retry it."
        }
    }

    private func retryFeaturePlannerAction(_ snapshot: ScreenplayFeaturePlannerActionSnapshot) {
        let projectId = selectedFeaturePlannerProjectID()
        guard ScreenplayProjectScopedState.matches(snapshot.projectId, selectedProjectId: projectId) else {
            featurePlannerPendingActionStorage = ScreenplayFeaturePlannerActionRecoveryStore.clear(
                id: snapshot.id,
                in: featurePlannerPendingActionStorage
            )
            vm.infoText = "That saved feature planner action belonged to a different project."
            return
        }
        let requestID = "feature-planner-\(UUID().uuidString.lowercased())"
        let retrySnapshot = snapshot.retrySnapshot(requestID: requestID)
        persistFeaturePlannerActionSnapshot(retrySnapshot)
        submitStudioPromptText(
            retrySnapshot.prompt,
            displayText: retrySnapshot.displayText,
            source: .typed,
            routingMode: featurePlannerRoutingMode(for: retrySnapshot),
            successMessage: retrySnapshot.command?.successMessage ?? "Asked io.them to continue the feature plan.",
            clearSeedOnSuccess: false,
            sendingSuggestionID: nil,
            requestIDOverride: requestID,
            completion: { error in
                handleFeaturePlannerActionCompletion(retrySnapshot, error: error)
            }
        )
    }

    private var filesSidebarContent: some View {
        ScreenplayStudioFilesSidebar(
            breadcrumbs: navigatorBreadcrumbs,
            entries: filteredNavigatorEntries,
            showHidden: $navigatorShowHidden,
            filterText: $navigatorFilterText,
            newFolderName: $navigatorNewFolderName,
            dropIsTargeted: $navigatorDropIsTargeted,
            canNavigateBack: !navigatorBackStack.isEmpty,
            canNavigateForward: !navigatorForwardStack.isEmpty,
            canNavigateUp: canNavigateUpInNavigator,
            tertiaryTextColor: directionOneChromeTertiaryText,
            onOpenFolder: openNavigatorRootPicker,
            onNavigateBack: navigateNavigatorBack,
            onNavigateForward: navigateNavigatorForward,
            onNavigateUp: navigateNavigatorUp,
            onNavigateTo: { navigateNavigatorTo($0, pushHistory: true) },
            onCreateFolder: createFolderInNavigator,
            onOpenEntry: openNavigatorEntry,
            onRenameEntry: renameNavigatorEntry,
            onDeleteEntry: deleteNavigatorEntry,
            onDropFiles: { handleNavigatorDrop(providers: $0) },
            onSaveDraft: saveDraftToLocalFile,
            onRefresh: refreshNavigatorEntries,
            relativeTimestamp: relativeTimestamp
        )
    }



    private var studioAppliedMemoryBanner: some View {
        let memory = liveDraftBridge.latestAppliedMemory
        let character = memory.primaryCharacter
        let canSaveCorrection =
            !character.isEmpty &&
            !studioAppliedMemoryCorrectionDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !isSavingStudioAppliedMemoryCorrection

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: memory.correctionAppliedToPrompt ? "checkmark.seal.fill" : "brain.head.profile")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.herStudioAccent.opacity(0.92))
                    .frame(width: 20, height: 20)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(memory.correctionAppliedToPrompt ? "Correction memory applied" : "Project memory applied")
                            .font(.system(size: 12, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.92))
                        if !memory.source.isEmpty {
                            Text(memory.source.replacingOccurrences(of: "_", with: " "))
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundStyle(Color.herText.opacity(0.42))
                        }
                    }

                    Text(memory.summary)
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)

                    if !memory.storyRunwayLines.isEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            ForEach(memory.storyRunwayLines, id: \.self) { line in
                                Text(line)
                                    .font(.system(size: 11, weight: .regular, design: .default))
                                    .foregroundStyle(Color.herText.opacity(0.66))
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(.top, 2)
                    }

                    if let change = memory.currentStoryObligationChange {
                        Divider()
                            .overlay(Color.herText.opacity(0.12))
                            .padding(.vertical, 2)

                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Image(systemName: change.statusLabel == "Paid off" ? "checkmark.circle.fill" : "arrow.triangle.branch")
                                    .accessibilityHidden(true)
                                Text(change.statusLabel)
                                    .accessibilityIdentifier("studio.story-obligation.current.status")
                                Text(change.kindLabel)
                                    .foregroundStyle(Color.herText.opacity(0.48))
                                Spacer(minLength: 8)
                                if correctingStudioStoryObligationID == change.id {
                                    ProgressView()
                                        .controlSize(.small)
                                        .frame(width: 24, height: 24)
                                        .accessibilityLabel("Saving story correction")
                                } else {
                                    Menu {
                                        Button {
                                            correctStudioStoryObligation(change, action: "keep_open")
                                        } label: {
                                            Label("Keep Open", systemImage: "arrow.uturn.backward.circle")
                                        }
                                        .accessibilityIdentifier("studio.story-obligation.current.keep-open")

                                        Button(role: .destructive) {
                                            correctStudioStoryObligation(change, action: "retire")
                                        } label: {
                                            Label("Retire Obligation", systemImage: "archivebox")
                                        }
                                        .accessibilityIdentifier("studio.story-obligation.current.retire")
                                    } label: {
                                        Image(systemName: "ellipsis.circle")
                                            .frame(width: 24, height: 24)
                                    }
                                    .menuStyle(.borderlessButton)
                                    .help("Correct this setup or payoff")
                                    .accessibilityLabel("Correct \(change.obligation)")
                                    .accessibilityIdentifier("studio.story-obligation.current.correct")
                                }
                            }
                            .font(.system(size: 10, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herStudioAccent.opacity(0.90))

                            Text(change.obligation)
                                .font(.system(size: 11, weight: .semibold, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.76))
                                .fixedSize(horizontal: false, vertical: true)

                            Text(change.result)
                                .font(.system(size: 12, weight: .regular, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.88))
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("studio.story-obligation.current.result")

                            Text(change.evidence)
                                .font(.system(size: 10, weight: .regular, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.58))
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("studio.story-obligation.current.evidence")
                        }
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("studio.story-obligation.current")
                    }

                    if !memory.lastSavedCorrection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Saved: \(memory.lastSavedCorrection)")
                            .font(.system(size: 11, weight: .regular, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.58))
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 8)
            }

            if !character.isEmpty {
                HStack(spacing: 8) {
                    TextField("Correct \(character)'s memory", text: $studioAppliedMemoryCorrectionDraft)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12, weight: .regular, design: .default))

                    Button {
                        saveStudioAppliedMemoryCorrection()
                    } label: {
                        if isSavingStudioAppliedMemoryCorrection {
                            ProgressView()
                                .controlSize(.small)
                                .frame(width: 18, height: 18)
                        } else {
                            Label("Save", systemImage: "checkmark")
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(!canSaveCorrection)
                    .help("Save this as authoritative character memory.")
                }
            }
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 10)
        .background(Color.herStudioAccentSoft.opacity(0.14))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.herStudioAccent.opacity(0.22), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func saveStudioAppliedMemoryCorrection() {
        let correction = studioAppliedMemoryCorrectionDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !correction.isEmpty, !isSavingStudioAppliedMemoryCorrection else { return }
        isSavingStudioAppliedMemoryCorrection = true
        Task { @MainActor in
            defer { isSavingStudioAppliedMemoryCorrection = false }
            do {
                let character = try await liveDraftBridge.saveInlineAppliedMemoryCorrection(correction)
                studioAppliedMemoryCorrectionDraft = ""
                liveDraftBridge.autoInsertStatusText = "Saved correction for \(character)."
            } catch {
                liveDraftBridge.autoInsertStatusText = "Memory correction failed: \(error.localizedDescription)"
            }
        }
    }

    private func correctStudioStoryObligation(
        _ change: BackendStoryObligationChange,
        action: String
    ) {
        guard correctingStudioStoryObligationID.isEmpty else { return }
        correctingStudioStoryObligationID = change.id
        Task { @MainActor in
            defer { correctingStudioStoryObligationID = "" }
            do {
                let message = try await liveDraftBridge.correctStoryObligation(
                    change,
                    action: action
                )
                liveDraftBridge.autoInsertStatusText = message
            } catch {
                liveDraftBridge.autoInsertStatusText = "Story correction failed: \(error.localizedDescription)"
            }
        }
    }


    private var draftToolsCard: some View {
        ScreenplayStudioDraftToolsCard(
            selectedSection: $selectedDraftToolsSection,
            autosaveEnabled: $vm.autosaveEnabled,
            linesPerPage: $vm.linesPerPage,
            revisionColor: $vm.revisionColor,
            snapshotLabel: $vm.snapshotLabel,
            presentation: draftToolsPresentation,
            actions: draftToolsActions
        )
    }

    private var draftToolsPresentation: ScreenplayStudioDraftToolsPresentation {
        let isDraftEmpty = vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return ScreenplayStudioDraftToolsPresentation(
            document: ScreenplayStudioDraftDocumentPresentation(
                isSaving: vm.isSaving,
                exportItems: vm.screenplayExportMenuItems,
                autosaveStatusText: vm.autosaveStatusText,
                exportFormatsErrorText: vm.screenplayExportFormatsErrorText,
                pdfUnavailableText: vm.screenplayExportPDFUnavailableText
            ),
            integrityIssues: screenplayIntegrityIssues,
            formatLint: ScreenplayStudioDraftFormatPresentation(
                cards: vm.formatLintCards,
                isLoading: vm.isFormatLinting,
                errorText: vm.formatLintErrorText,
                sourceText: vm.formatLintSourceText
            ),
            pages: ScreenplayStudioDraftPagesPresentation(
                isRefreshing: vm.isPaginationRefreshing,
                isDraftEmpty: isDraftEmpty,
                errorText: vm.paginationErrorText,
                pages: draftPaginationPagePresentations
            ),
            revisions: ScreenplayStudioDraftRevisionPresentation(
                isRefreshing: vm.isRevisionRefreshing,
                isDraftEmpty: isDraftEmpty,
                errorText: vm.revisionErrorText,
                summary: vm.revisionSummary,
                ranges: vm.revisionRanges
            ),
            snapshots: ScreenplayStudioDraftSnapshotsPresentation(
                versions: draftSnapshotPresentations
            )
        )
    }

    private var draftPaginationPagePresentations: [ScreenplayStudioPaginationPagePresentation] {
        vm.paginationPages.map { page in
            ScreenplayStudioPaginationPagePresentation(
                page: page,
                thumbnailLines: ScreenplayStudioDraftToolsPresentationPlanner.paginationThumbnailLines(
                    for: page,
                    draft: vm.fountainDraft
                ),
                isActive: ScreenplayStudioDraftToolsPresentationPlanner.isPaginationPageActive(
                    page,
                    cursorLine: liveDraftBridge.currentCursorLine
                )
            )
        }
    }

    private var draftSnapshotPresentations: [ScreenplayStudioSnapshotPresentation] {
        snapshotVersions.map { version in
            ScreenplayStudioSnapshotPresentation(
                version: version,
                phaseTitle: ScreenplayStudioDraftToolsPresentationPlanner.snapshotPhaseTitle(version),
                relativeTimestampText: dateFromTimestamp(version.updatedAt ?? version.createdAt).map {
                    relativeTimestamp($0)
                },
                notes: ScreenplayStudioDraftToolsPresentationPlanner.snapshotNotes(version),
                canRestore: ScreenplayStudioDraftToolsPresentationPlanner.snapshotCanRestore(version)
            )
        }
    }

    private var draftIntegrityActions: ScreenplayStudioDraftIntegrityActions {
        ScreenplayStudioDraftIntegrityActions(
            onOpenInspector: {
                openDraftInspector()
            },
            onReview: { issue in
                reviewScreenplayIntegrityIssue(issue)
            },
            onMoveToPin: { issue in
                convertScreenplayIntegrityIssueToPin(issue)
            },
            onRemove: { issue in
                removeScreenplayIntegrityIssue(issue)
            },
            onMoveAllToPin: {
                convertAllScreenplayIntegrityIssuesToPin()
            }
        )
    }

    private var draftToolsActions: ScreenplayStudioDraftToolsActions {
        ScreenplayStudioDraftToolsActions(
            onSaveNow: {
                triggerStudioManualSave(revealSavedTab: false)
            },
            onImport: {
                importDraftDocument()
            },
            onExport: { format in
                Task { await exportCurrentDraft(format: format) }
            },
            onRefreshExportFormats: {
                Task { await vm.refreshScreenplayExportFormats() }
            },
            onOpenGoogleDocs: {
                openInGoogleDocs(draft: vm.fountainDraft)
            },
            onRefreshFormatLint: {
                Task { await vm.refreshFormatLint(source: "Document") }
            },
            integrity: draftIntegrityActions,
            onRefreshPagination: {
                Task { await vm.refreshPagination(source: "Manual retry") }
            },
            onJumpToPage: { page in
                jumpToPaginationPage(page)
            },
            onRefreshRevision: {
                Task { await vm.refreshRevisionColor(source: "Manual retry") }
            },
            onCreateSnapshot: {
                Task { await vm.createRevisionSnapshot() }
            },
            onRestoreSnapshot: { version in
                vm.loadSnapshot(version)
            }
        )
    }




















    private var beatsInspectorContent: some View {
        ScreenplayStudioBeatsInspectorLayout(
            beatCount: vm.outline.beats.count,
            linkedSceneCount: linkedBeatSceneCount,
            linkedActCount: linkedBeatActCount,
            hasBeats: !vm.outline.beats.isEmpty,
            beatMap: {
                ScreenplayStudioBeatMapList(
                    cards: beatInspectorCardPresentations,
                    isBeatDragActive: draggedBeatID != nil,
                    dropTargetID: $beatDropTargetID,
                    isEndDropTargeted: $isBeatListDropTargeted,
                    actions: ScreenplayStudioBeatCardActions(
                        onSelect: { beat in
                            selectBeatInInspector(beat)
                        },
                        onBeginDrag: { beat in
                            draggedBeatID = beat.id
                            selectedBeatInspectorID = beat.id
                        },
                        onDropBefore: { beat in
                            handleBeatDrop(before: beat)
                        },
                        onMove: { beat, direction in
                            Task { await vm.moveBeat(beat, direction: direction) }
                        },
                        onEdit: { beat in
                            beginEditingBeatFromInspector(beat)
                        },
                        onDelete: { beat in
                            selectedBeatInspectorID = beat.id
                            Task { await vm.deleteBeat(beat) }
                        },
                        onLinkScene: { beat in
                            handleBeatLinkAction(beat)
                        },
                        onPromoteToSceneGoal: { beat in
                            handlePromoteBeatToSceneGoal(beat)
                        },
                        onRefreshFromSelection: { beat in
                            handleBeatRefreshFromSelection(beat)
                        },
                        onRefreshFromScene: { beat in
                            handleBeatRefreshFromCurrentScene(beat)
                        },
                        onDropAtEnd: {
                            guard let draggedBeatID else { return false }
                            settleInspectorDrop(at: inspectorScrollAnchorID(forBeatID: draggedBeatID))
                            Task { await vm.moveBeat(id: draggedBeatID, before: nil) }
                            self.draggedBeatID = nil
                            beatDropTargetID = ""
                            return true
                        }
                    )
                )
            },
            composer: {
                beatsComposerCard
            }
        )
    }

    private var linkedBeatSceneCount: Int {
        Set(
            vm.outline.beats.compactMap { beat in
                let clean = (beat.sceneId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                return clean.isEmpty ? nil : clean
            }
        ).count
    }

    private var linkedBeatActCount: Int {
        Set(
            vm.outline.beats.compactMap { beat in
                let clean = (beat.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                return clean.isEmpty ? nil : clean
            }
        ).count
    }

    private var beatInspectorCardPresentations: [ScreenplayStudioBeatCardPresentation] {
        let beats = sortedOutlineBeats
        return beats.enumerated().map { index, beat in
            let linkedScene = linkedScene(for: beat)
            let availability = ScreenplayStudioInspectorMoveAvailability.position(index, count: beats.count)
            return ScreenplayStudioBeatCardPresentation(
                beat: beat,
                index: index + 1,
                sceneLabel: linkedScene.map {
                    compactSceneNavigatorLabel($0.slugline?.isEmpty == false ? $0.slugline! : $0.title)
                },
                provenance: beatProvenance(for: beat),
                provenanceHistory: beatProvenanceHistory(for: beat).map(beatProvenanceHistoryPresentation(_:)),
                isSelected: selectedBeatInspectorID == beat.id || vm.editingBeatID == beat.id,
                isSettled: inspectorSettledAnchorID == inspectorScrollAnchorID(forBeatID: beat.id),
                canMoveUp: availability.canMoveUp,
                canMoveDown: availability.canMoveDown,
                linkButtonTitle: linkedScene == nil && currentSceneInspectorSelection == nil ? "Pick Scene" : "Link Scene",
                canRefreshFromSelection: selectionQuickCaptureSeed != nil,
                canRefreshFromScene: currentSceneQuickCaptureSeed != nil
            )
        }
    }

    private func beatProvenanceHistoryPresentation(
        _ history: BeatProvenanceHistoryEntry
    ) -> ScreenplayStudioBeatProvenanceHistoryPresentation {
        let createdDate = dateFromTimestamp(history.createdAt) ?? Date(timeIntervalSince1970: history.createdAt)
        let refreshedDate = dateFromTimestamp(history.lastRefreshedAt) ?? Date(timeIntervalSince1970: history.lastRefreshedAt)
        return ScreenplayStudioBeatProvenanceHistoryPresentation(
            createdText: "Created from \(history.createdFrom.title) · \(relativeTimestamp(createdDate))",
            refreshedText: "Last refreshed from \(history.lastRefreshedFrom.title) · \(relativeTimestamp(refreshedDate))",
            accessibilityLabel: "Created from \(history.createdFrom.title), last refreshed from \(history.lastRefreshedFrom.title)"
        )
    }

    private var beatsComposerCard: some View {
        let isEditing = !vm.editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return ScreenplayStudioBeatComposer(
            label: $vm.newBeatLabel,
            summary: $vm.newBeatSummary,
            isEditing: isEditing,
            isSaving: vm.isSaving,
            showsSelectionCapture: selectionQuickCaptureSeed != nil,
            showsSceneCapture: currentSceneQuickCaptureSeed != nil,
            showsSelectedBeatUpdate: selectionQuickCaptureSeed != nil && selectedBeatForQuickUpdate != nil,
            createsImmediately: canQuickCreateBeatImmediately,
            updatesSelectedBeatImmediately: canQuickUpdateSelectedBeatImmediately,
            selectedBeatUpdateSubtitle: selectedBeatQuickUpdateSubtitle,
            quickLinkTargets: beatQuickLinkTargets,
            selectedScene: selectedBeatScene,
            currentScene: currentSceneInspectorSelection,
            availableScenes: availableBeatSceneOptions,
            selectedAct: selectedBeatAct,
            acts: sortedOutlineActs,
            onCaptureSelection: handleSelectionQuickBeatCapture,
            onCaptureScene: handleCurrentSceneQuickBeatCapture,
            onUpdateSelectedBeat: handleSelectedBeatQuickUpdate,
            onSelectQuickLink: applyBeatQuickLinkTarget,
            onSelectScene: selectBeatScene,
            onSelectAct: selectBeatAct,
            onCancel: {
                vm.cancelEditingBeat()
                beatComposerProvenance = .manual
            },
            onSave: {
                Task { await handleBeatSaveAction() }
            }
        )
    }
    private func outlineFocusedSceneCard(_ scene: BackendScreenplayScene) -> some View {
        ScreenplayStudioOutlineFocusedSceneCard(scene: scene)
    }

    private var sortedOutlineActs: [BackendScreenplayAct] {
        InspectorOrderSupport.sortedActs(vm.outline.acts)
    }

    private var sortedOutlineBeats: [BackendScreenplayBeat] {
        InspectorOrderSupport.sortedBeats(vm.outline.beats)
    }

    private var selectedBeatScene: BackendScreenplayScene? {
        guard !vm.newBeatSceneID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return vm.outline.scenes.first(where: { $0.id == vm.newBeatSceneID })
    }

    private var selectedBeatAct: BackendScreenplayAct? {
        guard !vm.newBeatActID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return vm.outline.acts.first(where: { $0.id == vm.newBeatActID })
    }

    private var availableBeatSceneOptions: [BackendScreenplayScene] {
        let filteredActID = vm.newBeatActID.trimmingCharacters(in: .whitespacesAndNewlines)
        let scenes = vm.outline.scenes.filter { scene in
            guard !filteredActID.isEmpty else { return true }
            return (scene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines) == filteredActID
        }
        return InspectorOrderSupport.sortedScenes(scenes)
    }

    private var activePageOutlineSceneSelection: BackendScreenplayScene? {
        guard let active = activeDraftSceneNavigatorItem else { return nil }
        if let exact = vm.outline.scenes.first(where: { draftSceneNavigatorItem(for: $0)?.id == active.id }) {
            return exact
        }
        return vm.outline.scenes.first(where: {
            normalizedSceneNavigatorKey($0.slugline?.isEmpty == false ? $0.slugline! : $0.title) == normalizedSceneNavigatorKey(active.label)
        })
    }

    private var explicitFocusedOutlineSceneSelection: BackendScreenplayScene? {
        if !vm.editingSceneID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return vm.outline.scenes.first(where: { $0.id == vm.editingSceneID })
        }
        if !highlightedSceneInspectorKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return vm.outline.scenes.first(where: { sceneInspectorKey(for: $0) == highlightedSceneInspectorKey })
        }
        return nil
    }

    private var beatQuickLinkTargets: [BeatQuickLinkTarget] {
        BeatQuickLinkTargetPlanner.makeTargets(
            pageScene: activePageOutlineSceneSelection,
            focusedScene: explicitFocusedOutlineSceneSelection,
            acts: sortedOutlineActs
        )
    }

    private func applyBeatQuickLinkTarget(_ target: BeatQuickLinkTarget) {
        vm.newBeatSceneID = target.sceneID
        vm.newBeatActID = target.actID
        if target.sceneID.isEmpty && target.actID.isEmpty {
            vm.infoText = "Beat left loose for now."
        } else if !target.sceneID.isEmpty {
            vm.infoText = "Linked beat to \(target.subtitle)."
        } else {
            vm.infoText = "Linked beat to \(target.subtitle)."
        }
    }

    private var selectedBeatForQuickUpdate: BackendScreenplayBeat? {
        BeatQuickCaptureActionPlanner.selectedBeat(
            selectedBeatID: selectedBeatInspectorID,
            editingBeatID: vm.editingBeatID,
            beats: sortedOutlineBeats
        )
    }

    private var selectedBeatQuickUpdateSubtitle: String {
        BeatQuickCaptureActionPlanner.updateSubtitle(for: selectedBeatForQuickUpdate)
    }

    private var canTriggerMakeBeatFromSelectionShortcut: Bool {
        isDirectionOneRightRailExpanded && directionOneRightPanelTab == .beats && selectionQuickCaptureSeed != nil
    }

    private var canTriggerUpdateSelectedBeatFromSelectionShortcut: Bool {
        isDirectionOneRightRailExpanded &&
        directionOneRightPanelTab == .beats &&
        selectionQuickCaptureSeed != nil &&
        selectedBeatForQuickUpdate != nil
    }

    private func triggerMakeBeatFromSelectionShortcut() {
        guard canTriggerMakeBeatFromSelectionShortcut else { return }
        handleSelectionQuickBeatCapture()
    }

    private func triggerUpdateSelectedBeatFromSelectionShortcut() {
        guard canTriggerUpdateSelectedBeatFromSelectionShortcut else { return }
        handleSelectedBeatQuickUpdate()
    }

    private var canQuickCreateBeatImmediately: Bool {
        BeatQuickCaptureActionPlanner.canCreateImmediately(draft: beatQuickCaptureDraftState)
    }

    private var canQuickUpdateSelectedBeatImmediately: Bool {
        guard let beat = selectedBeatForQuickUpdate,
              selectionQuickCaptureSeed != nil else { return false }
        return canQuickUpdateBeatImmediately(for: beat)
    }

    private func canQuickUpdateBeatImmediately(for beat: BackendScreenplayBeat) -> Bool {
        BeatQuickCaptureActionPlanner.canUpdateImmediately(
            beatID: beat.id,
            draft: beatQuickCaptureDraftState
        )
    }

    private var beatQuickCaptureDraftState: BeatQuickCaptureDraftState {
        BeatQuickCaptureDraftState(
            editingBeatID: vm.editingBeatID,
            label: vm.newBeatLabel,
            summary: vm.newBeatSummary,
            sceneID: vm.newBeatSceneID,
            actID: vm.newBeatActID
        )
    }

    private var selectionQuickCaptureSeed: BeatQuickCaptureSeed? {
        guard let selection = liveDraftBridge.selectedEditorSnapshot() else { return nil }
        return BeatQuickCaptureSeedPlanner.makeSelectionSeed(
            selection: selection,
            linkedScene: outlineScene(for: selection)
        )
    }

    private var currentSceneQuickCaptureSeed: BeatQuickCaptureSeed? {
        guard let scene = currentSceneInspectorSelection else { return nil }
        return BeatQuickCaptureSeedPlanner.makeCurrentSceneSeed(scene: scene)
    }

    private func handleSelectionQuickBeatCapture() {
        guard let seed = selectionQuickCaptureSeed else {
            vm.infoText = "Select the block you want to turn into a beat first."
            return
        }
        if canQuickCreateBeatImmediately {
            Task { await createBeatFromQuickCaptureSeed(seed, persistToBackend: true) }
        } else {
            populateBeatComposer(with: seed, infoText: "Loaded the selected block into the beat composer.")
        }
    }

    private func handleCurrentSceneQuickBeatCapture() {
        guard let seed = currentSceneQuickCaptureSeed else {
            vm.infoText = "I couldn't resolve the current scene for a beat yet."
            return
        }
        if canQuickCreateBeatImmediately {
            Task { await createBeatFromQuickCaptureSeed(seed, persistToBackend: true) }
        } else {
            populateBeatComposer(with: seed, infoText: "Loaded the current scene into the beat composer.")
        }
    }

    private func handleSelectedBeatQuickUpdate() {
        guard let beat = selectedBeatForQuickUpdate else {
            vm.infoText = "Select the beat you want to update first."
            return
        }
        guard let seed = selectionQuickCaptureSeed else {
            vm.infoText = "Select the page block you want to use first."
            return
        }
        if canQuickUpdateSelectedBeatImmediately {
            Task { await updateBeatFromSelectionSeed(beat, seed: seed, persistToBackend: true) }
        } else {
            populateSelectedBeatComposer(beat, from: seed, infoText: "Loaded the selected block into \(beat.label).")
        }
    }

    private func handleBeatRefreshFromSelection(_ beat: BackendScreenplayBeat) {
        guard let seed = selectionQuickCaptureSeed else {
            vm.infoText = "Select the page block you want to use first."
            return
        }
        if canQuickUpdateBeatImmediately(for: beat) {
            Task { await updateBeatFromSelectionSeed(beat, seed: seed, persistToBackend: true) }
        } else {
            populateSelectedBeatComposer(beat, from: seed, infoText: "Loaded the selected block into \(beat.label) for review.")
        }
    }

    private func handleBeatRefreshFromCurrentScene(_ beat: BackendScreenplayBeat) {
        guard let seed = currentSceneQuickCaptureSeed else {
            vm.infoText = "I couldn't resolve the current scene yet."
            return
        }
        if canQuickUpdateBeatImmediately(for: beat) {
            Task { await updateBeatFromCurrentSceneSeed(beat, seed: seed, persistToBackend: true) }
        } else {
            populateSelectedBeatComposer(beat, from: seed, infoText: "Loaded the current scene into \(beat.label) for review.")
        }
    }

    private func handleBeatSaveAction(preferredNewBeatProvenance: BeatProvenanceSource? = nil) async {
        let existingBeatIDs = Set(vm.outline.beats.map(\.id))
        let editingBeatID = vm.editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines)
        let provenance = preferredNewBeatProvenance ?? (editingBeatID.isEmpty ? beatComposerProvenance : beatProvenance(forBeatID: editingBeatID))
        await vm.addBeat()
        guard vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        if editingBeatID.isEmpty {
            if let createdBeat = createdBeatAfterQuickCapture(excluding: existingBeatIDs, preferredLabel: vm.newBeatLabel) {
                setBeatProvenance(provenance, for: createdBeat.id)
                selectBeatInInspector(createdBeat)
            }
            beatComposerProvenance = .manual
        } else {
            setBeatProvenance(provenance, for: editingBeatID)
            if let updatedBeat = sortedOutlineBeats.first(where: { $0.id == editingBeatID }) {
                selectBeatInInspector(updatedBeat)
            }
            beatComposerProvenance = provenance
        }
    }

    private func populateBeatComposer(with seed: BeatQuickCaptureSeed, infoText: String) {
        vm.cancelEditingBeat()
        beatComposerProvenance = seed.provenance
        vm.newBeatLabel = seed.label
        vm.newBeatSummary = seed.summary
        vm.newBeatSceneID = seed.sceneID
        vm.newBeatActID = seed.actID
        directionOneRightPanelTab = .beats
        let cleanSceneID = seed.sceneID.trimmingCharacters(in: .whitespacesAndNewlines)
        if let linkedScene = (!cleanSceneID.isEmpty
            ? vm.outline.scenes.first(where: { $0.id == cleanSceneID })
            : nil) {
            highlightedSceneInspectorKey = sceneInspectorKey(for: linkedScene)
        }
        vm.infoText = infoText
    }

    private func populateSelectedBeatComposer(
        _ beat: BackendScreenplayBeat,
        from seed: BeatQuickCaptureSeed,
        infoText: String
    ) {
        selectBeatInInspector(beat)
        vm.beginEditingBeat(beat)
        beatComposerProvenance = beatProvenance(for: beat)
        vm.newBeatLabel = beat.label.trimmingCharacters(in: .whitespacesAndNewlines)
        vm.newBeatSummary = seed.summary
        let mergedSceneID = seed.sceneID.trimmingCharacters(in: .whitespacesAndNewlines)
        let mergedActID = seed.actID.trimmingCharacters(in: .whitespacesAndNewlines)
        if !mergedSceneID.isEmpty {
            vm.newBeatSceneID = mergedSceneID
        }
        if !mergedActID.isEmpty {
            vm.newBeatActID = mergedActID
        }
        if let linkedScene = vm.outline.scenes.first(where: { $0.id == vm.newBeatSceneID }) {
            highlightedSceneInspectorKey = sceneInspectorKey(for: linkedScene)
        }
        vm.infoText = infoText
    }

    private func createBeatFromQuickCaptureSeed(_ seed: BeatQuickCaptureSeed, persistToBackend: Bool) async {
        let existingBeatIDs = Set(vm.outline.beats.map(\.id))
        if persistToBackend {
            populateBeatComposer(with: seed, infoText: seed.infoText)
            await handleBeatSaveAction(preferredNewBeatProvenance: seed.provenance)
            guard vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            if let createdBeat = createdBeatAfterQuickCapture(excluding: existingBeatIDs, preferredLabel: seed.label) {
                setBeatProvenance(seed.provenance, for: createdBeat.id)
                selectBeatInInspector(createdBeat)
            }
            vm.infoText = seed.infoText
            return
        }

        let createdBeat = appendLocalQuickCaptureBeat(seed)
        setBeatProvenance(seed.provenance, for: createdBeat.id)
        selectBeatInInspector(createdBeat)
        vm.cancelEditingBeat()
        beatComposerProvenance = .manual
        vm.infoText = seed.infoText
    }

    private func updateBeatFromSelectionSeed(
        _ beat: BackendScreenplayBeat,
        seed: BeatQuickCaptureSeed,
        persistToBackend: Bool
    ) async {
        let label = beat.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? seed.label
            : beat.label
        let infoText = "Updated \(label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "the selected beat" : label) from the selected block."

        if persistToBackend {
            populateSelectedBeatComposer(beat, from: seed, infoText: infoText)
            await handleBeatSaveAction(preferredNewBeatProvenance: beatProvenance(for: beat))
            guard vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            if let refreshedBeat = sortedOutlineBeats.first(where: { $0.id == beat.id }) {
                selectBeatInInspector(refreshedBeat)
            } else {
                selectedBeatInspectorID = beat.id
            }
            markBeatProvenanceRefresh(seed.provenance, for: beat.id)
            vm.infoText = infoText
            return
        }

        applyLocalBeatQuickCaptureUpdate(beat, seed: seed, infoText: infoText)
    }

    private func updateBeatFromCurrentSceneSeed(
        _ beat: BackendScreenplayBeat,
        seed: BeatQuickCaptureSeed,
        persistToBackend: Bool
    ) async {
        let label = beat.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? seed.label
            : beat.label
        let refreshSceneLabel = vm.outline.scenes.first(where: { $0.id == seed.sceneID }).map {
            compactSceneNavigatorLabel($0.slugline?.isEmpty == false ? $0.slugline! : $0.title)
        } ?? "the current scene"
        let infoText = "Refreshed \(label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "the selected beat" : label) from \(refreshSceneLabel)."

        if persistToBackend {
            populateSelectedBeatComposer(beat, from: seed, infoText: infoText)
            await handleBeatSaveAction(preferredNewBeatProvenance: beatProvenance(for: beat))
            guard vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            if let refreshedBeat = sortedOutlineBeats.first(where: { $0.id == beat.id }) {
                selectBeatInInspector(refreshedBeat)
            }
            markBeatProvenanceRefresh(seed.provenance, for: beat.id)
            vm.infoText = infoText
            return
        }

        applyLocalBeatQuickCaptureUpdate(beat, seed: seed, infoText: infoText)
    }

    private func applyLocalBeatQuickCaptureUpdate(
        _ beat: BackendScreenplayBeat,
        seed: BeatQuickCaptureSeed,
        infoText: String
    ) {
        guard let mutation = BeatQuickCaptureMutationPlanner.updating(
            beatID: beat.id,
            from: seed,
            in: vm.outline,
            timestamp: Date().timeIntervalSince1970 * 1000
        ) else { return }
        vm.outline = mutation.outline
        selectBeatInInspector(mutation.beat)
        vm.cancelEditingBeat()
        beatComposerProvenance = beatProvenance(for: beat)
        markBeatProvenanceRefresh(seed.provenance, for: beat.id)
        vm.refreshLiveDraftBridgeContext()
        vm.infoText = infoText
    }

    private func createdBeatAfterQuickCapture(
        excluding existingBeatIDs: Set<String>,
        preferredLabel: String
    ) -> BackendScreenplayBeat? {
        if let exact = sortedOutlineBeats.first(where: { !existingBeatIDs.contains($0.id) }) {
            return exact
        }
        let normalizedLabel = preferredLabel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return sortedOutlineBeats.first(where: {
            !normalizedLabel.isEmpty &&
            $0.label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedLabel
        })
    }

    private func appendLocalQuickCaptureBeat(_ seed: BeatQuickCaptureSeed) -> BackendScreenplayBeat {
        let now = Date().timeIntervalSince1970 * 1000
        let mutation = BeatQuickCaptureMutationPlanner.appending(
            seed: seed,
            to: vm.outline,
            beatID: "beat-local-\(UUID().uuidString.lowercased())",
            timestamp: now
        )
        vm.outline = mutation.outline
        vm.refreshLiveDraftBridgeContext()
        return mutation.beat
    }

    private func outlineScene(for selection: ScreenplayEditorSelectionSnapshot) -> BackendScreenplayScene? {
        if let label = selection.sceneLabel?.trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty {
            let normalizedLabel = normalizedSceneNavigatorKey(label)
            if let explicit = vm.outline.scenes.first(where: {
                normalizedSceneNavigatorKey($0.slugline?.isEmpty == false ? $0.slugline! : $0.title) == normalizedLabel
            }) {
                return explicit
            }
        }
        return currentSceneInspectorSelection
    }

    private func beginEditingBeatFromInspector(_ beat: BackendScreenplayBeat) {
        selectBeatInInspector(beat)
        vm.beginEditingBeat(beat)
        beatComposerProvenance = beatProvenance(for: beat)
        vm.infoText = "Editing \(beat.label)."
    }

    private func selectBeatInInspector(_ beat: BackendScreenplayBeat) {
        selectedBeatInspectorID = beat.id
        directionOneRightPanelTab = .beats
    }

    private var isInspectorDragInFlight: Bool {
        draggedBeatID != nil || draggedActID != nil || draggedSceneID != nil
    }

    private func inspectorScrollAnchorID(forBeatID beatID: String) -> String {
        ScreenplayStudioInspectorAnchor.beat(beatID)
    }

    private func inspectorScrollAnchorID(forActID actID: String) -> String {
        ScreenplayStudioInspectorAnchor.act(actID)
    }

    private func inspectorScrollAnchorID(forSceneID sceneID: String) -> String {
        ScreenplayStudioInspectorAnchor.scene(sceneID)
    }

    private func syncInspectorDropTargetScroll(proxy: ScrollViewProxy) {
        guard isInspectorDragInFlight else { return }
        let anchorID = currentInspectorAutoScrollRequest?.anchorID ?? activeInspectorDropAnchorID
        let anchor = currentInspectorAutoScrollRequest?.anchor ?? .center
        guard let anchorID else { return }
        withAnimation(.easeOut(duration: 0.16)) {
            proxy.scrollTo(anchorID, anchor: anchor)
        }
    }

    private func clearInspectorDropSettlement() {
        inspectorSettledAnchorClearTask?.cancel()
        inspectorSettledAnchorClearTask = nil
        inspectorSettledAnchorID = ""
    }

    private func settleInspectorDrop(at anchorID: String) {
        inspectorSettledAnchorClearTask?.cancel()
        withAnimation(.spring(response: 0.22, dampingFraction: 0.84)) {
            inspectorSettledAnchorID = anchorID
        }
        inspectorSettledAnchorClearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 850_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.24)) {
                inspectorSettledAnchorID = ""
            }
            inspectorSettledAnchorClearTask = nil
        }
    }

    private var activeInspectorDropAnchorID: String? {
        if !beatDropTargetID.isEmpty {
            return inspectorScrollAnchorID(forBeatID: beatDropTargetID)
        }
        if !actDropTargetID.isEmpty {
            return inspectorScrollAnchorID(forActID: actDropTargetID)
        }
        if !sceneDropTargetID.isEmpty {
            return inspectorScrollAnchorID(forSceneID: sceneDropTargetID)
        }
        if !sceneGroupDropTargetID.isEmpty, sceneGroupDropTargetID != "loose-scenes" {
            return inspectorScrollAnchorID(forActID: sceneGroupDropTargetID)
        }
        return nil
    }

    private func updateInspectorAutoScroll(proxy: ScrollViewProxy) {
        inspectorAutoScrollTask?.cancel()
        inspectorAutoScrollTask = nil
        clearInspectorDropSettlementIfDragEnded()
        guard let request = currentInspectorAutoScrollRequest, isInspectorDragInFlight else { return }
        inspectorAutoScrollTask = Task { @MainActor in
            while !Task.isCancelled {
                if !isInspectorDragInFlight {
                    break
                }
                guard let currentRequest = currentInspectorAutoScrollRequest,
                      currentRequest.anchorID == request.anchorID,
                      currentRequest.direction == request.direction else {
                    break
                }
                withAnimation(.easeOut(duration: 0.16)) {
                    proxy.scrollTo(currentRequest.anchorID, anchor: currentRequest.anchor)
                }
                try? await Task.sleep(nanoseconds: 180_000_000)
            }
        }
    }

    private func clearInspectorDropSettlementIfDragEnded() {
        guard !isInspectorDragInFlight else { return }
        clearInspectorDropSettlement()
    }

    private var currentInspectorAutoScrollRequest: InspectorAutoScrollRequest? {
        if draggedBeatID != nil {
            let beatIDs = sortedOutlineBeats.map(\.id)
            if isBeatListDropTargeted, let lastBeatID = beatIDs.last {
                return InspectorAutoScrollRequest(
                    anchorID: inspectorScrollAnchorID(forBeatID: lastBeatID),
                    anchor: .bottom,
                    direction: .down
                )
            }
            if let request = inspectorAutoScrollRequest(
                targetID: beatDropTargetID,
                orderedIDs: beatIDs,
                anchorBuilder: inspectorScrollAnchorID(forBeatID:)
            ) {
                return request
            }
        }
        if draggedActID != nil {
            let actIDs = sortedOutlineActs.map(\.id)
            if isActListDropTargeted, let lastActID = actIDs.last {
                return InspectorAutoScrollRequest(
                    anchorID: inspectorScrollAnchorID(forActID: lastActID),
                    anchor: .bottom,
                    direction: .down
                )
            }
            if let request = inspectorAutoScrollRequest(
                targetID: actDropTargetID,
                orderedIDs: actIDs,
                anchorBuilder: inspectorScrollAnchorID(forActID:)
            ) {
                return request
            }
        }
        if draggedSceneID != nil {
            let sceneIDs = InspectorOrderSupport.sortedScenes(vm.outline.scenes).map(\.id)
            if sceneGroupDropTargetID == "loose-scenes", let lastSceneID = sceneIDs.last {
                return InspectorAutoScrollRequest(
                    anchorID: inspectorScrollAnchorID(forSceneID: lastSceneID),
                    anchor: .bottom,
                    direction: .down
                )
            }
            let targetGroupID = sceneGroupDropTargetID.trimmingCharacters(in: .whitespacesAndNewlines)
            if !targetGroupID.isEmpty,
               targetGroupID != "loose-scenes" {
                let groupedSceneIDs = InspectorOrderSupport.sortedScenes(
                    vm.outline.scenes.filter {
                        InspectorOrderSupport.normalizedID($0.actId) == targetGroupID
                    }
                ).map(\.id)
                if let lastGroupedSceneID = groupedSceneIDs.last {
                    return InspectorAutoScrollRequest(
                        anchorID: inspectorScrollAnchorID(forSceneID: lastGroupedSceneID),
                        anchor: .bottom,
                        direction: .down
                    )
                }
                if let act = sortedOutlineActs.first(where: { $0.id == targetGroupID }) {
                    return InspectorAutoScrollRequest(
                        anchorID: inspectorScrollAnchorID(forActID: act.id),
                        anchor: .center,
                        direction: .down
                    )
                }
            }
            if let request = inspectorAutoScrollRequest(
                targetID: sceneDropTargetID,
                orderedIDs: sceneIDs,
                anchorBuilder: inspectorScrollAnchorID(forSceneID:)
            ) {
                return request
            }
        }
        return nil
    }

    private func inspectorAutoScrollRequest(
        targetID: String,
        orderedIDs: [String],
        anchorBuilder: (String) -> String
    ) -> InspectorAutoScrollRequest? {
        let cleanTargetID = targetID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTargetID.isEmpty,
              let index = orderedIDs.firstIndex(of: cleanTargetID),
              !orderedIDs.isEmpty else { return nil }

        if index <= 1 {
            let anchorIndex = max(0, index - 1)
            return InspectorAutoScrollRequest(
                anchorID: anchorBuilder(orderedIDs[anchorIndex]),
                anchor: .top,
                direction: .up
            )
        }

        if index >= max(0, orderedIDs.count - 2) {
            let anchorIndex = min(orderedIDs.count - 1, index + 1)
            return InspectorAutoScrollRequest(
                anchorID: anchorBuilder(orderedIDs[anchorIndex]),
                anchor: .bottom,
                direction: .down
            )
        }

        return nil
    }


    private func moveSelectedBeatLocally(toEnd: Bool) -> Bool {
        let currentID = selectedBeatInspectorID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !currentID.isEmpty else { return false }
        guard let mutation = BeatOrderMutationPlanner.moving(
            beatID: currentID,
            to: toEnd ? .end : .beginning,
            in: vm.outline
        ) else { return false }
        applyLocalBeatOrderMutation(mutation)
        draggedBeatID = nil
        beatDropTargetID = ""
        isBeatListDropTargeted = false
        persistInspectorWorkspaceState()
        return true
    }

    private func restoreBeatOrderIfNeeded(from orderedIDs: [String]) {
        guard let mutation = BeatOrderMutationPlanner.restoring(
            orderedIDs: orderedIDs,
            in: vm.outline
        ) else { return }
        applyLocalBeatOrderMutation(mutation)
    }

    private func applyLocalBeatOrderMutation(_ mutation: BeatOrderMutation) {
        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: mutation.scenes.count,
            beatCount: mutation.beats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: mutation.scenes),
            scenes: mutation.scenes,
            beats: mutation.beats
        )
        vm.refreshLiveDraftBridgeContext()
    }

    private func handleBeatDrop(before beat: BackendScreenplayBeat) -> Bool {
        defer {
            draggedBeatID = nil
            beatDropTargetID = ""
        }
        guard let draggedBeatID, draggedBeatID != beat.id else { return false }
        settleInspectorDrop(at: inspectorScrollAnchorID(forBeatID: draggedBeatID))
        Task { await vm.moveBeat(id: draggedBeatID, before: beat.id) }
        return true
    }

    private func handleActDrop(before act: BackendScreenplayAct) -> Bool {
        defer {
            draggedActID = nil
            actDropTargetID = ""
        }
        guard let draggedActID, draggedActID != act.id else { return false }
        settleInspectorDrop(at: inspectorScrollAnchorID(forActID: draggedActID))
        Task { await vm.moveAct(id: draggedActID, before: act.id) }
        return true
    }

    private func handleSceneDrop(before scene: BackendScreenplayScene) -> Bool {
        defer {
            draggedSceneID = nil
            sceneDropTargetID = ""
            sceneGroupDropTargetID = ""
        }
        guard let draggedSceneID, draggedSceneID != scene.id else { return false }
        let targetActID = (scene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        settleInspectorDrop(at: inspectorScrollAnchorID(forSceneID: draggedSceneID))
        Task { await vm.moveScene(id: draggedSceneID, before: scene.id, targetActID: targetActID.isEmpty ? nil : targetActID) }
        return true
    }

    private func linkedScene(for beat: BackendScreenplayBeat) -> BackendScreenplayScene? {
        guard let sceneID = beat.sceneId?.trimmingCharacters(in: .whitespacesAndNewlines), !sceneID.isEmpty else {
            return nil
        }
        return vm.outline.scenes.first(where: { $0.id == sceneID })
    }

    private func selectBeatScene(_ scene: BackendScreenplayScene?) {
        vm.newBeatSceneID = scene?.id ?? ""
        if let scene {
            vm.newBeatActID = (scene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private func selectBeatAct(_ act: BackendScreenplayAct?) {
        let nextActID = act?.id ?? ""
        vm.newBeatActID = nextActID
        if let selectedScene = selectedBeatScene,
           (selectedScene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines) != nextActID {
            vm.newBeatSceneID = ""
        }
    }

    private func preferredSceneForBeatAction(_ beat: BackendScreenplayBeat) -> BackendScreenplayScene? {
        currentSceneInspectorSelection ?? linkedScene(for: beat)
    }

    private func handleBeatLinkAction(_ beat: BackendScreenplayBeat) {
        guard let scene = currentSceneInspectorSelection ?? linkedScene(for: beat) else {
            vm.beginEditingBeat(beat)
            vm.infoText = "Pick a scene in Outline or on the page, then tap Link Scene again."
            return
        }
        Task { await vm.linkBeat(beat, to: scene) }
        revealSceneInInspector(scene)
    }

    private func handlePromoteBeatToSceneGoal(_ beat: BackendScreenplayBeat) {
        guard let scene = preferredSceneForBeatAction(beat) else {
            vm.beginEditingBeat(beat)
            vm.infoText = "Pick a scene first so this beat has somewhere to promote its goal."
            return
        }
        Task { await vm.promoteBeatToSceneGoal(beat, scene: scene) }
        revealSceneInInspector(scene)
    }

    private func revealSceneInInspector(_ scene: BackendScreenplayScene) {
        selectedInspectorSection = .scenes
        highlightedSceneInspectorKey = sceneInspectorKey(for: scene)
        if let jumpTarget = draftSceneNavigatorItem(for: scene) {
            liveDraftBridge.jumpToLine(jumpTarget.line)
            liveDraftBridge.highlightLineRange(startLine: jumpTarget.line)
        }
    }




    @ViewBuilder
    private var lastCommittedWriteInlineActions: some View {
        if let committedWrite = liveDraftBridge.lastCommittedWrite {
            let matchingExchange = matchingStudioExchange(for: committedWrite)
            let source = matchingExchange?.source ?? lastCommittedStudioPromptSource
            let preview = committedWriteToastPreview(committedWrite.insertedText)

            if isLastCommittedWriteToastCollapsed {
                Button {
                    expandLastCommittedWriteActions()
                } label: {
                    HStack(spacing: 8) {
                        Capsule()
                            .fill(Color.accentColor.opacity(0.70))
                            .frame(width: 3, height: 20)

                        Text("Wrote to Page")
                            .font(.system(size: 11, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.82))

                        studioPromptSourceBadge(source, compact: true)

                        Image(systemName: "chevron.up")
                            .font(.system(size: 10, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.44))
                    }
                    .padding(.horizontal, 11)
                    .padding(.vertical, 9)
                    .background(
                        Capsule()
                            .fill(Color.herPaper.opacity(0.96))
                    )
                    .overlay(
                        Capsule()
                            .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .shadow(color: Color.black.opacity(0.05), radius: 8, y: 4)
                .help("Show page-write actions")
                .accessibilityIdentifier("studio.page-write.toast.collapsed")
                .accessibilityLabel("Wrote to page. \(source.label). Collapsed.")
                .accessibilityValue(preview)
                .accessibilityHint("Press Return to reopen. Press Escape to dismiss.")
                .studioExitCommand {
                    dismissLastCommittedWriteActions()
                }
#if os(macOS)
                .keyboardShortcut(.return, modifiers: [])
#endif
            } else {
                HStack(alignment: .center, spacing: 12) {
                    Capsule()
                        .fill(Color.accentColor.opacity(0.70))
                        .frame(width: 3, height: 34)

                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text("Wrote to Page")
                                .font(.system(size: 12, weight: .semibold, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.84))
                            studioPromptSourceBadge(source, compact: true)
                        }
                        Text(preview)
                            .font(.system(size: 12, weight: .medium, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.68))
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 8) {
                        Button("Undo") {
                            undoLastCommittedWrite(committedWrite)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .accessibilityIdentifier("studio.page-write.toast.undo")
                        .accessibilityLabel("Undo page write")
                        .accessibilityHint("Removes the latest inserted page block.")

                        Menu {
                            Button("Jump to Page Write") {
                                focusLastCommittedWriteFromToast(showMarker: true)
                            }

                            if let matchingExchange {
                                Button("Jump to Thread Entry") {
                                    highlightStudioExchangeFromCommittedWrite(matchingExchange)
                                }
                            }

                            Section("Rewrite") {
                                Button("Make Sharper") {
                                    reviseLastCommittedWrite(committedWrite, preset: .sharper)
                                }
                                Button("Make More Visual") {
                                    reviseLastCommittedWrite(committedWrite, preset: .moreVisual)
                                }
                                Button("Make Shorter") {
                                    reviseLastCommittedWrite(committedWrite, preset: .shorter)
                                }
                            }

                            Section("Recover") {
                                Button("Move To Pin") {
                                    recoverCommittedWriteOffPage(
                                        committedWrite,
                                        matchingExchange: matchingExchange,
                                        asNote: false
                                    )
                                }
                                Button("Convert To Note") {
                                    recoverCommittedWriteOffPage(
                                        committedWrite,
                                        matchingExchange: matchingExchange,
                                        asNote: true
                                    )
                                }
                            }

                            Divider()

                            Button("Dismiss") {
                                dismissLastCommittedWriteActions()
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .font(.system(size: 16, weight: .semibold, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.54))
                                .frame(width: 28, height: 28)
                        }
                        .help("More page-write actions")
                        .accessibilityIdentifier("studio.page-write.toast.more")
                        .accessibilityLabel("More page-write actions")
                        .accessibilityHint("Opens rewrite, jump, and recovery actions.")
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: 304)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.herPaper.opacity(0.96))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.06), radius: 10, y: 6)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("studio.page-write.toast.expanded")
                .accessibilityLabel("Wrote to page. \(source.label).")
                .accessibilityValue(preview)
                .accessibilityHint("Use Undo to remove the write, or More for rewrite and recovery actions.")
                .studioExitCommand {
                    dismissLastCommittedWriteActions()
                }
            }
        }
    }

    private func inlineWritePresetButton(
        _ title: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.system(size: 11, weight: .semibold, design: .default))
        }
        .buttonStyle(.bordered)
        .disabled(isSubmittingStudioPrompt || isSubmittingPrompt)
    }

    private var focusedPageDiffExchange: StudioAskNoteExchange? {
        guard let focusedPageDiffExchangeID else { return nil }
        return studioAskNoteHistory.first(where: { $0.id == focusedPageDiffExchangeID })
    }

    private var reviewablePageDiffExchange: StudioAskNoteExchange? {
        if let exchange = focusedPageDiffExchange,
           let comparison = fullThreadDraftComparison(for: exchange),
           comparison.state == .revisedInDraft,
           !comparison.currentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return exchange
        }
        return preferredRevisedDiffExchange(in: studioAskNoteHistory)
    }

    private func focusedPageDiffAnchor(for exchange: StudioAskNoteExchange) -> ResolvedStudioExchangeAnchor? {
        resolvedAnchorSnapshot(for: exchange, in: vm.fountainDraft) ?? fallbackAnchorSnapshot(for: exchange)
    }

    private func syncFocusedPageDiffAnchorRequest() {
        guard let exchange = focusedPageDiffExchange,
              let resolved = focusedPageDiffAnchor(for: exchange) else {
            liveDraftBridge.clearAnchoredTextRect()
            return
        }
        liveDraftBridge.anchorTextRect(startLine: resolved.startLine, endLine: resolved.endLine)
    }

    private func focusedPageDiffOverlayWidth(for snapshot: ScreenplayAnchoredTextRectSnapshot?) -> CGFloat {
        guard let snapshot else { return 480 }
        let available = max(280, snapshot.visibleRect.width - 28)
        return min(520, available)
    }

    private func focusedPageDiffOverlayX(for snapshot: ScreenplayAnchoredTextRectSnapshot?) -> CGFloat {
        guard let snapshot else { return 18 }
        let width = focusedPageDiffOverlayWidth(for: snapshot)
        let preferred = snapshot.rect.minX + 14
        let maxX = max(12, snapshot.visibleRect.width - width - 12)
        return min(max(12, preferred), maxX)
    }

    private func focusedPageDiffOverlayY(for snapshot: ScreenplayAnchoredTextRectSnapshot?) -> CGFloat {
        guard let snapshot else { return 16 }
        let preferred = snapshot.rect.minY + 8
        let maxY = max(12, snapshot.visibleRect.height - 250)
        return min(max(12, preferred), maxY)
    }

    private func focusedPageDiffConnectorLayout(
        for snapshot: ScreenplayAnchoredTextRectSnapshot?,
        overlayWidth: CGFloat,
        overlayX: CGFloat,
        overlayY: CGFloat
    ) -> (anchor: CGPoint, elbow: CGPoint, cardAttach: CGPoint)? {
        guard let snapshot else { return nil }
        let maxX = max(18, snapshot.visibleRect.width - 18)
        let maxY = max(18, snapshot.visibleRect.height - 18)
        let anchor = CGPoint(
            x: min(max(18, snapshot.rect.minX - 10), maxX),
            y: min(max(18, snapshot.rect.midY), maxY)
        )
        let attachesOnLeadingEdge = overlayX >= anchor.x
        let cardAttach = CGPoint(
            x: attachesOnLeadingEdge
                ? max(18, overlayX - 10)
                : min(maxX, overlayX + overlayWidth + 10),
            y: min(max(18, overlayY + 42), maxY)
        )
        let elbowX: CGFloat
        if attachesOnLeadingEdge {
            elbowX = max(anchor.x + 18, cardAttach.x - 52)
        } else {
            elbowX = min(anchor.x - 18, cardAttach.x + 52)
        }
        let elbow = CGPoint(
            x: min(max(18, elbowX), maxX),
            y: cardAttach.y
        )
        return (anchor, elbow, cardAttach)
    }

    private func focusedPageDiffConnector(
        anchor: CGPoint,
        elbow: CGPoint,
        cardAttach: CGPoint
    ) -> some View {
        ZStack {
            Path { path in
                path.move(to: anchor)
                path.addLine(to: CGPoint(x: elbow.x, y: anchor.y))
                path.addLine(to: elbow)
                path.addLine(to: cardAttach)
            }
            .stroke(
                Color.herStudioActiveStroke.opacity(0.34),
                style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round)
            )

            Circle()
                .fill(Color.herStudioActiveFill.opacity(0.92))
                .frame(width: 8, height: 8)
                .position(anchor)

            Circle()
                .fill(Color.herStudioActiveStroke.opacity(0.82))
                .frame(width: 6, height: 6)
                .position(cardAttach)
        }
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private var focusedPageDiffAnchoredOverlay: some View {
        if isFocusedPageDiffOverlayPresented, focusedPageDiffExchange != nil {
            GeometryReader { _ in
                let snapshot = liveDraftBridge.anchoredTextRectSnapshot
                let overlayWidth = focusedPageDiffOverlayWidth(for: snapshot)
                let overlayX = focusedPageDiffOverlayX(for: snapshot)
                let overlayY = focusedPageDiffOverlayY(for: snapshot)
                let connector = focusedPageDiffConnectorLayout(
                    for: snapshot,
                    overlayWidth: overlayWidth,
                    overlayX: overlayX,
                    overlayY: overlayY
                )

                ZStack(alignment: .topLeading) {
                    if let connector {
                        focusedPageDiffConnector(
                            anchor: connector.anchor,
                            elbow: connector.elbow,
                            cardAttach: connector.cardAttach
                        )
                    }

                    focusedPageDiffInlineCard
                        .frame(width: overlayWidth, alignment: .leading)
                        .offset(x: overlayX, y: overlayY)
                }
            }
        }
    }

    @ViewBuilder
    private var focusedPageDiffInlineCard: some View {
        if let exchange = focusedPageDiffExchange,
           let comparison = fullThreadDraftComparison(for: exchange),
           comparison.state == .revisedInDraft,
           !comparison.currentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let isDiffAccepted = isDiffAcknowledged(for: exchange)
            let isReopened = isDiffReopened(for: exchange)
            let resolvedAnchor = focusedPageDiffAnchor(for: exchange)
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("BLOCK")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(Color.herText.opacity(0.46))
                    Text(resolvedAnchor?.sceneLabel?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                         ? resolvedAnchor!.sceneLabel!
                         : (comparison.sceneLabel ?? "Current block"))
                        .font(.system(size: 10, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                    if let resolvedAnchor {
                        Text("Lines \(resolvedAnchor.startLine)-\(resolvedAnchor.endLine)")
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundStyle(Color.herText.opacity(0.58))
                    }
                }
                .frame(width: 112, alignment: .topLeading)
                .padding(.vertical, 2)
                .overlay(alignment: .trailing) {
                    Rectangle()
                        .fill(Color.herStudioActiveStroke.opacity(0.24))
                        .frame(width: 1)
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Text("Open Diff")
                            .font(.system(size: 11, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.80))
                        studioTargetBadge(.page, prefix: "On", compact: true)
                        if isReopened {
                            Text("Reopened")
                                .font(.system(size: 10, weight: .semibold, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.78))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.orange.opacity(0.18))
                                .clipShape(Capsule())
                                .accessibilityIdentifier("studio.page-diff.reopened")
                        }
                        Spacer(minLength: 0)
                        Button {
                            hideFocusedPageDiffOverlay()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .bold, design: .default))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.herText.opacity(0.58))
                    }

                    if isDiffAccepted {
                        Text("Current draft version kept for this write.")
                            .font(.system(size: 11, weight: .medium, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.64))
                    } else if isReopened {
                        Text("This diff reopened because the kept draft block changed again.")
                            .font(.system(size: 11, weight: .medium, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.70))
                    }

                    HStack(alignment: .top, spacing: 10) {
                        fullThreadDiffColumn(
                            title: "Original write",
                            text: exactInsertedText(for: exchange),
                            usesPaperTone: true
                        )
                        fullThreadDiffColumn(
                            title: "Current draft version",
                            text: comparison.currentText,
                            usesPaperTone: false
                        )
                    }

                    HStack(spacing: 8) {
                        if !isDiffAccepted {
                            inlineWritePresetButton("Restore Original", systemImage: "arrow.uturn.backward") {
                                restoreOriginalWrite(from: exchange)
                            }
                            .accessibilityIdentifier("studio.page-diff.restore-original")
                            inlineWritePresetButton("Keep Current", systemImage: "checkmark") {
                                acknowledgeCurrentDraftVersion(for: exchange)
                            }
                            .accessibilityIdentifier("studio.page-diff.keep-current")
                            inlineWritePresetButton("Rewrite From Diff", systemImage: "wand.and.stars") {
                                rewriteFromDiff(for: exchange)
                            }
                            .accessibilityIdentifier("studio.page-diff.rewrite-from-diff")
                        }

                        Button {
                            highlightStudioExchangeFromCommittedWrite(exchange)
                        } label: {
                            Label("Back to Thread", systemImage: "arrowshape.turn.up.left")
                                .font(.system(size: 11, weight: .semibold, design: .default))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.herText.opacity(0.72))

                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .frame(maxWidth: 520, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.herPaper.opacity(0.98))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.herStudioActiveStroke.opacity(0.30), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.10), radius: 16, y: 8)
        }
    }













    private var voicePinTurns: [VoicePinTurn] {
        studioAskNoteHistory
            .compactMap(voicePinTurn(from:))
            .sorted { $0.timestamp < $1.timestamp }
    }

    private var companionVoicePinEntries: [StudioAskNoteExchange] {
        studioAskNoteHistory
            .filter { exchange in
                guard exchange.target == .voicePin else { return false }
                let domain = resolvedMemoryDomain(for: exchange)
                return domain == .companion || domain == .mixed
            }
            .sorted { $0.timestamp > $1.timestamp }
    }


    private func voicePinTurn(from exchange: StudioAskNoteExchange) -> VoicePinTurn? {
        guard exchange.target == .voicePin else { return nil }
        let output = resolvedVoicePinOutput(for: exchange)
        guard !output.isEmpty else { return nil }
        return VoicePinTurn(
            id: exchange.id,
            exchangeID: exchange.id,
            userAskLabel: exchange.prompt,
            fountainOutput: output,
            source: exchange.source == .voice ? .voice : .typed,
            packLabel: exchange.packLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            phase: exchange.phase?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            timestamp: exchange.timestamp,
            lineRef: exchange.sluglineAnchorLine ?? exchange.anchorLine
        )
    }

    private func resolvedVoicePinOutput(for exchange: StudioAskNoteExchange) -> String {
        ScreenplayStudioCreativePartnerPresentationPlanner.resolvedVoicePinOutput(
            insertedText: exchange.insertedText,
            revisedBlockText: exchange.revisedBlockText,
            resolvedAnchorExcerpt: exchange.resolvedAnchorExcerpt,
            developmentText: exchange.developmentText,
            noteBody: exchange.noteBody
        )
    }

    private func studioAskNoteExchange(for turn: VoicePinTurn) -> StudioAskNoteExchange? {
        studioAskNoteHistory.first(where: { $0.id == turn.exchangeID })
    }

    private func canApplyExchangeToOutline(_ exchange: StudioAskNoteExchange) -> Bool {
        guard exchange.target == .voicePin else { return false }
        let importText = outlineImportSourceText(for: exchange)
        guard !importText.isEmpty else { return false }
        let director = HerDirectorContext.build(from: HerEvolutionStore.shared, userText: exchange.prompt)
        return director.isSynopsisFocused || director.isOutlineFocused || director.isAskingForStoryHelp
    }

    private func outlineImportSourceText(for exchange: StudioAskNoteExchange) -> String {
        let candidates = [
            exchange.developmentText,
            exchange.noteBody
        ]
        for candidate in candidates {
            let clean = candidate?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !clean.isEmpty {
                return clean
            }
        }
        return ""
    }

    private func applyExchangeToOutline(_ exchange: StudioAskNoteExchange) {
        let importText = outlineImportSourceText(for: exchange)
        guard !importText.isEmpty else {
            vm.infoText = "That note does not have enough development text to import."
            return
        }
        Task {
            let applied = await vm.applyDevelopmentReplyToOutline(
                prompt: exchange.prompt,
                reply: importText
            )
            guard applied else { return }
            await MainActor.run {
                directionOneRightPanelTab = .outline
                withAnimation(.easeInOut(duration: 0.20)) {
                    isDirectionOneRightRailExpanded = true
                }
            }
        }
    }






    private var filteredFullStudioThreadEntries: [StudioAskNoteExchange] {
        let query = fullStudioThreadSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return studioAskNoteHistory.filter { exchange in
            guard matchesFullThreadFilter(exchange) else { return false }
            guard !query.isEmpty else { return true }
            return [
                exchange.prompt,
                exchange.noteTitle,
                exchange.noteBody,
                exchange.anchorSceneLabel ?? "",
                exactInsertedText(for: exchange)
            ]
            .joined(separator: "\n")
            .lowercased()
            .contains(query)
        }
    }

    private var groupedFullStudioThreadSections: [FullThreadSection] {
        let filtered = filteredFullStudioThreadEntries
        guard !filtered.isEmpty else { return [] }

        var orderedTitles: [String] = []
        var buckets: [String: [StudioAskNoteExchange]] = [:]

        for exchange in filtered {
            let title = sceneLabelForThreadExchange(exchange)
                ?? (exchange.target == .page ? "Page Writes" : "Voice Pin")
            if buckets[title] == nil {
                orderedTitles.append(title)
            }
            buckets[title, default: []].append(exchange)
        }

        return orderedTitles.map { title in
            FullThreadSection(
                key: fullThreadSectionKey(for: title),
                title: title,
                entries: buckets[title] ?? []
            )
        }
    }

    private var currentFullThreadSceneKey: String {
        if let active = activeDraftSceneNavigatorItem {
            return normalizedSceneNavigatorKey(active.label)
        }
        if let currentScene = currentSceneInspectorSelection {
            return sceneInspectorKey(for: currentScene)
        }
        return ""
    }

    private func sceneLabelForThreadExchange(_ exchange: StudioAskNoteExchange) -> String? {
        if let sceneLabel = exchange.anchorSceneLabel,
           !sceneLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return sceneLabel
        }
        if let stored = storedStudioWriteAnchor(for: exchange, key: activeStudioAskNoteHistoryKey),
           let sceneLabel = stored.anchorSceneLabel,
           !sceneLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return sceneLabel
        }
        return nil
    }

    private func sceneKeyForThreadExchange(_ exchange: StudioAskNoteExchange) -> String {
        normalizedSceneNavigatorKey(sceneLabelForThreadExchange(exchange) ?? "")
    }

    private var availableFullThreadScenes: [FullThreadSceneOption] {
        var order: [String] = []
        var labels: [String: String] = [:]
        var counts: [String: Int] = [:]
        let currentKey = currentFullThreadSceneKey

        for exchange in studioAskNoteHistory {
            let key = sceneKeyForThreadExchange(exchange)
            guard !key.isEmpty else { continue }
            if labels[key] == nil {
                labels[key] = sceneLabelForThreadExchange(exchange) ?? key
                order.append(key)
            }
            counts[key, default: 0] += 1
        }

        return order.map { key in
            FullThreadSceneOption(
                key: key,
                label: labels[key] ?? key,
                count: counts[key, default: 0],
                isCurrent: key == currentKey
            )
        }
    }

    private func matchesFullThreadFilter(_ exchange: StudioAskNoteExchange) -> Bool {
        let matchesBaseFilter: Bool
        switch selectedFullThreadFilter {
        case .all:
            matchesBaseFilter = true
        case .pageWrites:
            matchesBaseFilter = exchange.target == .page
        case .voicePin:
            matchesBaseFilter = exchange.target == .voicePin
        case .companion:
            let memoryDomain = resolvedMemoryDomain(for: exchange)
            matchesBaseFilter = exchange.target == .voicePin && (memoryDomain == .companion || memoryDomain == .mixed)
        case .currentScene:
            let sceneKey = currentFullThreadSceneKey
            guard !sceneKey.isEmpty else { return false }
            matchesBaseFilter = sceneKeyForThreadExchange(exchange) == sceneKey
        }

        guard matchesBaseFilter else { return false }
        let scopedSceneKey = normalizedSceneNavigatorKey(selectedFullThreadSceneKey)
        guard !scopedSceneKey.isEmpty, selectedFullThreadFilter != .currentScene else {
            return true
        }
        return sceneKeyForThreadExchange(exchange) == scopedSceneKey
    }

    private func exactInsertedText(for exchange: StudioAskNoteExchange) -> String {
        let local = exchange.insertedText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !local.isEmpty {
            return local
        }
        let stored = storedStudioWriteAnchor(for: exchange, key: activeStudioAskNoteHistoryKey)?.insertedText?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !stored.isEmpty {
            return stored
        }
        return ""
    }

    private func draftTextForLines(startLine: Int, endLine: Int, in draft: String) -> String {
        let lines = draft.components(separatedBy: .newlines)
        guard !lines.isEmpty else { return "" }
        let safeStart = max(1, min(startLine, lines.count))
        let safeEnd = max(safeStart, min(endLine, lines.count))
        return Array(lines[(safeStart - 1)...(safeEnd - 1)])
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func fullThreadDraftComparison(for exchange: StudioAskNoteExchange) -> FullThreadDraftComparison? {
        guard exchange.target == .page else { return nil }
        let insertedText = exactInsertedText(for: exchange).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !insertedText.isEmpty else { return nil }

        let draft = vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.isEmpty else {
            return FullThreadDraftComparison(
                state: .removedFromDraft,
                currentText: "",
                sceneLabel: exchange.anchorSceneLabel
            )
        }

        let normalizedInserted = normalizedAnchorExcerpt(insertedText)

        guard let resolved = resolvedAnchorSnapshot(for: exchange, in: draft) else {
            if !normalizedInserted.isEmpty,
               normalizedAnchorExcerpt(draft).contains(normalizedInserted) {
                return FullThreadDraftComparison(
                    state: .matchesCurrentDraft,
                    currentText: insertedText,
                    sceneLabel: exchange.anchorSceneLabel
                )
            }
            return FullThreadDraftComparison(
                state: .removedFromDraft,
                currentText: "",
                sceneLabel: exchange.anchorSceneLabel
            )
        }

        let currentText = draftTextForLines(startLine: resolved.startLine, endLine: resolved.endLine, in: draft)
        let normalizedCurrent = normalizedAnchorExcerpt(currentText)
        if normalizedCurrent.isEmpty {
            return FullThreadDraftComparison(
                state: .removedFromDraft,
                currentText: "",
                sceneLabel: resolved.sceneLabel
            )
        }
        if !normalizedInserted.isEmpty,
           normalizedCurrent == normalizedInserted {
            return FullThreadDraftComparison(
                state: .matchesCurrentDraft,
                currentText: currentText,
                sceneLabel: resolved.sceneLabel
            )
        }
        return FullThreadDraftComparison(
            state: .revisedInDraft,
            currentText: currentText,
            sceneLabel: resolved.sceneLabel
        )
    }

    private func diffAcknowledgementFingerprint(for text: String) -> String {
        normalizedAnchorExcerpt(text)
    }

    private func normalizedAcknowledgedStudioDiffStorageKey(
        _ key: String,
        entries: [StudioAskNoteExchange]? = nil
    ) -> String {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedKey.isEmpty else { return "" }
        guard !normalizedKey.hasPrefix("lineage:") else { return normalizedKey }

        let sourceEntries = entries ?? studioAskNoteHistory
        if let matchedExchange = sourceEntries.first(where: {
            studioExchangePersistentActionKey($0) == normalizedKey
        }) {
            return studioExchangeLineageKey(matchedExchange, entries: sourceEntries)
        }

        if normalizedKey.hasPrefix("write:") {
            let writeID = normalizedWriteID(String(normalizedKey.dropFirst("write:".count)))
            if !writeID.isEmpty,
               let matchedExchange = sourceEntries.first(where: {
                   normalizedWriteID($0.writeID) == writeID
               }) {
                return studioExchangeLineageKey(matchedExchange, entries: sourceEntries)
            }
        }

        if normalizedKey.hasPrefix("thread:") {
            let backendThreadID = normalizedBackendThreadID(String(normalizedKey.dropFirst("thread:".count)))
            if !backendThreadID.isEmpty,
               let matchedExchange = sourceEntries.first(where: {
                   normalizedBackendThreadID($0.backendThreadID) == backendThreadID
               }) {
                return studioExchangeLineageKey(matchedExchange, entries: sourceEntries)
            }
        }

        return StudioAcknowledgedDiffStorageSupport.normalizePersistentKey(normalizedKey)
    }

    private func currentAcknowledgedDiffFingerprint(for exchange: StudioAskNoteExchange) -> String? {
        guard let comparison = fullThreadDraftComparison(for: exchange),
              comparison.state == .revisedInDraft else {
            return nil
        }
        let fingerprint = diffAcknowledgementFingerprint(for: comparison.currentText)
        return fingerprint.isEmpty ? nil : fingerprint
    }

    private func currentAcknowledgedStudioDiffRecords() -> [String: String] {
        let validKeys = acknowledgedDiffExchangeKeys
        guard !validKeys.isEmpty else { return [:] }
        return validKeys.reduce(into: [String: String]()) { partialResult, key in
            let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(key)
            guard !normalizedKey.isEmpty else { return }
            partialResult[normalizedKey] = acknowledgedDiffFingerprints[normalizedKey]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
    }

    private func currentAcknowledgedStudioDiffWriteIDs() -> [String: String] {
        let validKeys = acknowledgedDiffExchangeKeys
        guard !validKeys.isEmpty else { return [:] }
        return validKeys.reduce(into: [String: String]()) { partialResult, key in
            let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(key)
            let writeID = normalizedWriteID(acknowledgedDiffWriteIDs[normalizedKey])
            guard !normalizedKey.isEmpty, !writeID.isEmpty else { return }
            partialResult[normalizedKey] = writeID
        }
    }

    private func migrateAcknowledgedStudioDiffStorageKeysIfNeeded(
        entries: [StudioAskNoteExchange]
    ) {
        guard !entries.isEmpty else { return }

        let sourceKeys = Set(acknowledgedDiffExchangeKeys)
            .union(acknowledgedDiffFingerprints.keys)
            .union(acknowledgedDiffWriteIDs.keys)
        let sourceReopenedKeys = reopenedDiffExchangeKeys

        var nextKeys: Set<String> = []
        var nextFingerprints: [String: String] = [:]
        var nextWriteIDs: [String: String] = [:]
        var nextReopenedKeys: Set<String> = []

        for key in sourceKeys {
            let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(key, entries: entries)
            guard !normalizedKey.isEmpty else { continue }
            if acknowledgedDiffExchangeKeys.contains(key) || acknowledgedDiffExchangeKeys.contains(normalizedKey) {
                nextKeys.insert(normalizedKey)
            }
            let fingerprint = acknowledgedDiffFingerprints[key]
                ?? acknowledgedDiffFingerprints[normalizedKey]
            if let fingerprint, !fingerprint.isEmpty {
                nextFingerprints[normalizedKey] = fingerprint
            }
            let writeID = acknowledgedDiffWriteIDs[key]
                ?? acknowledgedDiffWriteIDs[normalizedKey]
            let normalizedWrite = normalizedWriteID(writeID)
            if !normalizedWrite.isEmpty {
                nextWriteIDs[normalizedKey] = normalizedWrite
            }
        }

        for key in sourceReopenedKeys {
            let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(key, entries: entries)
            guard !normalizedKey.isEmpty else { continue }
            nextReopenedKeys.insert(normalizedKey)
        }

        if nextKeys != acknowledgedDiffExchangeKeys {
            acknowledgedDiffExchangeKeys = nextKeys
        }
        if nextFingerprints != acknowledgedDiffFingerprints {
            acknowledgedDiffFingerprints = nextFingerprints
        }
        if nextWriteIDs != acknowledgedDiffWriteIDs {
            acknowledgedDiffWriteIDs = nextWriteIDs
        }
        if nextReopenedKeys != reopenedDiffExchangeKeys {
            reopenedDiffExchangeKeys = nextReopenedKeys
        }
    }

    private func latestRevisedDiffExchangeByLineage(
        in entries: [StudioAskNoteExchange]
    ) -> [String: StudioAskNoteExchange] {
        var result: [String: StudioAskNoteExchange] = [:]
        for exchange in entries {
            guard let comparison = fullThreadDraftComparison(for: exchange),
                  comparison.state == .revisedInDraft else {
                continue
            }
            let lineageKey = studioExchangeLineageKey(exchange, entries: entries)
            if result[lineageKey] == nil {
                result[lineageKey] = exchange
            }
        }
        return result
    }

    private func latestPageExchangeByLineage(
        in entries: [StudioAskNoteExchange]
    ) -> [String: StudioAskNoteExchange] {
        var result: [String: StudioAskNoteExchange] = [:]
        for exchange in entries where exchange.target == .page {
            let lineageKey = studioExchangeLineageKey(exchange, entries: entries)
            if result[lineageKey] == nil {
                result[lineageKey] = exchange
            }
        }
        return result
    }

    private func preferredRevisedDiffExchange(
        in entries: [StudioAskNoteExchange]
    ) -> StudioAskNoteExchange? {
        let revisedEntries = entries.filter { exchange in
            fullThreadDraftComparison(for: exchange)?.state == .revisedInDraft
        }
        guard !revisedEntries.isEmpty else { return nil }

        if let latestPageExchange = entries.first(where: { $0.target == .page }) {
            let latestLineageKey = studioExchangeLineageKey(latestPageExchange, entries: entries)
            let latestWriteID = normalizedWriteID(latestPageExchange.writeID)
            let lineageRevisedEntries = revisedEntries.filter {
                studioExchangeLineageKey($0, entries: entries) == latestLineageKey
            }
            if let predecessor = lineageRevisedEntries.first(where: {
                normalizedWriteID($0.writeID) != latestWriteID
            }) {
                return predecessor
            }
            if let lineageMatch = lineageRevisedEntries.first {
                return lineageMatch
            }
        }

        return revisedEntries.first
    }

    private func syncPreferredFocusedRevisedDiffIfNeeded() {
        let latestPageExchange = studioAskNoteHistory.first(where: { $0.target == .page })
        let latestPageReplacementApplied = latestPageExchange?.replacementApplied == true
        if (isPageCommitNoticeVisible || isLastCommittedWriteActionVisible) && !latestPageReplacementApplied {
            return
        }
        let currentFocusedRevisedExchange = focusedPageDiffExchange.flatMap { exchange in
            fullThreadDraftComparison(for: exchange)?.state == .revisedInDraft ? exchange : nil
        }
        guard let preferred = preferredRevisedDiffExchange(in: studioAskNoteHistory) else {
            return
        }
        let shouldUpdateFocus: Bool
        if let latestPageExchange, latestPageExchange.replacementApplied == true {
            let focusedLineage = currentFocusedRevisedExchange.map { studioExchangeLineageKey($0) } ?? ""
            let preferredLineage = studioExchangeLineageKey(preferred)
            shouldUpdateFocus = focusedPageDiffExchangeID == nil
                || focusedLineage != preferredLineage
                || focusedPageDiffExchangeID != preferred.id
        } else if currentFocusedRevisedExchange != nil {
            shouldUpdateFocus = false
        } else {
            shouldUpdateFocus = true
        }

        guard shouldUpdateFocus else { return }
        focusedPageDiffExchangeID = preferred.id
        focusedPageDiffPersistentKey = studioExchangePersistentActionKey(preferred)
        isFocusedPageDiffOverlayPresented = false
        highlightedStudioExchangeID = preferred.id
    }

    private func latestAcknowledgedDiffRecord(
        revisedExchangesByLineage: [String: StudioAskNoteExchange]
    ) -> (
        lineageKey: String,
        exchange: StudioAskNoteExchange?,
        acknowledgedWriteID: String,
        acknowledgedFingerprint: String
    )? {
        let sortedKeys = acknowledgedDiffExchangeKeys.sorted()
        guard !sortedKeys.isEmpty else { return nil }
        if let exchange = studioAskNoteHistory.first(where: { acknowledgedDiffExchangeKeys.contains(studioExchangeLineageKey($0)) }) {
            let lineageKey = studioExchangeLineageKey(exchange)
            return (
                lineageKey,
                revisedExchangesByLineage[lineageKey],
                normalizedWriteID(acknowledgedDiffWriteIDs[lineageKey]),
                acknowledgedDiffFingerprints[lineageKey]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            )
        }
        guard let lineageKey = sortedKeys.first else { return nil }
        return (
            lineageKey,
            revisedExchangesByLineage[lineageKey],
            normalizedWriteID(acknowledgedDiffWriteIDs[lineageKey]),
            acknowledgedDiffFingerprints[lineageKey]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        )
    }

    private func isDiffReopened(for exchange: StudioAskNoteExchange) -> Bool {
        reopenedDiffExchangeKeys.contains(studioExchangeLineageKey(exchange))
    }

    private func refreshAcknowledgedDiffState() {
        let trackedAcknowledgedLineageKeys = Set(acknowledgedDiffExchangeKeys)
            .union(acknowledgedDiffFingerprints.keys)
            .union(acknowledgedDiffWriteIDs.keys)
        let trackedLineageKeys = trackedAcknowledgedLineageKeys
            .union(reopenedDiffExchangeKeys)
        guard !trackedLineageKeys.isEmpty else {
            if !acknowledgedDiffExchangeKeys.isEmpty {
                acknowledgedDiffExchangeKeys = []
            }
            if !acknowledgedDiffFingerprints.isEmpty {
                acknowledgedDiffFingerprints = [:]
            }
            if !acknowledgedDiffWriteIDs.isEmpty {
                acknowledgedDiffWriteIDs = [:]
            }
            return
        }
        guard !studioAskNoteHistory.isEmpty else { return }

        let revisedExchangesByLineage = latestRevisedDiffExchangeByLineage(in: studioAskNoteHistory)
        let latestPageExchangesByLineage = latestPageExchangeByLineage(in: studioAskNoteHistory)
        if isAwaitingInitialAcknowledgedDiffHydration {
            let historyKey = activeStudioAskNoteHistoryKey
            let hasDraftHydrated = !vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            let hasTrackedPageLineage = trackedLineageKeys.contains { latestPageExchangesByLineage[$0] != nil }
            let hasLoadedProjectMetadata =
                screenplayProjectIdFromHistoryKey(historyKey) == nil
                || hasLoadedProjectMetadataForThreadViewKey(historyKey)
            if !hasDraftHydrated || !hasTrackedPageLineage || !hasLoadedProjectMetadata {
                publishDebugStudioDiffState()
                return
            }

            let restoredAcknowledgements = restoredAcknowledgedStudioDiffRecords(for: historyKey)
            let restoredWriteIDs = restoredAcknowledgedStudioDiffWriteIDs(for: historyKey)
            let restoredKeys = Set(restoredAcknowledgements.keys)

            if !restoredAcknowledgements.isEmpty && restoredAcknowledgements != acknowledgedDiffFingerprints {
                acknowledgedDiffFingerprints = restoredAcknowledgements
            }
            if !restoredKeys.isEmpty && restoredKeys != acknowledgedDiffExchangeKeys {
                acknowledgedDiffExchangeKeys = restoredKeys
            }
            if !restoredWriteIDs.isEmpty && restoredWriteIDs != acknowledgedDiffWriteIDs {
                acknowledgedDiffWriteIDs = restoredWriteIDs
            }

            isAwaitingInitialAcknowledgedDiffHydration = false
        }
        if isRestoringReopenedDiffState,
           !reopenedDiffExchangeKeys.isEmpty,
           revisedExchangesByLineage.isEmpty {
            publishDebugStudioDiffState()
            return
        }

        var nextRecords: [String: String] = [:]
        var nextWriteIDs: [String: String] = [:]
        var expiredKeys: Set<String> = []
        for key in trackedAcknowledgedLineageKeys {
            guard let exchange = revisedExchangesByLineage[key],
                  let currentFingerprint = currentAcknowledgedDiffFingerprint(for: exchange) else {
                continue
            }
            let storedFingerprint = acknowledgedDiffFingerprints[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let storedWriteID = normalizedWriteID(acknowledgedDiffWriteIDs[key])
            let latestLineageWriteID = normalizedWriteID(latestPageExchangesByLineage[key]?.writeID)
            let hasNewerCurrentWriteInLineage =
                !storedWriteID.isEmpty &&
                !latestLineageWriteID.isEmpty &&
                storedWriteID != latestLineageWriteID
            let fingerprintStillMatches = storedFingerprint.isEmpty || storedFingerprint == currentFingerprint
            if !hasNewerCurrentWriteInLineage && fingerprintStillMatches {
                nextRecords[key] = currentFingerprint
                if !latestLineageWriteID.isEmpty {
                    nextWriteIDs[key] = latestLineageWriteID
                } else if !storedWriteID.isEmpty {
                    nextWriteIDs[key] = storedWriteID
                }
            } else {
                expiredKeys.insert(key)
            }
        }

        let nextKeys = Set(nextRecords.keys)
        let revisedKeys = Set(revisedExchangesByLineage.keys)
        let nextReopened = reopenedDiffExchangeKeys
            .subtracting(nextKeys)
            .union(expiredKeys)
            .intersection(revisedKeys)
        if nextKeys != acknowledgedDiffExchangeKeys {
            acknowledgedDiffExchangeKeys = nextKeys
        }
        if nextRecords != acknowledgedDiffFingerprints {
            acknowledgedDiffFingerprints = nextRecords
        }
        if nextWriteIDs != acknowledgedDiffWriteIDs {
            acknowledgedDiffWriteIDs = nextWriteIDs
        }
        if nextReopened != reopenedDiffExchangeKeys {
            reopenedDiffExchangeKeys = nextReopened
        }
        if isRestoringReopenedDiffState, !revisedKeys.isEmpty {
            isRestoringReopenedDiffState = false
        }
        if !expiredKeys.isEmpty,
           let reopenedExchange = studioAskNoteHistory.first(where: {
               expiredKeys.contains(studioExchangeLineageKey($0))
               && fullThreadDraftComparison(for: $0)?.state == .revisedInDraft
           }) {
            highlightedStudioExchangeID = reopenedExchange.id
            if focusedPageDiffExchangeID == nil || focusedPageDiffExchangeID == reopenedExchange.id {
                focusedPageDiffExchangeID = reopenedExchange.id
            }
            isFocusedPageDiffOverlayPresented = false
            vm.infoText = expiredKeys.count == 1
                ? "A kept diff changed again and reopened. Review it from the page chip or thread."
                : "\(expiredKeys.count) kept diffs changed again and reopened. Review them from the page chip or thread."
        }
        publishDebugStudioDiffState()
    }

    private func isDiffAcknowledged(for exchange: StudioAskNoteExchange) -> Bool {
        let key = studioExchangeLineageKey(exchange)
        guard acknowledgedDiffExchangeKeys.contains(key) else { return false }
        guard let currentFingerprint = currentAcknowledgedDiffFingerprint(for: exchange) else { return false }
        let storedFingerprint = acknowledgedDiffFingerprints[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let storedWriteID = normalizedWriteID(acknowledgedDiffWriteIDs[key])
        let currentWriteID = normalizedWriteID(exchange.writeID)
        guard storedWriteID.isEmpty || currentWriteID.isEmpty || storedWriteID == currentWriteID else {
            return false
        }
        return storedFingerprint.isEmpty || storedFingerprint == currentFingerprint
    }

    private func acknowledgeCurrentDraftVersion(for exchange: StudioAskNoteExchange) {
        let key = studioExchangeLineageKey(exchange)
        acknowledgedDiffExchangeKeys.insert(key)
        if let currentFingerprint = currentAcknowledgedDiffFingerprint(for: exchange) {
            acknowledgedDiffFingerprints[key] = currentFingerprint
        }
        let latestCurrentWriteID = normalizedWriteID(
            latestPageExchangeByLineage(in: studioAskNoteHistory)[key]?.writeID
        )
        let currentWriteID = latestCurrentWriteID.isEmpty
            ? normalizedWriteID(exchange.writeID)
            : latestCurrentWriteID
        if !currentWriteID.isEmpty {
            acknowledgedDiffWriteIDs[key] = currentWriteID
        } else {
            acknowledgedDiffWriteIDs.removeValue(forKey: key)
        }
        reopenedDiffExchangeKeys.remove(key)
        highlightedStudioExchangeID = exchange.id
        vm.infoText = "Keeping the current draft version for this write."
        publishDebugStudioDiffState()
    }

    private func openStudioDiffOnPage(_ exchange: StudioAskNoteExchange) {
        presentFocusedPageDiffOverlay(for: exchange)
        jumpToStudioExchangeAnchor(exchange)
        liveDraftBridge.requestEditorFocus()
        highlightedStudioExchangeID = exchange.id
        studioThreadListFocused = false
        showingFullStudioThread = false
        vm.infoText = "Opened this revised write on the page."
    }

    private func restoreOriginalWrite(from exchange: StudioAskNoteExchange) {
        let original = exactInsertedText(for: exchange).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !original.isEmpty else { return }
        let comparison = fullThreadDraftComparison(for: exchange)
        let currentText = comparison?.currentText.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        prepareReplacementTarget(
            for: exchange,
            currentText: currentText.isEmpty ? original : currentText
        )
        let seed = """
Replace the current draft version of this section with the original page write below.

\(screenplayReplacementScopeInstruction(for: currentText.isEmpty ? original : currentText))

Return screenplay lines only.

Original page write:
\(original)

Current draft version:
\(currentText.isEmpty ? original : currentText)
"""
        submitStudioPromptText(
            seed,
            displayText: "Restore original page write",
            source: .typed,
            routingMode: .page,
            successMessage: "Asked io.them to restore the original page write.",
            clearSeedOnSuccess: false,
            sendingSuggestionID: nil
        )
    }

    private func rewriteFromDiff(for exchange: StudioAskNoteExchange) {
        let original = exactInsertedText(for: exchange).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !original.isEmpty else { return }
        let comparison = fullThreadDraftComparison(for: exchange)
        let currentText = comparison?.currentText.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        prepareReplacementTarget(
            for: exchange,
            currentText: currentText.isEmpty ? original : currentText
        )
        let seed = """
Rewrite this section for the current draft.

Keep the strongest dramatic intent from both versions, resolve the weaknesses between them, and return screenplay lines only.

\(screenplayReplacementScopeInstruction(for: currentText.isEmpty ? original : currentText))

Original page write:
\(original)

Current draft version:
\(currentText.isEmpty ? original : currentText)
"""
        submitStudioPromptText(
            seed,
            displayText: "Rewrite from diff",
            source: .typed,
            routingMode: .page,
            successMessage: "Asked io.them to rewrite the section from the diff.",
            clearSeedOnSuccess: false,
            sendingSuggestionID: nil
        )
    }

    private func prepareReplacementTarget(for committedWrite: ScreenplayCommittedWrite) {
        liveDraftBridge.prepareNextPageWriteReplacement(
            sourceWriteID: committedWrite.writeID,
            startLine: committedWrite.startLine,
            endLine: committedWrite.endLine,
            currentText: committedWrite.insertedText
        )
    }

    private func prepareReplacementTarget(for selection: ScreenplayEditorSelectionSnapshot) {
        let currentText = selection.trimmedText
        guard !currentText.isEmpty else {
            liveDraftBridge.clearPendingPageWriteReplacement()
            return
        }
        liveDraftBridge.prepareNextPageWriteReplacement(
            sourceWriteID: "selection:\(selection.startLine)-\(selection.endLine)",
            startLine: selection.startLine,
            endLine: selection.endLine,
            currentText: currentText
        )
        liveDraftBridge.highlightLineRange(startLine: selection.startLine, endLine: selection.endLine)
        liveDraftBridge.requestEditorFocus()
    }

    private func prepareReplacementTarget(for exchange: StudioAskNoteExchange, currentText: String) {
        let cleanCurrentText = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCurrentText.isEmpty else {
            liveDraftBridge.clearPendingPageWriteReplacement()
            return
        }
        guard let resolved = resolvedAnchorSnapshot(for: exchange, in: vm.fountainDraft) ?? fallbackAnchorSnapshot(for: exchange) else {
            liveDraftBridge.clearPendingPageWriteReplacement()
            return
        }
        liveDraftBridge.prepareNextPageWriteReplacement(
            sourceWriteID: exchange.writeID ?? "",
            startLine: resolved.startLine,
            endLine: resolved.endLine,
            currentText: cleanCurrentText
        )
    }

    private func screenplayReplacementScopeInstruction(for text: String) -> String {
        screenplayBlockIncludesSceneHeading(text)
            ? "Keep the rewrite scoped to this exact block. Only include the scene heading if it is already part of the block."
            : "Keep the rewrite scoped to this exact block. Do not add the scene heading or surrounding scene text."
    }

    private func screenplayBlockIncludesSceneHeading(_ text: String) -> Bool {
        text
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }
            .contains { line in
                !line.isEmpty &&
                (line.hasPrefix("INT.") || line.hasPrefix("EXT.") || line.hasPrefix("INT/EXT.") || line.hasPrefix("I/E."))
            }
    }

    private func fullThreadDraftComparisonTitle(_ comparison: FullThreadDraftComparison) -> String {
        switch comparison.state {
        case .matchesCurrentDraft:
            return "Still on page"
        case .revisedInDraft:
            return "Revised since write"
        case .removedFromDraft:
            return "No longer in draft"
        }
    }

    private func fullThreadDraftComparisonFill(_ comparison: FullThreadDraftComparison) -> Color {
        switch comparison.state {
        case .matchesCurrentDraft:
            return Color.herStudioActiveFill.opacity(0.92)
        case .revisedInDraft:
            return Color.herShellPanelSoft.opacity(0.92)
        case .removedFromDraft:
            return Color.herStudioAccentSoft.opacity(0.92)
        }
    }

    private func fullThreadDiffColumn(
        title: String,
        text: String,
        usesPaperTone: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.60))
            ScrollView {
                Text(text)
                    .font(.system(size: 11, weight: .regular, design: .monospaced))
                    .foregroundStyle(Color.herText.opacity(0.78))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(maxHeight: 140)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(usesPaperTone ? Color.herPaper.opacity(0.92) : Color.herShellPanel.opacity(0.74))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(
                    usesPaperTone
                        ? Color.herStudioActiveStroke.opacity(0.34)
                        : Color.herShellStroke.opacity(0.16),
                    lineWidth: 1
                )
        )
    }

    private func fullThreadSectionSummaryItems(_ section: FullThreadSection) -> [String] {
        let asks = section.entries.count
        let pageWrites = section.entries.filter { $0.target == .page }.count
        var items: [String] = ["\(asks) ask\(asks == 1 ? "" : "s")"]
        if pageWrites > 0 {
            items.append("\(pageWrites) page write\(pageWrites == 1 ? "" : "s")")
        }
        if let latestPage = section.entries.first(where: { $0.target == .page }),
           let comparison = fullThreadDraftComparison(for: latestPage) {
            switch comparison.state {
            case .matchesCurrentDraft:
                items.append("latest write still on page")
            case .revisedInDraft:
                items.append("latest write revised")
            case .removedFromDraft:
                items.append("latest write removed")
            }
        }
        return items
    }

    private func fullThreadSectionSummaryRow(_ section: FullThreadSection) -> some View {
        HStack(spacing: 8) {
            ForEach(fullThreadSectionSummaryItems(section), id: \.self) { item in
                Text(item)
                    .font(.system(size: 10, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.66))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.herShellPanelSoft.opacity(0.78))
                    .clipShape(Capsule())
            }
        }
    }

    private func fullThreadRevisionTimelineItems(_ section: FullThreadSection) -> [FullThreadRevisionTimelineItem] {
        section.entries
            .filter { $0.target == .page }
            .sorted(by: { $0.timestamp < $1.timestamp })
            .map { exchange in
                let comparison = fullThreadDraftComparison(for: exchange)
                let isAccepted = isDiffAcknowledged(for: exchange)
                let title: String
                let tint: Color
                switch comparison?.state {
                case .revisedInDraft:
                    if isAccepted {
                        title = "Kept"
                        tint = Color.blue.opacity(0.82)
                    } else {
                        title = "Revised"
                        tint = Color.orange.opacity(0.82)
                    }
                case .removedFromDraft:
                    title = "Removed"
                    tint = Color.red.opacity(0.78)
                case .matchesCurrentDraft, .none:
                    title = "Write"
                    tint = Color.green.opacity(0.82)
                }
                let lineLabel: String
                if let anchorLine = exchange.anchorLine {
                    let endLine = exchange.anchorEndLine ?? anchorLine
                    lineLabel = anchorLine == endLine ? "L\(anchorLine)" : "L\(anchorLine)-\(endLine)"
                } else {
                    lineLabel = relativeTimestamp(exchange.timestamp)
                }
                return FullThreadRevisionTimelineItem(
                    id: studioExchangePersistentActionKey(exchange),
                    exchange: exchange,
                    title: title,
                    subtitle: lineLabel,
                    tint: tint,
                    canOpenDiff: comparison?.state == .revisedInDraft && !isAccepted
                )
            }
    }

    private func jumpToRevisionTimelineItem(_ item: FullThreadRevisionTimelineItem) {
        highlightedStudioExchangeID = item.exchange.id
        fullThreadScrollTargetKey = persistentStudioThreadSelectionKey(for: item.exchange)
        jumpToStudioExchangeAnchor(item.exchange)
        showingFullStudioThread = false
    }

    private func reloadRevisionTimelineItem(_ item: FullThreadRevisionTimelineItem) {
        reloadStudioAskNoteExchange(item.exchange)
        showingFullStudioThread = false
    }

    private func openRevisionTimelineItemDiff(_ item: FullThreadRevisionTimelineItem) {
        guard item.canOpenDiff else { return }
        openStudioDiffOnPage(item.exchange)
    }

    private func revisionTimelineActionButton(
        _ systemImage: String,
        label: String,
        isEnabled: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.herText.opacity(isEnabled ? 0.72 : 0.34))
        .disabled(!isEnabled)
        .help(label)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private func fullThreadSectionRevisionTimeline(_ section: FullThreadSection) -> some View {
        let items = fullThreadRevisionTimelineItems(section)
        if !items.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 6) {
                                Button {
                                    highlightedStudioExchangeID = item.exchange.id
                                    fullThreadScrollTargetKey = persistentStudioThreadSelectionKey(for: item.exchange)
                                } label: {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.title)
                                            .font(.system(size: 10, weight: .semibold, design: .default))
                                            .foregroundStyle(Color.herText.opacity(0.82))
                                        Text(item.subtitle)
                                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                                            .foregroundStyle(Color.herText.opacity(0.56))
                                    }
                                    .frame(minWidth: 76, alignment: .leading)
                                }
                                .buttonStyle(.plain)

                                HStack(spacing: 4) {
                                    revisionTimelineActionButton(
                                        "arrow.turn.down.right",
                                        label: "Jump to page"
                                    ) {
                                        jumpToRevisionTimelineItem(item)
                                    }
                                    revisionTimelineActionButton(
                                        "rectangle.and.text.magnifyingglass",
                                        label: "Open diff on page",
                                        isEnabled: item.canOpenDiff
                                    ) {
                                        openRevisionTimelineItemDiff(item)
                                    }
                                    revisionTimelineActionButton(
                                        "arrow.clockwise",
                                        label: "Reload ask"
                                    ) {
                                        reloadRevisionTimelineItem(item)
                                    }
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(item.tint.opacity(0.12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(item.tint.opacity(0.28), lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                            if index < items.count - 1 {
                                Capsule()
                                    .fill(Color.herShellStroke.opacity(0.22))
                                    .frame(width: 18, height: 2)
                            }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func fullThreadSectionKey(for exchange: StudioAskNoteExchange) -> String {
        let title = sceneLabelForThreadExchange(exchange)
            ?? (exchange.target == .page ? "Page Writes" : "Voice Pin")
        return fullThreadSectionKey(for: title)
    }

    private func toggleFullThreadSection(_ section: FullThreadSection) {
        if collapsedFullThreadSectionKeys.contains(section.key) {
            collapsedFullThreadSectionKeys.remove(section.key)
        } else {
            collapsedFullThreadSectionKeys.insert(section.key)
        }
    }

    private func expandFullThreadSectionIfNeeded(for exchange: StudioAskNoteExchange) {
        collapsedFullThreadSectionKeys.remove(fullThreadSectionKey(for: exchange))
    }

    private func resolvedFullThreadScrollTargetID() -> UUID? {
        let normalizedTarget = fullThreadScrollTargetKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !normalizedTarget.isEmpty,
           let matched = filteredFullStudioThreadEntries.first(where: {
               persistentStudioThreadSelectionKey(for: $0) == normalizedTarget
           }) {
            return matched.id
        }
        return highlightedStudioExchangeID ?? filteredFullStudioThreadEntries.first?.id
    }

    private var fullThreadFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(FullThreadFilter.allCases) { filter in
                    let isActive = selectedFullThreadFilter == filter
                    Button(filter.title) {
                        selectedFullThreadFilter = filter
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(isActive ? 0.92 : 0.68))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .fill(isActive ? Color.herStudioActiveFill : Color.herShellPanelSoft.opacity(0.84))
                    )
                    .overlay(
                        Capsule()
                            .stroke(
                                isActive ? Color.herStudioActiveStroke : Color.herShellStroke.opacity(0.22),
                                lineWidth: isActive ? 1.2 : 1
                            )
                    )
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var fullThreadSceneBar: some View {
        let scenes = availableFullThreadScenes
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                let allActive = selectedFullThreadSceneKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && selectedFullThreadFilter != .currentScene
                Button("All Scenes") {
                    selectedFullThreadSceneKey = ""
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(allActive ? 0.92 : 0.68))
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(allActive ? Color.herStudioActiveFill : Color.herShellPanelSoft.opacity(0.84))
                )
                .overlay(
                    Capsule()
                        .stroke(
                            allActive ? Color.herStudioActiveStroke : Color.herShellStroke.opacity(0.22),
                            lineWidth: allActive ? 1.2 : 1
                        )
                )

                ForEach(scenes) { scene in
                    let isActive = normalizedSceneNavigatorKey(selectedFullThreadSceneKey) == scene.key
                    Button {
                        if selectedFullThreadFilter == .currentScene {
                            selectedFullThreadFilter = .all
                        }
                        selectedFullThreadSceneKey = scene.key
                    } label: {
                        HStack(spacing: 6) {
                            Text(scene.label)
                                .lineLimit(1)
                            Text("\(scene.count)")
                                .font(.system(size: 10, weight: .semibold, design: .default))
                                .foregroundStyle(Color.herText.opacity(isActive ? 0.80 : 0.54))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Color.white.opacity(isActive ? 0.24 : 0.14))
                                .clipShape(Capsule())
                            if scene.isCurrent {
                                Text("Current")
                                    .font(.system(size: 10, weight: .semibold, design: .default))
                                    .foregroundStyle(Color.herText.opacity(0.74))
                            }
                        }
                        .font(.system(size: 12, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(isActive ? 0.92 : 0.72))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(isActive ? Color.herStudioActiveFill : Color.herShellPanelSoft.opacity(0.84))
                        )
                        .overlay(
                            Capsule()
                                .stroke(
                                    isActive ? Color.herStudioActiveStroke : Color.herShellStroke.opacity(0.22),
                                    lineWidth: isActive ? 1.2 : 1
                                )
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var fullStudioThreadSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    TextField("Search thread", text: $fullStudioThreadSearchText)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("studio.thread.search")
                    Text("\(filteredFullStudioThreadEntries.count) shown")
                        .font(.system(size: 12, weight: .medium, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.62))
                }

                fullThreadFilterBar

                if !availableFullThreadScenes.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Browse by Scene")
                            .font(.system(size: 11, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.58))
                        fullThreadSceneBar
                    }
                }

                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(groupedFullStudioThreadSections) { section in
                                VStack(alignment: .leading, spacing: 8) {
                                    Button {
                                        toggleFullThreadSection(section)
                                    } label: {
                                        HStack(spacing: 8) {
                                            Image(systemName: collapsedFullThreadSectionKeys.contains(section.key) ? "chevron.right" : "chevron.down")
                                                .font(.system(size: 10, weight: .bold, design: .default))
                                            Text(section.title)
                                                .font(.system(size: 11, weight: .semibold, design: .default))
                                                .foregroundStyle(Color.herText.opacity(0.56))
                                                .textCase(.uppercase)
                                            Spacer(minLength: 0)
                                        }
                                    }
                                    .buttonStyle(.plain)

                                    fullThreadSectionSummaryRow(section)
                                    fullThreadSectionRevisionTimeline(section)
                                    if !collapsedFullThreadSectionKeys.contains(section.key) {
                                        ForEach(section.entries) { exchange in
                                            fullStudioThreadExchangeRow(exchange)
                                                .id(exchange.id)
                                                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                                .onTapGesture {
                                                    expandFullThreadSectionIfNeeded(for: exchange)
                                                    highlightedStudioExchangeID = exchange.id
                                                    fullThreadScrollTargetKey = persistentStudioThreadSelectionKey(for: exchange)
                                                }
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .onAppear {
                        guard let targetID = resolvedFullThreadScrollTargetID() else { return }
                        DispatchQueue.main.async {
                            withAnimation(.easeInOut(duration: 0.24)) {
                                proxy.scrollTo(targetID, anchor: .center)
                            }
                        }
                    }
                    .onChange(of: highlightedStudioExchangeID) { _, newValue in
                        guard let newValue else { return }
                        withAnimation(.easeInOut(duration: 0.24)) {
                            proxy.scrollTo(newValue, anchor: .center)
                        }
                    }
                    .onChange(of: fullThreadScrollTargetKey) { _, _ in
                        guard let targetID = resolvedFullThreadScrollTargetID() else { return }
                        withAnimation(.easeInOut(duration: 0.24)) {
                            proxy.scrollTo(targetID, anchor: .center)
                        }
                    }
                }
            }
            .padding(18)
            .frame(minWidth: 580, minHeight: 420)
            .navigationTitle("Working Thread")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        showingFullStudioThread = false
                    }
                    .accessibilityIdentifier("studio.thread.done")
                }
            }
        }
    }

    private func fullStudioThreadExchangeRow(_ exchange: StudioAskNoteExchange) -> some View {
        let isHighlighted = exchange.id == highlightedStudioExchangeID
        let comparison = fullThreadDraftComparison(for: exchange)
        let insertedText = exactInsertedText(for: exchange)
        let isRevisedComparison = comparison?.state == .revisedInDraft
        let isDiffAccepted = isRevisedComparison && isDiffAcknowledged(for: exchange)
        let hasReopenedDiff = isRevisedComparison && isDiffReopened(for: exchange)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("You")
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.60))
                studioPromptSourceBadge(exchange.source, compact: true)
                if let sceneLabel = sceneLabelForThreadExchange(exchange) {
                    Text(sceneLabel)
                        .font(.system(size: 10, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.72))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.herShellPanelSoft.opacity(0.78))
                        .clipShape(Capsule())
                }
                Spacer(minLength: 0)
                if isHighlighted {
                    Text("Current")
                        .font(.system(size: 10, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.62))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.herStudioActiveFill.opacity(0.92))
                        .clipShape(Capsule())
                }
                Text(relativeTimestamp(exchange.timestamp))
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.54))
            }

            Text(exchange.prompt)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.84))
                .fixedSize(horizontal: false, vertical: true)

            studioRouteMetaStrip(for: exchange)

            if !exchange.noteTitle.isEmpty || !exchange.noteBody.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    Text(exchange.noteTitle.isEmpty ? "io.them" : exchange.noteTitle)
                        .font(.system(size: 12, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.72))
                    if !exchange.noteBody.isEmpty {
                        Text(exchange.noteBody)
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.68))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.herShellPanel.opacity(0.72))
                )
            }

            if canApplyExchangeToOutline(exchange) {
                HStack(spacing: 8) {
                    Button {
                        applyExchangeToOutline(exchange)
                    } label: {
                        Label("Apply to Outline", systemImage: "square.and.arrow.down.on.square")
                            .font(.system(size: 11, weight: .semibold, design: .default))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.herText.opacity(0.72))

                    Text("Adds io.them's development beats to Outline/Beats.")
                        .font(.system(size: 10, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.50))

                    Spacer(minLength: 0)
                }
            }

            if exchange.target == .page, !insertedText.isEmpty {
                if let comparison, comparison.state == .revisedInDraft, !isDiffAccepted,
                   !comparison.currentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    HStack(alignment: .top, spacing: 10) {
                        fullThreadDiffColumn(
                            title: "Original write",
                            text: insertedText,
                            usesPaperTone: true
                        )
                        fullThreadDiffColumn(
                            title: "Current draft version",
                            text: comparison.currentText,
                            usesPaperTone: false
                        )
                    }
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Inserted on page")
                            .font(.system(size: 11, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.60))
                        ScrollView {
                            Text(insertedText)
                                .font(.system(size: 11, weight: .regular, design: .monospaced))
                                .foregroundStyle(Color.herText.opacity(0.78))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .textSelection(.enabled)
                        }
                        .frame(maxHeight: 120)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 9)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.herPaper.opacity(0.92))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(Color.herStudioActiveStroke.opacity(0.34), lineWidth: 1)
                    )
                }
            }

            if let comparison {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text("Current Draft")
                            .font(.system(size: 11, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.60))
                        Text(fullThreadDraftComparisonTitle(comparison))
                        .font(.system(size: 10, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.74))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(fullThreadDraftComparisonFill(comparison))
                        .clipShape(Capsule())
                        if let sceneLabel = comparison.sceneLabel,
                           !sceneLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(sceneLabel)
                                .font(.system(size: 10, weight: .medium, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.62))
                        }
                        if isDiffAccepted {
                            Text("Current kept")
                                .font(.system(size: 10, weight: .semibold, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.72))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.herShellPanelSoft.opacity(0.86))
                                .clipShape(Capsule())
                        } else if hasReopenedDiff {
                            Text("Reopened")
                                .font(.system(size: 10, weight: .semibold, design: .default))
                                .foregroundStyle(Color.herText.opacity(0.76))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.orange.opacity(0.18))
                                .clipShape(Capsule())
                                .accessibilityIdentifier("studio.thread.reopened")
                        }
                    }
                }
            }

            HStack(spacing: 10) {
                if isRevisedComparison, !isDiffAccepted {
                    Button("Restore Original") {
                        restoreOriginalWrite(from: exchange)
                        showingFullStudioThread = false
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("studio.thread.restore-original")

                    Button("Keep Current") {
                        acknowledgeCurrentDraftVersion(for: exchange)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("studio.thread.keep-current")

                    Button("Open Diff on Page") {
                        openStudioDiffOnPage(exchange)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("studio.thread.open-diff")

                    Button("Rewrite From Diff") {
                        rewriteFromDiff(for: exchange)
                        showingFullStudioThread = false
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("studio.thread.rewrite-from-diff")
                }

                Button("Reload") {
                    reloadStudioAskNoteExchange(exchange)
                    showingFullStudioThread = false
                }
                .buttonStyle(.bordered)

                Button("Pin") {
                    pinStudioAskNoteExchange(exchange)
                    showingFullStudioThread = false
                }
                .buttonStyle(.bordered)

                if exchange.target == .page, exchange.anchorLine != nil {
                    Button("Jump to Page") {
                        jumpToStudioExchangeAnchor(exchange)
                        showingFullStudioThread = false
                    }
                    .buttonStyle(.borderedProminent)
                }

                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill((isHighlighted ? Color.herStudioActiveFill : Color.herShellPanelSoft).opacity(0.82))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(
                    isHighlighted ? Color.herStudioActiveStroke : Color.herShellStroke.opacity(0.18),
                    lineWidth: isHighlighted ? 1.2 : 1
                )
        )
    }




    private var draftSceneNavigatorItems: [DraftSceneNavigatorItem] {
        if !liveDraftBridge.structuredDraft.scenes.isEmpty {
            return liveDraftBridge.structuredDraft.scenes.map { scene in
                DraftSceneNavigatorItem(
                    id: scene.id,
                    line: scene.line,
                    label: scene.slugline,
                    shortLabel: scene.shortLabel
                )
            }
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        var items: [DraftSceneNavigatorItem] = []

        for (index, rawLine) in lines.enumerated() {
            let trimmed = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard looksLikeDraftSceneHeading(trimmed) else { continue }
            let label = trimmed.uppercased()
            items.append(
                DraftSceneNavigatorItem(
                    id: "\(index + 1)|\(label)",
                    line: index + 1,
                    label: label,
                    shortLabel: compactSceneNavigatorLabel(label)
                )
            )
        }

        return items
    }

    private var activeDraftSceneNavigatorItem: DraftSceneNavigatorItem? {
        let cursorLine = max(1, liveDraftBridge.currentCursorLine)
        let items = draftSceneNavigatorItems
        guard !items.isEmpty else { return nil }
        return items.last(where: { $0.line <= cursorLine }) ?? items.first
    }


    private func draftSceneNavigatorItem(for scene: BackendScreenplayScene) -> DraftSceneNavigatorItem? {
        let candidates = [
            scene.slugline?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            scene.title.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        let normalizedCandidates = candidates
            .map(normalizedSceneNavigatorKey(_:))
            .filter { !$0.isEmpty }
        guard !normalizedCandidates.isEmpty else { return nil }

        if let exact = draftSceneNavigatorItems.first(where: { normalizedCandidates.contains(normalizedSceneNavigatorKey($0.label)) }) {
            return exact
        }

        return draftSceneNavigatorItems.first { item in
            let itemKey = normalizedSceneNavigatorKey(item.label)
            return normalizedCandidates.contains(where: { itemKey.contains($0) || $0.contains(itemKey) })
        }
    }

    private func isSceneInspectorRowActive(_ scene: BackendScreenplayScene) -> Bool {
        let sceneKey = normalizedSceneNavigatorKey(scene.slugline?.isEmpty == false ? scene.slugline! : scene.title)
        if !highlightedSceneInspectorKey.isEmpty, sceneKey == highlightedSceneInspectorKey {
            return true
        }
        guard let active = activeDraftSceneNavigatorItem else { return false }
        return draftSceneNavigatorItem(for: scene)?.id == active.id
    }

    private func normalizedSceneNavigatorKey(_ text: String) -> String {
        text
            .uppercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func fullThreadSectionKey(for title: String) -> String {
        let normalized = normalizedSceneNavigatorKey(title)
        return normalized.isEmpty ? "UNTITLED" : normalized
    }

    private func looksLikeDraftSceneHeading(_ line: String) -> Bool {
        guard !line.isEmpty else { return false }
        let upper = line.uppercased()
        let prefixes = ["INT.", "EXT.", "INT/EXT.", "EXT/INT.", "INT./EXT.", "EXT./INT.", "I/E."]
        return prefixes.contains(where: { upper.hasPrefix($0) })
    }

    private func compactSceneNavigatorLabel(_ heading: String) -> String {
        let cleaned = heading.replacingOccurrences(of: "  ", with: " ")
        if cleaned.count <= 28 { return cleaned }
        let index = cleaned.index(cleaned.startIndex, offsetBy: 28)
        return String(cleaned[..<index]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private func compactCommittedWritePreview(_ text: String) -> String {
        let cleaned = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        if cleaned.count <= 72 { return cleaned }
        let index = cleaned.index(cleaned.startIndex, offsetBy: 72)
        return String(cleaned[..<index]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private func committedWriteToastPreview(_ text: String) -> String {
        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let candidate = lines.first ?? text
        let cleaned = candidate
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleaned.isEmpty else { return compactCommittedWritePreview(text) }
        if cleaned.count <= 52 { return cleaned }
        let index = cleaned.index(cleaned.startIndex, offsetBy: 52)
        return String(cleaned[..<index]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private func noteBodyForExchange(_ text: String) -> String {
        let cleaned = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        if cleaned.count <= 96 { return cleaned }
        let index = cleaned.index(cleaned.startIndex, offsetBy: 96)
        return String(cleaned[..<index]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private var currentStudioPromptTarget: StudioTarget {
        shouldRoutePromptToPage(studioPromptSeed, studioPromptRoutingMode) ? .page : .voicePin
    }

    private var studioPromptRoutingMode: PromptRoutingMode {
        get { PromptRoutingMode(rawValue: studioPromptRoutingModeRaw) ?? .automatic }
        nonmutating set { studioPromptRoutingModeRaw = newValue.rawValue }
    }

    private var studioPromptHelperText: String {
        switch studioPromptRoutingMode {
        case .automatic:
            return currentStudioPromptTarget == .page
                ? "Auto routes this to the screenplay page."
                : "Auto keeps this in Voice Pin."
        case .page:
            return "Page override is on."
        case .voicePin:
            return "Voice Pin override is on."
        }
    }

    private var studioPromptPlaceholder: String {
        switch studioPromptIntent {
        case .advice:
            return "Ask for guidance or the next move"
        case .rewrite:
            return "Describe the rewrite you want on the page"
        case .voicePin:
            return "Pin a note for io.them to hold"
        }
    }

    private var promptRoutingControl: some View {
        VStack(alignment: .leading, spacing: 6) {
            Picker(
                "Destination",
                selection: Binding(
                    get: { studioPromptRoutingMode },
                    set: selectStudioPromptRoutingMode
                )
            ) {
                ForEach(PromptRoutingMode.allCases) { mode in
                    Text(compactRoutingLabel(for: mode))
                        .tag(mode)
                        .accessibilityIdentifier("studio.prompt.routing.\(mode.rawValue)")
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityIdentifier("studio.prompt.routing")
        }
    }

    private var studioPromptIntentControl: some View {
        Picker(
            "Intent",
            selection: Binding(
                get: { studioPromptIntent },
                set: selectStudioPromptIntent
            )
        ) {
            ForEach(StudioPromptIntent.allCases) { intent in
                Text(intent.title)
                    .tag(intent)
                    .accessibilityIdentifier("studio.prompt.intent.\(intent.rawValue)")
            }
        }
        .pickerStyle(.menu)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labelsHidden()
        .accessibilityLabel("Response intent")
        .accessibilityHint("Changes how io.them responds to the next request.")
        .accessibilityIdentifier("studio.prompt.intent")
    }

    private func selectStudioPromptRoutingMode(_ mode: PromptRoutingMode) {
        studioPromptRoutingMode = mode
        switch mode {
        case .automatic:
            studioPromptIntent = .advice
        case .page:
            studioPromptIntent = .rewrite
        case .voicePin:
            if studioPromptIntent == .rewrite {
                studioPromptIntent = .voicePin
            }
        }
    }

    private func selectStudioPromptIntent(_ intent: StudioPromptIntent) {
        studioPromptIntent = intent
        switch intent {
        case .advice:
            if studioPromptRoutingMode == .page {
                studioPromptRoutingMode = .voicePin
            }
        case .rewrite:
            studioPromptRoutingMode = .page
        case .voicePin:
            studioPromptRoutingMode = .voicePin
        }
    }

    private func compactRoutingLabel(for mode: PromptRoutingMode) -> String {
        switch mode {
        case .automatic:
            return "Auto"
        case .page:
            return "Page"
        case .voicePin:
            return "Pin"
        }
    }



    private func studioTargetBadge(_ target: StudioTarget, prefix: String? = nil, compact: Bool = false) -> some View {
        let label = prefix.map { "\($0): \(target.label)" } ?? target.label

        return HStack(spacing: 6) {
            Image(systemName: target.systemImage)
                .font(.system(size: compact ? 9 : 10, weight: .semibold, design: .default))
            Text(label)
                .font(.system(size: compact ? 10 : 11, weight: .semibold, design: .default))
        }
        .foregroundStyle(target.tint.opacity(0.92))
        .padding(.horizontal, compact ? 7 : 9)
        .padding(.vertical, compact ? 4 : 5)
        .background(target.fill)
        .overlay(
            Capsule()
                .stroke(target.tint.opacity(compact ? 0.24 : 0.32), lineWidth: 1)
        )
        .clipShape(Capsule())
    }

    private func studioPromptSourceTint(_ source: StudioPromptSource) -> Color {
        switch source {
        case .voice:
            return Color(red: 0.27, green: 0.49, blue: 0.86)
        case .typed:
            return Color(red: 0.57, green: 0.43, blue: 0.35)
        }
    }

    private func studioPromptSourceBadge(_ source: StudioPromptSource, compact: Bool = false) -> some View {
        let tint = studioPromptSourceTint(source)
        return HStack(spacing: compact ? 4 : 5) {
            Circle()
                .fill(tint.opacity(compact ? 0.84 : 0.78))
                .frame(width: compact ? 5 : 6, height: compact ? 5 : 6)

            Text(source.label)
                .font(.system(size: compact ? 9 : 10, weight: .semibold, design: .default))
                .foregroundStyle(tint.opacity(compact ? 0.96 : 0.88))
        }
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, compact ? 3 : 4)
        .background(
            Capsule()
                .fill(tint.opacity(compact ? 0.08 : 0.10))
        )
        .overlay(
            Capsule()
                .stroke(tint.opacity(compact ? 0.16 : 0.18), lineWidth: 1)
        )
    }



    private var studioFocusShortcutLayer: some View {
        HStack(spacing: 0) {
            Button("") {
                focusStudioPage()
            }
            .keyboardShortcut("1", modifiers: [.command, .option])

            Button("") {
                focusStudioRail()
            }
            .keyboardShortcut("2", modifiers: [.command, .option])

            Button("") {
                focusStudioInspector()
            }
            .keyboardShortcut("3", modifiers: [.command, .option])

            Button("") {
                submitStudioPromptSeedFromKeyboardShortcut()
            }
            .keyboardShortcut(.return, modifiers: [.command])
            .disabled(
                isSubmittingStudioPrompt ||
                isSubmittingPrompt ||
                studioPromptSeed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )

            Button("") {
                openStudioCommandBar()
            }
            .keyboardShortcut("k", modifiers: [.command])

            Button("") {
                toggleDirectionOneSidebarVisibility()
            }
            .keyboardShortcut("b", modifiers: [.command])

            Button("") {
                triggerStudioManualSave()
            }
            .keyboardShortcut("s", modifiers: [.command])
            .disabled(
                vm.isSaving ||
                vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )

            Button("") {
                dismissDirectionOneRailOverlays()
            }
            .keyboardShortcut(.escape, modifiers: [])
            .disabled(
                !isDirectionOneRailOverlayPresented ||
                !vm.editingSceneID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )

            Button("") {
                triggerMakeBeatFromSelectionShortcut()
            }
            .keyboardShortcut("b", modifiers: [.command, .option])
            .disabled(!canTriggerMakeBeatFromSelectionShortcut)

            Button("") {
                triggerUpdateSelectedBeatFromSelectionShortcut()
            }
            .keyboardShortcut("u", modifiers: [.command, .option])
            .disabled(!canTriggerUpdateSelectedBeatFromSelectionShortcut)
        }
        .frame(width: 0, height: 0)
        .opacity(0.001)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }




#if DEBUG || os(macOS)
    private var studioDebugVoiceRenderSnapshot: StudioDebugVoiceRenderStatusSnapshot? {
        let raw = studioDebugVoiceTurnResultJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty, let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(StudioDebugVoiceRenderStatusSnapshot.self, from: data)
    }

    private var studioDebugHasVisibleVoiceVadState: Bool {
        talkIsActive || debugVoicePartialStableSeconds > 0.001
    }

    private var studioDebugVoiceVadChip: some View {
        let liveMs = max(Int((debugVoicePartialStableSeconds * 1000).rounded()), 0)
        let targetMs = max(Int((debugVoicePartialStabilityWindowSeconds * 1000).rounded()), 1)
        let isReady = liveMs >= targetMs
        let tint: Color = isReady
            ? Color.green.opacity(0.84)
            : (studioDebugHasVisibleVoiceVadState ? Color.orange.opacity(0.84) : Color.herText.opacity(0.64))

        return HStack(spacing: 5) {
            Text("VAD")
                .font(.system(size: 9, weight: .bold, design: .default))
                .tracking(0.5)
                .foregroundStyle(Color.herText.opacity(0.52))
            Text("\(liveMs)/\(targetMs)ms")
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(tint)
            if talkIsActive {
                Circle()
                    .fill(tint.opacity(0.92))
                    .frame(width: 5, height: 5)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(Color.herShellPanelSoft.opacity(0.70))
        .overlay(
            Capsule()
                .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
        )
        .clipShape(Capsule())
        .help("Partial transcript stability during dictation. Fast Studio VAD only fires after this reaches the 400ms window.")
    }

    @ViewBuilder
    private var studioDebugPageSurfaceChips: some View {
        if studioDebugVoiceRenderSnapshot != nil || studioDebugHasVisibleVoiceVadState {
            HStack(spacing: 8) {
                if studioDebugVoiceRenderSnapshot != nil {
                    studioDebugRenderChip
                }
                if studioDebugHasVisibleVoiceVadState {
                    studioDebugVoiceVadChip
                }
            }
            .frame(maxWidth: .infinity)
            .transition(.opacity)
        }
    }

    private var studioDebugRenderChip: some View {
        let snapshot = studioDebugVoiceRenderSnapshot
        let requestID = snapshot?.renderRequestID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let firstDelta = snapshot?.renderServerFirstDeltaMs
        let totalMs = snapshot?.renderServerTotalMs
        let status = snapshot?.status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let displayRequestID = requestID.isEmpty ? "pending" : String(requestID.prefix(8))
        let timingParts = [firstDelta.map { "\($0)ms" }, totalMs.map { "\($0)ms total" }]
            .compactMap { $0 }
            .joined(separator: " • ")
        let tint: Color
        switch status {
        case "error":
            tint = .red.opacity(0.84)
        case "ok":
            tint = .green.opacity(0.82)
        default:
            tint = Color.herText.opacity(0.72)
        }

        return HStack(spacing: 5) {
            Image(systemName: "hammer")
                .font(.system(size: 8, weight: .bold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.46))
            Text(displayRequestID)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(tint)
            if !timingParts.isEmpty {
                Text(timingParts)
                    .font(.system(size: 9, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.60))
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(Color.herShellPanelSoft.opacity(0.82))
        .overlay(
            Capsule()
                .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
        )
        .clipShape(Capsule())
        .help(requestID.isEmpty
              ? "Waiting for a streamed Studio render request id."
              : "Last Studio render request id: \(requestID)")
    }
#endif

    private func screenplayPageSurface<Content: View>(
        minHeight: CGFloat,
        maxHeight: CGFloat,
        isDropTargeted: Bool,
        isDraftingPreviewActive: Bool,
        isCommitNoticeVisible: Bool,
        @ViewBuilder content: () -> Content
    ) -> some View {
        let showEmptyPlaceholder = screenplayPageShouldShowEmptyPlaceholder

        return VStack(spacing: 16) {
            screenplayCurrentElementLabel

            ZStack(alignment: .top) {
                VStack(spacing: 0) {
                    screenplayPageHeaderStrip(
                        showEditingHint: showEmptyPlaceholder,
                        isDraftingPreviewActive: isDraftingPreviewActive,
                        isCommitNoticeVisible: isCommitNoticeVisible
                    )
                    .frame(
                        maxWidth: .infinity,
                        minHeight: IOThemSpacing.ScreenplayPageChrome.headerContentMinHeight,
                        alignment: .topLeading
                    )
                    .padding(.horizontal, 22)
                    .padding(.top, IOThemSpacing.ScreenplayPageChrome.headerTopPadding)
                    .padding(.bottom, IOThemSpacing.ScreenplayPageChrome.headerBottomPadding)

                    content()
                        .frame(minHeight: minHeight, maxHeight: maxHeight)
                        .padding(.top, IOThemSpacing.ScreenplayPageChrome.contentTopPadding)
                        .padding(.horizontal, ScreenplayStackMetrics.pageSurfaceHorizontalPadding)
                        .padding(.bottom, IOThemSpacing.ScreenplayPageChrome.contentBottomPadding)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            triggerDirectionOnePageFocusTransition()
                            liveDraftBridge.requestEditorFocus()
                        }
                }
                .background(
                    screenplayPageBackground(
                        isDropTargeted: isDropTargeted,
                        isDraftingPreviewActive: isDraftingPreviewActive,
                        isCommitNoticeVisible: isCommitNoticeVisible
                    )
                )
                .overlay(alignment: .topLeading) {
                    if showEmptyPlaceholder {
                        ScreenplayStudioPageEmptyPlaceholder(
                            hasSelectedProject: vm.selectedProject != nil
                        )
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: IOThemSpacing.ScreenplayPageChrome.cornerRadius, style: .continuous)
                        .stroke(
                            Color.accentColor.opacity(isDirectionOnePageFocusTransitionVisible ? 0.20 : 0),
                            lineWidth: 1.5
                        )
                        .padding(1)
                }
                .scaleEffect(isDirectionOnePageFocusTransitionVisible ? 1.003 : 1.0)
                .shadow(color: Color.herPaperShadow.opacity(0.26), radius: 28, y: 18)

                ScreenplayStudioElementModeBar(
                    activeElement: liveDraftBridge.activeScreenplayElement,
                    panelColor: directionOneChromePanel,
                    strokeColor: directionOneChromeStroke,
                    textColor: directionOneChromeText,
                    secondaryTextColor: directionOneChromeSecondaryText
                ) { element in
                    liveDraftBridge.setActiveScreenplayElement(element)
                    liveDraftBridge.requestEditorFocus()
                }
                    .offset(y: -16)

#if DEBUG || os(macOS)
                if studioDebugOverlayEnabled {
                    studioDebugPageSurfaceChips
                        .padding(.top, 10)
                        .padding(.trailing, 14)
                        .frame(maxWidth: .infinity, alignment: .topTrailing)
                        .opacity(0.92)
                }
#endif
            }
        }
        .animation(.easeInOut(duration: 0.20), value: isDraftingPreviewActive)
        .animation(.easeInOut(duration: 0.20), value: isCommitNoticeVisible)
        .animation(.easeOut(duration: 0.22), value: isDirectionOnePageFocusTransitionVisible)
        .overlay(alignment: .bottomLeading) {
            #if DEBUG
            if IOThemRuntime.isRunningUITests {
                Text(vm.fountainDraft.isEmpty ? "EMPTY_DRAFT" : String(vm.fountainDraft.prefix(1_000)))
                    .font(.system(size: 1))
                    .frame(width: 1, height: 1)
                    .opacity(0.01)
                    .accessibilityIdentifier("studio.draft.snapshot")
            }
            #endif
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.draft.surface")
        .accessibilityValue(String(vm.fountainDraft.prefix(1_000)))
    }

    private var screenplayCurrentElementLabel: some View {
        ZStack {
            Text(liveDraftBridge.activeScreenplayElement.title.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .default))
                .tracking(2.6)
                .foregroundStyle(Color.herText.opacity(0.46))
                .id(liveDraftBridge.activeScreenplayElement.rawValue)
                .transition(.opacity)
        }
        .frame(maxWidth: .infinity)
        .animation(.easeInOut(duration: 0.18), value: liveDraftBridge.activeScreenplayElement.rawValue)
    }

    @ViewBuilder
    private func screenplayPageHeaderStrip(
        showEditingHint: Bool,
        isDraftingPreviewActive: Bool,
        isCommitNoticeVisible: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("DRAFT PAGE")
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .tracking(0.8)
                        .foregroundStyle(Color.herText.opacity(0.40))
                    Text(screenplayPageDraftTitle)
                        .font(.system(size: 15, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.88))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)

                HStack(spacing: 8) {
                    if vm.selectedProject == nil {
                        screenplayPageActionChipButton(
                            title: "Create Project",
                            systemImage: "rectangle.stack.badge.plus",
                            tint: Color.accentColor.opacity(0.84),
                            fill: Color.accentColor.opacity(0.08),
                            stroke: Color.accentColor.opacity(0.18)
                        ) {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                                isDirectionOneSidebarVisible = true
                                selectedSidebarSection = .projects
                            }
                        }
                    } else if vm.hasUnsavedDraftChanges {
                        screenplayPageActionChipButton(
                            title: vm.isSaving ? "Saving…" : "Save now",
                            systemImage: vm.isSaving ? "arrow.clockwise" : "square.and.arrow.down",
                            tint: vm.isSaving ? Color.orange.opacity(0.86) : Color.blue.opacity(0.84),
                            fill: vm.isSaving ? Color.orange.opacity(0.08) : Color.blue.opacity(0.08),
                            stroke: vm.isSaving ? Color.orange.opacity(0.18) : Color.blue.opacity(0.18),
                            isDisabled: vm.isSaving
                        ) {
                            triggerStudioManualSave()
                        }
                        .accessibilityIdentifier("studio.draft.page.save")
                    }

                    if !isDraftingPreviewActive,
                       !isCommitNoticeVisible,
                       !isFocusedPageDiffOverlayPresented,
                       let exchange = reviewablePageDiffExchange {
                        screenplayPageDiffReviewChip(for: exchange)
                    }

                    if isDraftingPreviewActive {
                        HStack(spacing: 6) {
                            ProgressView()
                                .controlSize(.small)
                                .tint(Color.green.opacity(0.82))
                            Text("io.them is drafting…")
                                .font(.system(size: 10, weight: .semibold, design: .default))
                                .foregroundStyle(Color.green.opacity(0.88))
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Color.green.opacity(0.10))
                        .overlay(
                            Capsule()
                                .stroke(Color.green.opacity(0.22), lineWidth: 1)
                        )
                        .clipShape(Capsule())
                    } else if isCommitNoticeVisible {
                        screenplayPageStatusChip(
                            title: "Written to page",
                            systemImage: "checkmark.circle.fill",
                            tint: Color.green.opacity(0.86),
                            fill: Color.green.opacity(0.08),
                            stroke: Color.green.opacity(0.18)
                        )
                    }

#if DEBUG || os(macOS)
                    if studioDebugVoiceRenderSnapshot != nil {
                        studioDebugRenderChip
                    }
#endif
                }
                .fixedSize(horizontal: true, vertical: false)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ScreenplayStudioPageMetadataItem(
                        title: "Last saved",
                        value: screenplayPageSavedMetadataText,
                        color: screenplayPageSavedMetadataTone.color
                    )
                    ScreenplayStudioPageMetadataDivider()
                    ScreenplayStudioPageMetadataItem(
                        title: "Pages",
                        value: screenplayPagePageCountText,
                        color: ScreenplayPageMetaTone.muted.color
                    )
                    ScreenplayStudioPageMetadataDivider()
                    ScreenplayStudioPageMetadataItem(
                        title: "Revision",
                        value: screenplayPageRevisionStateText,
                        color: screenplayPageRevisionTone.color
                    )
                    if showEditingHint {
                        ScreenplayStudioPageMetadataDivider()
                        Text("Start with a scene heading, or click to place the first line.")
                            .font(.system(size: 10.5, weight: .medium, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.48))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 1)
            }
        }
    }

    private var screenplayPageDraftTitle: String {
        let selectedTitle = vm.selectedProject?.title.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !selectedTitle.isEmpty {
            return selectedTitle
        }
        let draftTitle = vm.newProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !draftTitle.isEmpty {
            return draftTitle
        }
        return screenplayPageShouldShowEmptyPlaceholder ? "Untitled Draft" : "Live Draft"
    }

    private var screenplayPageShouldShowEmptyPlaceholder: Bool {
        vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var screenplayPageSavedMetadataText: String {
        let hasDraft = !screenplayPageShouldShowEmptyPlaceholder
        if vm.isSaving {
            return "Saving…"
        }
        if vm.selectedProject == nil {
            return hasDraft ? "Live only" : "Not saved"
        }
        if vm.hasUnsavedDraftChanges {
            return "Unsaved"
        }
        if let savedDate = screenplayPageSavedDate {
            return relativeTimestamp(savedDate)
        }
        if !vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Saved"
        }
        return "Not saved"
    }

    private var screenplayPageSavedMetadataTone: ScreenplayPageMetaTone {
        if vm.isSaving {
            return .accent
        }
        if vm.selectedProject != nil && vm.hasUnsavedDraftChanges {
            return .warning
        }
        if screenplayPageSavedDate != nil || !vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .success
        }
        return .muted
    }

    private var screenplayPageSavedDate: Date? {
        guard let project = vm.selectedProject else { return nil }
        return dateFromTimestamp(project.lastVersionAt ?? project.updatedAt ?? project.createdAt)
    }

    private var screenplayPagePageCountText: String {
        if !vm.paginationPages.isEmpty {
            return "\(vm.paginationPages.count)"
        }
        guard !screenplayPageShouldShowEmptyPlaceholder else {
            return "0"
        }
        let normalized = vm.fountainDraft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lineCount = max(1, normalized.components(separatedBy: "\n").count)
        let estimated = Int(ceil(Double(lineCount) / Double(max(vm.linesPerPage, 1))))
        return "\(max(1, estimated))"
    }

    private var screenplayPageRevisionStateText: String {
        let changeCount = screenplayPageChangeCount
        if changeCount > 0 {
            return "\(changeCount) change\(changeCount == 1 ? "" : "s")"
        }
        let hasBaseline = !vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if hasBaseline {
            return "Clean"
        }
        return "No baseline"
    }

    private var screenplayPageRevisionTone: ScreenplayPageMetaTone {
        if screenplayPageChangeCount > 0 {
            return .warning
        }
        if !vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .success
        }
        return .muted
    }

    private var screenplayPageChangeCount: Int {
        guard let summary = vm.revisionSummary else { return 0 }
        return summary.revised + summary.added + summary.moved + summary.removed
    }


    @ViewBuilder
    private func screenplayPageBackground(
        isDropTargeted: Bool,
        isDraftingPreviewActive: Bool,
        isCommitNoticeVisible: Bool
    ) -> some View {
        GeometryReader { proxy in
            let guidePositions = ScreenplayStackMetrics.paperGuidePositions(in: proxy.size.width)
            let headerBottom = IOThemSpacing.ScreenplayPageChrome.headerHeight
            let guideTop = headerBottom + 18
            let leftMarkerInset = max(guidePositions.left - 20, 12)
            let markerColor = isDraftingPreviewActive
                ? Color.green.opacity(0.66)
                : Color.accentColor.opacity(0.54)

            ZStack {
                RoundedRectangle(cornerRadius: IOThemSpacing.ScreenplayPageChrome.cornerRadius, style: .continuous)
                    .fill(Color.herPaper)

                LinearGradient(
                    colors: [
                        Color.white.opacity(0.36),
                        Color.herPaper.opacity(0.92),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: headerBottom + 24)
                .frame(maxHeight: .infinity, alignment: .top)
                .clipShape(RoundedRectangle(cornerRadius: IOThemSpacing.ScreenplayPageChrome.cornerRadius, style: .continuous))

                RoundedRectangle(cornerRadius: IOThemSpacing.ScreenplayPageChrome.cornerRadius, style: .continuous)
                    .stroke(
                        isDropTargeted ? Color.herStudioActiveStroke : Color.black.opacity(0.08),
                        lineWidth: isDropTargeted ? 1.5 : 0.8
                    )

                Path { path in
                    path.move(to: CGPoint(x: 18, y: headerBottom))
                    path.addLine(to: CGPoint(x: proxy.size.width - 18, y: headerBottom))
                }
                .stroke(Color.herPaperLine.opacity(0.34), lineWidth: 0.8)

                Path { path in
                    path.move(to: CGPoint(x: guidePositions.left, y: guideTop))
                    path.addLine(to: CGPoint(x: guidePositions.left, y: proxy.size.height - 18))
                    path.move(to: CGPoint(x: guidePositions.right, y: guideTop))
                    path.addLine(to: CGPoint(x: guidePositions.right, y: proxy.size.height - 18))
                }
                .stroke(Color.herPaperLine.opacity(0.22), lineWidth: 0.75)

                if isDraftingPreviewActive || isCommitNoticeVisible {
                    VStack {
                        Capsule()
                            .fill(markerColor)
                            .frame(width: 3, height: isDraftingPreviewActive ? 84 : 52)
                            .shadow(color: markerColor.opacity(0.10), radius: 3, y: 0)
                            .padding(.top, guideTop + 16)
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(.leading, leftMarkerInset)
                    .animation(.easeInOut(duration: 0.18), value: isDraftingPreviewActive)
                    .animation(.easeInOut(duration: 0.18), value: isCommitNoticeVisible)
                }
            }
        }
    }

    private func screenplayPageStatusChip(
        title: String,
        systemImage: String,
        tint: Color,
        fill: Color,
        stroke: Color
    ) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .foregroundStyle(tint)
            Text(title)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(fill)
        .overlay(
            Capsule()
                .stroke(stroke, lineWidth: 1)
        )
        .clipShape(Capsule())
    }

    private func screenplayPageActionChipButton(
        title: String,
        systemImage: String,
        tint: Color,
        fill: Color,
        stroke: Color,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .semibold, design: .default))
                    .foregroundStyle(tint)
                Text(title)
                    .font(.system(size: 10, weight: .semibold, design: .default))
                    .foregroundStyle(tint)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(fill)
            .overlay(
                Capsule()
                    .stroke(stroke, lineWidth: 1)
            )
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.72 : 1)
    }

    private func screenplayPageDiffReviewChip(for exchange: StudioAskNoteExchange) -> some View {
        let reopened = isDiffReopened(for: exchange)
        let title = reopened ? "Reopened diff" : "Review diff"

        return Button {
            openStudioDiffOnPage(exchange)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: reopened ? "arrow.triangle.branch" : "square.split.2x1")
                    .font(.system(size: 10, weight: .semibold, design: .default))
                Text(title)
                    .font(.system(size: 10, weight: .semibold, design: .default))
            }
            .foregroundStyle(Color.herText.opacity(reopened ? 0.82 : 0.72))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(reopened ? Color.orange.opacity(0.12) : Color.herShellPanelSoft.opacity(0.55))
            .overlay(
                Capsule()
                    .stroke(reopened ? Color.orange.opacity(0.22) : Color.herShellStroke.opacity(0.18), lineWidth: 1)
            )
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .help(reopened
              ? "A kept diff changed again. Review the reopened block on the page."
              : "Review the revised block on the page.")
    }

    private var studioRailStatusStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !vm.errorText.isEmpty {
                studioRailStatusRow(
                    vm.errorText,
                    systemImage: "exclamationmark.circle.fill",
                    tint: Color.red.opacity(0.88)
                )
            }
            if !vm.infoText.isEmpty {
                studioRailStatusRow(
                    vm.infoText,
                    systemImage: "info.circle.fill",
                    tint: Color.herText.opacity(0.78)
                )
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.herShellPanel.opacity(0.62))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.24), lineWidth: 1)
        )
    }

    private func studioRailStatusRow(_ text: String, systemImage: String, tint: Color) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(tint)
                .padding(.top, 1)

            Text(text)
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundStyle(tint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier(systemImage.hasPrefix("exclamationmark") ? "studio.error.text" : "studio.info.text")
    }

    private func draftRecoveryBanner(
        _ recovery: ScreenplayStudioViewModel.LocalDraftRecoveryCandidate
    ) -> some View {
        let currentDraft = vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let recoveryDraft = recovery.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let recoveryAlreadyOnPage = vm.hasUnsavedDraftChanges &&
            !currentDraft.isEmpty &&
            currentDraft == recoveryDraft
        let savedText = relativeTimestamp(dateFromTimestamp(recovery.savedAt) ?? .now)

        return draftAlertBanner(
            title: recoveryAlreadyOnPage ? "Local draft protected" : "Unsaved local draft found",
            message: recoveryAlreadyOnPage
                ? "Saved locally \(savedText). Retry Save when the connection is back, or discard the recovery copy."
                : "Saved \(savedText). Recover it or keep the server draft.",
            hint: recoveryAlreadyOnPage
                ? "Press 1 to keep the local draft on the page or 2 to discard the recovery copy."
                : "Press 1 to recover local or 2 to keep the server draft.",
            tint: Color.orange.opacity(0.88),
            excerpt: nil
        ) {
            NumberedChoiceActionButton(
                number: "1",
                title: recoveryAlreadyOnPage ? "Keep Local" : "Recover Local",
                prominence: .prominent
            ) {
                vm.restoreDraftFromRecovery()
            }
            NumberedChoiceActionButton(
                number: "2",
                title: recoveryAlreadyOnPage ? "Discard Copy" : "Keep Server"
            ) {
                if recoveryAlreadyOnPage {
                    vm.discardLocalRecoveryCopy()
                } else {
                    vm.keepServerDraft()
                }
            }
        }
    }

    private func draftConflictBanner(
        _ conflict: ScreenplayStudioViewModel.SaveConflictState
    ) -> some View {
        let relativeUpdateText: String? = {
            guard conflict.serverUpdatedAt > 0,
                  let serverDate = dateFromTimestamp(conflict.serverUpdatedAt) else { return nil }
            return relativeTimestamp(serverDate)
        }()

        return draftAlertBanner(
            title: "Server draft changed",
            message: relativeUpdateText.map { "A newer draft was saved \($0). Choose which version should stay on the page." }
                ?? "A newer draft was saved on the server. Choose which version should stay on the page.",
            hint: "Press 1 to load the server draft or 2 to keep your local draft.",
            tint: Color.red.opacity(0.88),
            excerpt: conflict.serverDraftExcerpt
        ) {
            Button {
                vm.applyServerVersionFromConflict()
            } label: {
                Text("1 Load Server")
            }
            .buttonStyle(.bordered)
            .tint(Color.white.opacity(0.24))
            .keyboardShortcut("1", modifiers: [])
            .accessibilityIdentifier("studio.conflict.load-server")

            Button {
                Task { await vm.keepLocalDraftAfterConflict() }
            } label: {
                Text("2 Keep Mine")
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.white.opacity(0.24))
            .keyboardShortcut("2", modifiers: [])
            .accessibilityIdentifier("studio.conflict.keep-mine")
        }
    }

    private func draftAlertBanner<Actions: View>(
        title: String,
        message: String,
        hint: String,
        tint: Color,
        excerpt: String?,
        @ViewBuilder actions: () -> Actions
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundStyle(tint)
                    .padding(.top, 1)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 12, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.88))
                    Text(message)
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.74))
                    NumberedChoiceHintText(message: hint)
                }
                Spacer(minLength: 0)
            }

            if let excerpt, !excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(excerpt)
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.60))
                    .lineLimit(2)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.herShellPanelSoft.opacity(0.80))
                    )
            }

            HStack(spacing: 8) {
                actions()
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(tint.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(tint.opacity(0.20), lineWidth: 1)
        )
    }

    private func showPageCommitNotice() {
        pageCommitNoticeTask?.cancel()
        isPageCommitNoticeVisible = true
        pageCommitNoticeTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_250_000_000)
            guard !Task.isCancelled else { return }
            isPageCommitNoticeVisible = false
            pageCommitNoticeTask = nil
        }
    }

    private func clearPageCommitNotice() {
        pageCommitNoticeTask?.cancel()
        pageCommitNoticeTask = nil
        isPageCommitNoticeVisible = false
    }

    private func cancelLastCommittedWriteCollapse() {
        lastCommittedWriteCollapseTask?.cancel()
        lastCommittedWriteCollapseTask = nil
    }

    private func revealLastCommittedWriteActions(autoCollapse: Bool = true) {
        cancelLastCommittedWriteCollapse()
        if accessibilityReduceMotion {
            isLastCommittedWriteActionVisible = true
            isLastCommittedWriteToastCollapsed = false
        } else {
            withAnimation(.spring(response: 0.22, dampingFraction: 0.88)) {
                isLastCommittedWriteActionVisible = true
                isLastCommittedWriteToastCollapsed = false
            }
        }
        guard autoCollapse else { return }
        let reduceMotion = accessibilityReduceMotion
        lastCommittedWriteCollapseTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_600_000_000)
            guard !Task.isCancelled,
                  isLastCommittedWriteActionVisible,
                  liveDraftBridge.lastCommittedWrite != nil else { return }
            if reduceMotion {
                isLastCommittedWriteToastCollapsed = true
            } else {
                withAnimation(.easeInOut(duration: 0.18)) {
                    isLastCommittedWriteToastCollapsed = true
                }
            }
            lastCommittedWriteCollapseTask = nil
        }
    }

    private func expandLastCommittedWriteActions() {
        revealLastCommittedWriteActions(autoCollapse: false)
        focusLastCommittedWriteFromToast(showMarker: true)
    }

    private func focusLastCommittedWriteFromToast(showMarker: Bool) {
        guard let committedWrite = liveDraftBridge.lastCommittedWrite else { return }
        let startLine = max(1, committedWrite.startLine)
        let endLine = max(startLine, committedWrite.endLine)
        liveDraftBridge.jumpToLine(startLine)
        liveDraftBridge.highlightLineRange(startLine: startLine, endLine: endLine)
        if showMarker {
            showPageCommitNotice()
        }
    }

    private func presentFocusedPageDiffOverlay(for exchange: StudioAskNoteExchange) {
        focusedPageDiffExchangeID = exchange.id
        isFocusedPageDiffOverlayPresented = true
    }

    private func hideFocusedPageDiffOverlay() {
        isFocusedPageDiffOverlayPresented = false
    }

    private func dismissFocusedPageDiffAfterCommittedWrite() {
        guard focusedPageDiffExchangeID != nil || !focusedPageDiffPersistentKey.isEmpty else { return }
        withAnimation(.easeOut(duration: 0.18)) {
            isFocusedPageDiffOverlayPresented = false
            focusedPageDiffExchangeID = nil
        }
        focusedPageDiffPersistentKey = ""
    }

    private func dismissLastCommittedWriteActions() {
        cancelLastCommittedWriteCollapse()
        isLastCommittedWriteActionVisible = false
        isLastCommittedWriteToastCollapsed = false
        clearPageCommitNotice()
        liveDraftBridge.clearLastCommittedWrite()
    }

    private func reviseLastCommittedWrite(_ committedWrite: ScreenplayCommittedWrite, preset: InlineWriteRevisionPreset) {
        prepareReplacementTarget(for: committedWrite)
        let seed = """
Revise this page write and keep the same story intent.

\(preset.instruction)
\(screenplayReplacementScopeInstruction(for: committedWrite.insertedText))

Return revised screenplay lines only.

\(committedWrite.insertedText.trimmingCharacters(in: .whitespacesAndNewlines))
"""
        isLastCommittedWriteActionVisible = false
        clearPageCommitNotice()
        submitStudioPromptText(
            seed,
            displayText: preset.displayPrompt,
            source: .typed,
            routingMode: .page,
            successMessage: "Asked io.them to make the last write \(preset.title).",
            clearSeedOnSuccess: false,
            sendingSuggestionID: nil
        )
    }

    private func canRevertCommittedWrite(_ committedWrite: ScreenplayCommittedWrite) -> Bool {
        vm.fountainDraft == committedWrite.committedDraft
    }

    private func revertCommittedWrite(_ committedWrite: ScreenplayCommittedWrite, successMessage: String) {
        guard canRevertCommittedWrite(committedWrite) else {
            vm.infoText = "The draft changed after that write, so there is nothing simple to undo now."
            dismissLastCommittedWriteActions()
            return
        }
        vm.fountainDraft = committedWrite.previousDraft
        liveDraftBridge.draftText = committedWrite.previousDraft
        dismissLastCommittedWriteActions()
        vm.infoText = successMessage
    }

    private func recoverCommittedWriteOffPage(
        _ committedWrite: ScreenplayCommittedWrite,
        matchingExchange: StudioAskNoteExchange?,
        asNote: Bool
    ) {
        guard canRevertCommittedWrite(committedWrite) else {
            vm.infoText = "The draft changed after that write, so there is nothing simple to rescue now."
            dismissLastCommittedWriteActions()
            return
        }

        let insertedText = committedWrite.insertedText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !insertedText.isEmpty else {
            revertCommittedWrite(
                committedWrite,
                successMessage: "Removed the last write from the page."
            )
            return
        }

        let memoryDomain = matchingExchange.map(resolvedMemoryDomain(for:)) ?? liveDraftBridge.latestMemoryDomain
        let companionMode = matchingExchange.flatMap(resolvedCompanionMode(for:))
        let recoveredPrompt = matchingExchange?.prompt ?? (asNote
            ? "Convert that page write into a note."
            : "Move that page write to Voice Pin.")
        let recoveredSource = matchingExchange?.source ?? lastCommittedStudioPromptSource
        let noteTitle = asNote ? "Converted to note" : "Moved to Voice Pin"
        let fullBody = asNote
            ? "Saved off-page for later:\n\n\(insertedText)"
            : insertedText
        let noteBody = noteBodyForExchange(fullBody)

        liveDraftBridge.latestMemoryDomain = memoryDomain
        liveDraftBridge.updateAssistantPin(
            mode: "copilot",
            category: asNote ? "note" : "voice_pin",
            title: noteTitle,
            body: noteBody,
            fullBody: fullBody,
            badge: asNote ? "Note" : "Pin",
            actionSummary: asNote ? "Saved as note" : "Moved off-page"
        )

        let recoveredEntry = StudioAskNoteExchange(
            id: UUID(),
            backendThreadID: nil,
            backendTurn: nil,
            requestID: nil,
            prompt: recoveredPrompt,
            target: .voicePin,
            source: recoveredSource,
            noteTitle: noteTitle,
            noteBody: noteBody,
            developmentText: insertedText,
            writeID: nil,
            replacedWriteID: committedWrite.replacedWriteID,
            anchorLine: committedWrite.startLine,
            anchorEndLine: committedWrite.endLine,
            anchorSceneLabel: sceneLabelForLine(committedWrite.startLine),
            anchorExcerpt: nil,
            insertedText: asNote ? nil : insertedText,
            replacementApplied: asNote ? nil : committedWrite.replacementApplied,
            revisedBlockText: asNote ? nil : (committedWrite.replacementApplied ? insertedText : nil),
            resolvedAnchorExcerpt: nil,
            packLabel: matchingExchange?.packLabel,
            phase: matchingExchange?.phase,
            sluglineAnchorLine: matchingExchange?.sluglineAnchorLine,
            memoryDomainRaw: memoryDomain.rawValue,
            companionModeRaw: companionMode?.rawValue,
            timestamp: Date()
        )
        insertStudioAskNoteHistoryEntry(recoveredEntry)
        expandedVoicePinTurnID = recoveredEntry.id
        showFullVoicePinThread = true
        highlightedStudioExchangeID = recoveredEntry.id

        revertCommittedWrite(
            committedWrite,
            successMessage: asNote
                ? "Converted the last page write into a note in Voice Pin."
                : "Moved the last page write into Voice Pin."
        )
    }

    private func undoLastCommittedWrite(_ committedWrite: ScreenplayCommittedWrite) {
        revertCommittedWrite(committedWrite, successMessage: "Removed the last write from the page.")
    }

    private func clearWriteCommitUI() {
        cancelLastCommittedWriteCollapse()
        clearPageCommitNotice()
        isLastCommittedWriteActionVisible = false
        isLastCommittedWriteToastCollapsed = false
        liveDraftBridge.clearLastCommittedWrite()
    }




    private func suggestedSceneNavigatorSlugline() -> String {
        let defaultHeading = "INT. NEW LOCATION - DAY"
        guard let active = activeDraftSceneNavigatorItem else { return defaultHeading }
        let upper = active.label.uppercased()
        let prefix = sceneHeadingPrefix(for: upper) ?? "INT."
        let time = sceneHeadingTimeOfDay(for: upper) ?? "DAY"
        return "\(prefix) NEW LOCATION - \(time)"
    }

    private func normalizedSceneInsertSlugline(_ raw: String) -> String {
        var slugline = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s*-\s*"#, with: " - ", options: .regularExpression)
            .replacingOccurrences(of: #"^INT\s+"#, with: "INT. ", options: .regularExpression)
            .replacingOccurrences(of: #"^EXT\s+"#, with: "EXT. ", options: .regularExpression)
            .replacingOccurrences(of: #"^INT/EXT\s+"#, with: "INT./EXT. ", options: .regularExpression)
            .replacingOccurrences(of: #"^EXT/INT\s+"#, with: "EXT./INT. ", options: .regularExpression)

        guard !slugline.isEmpty else { return "" }

        if sceneHeadingPrefix(for: slugline) == nil {
            slugline = "INT. " + slugline
        }

        if !slugline.contains(" - ") {
            let time = sceneHeadingTimeOfDay(for: activeDraftSceneNavigatorItem?.label ?? "") ?? "DAY"
            slugline += " - \(time)"
        }

        return slugline
    }

    private func sceneHeadingPrefix(for heading: String) -> String? {
        let upper = heading.uppercased()
        let prefixes = ["INT./EXT.", "EXT./INT.", "INT/EXT.", "EXT/INT.", "INT.", "EXT.", "I/E."]
        return prefixes.first(where: { upper.hasPrefix($0) })
    }

    private func sceneHeadingTimeOfDay(for heading: String) -> String? {
        let upper = heading.uppercased()
        guard let range = upper.range(of: " - ", options: .backwards) else { return nil }
        let suffix = String(upper[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        return suffix.isEmpty ? nil : suffix
    }

    private func sceneLabelForLine(_ line: Int) -> String? {
        let target = max(1, line)
        if let scene = liveDraftBridge.structuredDraft.scenes.last(where: { $0.line <= target }) {
            return scene.shortLabel
        }
        return draftSceneNavigatorItems
            .last(where: { $0.line <= target })?
            .shortLabel
    }

    private func sluglineLineReference(for committedWrite: ScreenplayCommittedWrite) -> Int? {
        guard let slugline = firstFountainSlugline(in: committedWrite.insertedText) else {
            return committedWrite.startLine
        }
        let draftLines = committedWrite.committedDraft.components(separatedBy: .newlines)
        let normalizedSlugline = slugline.uppercased()
        let startIndex = max(0, min(draftLines.count - 1, committedWrite.startLine - 1))
        for index in startIndex..<draftLines.count {
            let normalizedLine = draftLines[index].trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            if normalizedLine == normalizedSlugline || normalizedLine.contains(normalizedSlugline) {
                return index + 1
            }
        }
        for (index, line) in draftLines.enumerated() {
            let normalizedLine = line.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            if normalizedLine == normalizedSlugline || normalizedLine.contains(normalizedSlugline) {
                return index + 1
            }
        }
        return committedWrite.startLine
    }

    private func firstFountainSlugline(in text: String) -> String? {
        text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { line in
                let upper = line.uppercased()
                return upper.hasPrefix("INT.")
                    || upper.hasPrefix("EXT.")
                    || upper.hasPrefix("INT ")
                    || upper.hasPrefix("EXT ")
                    || upper.hasPrefix("INT/EXT.")
                    || upper.hasPrefix("I/E.")
            }
    }

    private func sceneInspectorKey(for scene: BackendScreenplayScene) -> String {
        normalizedSceneNavigatorKey(scene.slugline?.isEmpty == false ? scene.slugline! : scene.title)
    }

    private var inspectorWorkspacePersistenceKey: String {
        let explicitProjectID = (vm.selectedProject?.id ?? vm.selectedProjectID).trimmingCharacters(in: .whitespacesAndNewlines)
        return explicitProjectID.isEmpty ? "__global__" : explicitProjectID
    }

    private func decodedBeatProvenanceStates() -> [String: [String: String]] {
        guard let data = studioInspectorBeatProvenanceStorage.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String: [String: String]].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private func storeBeatProvenanceStates(_ states: [String: [String: String]]) {
        guard let data = try? JSONEncoder().encode(states),
              let raw = String(data: data, encoding: .utf8) else {
            return
        }
        studioInspectorBeatProvenanceStorage = raw
    }

    private func decodedBeatProvenanceHistoryStates() -> [String: [String: BeatProvenanceHistoryEntry]] {
        guard let data = studioInspectorBeatProvenanceHistoryStorage.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String: [String: BeatProvenanceHistoryEntry]].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private func storeBeatProvenanceHistoryStates(_ states: [String: [String: BeatProvenanceHistoryEntry]]) {
        guard let data = try? JSONEncoder().encode(states),
              let raw = String(data: data, encoding: .utf8) else {
            return
        }
        studioInspectorBeatProvenanceHistoryStorage = raw
    }

    private func beatProvenance(for beat: BackendScreenplayBeat) -> BeatProvenanceSource {
        beatProvenance(forBeatID: beat.id)
    }

    private func beatProvenanceHistory(for beat: BackendScreenplayBeat) -> BeatProvenanceHistoryEntry? {
        beatProvenanceHistory(forBeatID: beat.id)
    }

    private func beatProvenance(forBeatID beatID: String) -> BeatProvenanceSource {
        let cleanBeatID = beatID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanBeatID.isEmpty else { return .manual }
        let key = inspectorWorkspacePersistenceKey
        let rawValue = decodedBeatProvenanceStates()[key]?[cleanBeatID] ?? BeatProvenanceSource.manual.rawValue
        return BeatProvenanceSource(rawValue: rawValue) ?? .manual
    }

    private func beatProvenanceHistory(forBeatID beatID: String) -> BeatProvenanceHistoryEntry? {
        let cleanBeatID = beatID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanBeatID.isEmpty else { return nil }
        let key = inspectorWorkspacePersistenceKey
        return decodedBeatProvenanceHistoryStates()[key]?[cleanBeatID]
    }

    private func setBeatProvenance(_ source: BeatProvenanceSource, for beatID: String) {
        let cleanBeatID = beatID.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = inspectorWorkspacePersistenceKey
        guard !cleanBeatID.isEmpty, !key.isEmpty else { return }
        var states = decodedBeatProvenanceStates()
        var projectStates = states[key] ?? [:]
        projectStates[cleanBeatID] = source.rawValue
        states[key] = projectStates
        storeBeatProvenanceStates(states)

        let now = Date().timeIntervalSince1970
        var historyStates = decodedBeatProvenanceHistoryStates()
        var projectHistory = historyStates[key] ?? [:]
        if let existing = projectHistory[cleanBeatID] {
            projectHistory[cleanBeatID] = BeatProvenanceHistoryEntry(
                createdFromRaw: existing.createdFromRaw,
                createdAt: existing.createdAt,
                lastRefreshedFromRaw: source.rawValue,
                lastRefreshedAt: now
            )
        } else {
            projectHistory[cleanBeatID] = BeatProvenanceHistoryEntry(
                createdFromRaw: source.rawValue,
                createdAt: now,
                lastRefreshedFromRaw: source.rawValue,
                lastRefreshedAt: now
            )
        }
        historyStates[key] = projectHistory
        storeBeatProvenanceHistoryStates(historyStates)
    }

    private func markBeatProvenanceRefresh(_ source: BeatProvenanceSource, for beatID: String) {
        let cleanBeatID = beatID.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = inspectorWorkspacePersistenceKey
        guard !cleanBeatID.isEmpty, !key.isEmpty else { return }
        let now = Date().timeIntervalSince1970
        var historyStates = decodedBeatProvenanceHistoryStates()
        var projectHistory = historyStates[key] ?? [:]
        if let existing = projectHistory[cleanBeatID] {
            projectHistory[cleanBeatID] = BeatProvenanceHistoryEntry(
                createdFromRaw: existing.createdFromRaw,
                createdAt: existing.createdAt,
                lastRefreshedFromRaw: source.rawValue,
                lastRefreshedAt: now
            )
        } else {
            let current = beatProvenance(forBeatID: cleanBeatID)
            projectHistory[cleanBeatID] = BeatProvenanceHistoryEntry(
                createdFromRaw: current.rawValue,
                createdAt: now,
                lastRefreshedFromRaw: source.rawValue,
                lastRefreshedAt: now
            )
        }
        historyStates[key] = projectHistory
        storeBeatProvenanceHistoryStates(historyStates)
    }

    private func sanitizeBeatProvenanceAfterOutlineChange() {
        let key = inspectorWorkspacePersistenceKey
        guard !key.isEmpty else { return }
        let validBeatIDs = Set(vm.outline.beats.map(\.id))
        var states = decodedBeatProvenanceStates()
        guard var projectStates = states[key] else { return }
        projectStates = projectStates.filter { validBeatIDs.contains($0.key) }
        states[key] = projectStates
        storeBeatProvenanceStates(states)

        var historyStates = decodedBeatProvenanceHistoryStates()
        if var projectHistory = historyStates[key] {
            projectHistory = projectHistory.filter { validBeatIDs.contains($0.key) }
            historyStates[key] = projectHistory
            storeBeatProvenanceHistoryStates(historyStates)
        }
    }

    private func decodedInspectorWorkspaceStates() -> [String: StudioInspectorWorkspaceState] {
        guard let data = studioInspectorWorkspaceStorage.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String: StudioInspectorWorkspaceState].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private func storeInspectorWorkspaceStates(_ states: [String: StudioInspectorWorkspaceState]) {
        guard let data = try? JSONEncoder().encode(states),
              let raw = String(data: data, encoding: .utf8) else {
            return
        }
        studioInspectorWorkspaceStorage = raw
    }

    private func persistInspectorWorkspaceState() {
        guard !isRestoringInspectorWorkspaceState else { return }
        let key = inspectorWorkspacePersistenceKey
        guard !key.isEmpty else { return }
        var states = decodedInspectorWorkspaceStates()
        states[key] = StudioInspectorWorkspaceState(
            rightPanelTabRaw: directionOneRightPanelTab.rawValue,
            selectedInspectorSectionRaw: selectedInspectorSection.rawValue,
            selectedBeatID: selectedBeatInspectorID.trimmingCharacters(in: .whitespacesAndNewlines),
            beatOrderIDs: sortedOutlineBeats.map(\.id),
            highlightedSceneInspectorKey: highlightedSceneInspectorKey.trimmingCharacters(in: .whitespacesAndNewlines),
            editingBeatID: vm.editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines),
            beatLabel: vm.newBeatLabel,
            beatSummary: vm.newBeatSummary,
            beatSceneID: vm.newBeatSceneID.trimmingCharacters(in: .whitespacesAndNewlines),
            beatActID: vm.newBeatActID.trimmingCharacters(in: .whitespacesAndNewlines),
            beatDraftProvenanceRaw: beatComposerProvenance.rawValue
        )
        storeInspectorWorkspaceStates(states)
    }

    private func reapplyPersistedInspectorBeatOrderIfNeeded() {
        guard !isRestoringInspectorWorkspaceState else { return }
        let key = inspectorWorkspacePersistenceKey
        guard !key.isEmpty, let state = decodedInspectorWorkspaceStates()[key] else { return }
        let persistedOrder = state.beatOrderIDs.map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.filter { !$0.isEmpty }
        guard !persistedOrder.isEmpty else { return }

        let currentIDs = vm.outline.beats.map(\.id)
        guard Set(currentIDs) == Set(persistedOrder), currentIDs != persistedOrder else { return }

        isRestoringInspectorWorkspaceState = true
        restoreBeatOrderIfNeeded(from: persistedOrder)
        isRestoringInspectorWorkspaceState = false
    }

    private func restoreInspectorWorkspaceState() {
        let key = inspectorWorkspacePersistenceKey
        guard let state = decodedInspectorWorkspaceStates()[key] else {
            isRestoringInspectorWorkspaceState = true
            selectedBeatInspectorID = ""
            highlightedSceneInspectorKey = ""
            vm.cancelEditingBeat()
            beatComposerProvenance = .manual
            isRestoringInspectorWorkspaceState = false
            return
        }
        isRestoringInspectorWorkspaceState = true
        directionOneRightPanelTab = DirectionOneRightPanelTab.resolved(from: state.rightPanelTabRaw) ?? directionOneRightPanelTab
        selectedInspectorSection = InspectorSection(rawValue: state.selectedInspectorSectionRaw) ?? selectedInspectorSection
        selectedBeatInspectorID = state.selectedBeatID
        restoreBeatOrderIfNeeded(from: state.beatOrderIDs)
        highlightedSceneInspectorKey = state.highlightedSceneInspectorKey
        vm.editingBeatID = state.editingBeatID
        vm.newBeatLabel = state.beatLabel
        vm.newBeatSummary = state.beatSummary
        vm.newBeatSceneID = state.beatSceneID
        vm.newBeatActID = state.beatActID
        beatComposerProvenance = BeatProvenanceSource(rawValue: state.beatDraftProvenanceRaw) ?? .manual
        isRestoringInspectorWorkspaceState = false
        if !vm.outline.scenes.isEmpty || !vm.outline.beats.isEmpty || !vm.outline.acts.isEmpty {
            sanitizeInspectorWorkspaceStateAfterOutlineChange()
        }
    }

    private func sanitizeInspectorWorkspaceStateAfterOutlineChange() {
        if !selectedBeatInspectorID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !vm.outline.beats.contains(where: { $0.id == selectedBeatInspectorID }) {
            selectedBeatInspectorID = ""
        }

        if !highlightedSceneInspectorKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !vm.outline.scenes.contains(where: { sceneInspectorKey(for: $0) == highlightedSceneInspectorKey }) {
            highlightedSceneInspectorKey = ""
        }

        if !vm.newBeatActID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !vm.outline.acts.contains(where: { $0.id == vm.newBeatActID }) {
            vm.newBeatActID = ""
        }

        if !vm.newBeatSceneID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !vm.outline.scenes.contains(where: { $0.id == vm.newBeatSceneID }) {
            vm.newBeatSceneID = ""
        }

        if !vm.editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !vm.outline.beats.contains(where: { $0.id == vm.editingBeatID }) {
            vm.editingBeatID = ""
        }

        sanitizeBeatProvenanceAfterOutlineChange()

        if !vm.newBeatSceneID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let selectedScene = selectedBeatScene {
            let sceneActID = (selectedScene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !sceneActID.isEmpty {
                vm.newBeatActID = sceneActID
            }
        }

        if selectedBeatInspectorID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           !vm.editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            selectedBeatInspectorID = vm.editingBeatID
        }
    }

    private var currentSceneInspectorSelection: BackendScreenplayScene? {
        if !vm.editingSceneID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return vm.outline.scenes.first(where: { $0.id == vm.editingSceneID })
        }
        if !highlightedSceneInspectorKey.isEmpty,
           let explicit = vm.outline.scenes.first(where: { sceneInspectorKey(for: $0) == highlightedSceneInspectorKey }) {
            return explicit
        }
        if let active = activeDraftSceneNavigatorItem,
           let matched = vm.outline.scenes.first(where: { sceneInspectorKey(for: $0) == normalizedSceneNavigatorKey(active.label) }) {
            return matched
        }
        return vm.outline.scenes.first
    }


    private func matchingStudioExchange(for committedWrite: ScreenplayCommittedWrite) -> StudioAskNoteExchange? {
        if let exactByExcerpt = studioAskNoteHistory.first(where: {
            $0.target == .page &&
            normalizedWriteID($0.writeID) == normalizedWriteID(committedWrite.writeID)
        }) {
            return exactByExcerpt
        }
        if let exactByExcerpt = studioAskNoteHistory.first(where: {
            $0.target == .page &&
            normalizedAnchorExcerpt($0.anchorExcerpt) == normalizedAnchorExcerpt(committedWrite.insertedText)
        }) {
            return exactByExcerpt
        }
        if let exact = studioAskNoteHistory.first(where: {
            $0.target == .page &&
            $0.anchorLine == committedWrite.startLine &&
            ($0.anchorEndLine ?? committedWrite.endLine) == committedWrite.endLine
        }) {
            return exact
        }
        return studioAskNoteHistory.first(where: { $0.target == .page })
    }

    private func highlightStudioExchangeFromCommittedWrite(_ exchange: StudioAskNoteExchange) {
        highlightedStudioExchangeID = exchange.id
        studioThreadListFocused = true
        vm.infoText = "Highlighted the matching thread entry in the rail."
    }

    private func jumpToStudioExchangeAnchor(_ exchange: StudioAskNoteExchange) {
        guard let resolvedAnchor = resolvedAnchorSnapshot(for: exchange, in: vm.fountainDraft) ??
            fallbackAnchorSnapshot(for: exchange) else { return }
        selectedInspectorSection = .scenes
        highlightedStudioExchangeID = exchange.id
        if let sceneLabel = resolvedAnchor.sceneLabel, !sceneLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            highlightedSceneInspectorKey = normalizedSceneNavigatorKey(sceneLabel)
        }
        liveDraftBridge.jumpToLine(resolvedAnchor.startLine)
        liveDraftBridge.highlightLineRange(startLine: resolvedAnchor.startLine, endLine: resolvedAnchor.endLine)
        persistResolvedAnchorIfNeeded(for: exchange, resolved: resolvedAnchor)
        vm.infoText = resolvedAnchor.sceneLabel?.isEmpty == false
            ? "Jumped to \(resolvedAnchor.sceneLabel!)."
            : "Jumped to line \(resolvedAnchor.startLine)."
    }

    private func screenplayProjectIdFromHistoryKey(_ key: String) -> String? {
        guard key.hasPrefix("project:") else { return nil }
        let projectId = String(key.dropFirst("project:".count)).trimmingCharacters(in: .whitespacesAndNewlines)
        return projectId.isEmpty ? nil : projectId
    }

    private func backfilledStudioExchange(from thread: BackendHistoryThread) -> StudioAskNoteExchange? {
        let prompt = thread.user.trimmingCharacters(in: .whitespacesAndNewlines)
        let assistant = thread.assistant.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, !assistant.isEmpty else { return nil }
        let metadataTarget = (thread.screenplayTarget ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let hasStudioMetadata = thread.screenplayProjectId != nil || !metadataTarget.isEmpty
        guard hasStudioMetadata || isLikelyStudioHistoryThread(prompt: prompt, assistant: assistant) else { return nil }

        let target: StudioTarget
        switch metadataTarget {
        case "page":
            target = .page
        case "voice_pin", "voicepin":
            target = .voicePin
        default:
            target = FountainFormatter.isStrongStudioPageWriteCandidate(assistant) ? .page : .voicePin
        }
        let source = StudioPromptSource(rawValue: (thread.screenplayPromptSource ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) ?? .voice
        let noteTitle = (thread.screenplayNoteTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? (target == .page ? "Wrote to page" : "io.them")
            : (thread.screenplayNoteTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let noteBody = noteBodyForExchange(
            (thread.screenplayNoteBody ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? assistant
                : (thread.screenplayNoteBody ?? "")
        )
        let insertedText = (thread.screenplayInsertedText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let voicePinDevelopmentText: String? = {
            guard target == .voicePin else { return nil }
            if !assistant.isEmpty { return assistant }
            let metadataNote = (thread.screenplayNoteBody ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return metadataNote.isEmpty ? nil : metadataNote
        }()

        return StudioAskNoteExchange(
            id: UUID(),
            backendThreadID: thread.id,
            backendTurn: thread.turn > 0 ? thread.turn : nil,
            requestID: normalizedStudioRequestID(thread.requestId),
            prompt: prompt,
            target: target,
            source: source,
            noteTitle: noteTitle,
            noteBody: noteBody,
            developmentText: voicePinDevelopmentText,
            writeID: thread.screenplayWriteId,
            replacedWriteID: thread.screenplayReplacedWriteId,
            anchorLine: thread.screenplayAnchorLine,
            anchorEndLine: thread.screenplayAnchorEndLine,
            anchorSceneLabel: thread.screenplayAnchorSceneLabel,
            anchorExcerpt: target == .page
                ? noteBodyForAnchor(insertedText.isEmpty ? (thread.screenplayNoteBody ?? assistant) : insertedText)
                : nil,
            insertedText: insertedText.isEmpty ? nil : insertedText,
            replacementApplied: thread.screenplayReplacementApplied,
            revisedBlockText: thread.screenplayRevisedBlockText,
            resolvedAnchorExcerpt: thread.screenplayResolvedAnchorExcerpt,
            memoryDomainRaw: target == .page ? StudioMemoryDomain.project.rawValue : StudioMemoryDomain.companion.rawValue,
            companionModeRaw: target == .voicePin ? liveDraftBridge.companionMode.rawValue : nil,
            timestamp: dateFromTimestamp(thread.updatedAt) ?? Date()
        )
    }

    private func isLikelyStudioHistoryThread(prompt: String, assistant: String) -> Bool {
        if FountainFormatter.isLikelyFountainBlock(assistant) {
            return true
        }

        let combined = " \(prompt.lowercased()) \(assistant.lowercased()) "
        let cues = [
            " scene ",
            " screenplay ",
            " script ",
            " slugline ",
            " dialogue ",
            " subtext ",
            " beat ",
            " act ",
            " opening scene ",
            " voice pin ",
            " write that ",
        ]
        return cues.contains(where: { combined.contains($0) })
    }

    private func appendStudioAskNoteHistory(
        prompt: String,
        target: StudioTarget,
        source: StudioPromptSource,
        requestID: String? = nil,
        noteTitleOverride: String? = nil,
        noteBodyOverride: String? = nil,
        anchorLine: Int? = nil,
        anchorEndLine: Int? = nil,
        anchorSceneLabel: String? = nil,
        committedWriteOverride: ScreenplayCommittedWrite? = nil,
        insertedTextOverride: String? = nil,
        voicePinTextOverride: String? = nil
    ) {
        let pin = liveDraftBridge.assistantPin
        let noteTitle: String
        let noteBody: String
        var resolvedDevelopmentText: String? = nil
        var resolvedAnchorLine = anchorLine
        var resolvedAnchorEndLine = anchorEndLine
        var resolvedAnchorSceneLabel = anchorSceneLabel
        var resolvedAnchorExcerpt: String? = nil
        var resolvedWriteID: String? = nil
        var resolvedReplacedWriteID: String? = nil
        var resolvedInsertedText: String? = nil
        var replacementApplied: Bool? = nil
        var revisedBlockText: String? = nil
        var resolvedAnchorMetadataExcerpt: String? = nil
        let resolvedPackLabel = {
            let explicitPack = liveDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines)
            if !explicitPack.isEmpty { return explicitPack }
            let phaseFallback = liveDraftBridge.latestPhase
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
            if !phaseFallback.isEmpty { return phaseFallback }
            return "Studio"
        }()
        let resolvedPhase = liveDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines)
        var resolvedSluglineAnchorLine: Int? = nil

        if let noteTitleOverride, let noteBodyOverride {
            noteTitle = noteTitleOverride
            noteBody = noteBodyOverride
            resolvedDevelopmentText = target == .voicePin ? noteBodyOverride.trimmingCharacters(in: .whitespacesAndNewlines) : nil
            resolvedAnchorExcerpt = target == .page ? noteBodyForAnchor(noteBodyOverride) : nil
            resolvedAnchorMetadataExcerpt = resolvedAnchorExcerpt
        } else if target == .page,
                  let committedWrite = committedWriteOverride ?? liveDraftBridge.lastCommittedWrite,
                  !committedWrite.insertedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            noteTitle = "Wrote to page"
            noteBody = noteBodyForExchange(committedWrite.insertedText)
            resolvedAnchorExcerpt = noteBodyForAnchor(committedWrite.insertedText)
            resolvedAnchorMetadataExcerpt = resolvedAnchorExcerpt
            resolvedInsertedText = committedWrite.insertedText
            resolvedAnchorLine = anchorLine ?? committedWrite.startLine
            resolvedAnchorEndLine = anchorEndLine ?? committedWrite.endLine
            resolvedAnchorSceneLabel = anchorSceneLabel ?? sceneLabelForLine(committedWrite.startLine)
            if committedWrite.isAuthoritativeWrite {
                resolvedWriteID = committedWrite.writeID
                resolvedReplacedWriteID = committedWrite.replacedWriteID
                replacementApplied = committedWrite.replacementApplied
                revisedBlockText = committedWrite.replacementApplied ? committedWrite.insertedText : nil
                resolvedSluglineAnchorLine = sluglineLineReference(for: committedWrite)
            }
        } else if target == .page {
            let fallbackInsertedText = (insertedTextOverride ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            noteTitle = "Wrote to page"
            noteBody = fallbackInsertedText.isEmpty
                ? "The page write is still settling into the draft."
                : noteBodyForExchange(fallbackInsertedText)
            resolvedInsertedText = fallbackInsertedText.isEmpty ? nil : fallbackInsertedText
            resolvedAnchorExcerpt = fallbackInsertedText.isEmpty ? nil : noteBodyForAnchor(fallbackInsertedText)
            resolvedAnchorMetadataExcerpt = resolvedAnchorExcerpt
        } else {
            noteTitle = pin.title.trimmingCharacters(in: .whitespacesAndNewlines)
            let bodySource = [
                (voicePinTextOverride ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                pin.fullBody.trimmingCharacters(in: .whitespacesAndNewlines),
                pin.body.trimmingCharacters(in: .whitespacesAndNewlines),
                pin.actionSummary.trimmingCharacters(in: .whitespacesAndNewlines)
            ].first(where: { !$0.isEmpty }) ?? ""
            resolvedDevelopmentText = bodySource.isEmpty ? nil : bodySource
            noteBody = noteBodyForExchange(bodySource)
            resolvedAnchorLine = anchorLine
            resolvedAnchorEndLine = anchorEndLine
            resolvedAnchorSceneLabel = anchorSceneLabel
            resolvedAnchorExcerpt = nil
        }

        let entry = consumePendingStudioTurnEvent(for: StudioAskNoteExchange(
            id: UUID(),
            backendThreadID: nil,
            backendTurn: nil,
            requestID: normalizedStudioRequestID(requestID),
            prompt: prompt,
            target: target,
            source: source,
            noteTitle: noteTitle,
            noteBody: noteBody,
            developmentText: resolvedDevelopmentText,
            writeID: resolvedWriteID,
            replacedWriteID: resolvedReplacedWriteID,
            anchorLine: resolvedAnchorLine,
            anchorEndLine: resolvedAnchorEndLine,
            anchorSceneLabel: resolvedAnchorSceneLabel,
            anchorExcerpt: resolvedAnchorExcerpt,
            insertedText: resolvedInsertedText,
            replacementApplied: replacementApplied,
            revisedBlockText: revisedBlockText,
            resolvedAnchorExcerpt: resolvedAnchorMetadataExcerpt,
            packLabel: resolvedPackLabel.isEmpty ? nil : resolvedPackLabel,
            phase: resolvedPhase.isEmpty ? nil : resolvedPhase,
            sluglineAnchorLine: resolvedSluglineAnchorLine,
            memoryDomainRaw: liveDraftBridge.latestMemoryDomain.rawValue,
            companionModeRaw: liveDraftBridge.companionMode.rawValue,
            timestamp: Date()
        ))

        let shouldAutoOpenOnVoiceTurn = source == .voice && target == .page && !didAutoOpenVoicePinOnFirstVoiceTurn
        insertStudioAskNoteHistoryEntry(entry, autoOpenOnVoiceTurn: shouldAutoOpenOnVoiceTurn)
    }

    private func insertStudioAskNoteHistoryEntry(
        _ entry: StudioAskNoteExchange,
        autoOpenOnVoiceTurn: Bool = false
    ) {
        studioAskNoteHistory.insert(entry, at: 0)
        if studioAskNoteHistory.count > 24 {
            studioAskNoteHistory = Array(studioAskNoteHistory.prefix(24))
        }
        highlightedStudioExchangeID = entry.id
        studioThreadListFocused = true
        if autoOpenOnVoiceTurn {
            didAutoOpenVoicePinOnFirstVoiceTurn = true
            withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) {
                isDirectionOneRightRailExpanded = true
            }
        }
        persistStudioAskNoteHistory(studioAskNoteHistory, for: activeStudioAskNoteHistoryKey)
    }

    private func appendPendingVoicePageWriteIfNeeded() {
        guard let prompt = pendingVoiceStudioPrompt else { return }
        guard prompt.source == .voice else { return }
        guard prompt.target == .page else { return }
        guard liveDraftBridge.lastCommittedWrite != nil else { return }
        appendStudioAskNoteHistory(prompt: prompt.text, target: .page, source: .voice, requestID: prompt.requestID)
        pendingVoiceStudioPrompt = nil
    }

    private func appendPendingVoicePinExchangeIfNeeded(_ pin: ScreenplayAssistantPinState) {
        guard let prompt = pendingVoiceStudioPrompt else { return }
        guard prompt.source == .voice else { return }
        guard prompt.target == .voicePin else { return }
        guard pin.hasContent else { return }
        appendStudioAskNoteHistory(prompt: prompt.text, target: .voicePin, source: .voice, requestID: prompt.requestID)
        pendingVoiceStudioPrompt = nil
    }

    private var activeStudioAskNoteHistoryKey: String {
        ScreenplayStudioHistoryMigrationPolicy.activeHistoryKey(
            selectedProjectID: vm.selectedProjectID,
            preferredProjectID: liveDraftBridge.preferredProjectID,
            bindingProjectID: liveDraftBridge.projectBinding.projectID
        )
    }

    @discardableResult
    private func migrateLiveDraftHistoryToProjectIfNeeded(from oldKey: String, to newKey: String) -> Bool {
        let store = loadStudioAskNoteHistoryMap()
        let liveEntries = Array(
            (store[oldKey] ?? studioAskNoteHistory)
                .prefix(24)
        )
        guard ScreenplayStudioHistoryMigrationPolicy.shouldMoveLiveDraftHistory(
            from: oldKey,
            to: newKey,
            liveDraftEntryCount: liveEntries.count
        ) else {
            return false
        }

        let existingProjectEntries = Array((store[newKey] ?? []).prefix(24))
        let merged = mergedStudioThreadHistory(local: liveEntries, remote: existingProjectEntries)
        persistStudioAskNoteHistory(merged, for: newKey)
        persistStudioWriteAnchorSnapshot(from: merged, for: newKey, versionID: vm.latestVersionID)
        persistSelectedStudioThreadID(highlightedStudioExchangeID, for: newKey)
        persistStudioAskNoteHistory([], for: oldKey)
        return true
    }

    private func reloadStudioAskNoteExchange(_ exchange: StudioAskNoteExchange) {
        openStudioCommandBar(
            prefill: exchange.prompt,
            routingMode: exchange.target == .page ? .page : .voicePin,
            intent: restoredStudioPromptIntent(for: exchange),
            focusComposer: false
        )
        highlightedStudioExchangeID = exchange.id
        studioThreadListFocused = true
        vm.infoText = exchange.target == .page
            ? "Loaded this page write back into io.them."
            : "Loaded this Voice Pin ask back into io.them."
    }

    private func restoredStudioPromptIntent(
        for exchange: StudioAskNoteExchange
    ) -> StudioPromptIntent {
        guard exchange.target == .voicePin else { return .rewrite }
        return resolvedMemoryDomain(for: exchange) == .companion ? .voicePin : .advice
    }

    private func pinStudioAskNoteExchange(_ exchange: StudioAskNoteExchange) {
        openStudioCommandBar(
            prefill: exchange.prompt,
            routingMode: exchange.target == .page ? .page : .voicePin,
            intent: restoredStudioPromptIntent(for: exchange),
            focusComposer: false
        )
        highlightedStudioExchangeID = exchange.id
        studioThreadListFocused = true
        vm.infoText = "Pinned this ask back into the composer."
    }

    private func loadStudioAskNoteHistoryMap() -> [String: [StudioAskNoteExchange]] {
        let stored = studioAskNoteHistoryStorage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !stored.isEmpty,
              let data = stored.data(using: .utf8) else { return [:] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([String: [StudioAskNoteExchange]].self, from: data)) ?? [:]
    }

    private func loadStudioAskNoteSelectionMap() -> [String: String] {
        let stored = studioAskNoteSelectionStorage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !stored.isEmpty,
              let data = stored.data(using: .utf8) else { return [:] }
        return (try? JSONDecoder().decode([String: String].self, from: data)) ?? [:]
    }

    private func loadStudioWriteAnchorMap() -> [String: [String: StudioWriteAnchorRecord]] {
        let stored = studioWriteAnchorStorage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !stored.isEmpty,
              let data = stored.data(using: .utf8) else { return [:] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([String: [String: StudioWriteAnchorRecord]].self, from: data)) ?? [:]
    }

    private func loadAcknowledgedStudioDiffMap() -> [String: [String: String]] {
        let stored = studioDiffAcknowledgedStorage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !stored.isEmpty,
              let data = stored.data(using: .utf8) else { return [:] }
        if let decoded = try? JSONDecoder().decode([String: [String: String]].self, from: data) {
            let normalized = normalizedAcknowledgedStudioDiffStoreMap(decoded)
            if normalized != decoded {
                persistNormalizedAcknowledgedStudioDiffStore(normalized)
            }
            return normalized
        }
        if let legacyDecoded = try? JSONDecoder().decode([String: [String]].self, from: data) {
            let normalized = legacyDecoded.reduce(into: [String: [String: String]]()) { partialResult, item in
                partialResult[item.key] = item.value.reduce(into: [String: String]()) { nestedResult, key in
                    let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    guard !normalizedKey.isEmpty else { return }
                    nestedResult[normalizedKey] = ""
                }
            }
            let rewritten = normalizedAcknowledgedStudioDiffStoreMap(normalized)
            persistNormalizedAcknowledgedStudioDiffStore(rewritten)
            return rewritten
        }
        return [:]
    }

    private func loadAcknowledgedStudioDiffWriteIDMap() -> [String: [String: String]] {
        let stored = studioDiffAcknowledgedWriteIDStorage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !stored.isEmpty,
              let data = stored.data(using: .utf8) else { return [:] }
        let decoded = (try? JSONDecoder().decode([String: [String: String]].self, from: data)) ?? [:]
        let normalized = normalizedAcknowledgedStudioDiffWriteIDStoreMap(decoded)
        if normalized != decoded {
            persistNormalizedAcknowledgedStudioDiffWriteIDStore(normalized)
        }
        return normalized
    }

    private func normalizedAcknowledgedStudioDiffStoreMap(
        _ store: [String: [String: String]]
    ) -> [String: [String: String]] {
        store.reduce(into: [String: [String: String]]()) { partialResult, item in
            let normalizedProjectKey = item.key.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !normalizedProjectKey.isEmpty else { return }
            let normalizedRecord = normalizedAcknowledgedStudioDiffRecords(item.value)
            guard !normalizedRecord.isEmpty else { return }
            partialResult[normalizedProjectKey] = normalizedRecord
        }
    }

    private func normalizedAcknowledgedStudioDiffWriteIDStoreMap(
        _ store: [String: [String: String]]
    ) -> [String: [String: String]] {
        store.reduce(into: [String: [String: String]]()) { partialResult, item in
            let normalizedProjectKey = item.key.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !normalizedProjectKey.isEmpty else { return }
            let normalizedRecord = normalizedAcknowledgedStudioDiffWriteIDs(item.value)
            guard !normalizedRecord.isEmpty else { return }
            partialResult[normalizedProjectKey] = normalizedRecord
        }
    }

    private func persistNormalizedAcknowledgedStudioDiffStore(
        _ store: [String: [String: String]]
    ) {
        guard !store.isEmpty else {
            studioDiffAcknowledgedStorage = ""
            return
        }
        guard let data = try? JSONEncoder().encode(store),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioDiffAcknowledgedStorage = encoded
    }

    private func persistNormalizedAcknowledgedStudioDiffWriteIDStore(
        _ store: [String: [String: String]]
    ) {
        guard !store.isEmpty else {
            studioDiffAcknowledgedWriteIDStorage = ""
            return
        }
        guard let data = try? JSONEncoder().encode(store),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioDiffAcknowledgedWriteIDStorage = encoded
    }

    private func loadStudioFullThreadBrowseStateMap() -> [String: StudioFullThreadBrowseState] {
        func decoded(_ raw: String) -> [String: StudioFullThreadBrowseState] {
            let stored = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !stored.isEmpty,
                  let data = stored.data(using: .utf8) else { return [:] }
            return (try? JSONDecoder().decode([String: StudioFullThreadBrowseState].self, from: data)) ?? [:]
        }

        var merged = decoded(studioFullThreadStateStorage)
        let direct = decoded(UserDefaults.standard.string(forKey: "studio.full.thread.state.v1") ?? "")
        for (key, value) in direct {
            merged[key] = value
        }
        return merged
    }

    private func persistAcknowledgedStudioDiffs(_ records: [String: String], for key: String) {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return }
        var store = loadAcknowledgedStudioDiffMap()
        let limited = normalizedAcknowledgedStudioDiffRecords(records)
        if limited.isEmpty {
            store.removeValue(forKey: normalizedKey)
        } else {
            store[normalizedKey] = limited
        }
        if !shouldDeferBackendThreadViewPersist(for: normalizedKey) {
            schedulePersistFullThreadBrowseStateToBackend(
                currentFullThreadBrowseStateRecord(),
                for: normalizedKey
            )
        }
        guard !store.isEmpty else {
            studioDiffAcknowledgedStorage = ""
            return
        }
        guard let data = try? JSONEncoder().encode(store),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioDiffAcknowledgedStorage = encoded
    }

    private func persistAcknowledgedStudioDiffWriteIDs(_ records: [String: String], for key: String) {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return }
        var store = loadAcknowledgedStudioDiffWriteIDMap()
        let limited = normalizedAcknowledgedStudioDiffWriteIDs(records)
        if limited.isEmpty {
            store.removeValue(forKey: normalizedKey)
        } else {
            store[normalizedKey] = limited
        }
        guard !store.isEmpty else {
            studioDiffAcknowledgedWriteIDStorage = ""
            return
        }
        guard let data = try? JSONEncoder().encode(store),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioDiffAcknowledgedWriteIDStorage = encoded
    }

    private func restoredAcknowledgedStudioDiffRecords(for key: String) -> [String: String] {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return [:] }
        let localValues = normalizedAcknowledgedStudioDiffRecords(loadAcknowledgedStudioDiffMap()[normalizedKey] ?? [:])
        let backendValues = backendStoredAcknowledgedStudioDiffRecords(for: normalizedKey)
        return backendValues.merging(localValues) { backendValue, localValue in
            localValue.isEmpty ? backendValue : localValue
        }
    }

    private func restoredAcknowledgedStudioDiffWriteIDs(for key: String) -> [String: String] {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return [:] }
        let localValues = normalizedAcknowledgedStudioDiffWriteIDs(loadAcknowledgedStudioDiffWriteIDMap()[normalizedKey] ?? [:])
        let backendValues = backendStoredAcknowledgedStudioDiffWriteIDs(for: normalizedKey)
        return backendValues.merging(localValues) { backendValue, localValue in
            localValue.isEmpty ? backendValue : localValue
        }
    }

    private func normalizedAcknowledgedStudioDiffRecords(_ records: [String: String]) -> [String: String] {
        var normalized: [String: String] = [:]
        for (key, fingerprint) in records {
            let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(key)
            let normalizedFingerprint = fingerprint.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !normalizedKey.isEmpty else { continue }
            normalized[normalizedKey] = normalizedFingerprint
        }
        let limitedPairs = Array(normalized.sorted(by: { $0.key < $1.key }).prefix(48))
        return limitedPairs.reduce(into: [String: String]()) { partialResult, item in
            partialResult[item.key] = item.value
        }
    }

    private func normalizedAcknowledgedStudioDiffWriteIDs(_ records: [String: String]) -> [String: String] {
        var normalized: [String: String] = [:]
        for (key, writeID) in records {
            let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(key)
            let normalizedWrite = normalizedWriteID(writeID)
            guard !normalizedKey.isEmpty, !normalizedWrite.isEmpty else { continue }
            normalized[normalizedKey] = normalizedWrite
        }
        let limitedPairs = Array(normalized.sorted(by: { $0.key < $1.key }).prefix(48))
        return limitedPairs.reduce(into: [String: String]()) { partialResult, item in
            partialResult[item.key] = item.value
        }
    }

    private func normalizedAcknowledgedStudioDiffKeys(_ records: [String: String]) -> [String] {
        Array(normalizedAcknowledgedStudioDiffRecords(records).keys).sorted()
    }

    private func normalizedAcknowledgedStudioDiffBackendEntries(
        _ records: [String: String],
        writeIDs: [String: String]
    ) -> [BackendScreenplayDiffAcknowledgementEntry] {
        normalizedAcknowledgedStudioDiffRecords(records)
            .sorted(by: { $0.key < $1.key })
            .map { item in
                BackendScreenplayDiffAcknowledgementEntry(
                    key: item.key,
                    fingerprint: item.value,
                    writeId: normalizedWriteID(writeIDs[item.key])
                )
            }
    }

    private func fallbackLatestReopenedWriteID(for key: String) -> String {
        let restored = restoredFullThreadBrowseState(for: key).record?.latestReopenedWriteID ?? ""
        return normalizedWriteID(restored)
    }

    private func currentFullThreadBrowseStateRecord() -> StudioFullThreadBrowseState {
        let latestReopenedExchange = studioAskNoteHistory.first(where: { isDiffReopened(for: $0) })
        let latestReopenedWriteID = normalizedWriteID(latestReopenedExchange?.writeID)
        let fallbackReopenedWriteID = fallbackLatestReopenedWriteID(for: activeStudioAskNoteHistoryKey)
        return StudioFullThreadBrowseState(
            searchText: fullStudioThreadSearchText.trimmingCharacters(in: .newlines),
            selectedFilterRaw: selectedFullThreadFilter.rawValue,
            selectedSceneKey: selectedFullThreadSceneKey.trimmingCharacters(in: .whitespacesAndNewlines),
            scrollTargetKey: fullThreadScrollTargetKey.trimmingCharacters(in: .whitespacesAndNewlines),
            collapsedSectionKeys: Array(collapsedFullThreadSectionKeys).sorted(),
            focusedDiffKey: focusedPageDiffPersistentKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            reopenedLineageKeys: Array(reopenedDiffExchangeKeys)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
                .sorted(),
            latestReopenedWriteID: latestReopenedWriteID.isEmpty ? fallbackReopenedWriteID : latestReopenedWriteID
        )
    }

    private func hasMeaningfulFullThreadBrowseState(_ record: StudioFullThreadBrowseState) -> Bool {
        !record.searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || record.selectedFilterRaw != FullThreadFilter.all.rawValue
            || !record.selectedSceneKey.isEmpty
            || !record.scrollTargetKey.isEmpty
            || !record.collapsedSectionKeys.isEmpty
            || !record.focusedDiffKey.isEmpty
            || !record.reopenedLineageKeys.isEmpty
            || !record.latestReopenedWriteID.isEmpty
    }

    private func backendStoredFullThreadBrowseState(for key: String) -> StudioFullThreadBrowseState? {
        guard let projectId = screenplayProjectIdFromHistoryKey(key) else { return nil }
        let project = (vm.selectedProject?.id == projectId)
            ? vm.selectedProject
            : vm.projects.first(where: { $0.id == projectId })
        return StudioFullThreadBrowseState(backend: project?.studioThreadViewState)
    }

    private func hasLoadedProjectMetadataForThreadViewKey(_ key: String) -> Bool {
        guard let projectId = screenplayProjectIdFromHistoryKey(key) else { return false }
        if vm.selectedProject?.id == projectId {
            return true
        }
        return vm.projects.contains(where: { $0.id == projectId })
    }

    private func backendThreadViewRestoreSignature(for key: String) -> String {
        guard let state = backendStoredFullThreadBrowseState(for: key) else { return "" }
        return [
            state.focusedDiffKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            state.latestReopenedWriteID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            state.reopenedLineageKeys.map {
                $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            }.joined(separator: ",")
        ].joined(separator: "|")
    }

    private func restoredFullThreadBrowseState(for key: String) -> StudioFullThreadBrowseStateRestoreResult {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return .empty }
        let backend = backendStoredFullThreadBrowseState(for: normalizedKey)
        let local = loadStudioFullThreadBrowseStateMap()[normalizedKey]
        return StudioFullThreadBrowseStateRestoreResult.resolve(local: local, backend: backend)
    }

    private func shouldRetryFullThreadBrowseStateRestore(
        for key: String,
        backendSignature: String
    ) -> Bool {
        guard !backendSignature.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard !isRestoringFullThreadBrowseState else { return false }

        let restoreResult = restoredFullThreadBrowseState(for: key)
        guard let record = restoreResult.record else { return false }

        let needsFocusedDiff = focusedPageDiffPersistentKey.isEmpty && !record.focusedDiffKey.isEmpty
        let needsReopened = reopenedDiffExchangeKeys.isEmpty
            && (!record.reopenedLineageKeys.isEmpty || !record.latestReopenedWriteID.isEmpty)
        let hasNoRecordedRestore = restoredStudioDebugStateSourceRaw == StudioThreadViewStateSource.none.rawValue
        let localRecord = loadStudioFullThreadBrowseStateMap()[key]
        let hasUnappliedLocalFocusedDiff =
            restoredStudioDebugFocusedDiffSourceRaw != StudioThreadViewStateSource.local.rawValue
            && !(localRecord?.focusedDiffKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)

        return hasNoRecordedRestore || needsFocusedDiff || needsReopened || hasUnappliedLocalFocusedDiff
    }

    private func backendStoredAcknowledgedStudioDiffRecords(for key: String) -> [String: String] {
        guard let projectId = screenplayProjectIdFromHistoryKey(key) else { return [:] }
        let project = (vm.selectedProject?.id == projectId)
            ? vm.selectedProject
            : vm.projects.first(where: { $0.id == projectId })
        let entries = project?.studioDiffAcknowledged?.entries ?? []
        if !entries.isEmpty {
            return entries.reduce(into: [String: String]()) { partialResult, entry in
                let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(entry.key ?? "")
                let fingerprint = (entry.fingerprint ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                guard !normalizedKey.isEmpty else { return }
                partialResult[normalizedKey] = fingerprint
            }
        }
        let values = project?.studioDiffAcknowledged?.keys ?? []
        return values.reduce(into: [String: String]()) { partialResult, value in
            let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(value)
            guard !normalizedKey.isEmpty else { return }
            partialResult[normalizedKey] = ""
        }
    }

    private func backendStoredAcknowledgedStudioDiffWriteIDs(for key: String) -> [String: String] {
        guard let projectId = screenplayProjectIdFromHistoryKey(key) else { return [:] }
        let project = (vm.selectedProject?.id == projectId)
            ? vm.selectedProject
            : vm.projects.first(where: { $0.id == projectId })
        let entries = project?.studioDiffAcknowledged?.entries ?? []
        return entries.reduce(into: [String: String]()) { partialResult, entry in
            let normalizedKey = normalizedAcknowledgedStudioDiffStorageKey(entry.key ?? "")
            let writeID = normalizedWriteID(entry.writeId)
            guard !normalizedKey.isEmpty, !writeID.isEmpty else { return }
            partialResult[normalizedKey] = writeID
        }
    }

    private func backendAcknowledgedStudioDiffSignature(for key: String) -> String {
        let records = backendStoredAcknowledgedStudioDiffRecords(for: key)
        let writeIDs = backendStoredAcknowledgedStudioDiffWriteIDs(for: key)
        let orderedKeys = Array(Set(records.keys).union(writeIDs.keys)).sorted()
        guard !orderedKeys.isEmpty else { return "" }
        return orderedKeys.map { key in
            let fingerprint = records[key] ?? ""
            let writeID = writeIDs[key] ?? ""
            return "\(key):\(fingerprint):\(writeID)"
        }.joined(separator: "|")
    }

    private func rawBackendProjectMetadataDebugSignature(for key: String) -> String {
        guard let projectId = screenplayProjectIdFromHistoryKey(key) else { return "" }
        let selectedProject = (vm.selectedProject?.id == projectId) ? vm.selectedProject : nil
        let listedProject = vm.projects.first(where: { $0.id == projectId })
        let selectedFocused = selectedProject?.studioThreadViewState?.focusedDiffKey ?? ""
        let selectedLatestReopened = selectedProject?.studioThreadViewState?.latestReopenedWriteID ?? ""
        let selectedReopened = (selectedProject?.studioThreadViewState?.reopenedLineageKeys ?? []).joined(separator: ",")
        let selectedAckKeys = String(selectedProject?.studioDiffAcknowledged?.keys?.count ?? 0)
        let selectedAckEntries = String(selectedProject?.studioDiffAcknowledged?.entries?.count ?? 0)
        let listedFocused = listedProject?.studioThreadViewState?.focusedDiffKey ?? ""
        let listedLatestReopened = listedProject?.studioThreadViewState?.latestReopenedWriteID ?? ""
        let listedReopened = (listedProject?.studioThreadViewState?.reopenedLineageKeys ?? []).joined(separator: ",")
        let listedAckKeys = String(listedProject?.studioDiffAcknowledged?.keys?.count ?? 0)
        let listedAckEntries = String(listedProject?.studioDiffAcknowledged?.entries?.count ?? 0)
        let components = [
            selectedProject?.id ?? "",
            selectedFocused,
            selectedLatestReopened,
            selectedReopened,
            selectedAckKeys,
            selectedAckEntries,
            listedFocused,
            listedLatestReopened,
            listedReopened,
            listedAckKeys,
            listedAckEntries,
        ]
        return components.joined(separator: "|")
    }

    private func shouldRetryAcknowledgedStudioDiffRestore(
        for key: String,
        backendSignature: String
    ) -> Bool {
        guard !backendSignature.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard screenplayProjectIdFromHistoryKey(key) != nil else { return false }
        return acknowledgedDiffExchangeKeys.isEmpty
            && acknowledgedDiffFingerprints.isEmpty
            && acknowledgedDiffWriteIDs.isEmpty
    }

    private func shouldDeferBackendThreadViewPersist(for key: String) -> Bool {
        StudioThreadViewPersistPolicy.shouldDeferBackendPersist(
            StudioThreadViewPersistDeferralContext(
                hasProjectKey: screenplayProjectIdFromHistoryKey(key) != nil,
                isRestoringFullThreadBrowseState: isRestoringFullThreadBrowseState,
                isAwaitingInitialFullThreadRestore: isAwaitingInitialFullThreadRestore,
                isAwaitingInitialAcknowledgedDiffHydration: isAwaitingInitialAcknowledgedDiffHydration,
                isRestoringReopenedDiffState: isRestoringReopenedDiffState
            )
        )
    }

    private func schedulePersistFullThreadBrowseStateToBackend(
        _ record: StudioFullThreadBrowseState,
        for key: String
    ) {
        guard let projectId = screenplayProjectIdFromHistoryKey(key),
              let project = (vm.selectedProject?.id == projectId
                             ? vm.selectedProject
                             : vm.projects.first(where: { $0.id == projectId })) else {
            return
        }

        backendThreadViewStatePersistTask?.cancel()
        backendThreadViewStatePersistTask = Task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            guard !Task.isCancelled else { return }
            do {
                let result = try await BackendMemoryAPI.shared.upsertScreenplayProject(
                    projectId: project.id,
                    title: project.title,
                    phase: project.lastPhase ?? "scene_draft",
                    tags: project.tags ?? [],
                    characters: project.characters ?? [],
                    setting: project.setting ?? "",
                    tone: project.tone ?? "",
                    studioThreadViewState: hasMeaningfulFullThreadBrowseState(record)
                        ? record.backendPayload
                        : BackendScreenplayThreadViewState(
                            searchText: "",
                            selectedFilterRaw: "",
                            selectedSceneKey: "",
                            scrollTargetKey: "",
                            collapsedSectionKeys: [],
                            focusedDiffKey: "",
                            reopenedLineageKeys: [],
                            latestReopenedWriteID: ""
                        ),
                    studioDiffAcknowledgedKeys: normalizedAcknowledgedStudioDiffKeys(currentAcknowledgedStudioDiffRecords()),
                    studioDiffAcknowledgedEntries: normalizedAcknowledgedStudioDiffBackendEntries(
                        currentAcknowledgedStudioDiffRecords(),
                        writeIDs: currentAcknowledgedStudioDiffWriteIDs()
                    )
                )
                if let nextProject = result.payload.project {
                    await MainActor.run {
                        vm.applyProjectMetadataUpdate(nextProject)
                        studioBackgroundSyncNoticeText = ""
                    }
                } else {
                    await MainActor.run {
                        studioBackgroundSyncNoticeText = ""
                    }
                }
            } catch {
                await MainActor.run {
                    studioBackgroundSyncNoticeText = "Saved on this device. Studio sync will retry when the connection returns."
                }
            }
        }
    }

    private func persistFullThreadBrowseState(for key: String) {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return }
        var store = loadStudioFullThreadBrowseStateMap()
        let record = currentFullThreadBrowseStateRecord()
        if store[normalizedKey] != nil
            && shouldDeferBackendThreadViewPersist(for: normalizedKey)
            && screenplayProjectIdFromHistoryKey(normalizedKey) != nil {
            return
        }
        if store[normalizedKey] != nil
            && restoredStudioDebugStateSourceRaw == StudioThreadViewStateSource.backend.rawValue
            && restoredStudioDebugFocusedDiffSourceRaw != StudioThreadViewStateSource.local.rawValue
            && screenplayProjectIdFromHistoryKey(normalizedKey) != nil {
            return
        }
        if !hasMeaningfulFullThreadBrowseState(record)
            && isAwaitingInitialFullThreadRestore
            && screenplayProjectIdFromHistoryKey(normalizedKey) != nil {
            return
        }
        if hasMeaningfulFullThreadBrowseState(record) {
            store[normalizedKey] = record
        } else {
            store.removeValue(forKey: normalizedKey)
        }
        if !shouldDeferBackendThreadViewPersist(for: normalizedKey) {
            schedulePersistFullThreadBrowseStateToBackend(record, for: normalizedKey)
        }
        guard !store.isEmpty else {
            studioFullThreadStateStorage = ""
            return
        }
        guard let data = try? JSONEncoder().encode(store),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioFullThreadStateStorage = encoded
    }

    private func restoreFullThreadBrowseState(for key: String) {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        isRestoringFullThreadBrowseState = true
        defer {
            DispatchQueue.main.async {
                self.isRestoringFullThreadBrowseState = false
            }
        }
        guard !normalizedKey.isEmpty else {
            isAwaitingInitialFullThreadRestore = false
            isAwaitingInitialAcknowledgedDiffHydration = false
            fullStudioThreadSearchText = ""
            selectedFullThreadFilter = .all
            selectedFullThreadSceneKey = ""
            fullThreadScrollTargetKey = ""
            collapsedFullThreadSectionKeys = []
            isFocusedPageDiffOverlayPresented = false
            focusedPageDiffPersistentKey = ""
            focusedPageDiffExchangeID = nil
            reopenedDiffExchangeKeys = []
            isRestoringReopenedDiffState = false
            restoredStudioDebugStateSourceRaw = StudioThreadViewStateSource.none.rawValue
            restoredStudioDebugFocusedDiffSourceRaw = StudioThreadViewStateSource.none.rawValue
            restoredStudioDebugReopenedSourceRaw = StudioThreadViewStateSource.none.rawValue
            restoredStudioDebugFocusedDiffKey = ""
            restoredStudioDebugReopenedLineageKeys = []
            restoredStudioDebugLatestReopenedWriteID = ""
            return
        }
        let restoreResult = restoredFullThreadBrowseState(for: normalizedKey)
        let record = restoreResult.record
        isAwaitingInitialFullThreadRestore = screenplayProjectIdFromHistoryKey(normalizedKey) != nil
            && restoreResult.source == .none
            && !hasLoadedProjectMetadataForThreadViewKey(normalizedKey)
        fullStudioThreadSearchText = record?.searchText ?? ""
        selectedFullThreadFilter = FullThreadFilter(rawValue: record?.selectedFilterRaw ?? "") ?? .all
        selectedFullThreadSceneKey = record?.selectedSceneKey ?? ""
        fullThreadScrollTargetKey = record?.scrollTargetKey ?? ""
        collapsedFullThreadSectionKeys = Set(record?.collapsedSectionKeys ?? [])
        isFocusedPageDiffOverlayPresented = false
        focusedPageDiffPersistentKey = record?.focusedDiffKey ?? ""
        reopenedDiffExchangeKeys = Set(record?.reopenedLineageKeys ?? [])
        isRestoringReopenedDiffState = !reopenedDiffExchangeKeys.isEmpty
        isAwaitingInitialAcknowledgedDiffHydration =
            screenplayProjectIdFromHistoryKey(normalizedKey) != nil
            && (
                isRestoringReopenedDiffState
                || !hasLoadedProjectMetadataForThreadViewKey(normalizedKey)
            )
        focusedPageDiffExchangeID = studioAskNoteHistory.first(where: {
            studioExchangePersistentActionKey($0) == focusedPageDiffPersistentKey
        })?.id
        restoredStudioDebugStateSourceRaw = restoreResult.source.rawValue
        restoredStudioDebugFocusedDiffSourceRaw = restoreResult.focusedDiffSource.rawValue
        restoredStudioDebugReopenedSourceRaw = restoreResult.reopenedSource.rawValue
        restoredStudioDebugFocusedDiffKey = record?.focusedDiffKey ?? ""
        restoredStudioDebugReopenedLineageKeys = record?.reopenedLineageKeys ?? []
        restoredStudioDebugLatestReopenedWriteID = record?.latestReopenedWriteID ?? ""
    }

    private func currentVersionStudioWriteAnchors() -> [BackendScreenplayWriteAnchor] {
        func filtered(_ anchors: [BackendScreenplayWriteAnchor]?) -> [BackendScreenplayWriteAnchor] {
            (anchors ?? []).filter { anchor in
                !normalizedWriteID(anchor.writeId).hasPrefix("binding:")
            }
        }
        let preferredVersionID = vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        if let version = vm.selectedProject?.versions?.first(where: { $0.id == preferredVersionID }) {
            return filtered(version.studioWriteAnchors)
        }
        if let activeVersionID = vm.selectedProject?.activeVersionId?.trimmingCharacters(in: .whitespacesAndNewlines),
           let version = vm.selectedProject?.versions?.first(where: { $0.id == activeVersionID }) {
            return filtered(version.studioWriteAnchors)
        }
        return filtered(vm.selectedProject?.versions?.first?.studioWriteAnchors)
    }

    private func currentScreenplayBindingPayload() -> [BackendScreenplayBindingRecord] {
        let bindingSnapshot = liveDraftBridge.projectBinding
        guard !bindingSnapshot.projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        let timestamp = max(bindingSnapshot.updatedAt.timeIntervalSince1970 * 1000, 1)
        return bindingSnapshot.sceneBindings.map { binding in
            BackendScreenplayBindingRecord(
                draftSceneId: binding.draftSceneID,
                draftLine: binding.draftLine,
                draftEndLine: binding.draftEndLine,
                draftSlugline: binding.draftSlugline,
                draftShortLabel: binding.draftShortLabel,
                outlineSceneId: binding.outlineSceneID,
                outlineSceneTitle: binding.outlineSceneTitle,
                outlineSceneSlugline: binding.outlineSceneSlugline,
                outlineBeatIds: binding.outlineBeatIDs,
                outlineBeatLabels: binding.outlineBeatLabels,
                actTitle: binding.actTitle,
                matchedBy: binding.matchedBy,
                updatedAt: timestamp
            )
        }
    }

    private func currentStudioWriteAnchorPayload(from entries: [StudioAskNoteExchange]) -> [BackendScreenplayWriteAnchor] {
        var merged: [String: BackendScreenplayWriteAnchor] = [:]
        for anchor in currentVersionStudioWriteAnchors() {
            let writeID = normalizedWriteID(anchor.writeId)
            guard !writeID.isEmpty else { continue }
            merged[writeID] = anchor
        }
        for exchange in entries {
            guard exchange.target == .page else { continue }
            let writeID = normalizedWriteID(exchange.writeID)
            guard !writeID.isEmpty else { continue }
            let anchorLine = exchange.anchorLine ?? merged[writeID]?.anchorLine
            guard anchorLine != nil else { continue }
            merged[writeID] = BackendScreenplayWriteAnchor(
                writeId: writeID,
                anchorLine: anchorLine,
                anchorEndLine: exchange.anchorEndLine ?? merged[writeID]?.anchorEndLine,
                anchorSceneLabel: exchange.anchorSceneLabel ?? merged[writeID]?.anchorSceneLabel,
                anchorExcerpt: exchange.anchorExcerpt ?? merged[writeID]?.anchorExcerpt,
                insertedText: exchange.insertedText ?? merged[writeID]?.insertedText,
                updatedAt: exchange.timestamp.timeIntervalSince1970 * 1000
            )
        }
        return merged.values
            .sorted { ($0.updatedAt ?? 0) > ($1.updatedAt ?? 0) }
            .prefix(128)
            .map { $0 }
    }

    private func normalizedBackendThreadID(_ value: String?) -> String {
        let raw = (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard !raw.isEmpty else { return "" }
        if raw.hasPrefix("turn-") {
            return raw
        }
        let digits = raw.filter(\.isNumber)
        if !digits.isEmpty {
            return "turn-\(digits)"
        }
        return raw
    }

    private func normalizedStudioRequestID(_ value: String?) -> String {
        (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private func isPlaceholderStudioWriteID(_ value: String?) -> Bool {
        normalizedWriteID(value).hasPrefix("stub-")
    }

    private func mergedStudioWriteID(preferred: String?, fallback: String?) -> String? {
        let preferredWriteID = normalizedWriteID(preferred)
        let fallbackWriteID = normalizedWriteID(fallback)
        let preferredAuthoritative = !preferredWriteID.isEmpty && !isPlaceholderStudioWriteID(preferredWriteID)
        let fallbackAuthoritative = !fallbackWriteID.isEmpty && !isPlaceholderStudioWriteID(fallbackWriteID)
        if preferredAuthoritative {
            return preferred
        }
        if fallbackAuthoritative {
            return fallback
        }
        if !preferredWriteID.isEmpty {
            return preferred
        }
        if !fallbackWriteID.isEmpty {
            return fallback
        }
        return nil
    }

#if DEBUG || os(macOS)
    private func publishStudioDebugSubmitResultPayload(
        token: Int,
        status: String,
        prompt: String,
        requestID: String,
        routingMode: PromptRoutingMode,
        target: StudioTarget,
        exchange: StudioAskNoteExchange?,
        error: String
    ) {
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let resolvedExchange = exchange
        let payload = StudioDebugSubmitResultPayload(
            token: token,
            status: status,
            transport: studioDebugSubmitTransportModeRaw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "live"
                : studioDebugSubmitTransportModeRaw.trimmingCharacters(in: .whitespacesAndNewlines),
            requestID: normalizedStudioRequestID(requestID),
            prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
            routingMode: routingMode.rawValue,
            target: (resolvedExchange?.target ?? target).rawValue,
            memoryDomain: resolvedExchange.map { resolvedMemoryDomain(for: $0).rawValue } ?? liveDraftBridge.latestMemoryDomain.rawValue,
            companionMode: resolvedExchange.flatMap { resolvedCompanionMode(for: $0)?.rawValue } ?? "",
            noteTitle: resolvedExchange?.noteTitle ?? "",
            noteBody: resolvedExchange?.noteBody ?? "",
            developmentText: resolvedExchange?.developmentText ?? "",
            insertedText: resolvedExchange?.insertedText ?? "",
            error: error.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        if let data = try? JSONEncoder().encode(payload),
           let encoded = String(data: data, encoding: .utf8) {
            studioDebugSubmitResultJSON = encoded
            mirrorStudioDebugString(encoded, forKey: "studio_debug_submit_result_json")
            mirrorStudioDebugString(encoded, forKey: "studio_debug_submit_result_json_\(token)")
        } else {
            studioDebugSubmitResultJSON = ""
            mirrorStudioDebugString("", forKey: "studio_debug_submit_result_json")
            mirrorStudioDebugString("", forKey: "studio_debug_submit_result_json_\(token)")
        }
        setStudioDebugSubmitResult(
            token: token,
            status: status,
            error: error.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }
#endif

    #if DEBUG || os(macOS)


    private func runStudioThreadViewStateDecodeMergeRegressionSmoke() {
        let legacyPayload = """
        {
          "searchText":"legacy search",
          "selectedFilterRaw":"pageWrites",
          "selectedSceneKey":"scene:legacy",
          "scrollTargetKey":"thread:legacy",
          "collapsedSectionKeys":["scene:legacy"],
          "focusedDiffKey":"thread:legacy"
        }
        """

        guard let legacyData = legacyPayload.data(using: .utf8),
              let decodedLegacy = try? JSONDecoder().decode(StudioFullThreadBrowseState.self, from: legacyData) else {
            preconditionFailure("Studio thread-view decode regression smoke failed to decode legacy payload.")
        }

        assert(decodedLegacy.searchText == "legacy search")
        assert(decodedLegacy.selectedFilterRaw == FullThreadFilter.pageWrites.rawValue)
        assert(decodedLegacy.focusedDiffKey == "thread:legacy")
        assert(decodedLegacy.reopenedLineageKeys.isEmpty)
        assert(decodedLegacy.latestReopenedWriteID.isEmpty)

        let backend = StudioFullThreadBrowseState(
            searchText: "backend search",
            selectedFilterRaw: FullThreadFilter.voicePin.rawValue,
            selectedSceneKey: "scene:backend",
            scrollTargetKey: "thread:backend",
            collapsedSectionKeys: ["scene:backend"],
            focusedDiffKey: "thread:backend",
            reopenedLineageKeys: ["lineage:backend"],
            latestReopenedWriteID: "write-backend"
        )
        let local = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: FullThreadFilter.pageWrites.rawValue,
            selectedSceneKey: "",
            scrollTargetKey: "thread:local",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:local",
            reopenedLineageKeys: ["lineage:local"],
            latestReopenedWriteID: "write-local"
        )

        let merged = StudioFullThreadBrowseStateRestoreResult.resolve(local: local, backend: backend)
        assert(merged.record?.searchText == "backend search")
        assert(merged.record?.selectedFilterRaw == FullThreadFilter.pageWrites.rawValue)
        assert(merged.record?.selectedSceneKey == "scene:backend")
        assert(merged.record?.scrollTargetKey == "thread:local")
        assert(merged.record?.collapsedSectionKeys == ["scene:backend"])
        assert(merged.record?.focusedDiffKey == "thread:local")
        assert(merged.record?.reopenedLineageKeys == ["lineage:local"])
        assert(merged.record?.latestReopenedWriteID == "write-local")
        assert(merged.source == .merged)
        assert(merged.focusedDiffSource == .local)
        assert(merged.reopenedSource == .local)

        let backendOnly = StudioFullThreadBrowseStateRestoreResult.resolve(local: nil, backend: backend)
        assert(backendOnly.record == backend)
        assert(backendOnly.source == .backend)
        assert(backendOnly.focusedDiffSource == .backend)
        assert(backendOnly.reopenedSource == .backend)

        assert(
            StudioAcknowledgedDiffStorageSupport.normalizePersistentKey("write:ABC-123")
            == "lineage:abc-123"
        )
        assert(
            StudioAcknowledgedDiffStorageSupport.normalizePersistentKey("lineage:EXISTING")
            == "lineage:existing"
        )

        let startupDeferral = StudioThreadViewPersistPolicy.shouldDeferBackendPersist(
            StudioThreadViewPersistDeferralContext(
                hasProjectKey: true,
                isRestoringFullThreadBrowseState: false,
                isAwaitingInitialFullThreadRestore: false,
                isAwaitingInitialAcknowledgedDiffHydration: true,
                isRestoringReopenedDiffState: false
            )
        )
        assert(startupDeferral)

        let restoreDeferral = StudioThreadViewPersistPolicy.shouldDeferBackendPersist(
            StudioThreadViewPersistDeferralContext(
                hasProjectKey: true,
                isRestoringFullThreadBrowseState: true,
                isAwaitingInitialFullThreadRestore: false,
                isAwaitingInitialAcknowledgedDiffHydration: false,
                isRestoringReopenedDiffState: false
            )
        )
        assert(restoreDeferral)

        let settledPolicy = StudioThreadViewPersistPolicy.shouldDeferBackendPersist(
            StudioThreadViewPersistDeferralContext(
                hasProjectKey: true,
                isRestoringFullThreadBrowseState: false,
                isAwaitingInitialFullThreadRestore: false,
                isAwaitingInitialAcknowledgedDiffHydration: false,
                isRestoringReopenedDiffState: false
            )
        )
        assert(!settledPolicy)

        let nonProjectPolicy = StudioThreadViewPersistPolicy.shouldDeferBackendPersist(
            StudioThreadViewPersistDeferralContext(
                hasProjectKey: false,
                isRestoringFullThreadBrowseState: true,
                isAwaitingInitialFullThreadRestore: true,
                isAwaitingInitialAcknowledgedDiffHydration: true,
                isRestoringReopenedDiffState: true
            )
        )
        assert(!nonProjectPolicy)

        let empty = StudioFullThreadBrowseStateRestoreResult.resolve(local: nil, backend: nil)
        assert(empty.record == nil)
        assert(empty.source == .none)
    }
    #endif

    private func persistentStudioThreadSelectionKey(for exchange: StudioAskNoteExchange) -> String {
        let backendID = normalizedBackendThreadID(exchange.backendThreadID)
        if !backendID.isEmpty {
            return "backend:\(backendID)"
        }
        return exchange.id.uuidString.lowercased()
    }

    private func backendTurnNumber(from turnId: String?) -> Int? {
        let digits = (turnId ?? "").filter(\.isNumber)
        guard let value = Int(digits), value > 0 else { return nil }
        return value
    }

    private func studioExchangePersistentActionKey(_ exchange: StudioAskNoteExchange) -> String {
        let backendID = normalizedBackendThreadID(exchange.backendThreadID)
        if !backendID.isEmpty {
            return "thread:\(backendID)"
        }
        let writeID = normalizedWriteID(exchange.writeID)
        if !writeID.isEmpty {
            return "write:\(writeID)"
        }
        return exchange.id.uuidString.lowercased()
    }

    private func studioExchangeLineageKey(
        _ exchange: StudioAskNoteExchange,
        entries: [StudioAskNoteExchange]? = nil
    ) -> String {
        let writeID = normalizedWriteID(exchange.writeID)
        guard !writeID.isEmpty else {
            return studioExchangePersistentActionKey(exchange)
        }

        let sourceEntries = entries ?? studioAskNoteHistory
        let byWriteID = sourceEntries.reduce(into: [String: StudioAskNoteExchange]()) { partialResult, item in
            let key = normalizedWriteID(item.writeID)
            guard !key.isEmpty, partialResult[key] == nil else { return }
            partialResult[key] = item
        }

        var rootWriteID = writeID
        var predecessorWriteID = normalizedWriteID(exchange.replacedWriteID)
        var visited: Set<String> = [writeID]

        while !predecessorWriteID.isEmpty, !visited.contains(predecessorWriteID) {
            rootWriteID = predecessorWriteID
            visited.insert(predecessorWriteID)
            predecessorWriteID = normalizedWriteID(byWriteID[predecessorWriteID]?.replacedWriteID)
        }

        return "lineage:\(rootWriteID)"
    }

    private func studioTurnEventMatchesExchange(
        _ event: BackendTurnCommittedEvent,
        exchange: StudioAskNoteExchange
    ) -> Bool {
        let exchangeBackendID = normalizedBackendThreadID(exchange.backendThreadID)
        let eventBackendID = normalizedBackendThreadID(event.turnId)
        if !exchangeBackendID.isEmpty {
            return exchangeBackendID == eventBackendID
        }

        let exchangeRequestID = normalizedStudioRequestID(exchange.requestID)
        let eventRequestID = normalizedStudioRequestID(event.requestId)
        if !exchangeRequestID.isEmpty || !eventRequestID.isEmpty {
            guard !exchangeRequestID.isEmpty, !eventRequestID.isEmpty else { return false }
            return exchangeRequestID == eventRequestID
        }

        let eventPrompt = normalizedAnchorExcerpt(event.userMessage)
        let exchangePrompt = normalizedAnchorExcerpt(exchange.prompt)
        guard !eventPrompt.isEmpty, !exchangePrompt.isEmpty else { return false }
        if eventPrompt == exchangePrompt {
            return true
        }
        if eventPrompt.contains(exchangePrompt) || exchangePrompt.contains(eventPrompt) {
            return true
        }
        return false
    }

    private func applyingBackendTurnEvent(
        _ event: BackendTurnCommittedEvent,
        to exchange: StudioAskNoteExchange
    ) -> StudioAskNoteExchange {
        let eventTargetRaw = (event.screenplayTarget ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let mergedTarget: StudioTarget
        switch eventTargetRaw {
        case "page":
            mergedTarget = .page
        case "voice_pin", "voicepin":
            mergedTarget = .voicePin
        default:
            mergedTarget = exchange.target
        }

        let eventSourceRaw = (event.screenplayPromptSource ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let mergedSource = StudioPromptSource(rawValue: eventSourceRaw) ?? exchange.source
        let eventInsertedText = (event.screenplayInsertedText ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let eventNoteBody = (event.screenplayNoteBody ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let eventNoteTitle = (event.screenplayNoteTitle ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let isPageWrite = mergedTarget == .page
        let mergedNoteBody: String
        if isPageWrite, !eventNoteBody.isEmpty {
            mergedNoteBody = noteBodyForExchange(eventNoteBody)
        } else if isPageWrite, !eventInsertedText.isEmpty {
            mergedNoteBody = noteBodyForExchange(eventInsertedText)
        } else {
            mergedNoteBody = exchange.noteBody
        }
        let mergedAnchorExcerpt: String?
        if isPageWrite, !eventInsertedText.isEmpty {
            mergedAnchorExcerpt = noteBodyForAnchor(eventInsertedText)
        } else if isPageWrite, !eventNoteBody.isEmpty {
            mergedAnchorExcerpt = noteBodyForAnchor(eventNoteBody)
        } else {
            mergedAnchorExcerpt = exchange.anchorExcerpt
        }

        return StudioAskNoteExchange(
            id: exchange.id,
            backendThreadID: normalizedBackendThreadID(event.turnId),
            backendTurn: backendTurnNumber(from: event.turnId) ?? exchange.backendTurn,
            requestID: normalizedStudioRequestID(exchange.requestID).isEmpty ? normalizedStudioRequestID(event.requestId) : exchange.requestID,
            prompt: exchange.prompt,
            target: mergedTarget,
            source: mergedSource,
            noteTitle: eventNoteTitle.isEmpty ? exchange.noteTitle : eventNoteTitle,
            noteBody: mergedNoteBody,
            developmentText: isPageWrite && !eventInsertedText.isEmpty ? nil : exchange.developmentText,
            writeID: normalizedWriteID(exchange.writeID).isEmpty ? event.screenplayWriteId : exchange.writeID,
            replacedWriteID: normalizedWriteID(exchange.replacedWriteID).isEmpty ? event.screenplayReplacedWriteId : exchange.replacedWriteID,
            anchorLine: exchange.anchorLine ?? event.screenplayAnchorLine,
            anchorEndLine: exchange.anchorEndLine ?? event.screenplayAnchorEndLine,
            anchorSceneLabel: normalizedAnchorExcerpt(exchange.anchorSceneLabel).isEmpty ? event.screenplayAnchorSceneLabel : exchange.anchorSceneLabel,
            anchorExcerpt: normalizedAnchorExcerpt(exchange.anchorExcerpt).isEmpty ? mergedAnchorExcerpt : exchange.anchorExcerpt,
            insertedText: normalizedAnchorExcerpt(exchange.insertedText).isEmpty ? eventInsertedText : exchange.insertedText,
            replacementApplied: exchange.replacementApplied ?? event.screenplayReplacementApplied,
            revisedBlockText: normalizedAnchorExcerpt(exchange.revisedBlockText).isEmpty ? event.screenplayRevisedBlockText : exchange.revisedBlockText,
            resolvedAnchorExcerpt: normalizedAnchorExcerpt(exchange.resolvedAnchorExcerpt).isEmpty ? event.screenplayResolvedAnchorExcerpt : exchange.resolvedAnchorExcerpt,
            packLabel: exchange.packLabel,
            phase: exchange.phase,
            sluglineAnchorLine: exchange.sluglineAnchorLine,
            memoryDomainRaw: exchange.memoryDomainRaw,
            companionModeRaw: exchange.companionModeRaw,
            timestamp: exchange.timestamp
        )
    }

    private func consumePendingStudioTurnEvent(for exchange: StudioAskNoteExchange) -> StudioAskNoteExchange {
        guard let index = pendingStudioTurnEvents.firstIndex(where: { studioTurnEventMatchesExchange($0, exchange: exchange) }) else {
            return exchange
        }
        let event = pendingStudioTurnEvents.remove(at: index)
        return applyingBackendTurnEvent(event, to: exchange)
    }

    private func handleStudioTurnCommittedEvent(_ event: BackendTurnCommittedEvent) {
        if vm.pendingScreenplayQuestion != nil {
            Task { await vm.refreshPendingScreenplayQuestion() }
        }
        if let index = studioAskNoteHistory.firstIndex(where: { studioTurnEventMatchesExchange(event, exchange: $0) }) {
            studioAskNoteHistory[index] = applyingBackendTurnEvent(event, to: studioAskNoteHistory[index])
            persistStudioAskNoteHistory(studioAskNoteHistory, for: activeStudioAskNoteHistoryKey)
            return
        }
        let prompt = normalizedAnchorExcerpt(event.userMessage)
        guard !prompt.isEmpty else { return }
        pendingStudioTurnEvents.insert(event, at: 0)
        if pendingStudioTurnEvents.count > 12 {
            pendingStudioTurnEvents = Array(pendingStudioTurnEvents.prefix(12))
        }
    }

    private func persistSelectedStudioThreadID(_ id: UUID?, for key: String) {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return }
        var store = loadStudioAskNoteSelectionMap()
        if let id {
            if let exchange = studioAskNoteHistory.first(where: { $0.id == id }) {
                store[normalizedKey] = persistentStudioThreadSelectionKey(for: exchange)
            } else {
                store[normalizedKey] = id.uuidString.lowercased()
            }
        } else {
            store.removeValue(forKey: normalizedKey)
        }
        guard !store.isEmpty else {
            studioAskNoteSelectionStorage = ""
            return
        }
        guard let data = try? JSONEncoder().encode(store),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioAskNoteSelectionStorage = encoded
    }

    private func restoredSelectedStudioThreadID(
        for key: String,
        entries: [StudioAskNoteExchange]
    ) -> UUID? {
        guard !entries.isEmpty else { return nil }
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return entries.first?.id }
        let store = loadStudioAskNoteSelectionMap()
        if let rawID = store[normalizedKey]?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            if let matched = entries.first(where: {
                persistentStudioThreadSelectionKey(for: $0) == rawID
            }) {
                return matched.id
            }
            if let selectedID = UUID(uuidString: rawID),
               entries.contains(where: { $0.id == selectedID }) {
                return selectedID
            }
        }
        return entries.first?.id
    }

    private func persistStudioWriteAnchorSnapshot(
        from entries: [StudioAskNoteExchange],
        for key: String,
        versionID: String
    ) {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return }
        var store = loadStudioWriteAnchorMap()
        let normalizedVersionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        var records: [String: StudioWriteAnchorRecord] = [:]
        for exchange in entries {
            guard exchange.target == .page else { continue }
            let writeID = normalizedWriteID(exchange.writeID)
            guard !writeID.isEmpty,
                  let anchorLine = exchange.anchorLine else { continue }
            records[writeID] = StudioWriteAnchorRecord(
                writeID: writeID,
                anchorLine: anchorLine,
                anchorEndLine: exchange.anchorEndLine ?? anchorLine,
                anchorSceneLabel: exchange.anchorSceneLabel,
                anchorExcerpt: exchange.anchorExcerpt,
                insertedText: exchange.insertedText,
                versionID: normalizedVersionID.isEmpty ? nil : normalizedVersionID,
                updatedAt: exchange.timestamp
            )
        }
        if records.isEmpty {
            store.removeValue(forKey: normalizedKey)
        } else {
            store[normalizedKey] = records
        }
        guard !store.isEmpty else {
            studioWriteAnchorStorage = ""
            return
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(store),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioWriteAnchorStorage = encoded
    }

    private func storedStudioWriteAnchor(
        for exchange: StudioAskNoteExchange,
        key: String
    ) -> StudioWriteAnchorRecord? {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        let writeID = normalizedWriteID(exchange.writeID)
        guard !normalizedKey.isEmpty, !writeID.isEmpty else { return nil }
        if let local = loadStudioWriteAnchorMap()[normalizedKey]?[writeID] {
            return local
        }
        if let backend = currentVersionStudioWriteAnchors().first(where: { normalizedWriteID($0.writeId) == writeID }),
           let anchorLine = backend.anchorLine,
           anchorLine > 0 {
            return StudioWriteAnchorRecord(
                writeID: writeID,
                anchorLine: anchorLine,
                anchorEndLine: backend.anchorEndLine ?? anchorLine,
                anchorSceneLabel: backend.anchorSceneLabel,
                anchorExcerpt: backend.anchorExcerpt,
                insertedText: backend.insertedText,
                versionID: vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : vm.latestVersionID,
                updatedAt: dateFromTimestamp(backend.updatedAt) ?? Date()
            )
        }
        return nil
    }

    private func applyStoredWriteAnchors(
        to entries: [StudioAskNoteExchange],
        for key: String
    ) -> [StudioAskNoteExchange] {
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedKey.isEmpty else { return entries }
        let store = loadStudioWriteAnchorMap()[normalizedKey] ?? [:]
        var backendStore: [String: StudioWriteAnchorRecord] = [:]
        for anchor in currentVersionStudioWriteAnchors() {
            let writeID = normalizedWriteID(anchor.writeId)
            guard !writeID.isEmpty,
                  let anchorLine = anchor.anchorLine,
                  anchorLine > 0 else { continue }
            backendStore[writeID] = StudioWriteAnchorRecord(
                writeID: writeID,
                anchorLine: anchorLine,
                anchorEndLine: anchor.anchorEndLine ?? anchorLine,
                anchorSceneLabel: anchor.anchorSceneLabel,
                anchorExcerpt: anchor.anchorExcerpt,
                insertedText: anchor.insertedText,
                versionID: vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : vm.latestVersionID,
                updatedAt: dateFromTimestamp(anchor.updatedAt) ?? Date()
            )
        }
        guard !store.isEmpty || !backendStore.isEmpty else { return entries }
        return entries.map { exchange in
            let writeID = normalizedWriteID(exchange.writeID)
            guard exchange.target == .page,
                  !writeID.isEmpty,
                  let record = store[writeID] ?? backendStore[writeID] else { return exchange }
            return StudioAskNoteExchange(
                id: exchange.id,
                backendThreadID: exchange.backendThreadID,
                backendTurn: exchange.backendTurn,
                requestID: exchange.requestID,
                prompt: exchange.prompt,
                target: exchange.target,
                source: exchange.source,
                noteTitle: exchange.noteTitle,
                noteBody: exchange.noteBody,
                developmentText: exchange.developmentText,
                writeID: exchange.writeID,
                replacedWriteID: exchange.replacedWriteID,
                anchorLine: record.anchorLine,
                anchorEndLine: record.anchorEndLine,
                anchorSceneLabel: record.anchorSceneLabel,
                anchorExcerpt: record.anchorExcerpt ?? exchange.anchorExcerpt,
                insertedText: record.insertedText ?? exchange.insertedText,
                replacementApplied: exchange.replacementApplied,
                revisedBlockText: exchange.revisedBlockText,
                resolvedAnchorExcerpt: exchange.resolvedAnchorExcerpt,
                packLabel: exchange.packLabel,
                phase: exchange.phase,
                sluglineAnchorLine: exchange.sluglineAnchorLine,
                memoryDomainRaw: exchange.memoryDomainRaw,
                companionModeRaw: exchange.companionModeRaw,
                timestamp: exchange.timestamp
            )
        }
    }

    private func studioThreadDedupKey(_ exchange: StudioAskNoteExchange) -> String {
        let requestID = normalizedStudioRequestID(exchange.requestID)
        if !requestID.isEmpty {
            return "request:\(requestID)"
        }
        let writeID = normalizedWriteID(exchange.writeID)
        if !writeID.isEmpty {
            return "write:\(writeID)"
        }
        let backendID = normalizedBackendThreadID(exchange.backendThreadID)
        if !backendID.isEmpty {
            return "backend:\(backendID)"
        }
        return [
            exchange.target.rawValue,
            exchange.source.rawValue,
            normalizedAnchorExcerpt(exchange.prompt),
            normalizedAnchorExcerpt(exchange.noteTitle),
            normalizedAnchorExcerpt(exchange.noteBody),
            normalizedAnchorExcerpt(exchange.anchorSceneLabel)
        ].joined(separator: "|")
    }

    private func mergeStudioThreadExchange(
        _ existing: StudioAskNoteExchange,
        with incoming: StudioAskNoteExchange
    ) -> StudioAskNoteExchange {
        let preferred = incoming.timestamp >= existing.timestamp ? incoming : existing
        let fallback = preferred.id == existing.id ? incoming : existing
        let backendTurn = max(existing.backendTurn ?? 0, incoming.backendTurn ?? 0)
        return StudioAskNoteExchange(
            id: existing.id,
            backendThreadID: normalizedBackendThreadID(existing.backendThreadID).isEmpty
                ? incoming.backendThreadID
                : existing.backendThreadID,
            backendTurn: backendTurn > 0 ? backendTurn : nil,
            requestID: normalizedStudioRequestID(preferred.requestID).isEmpty ? fallback.requestID : preferred.requestID,
            prompt: preferred.prompt.isEmpty ? fallback.prompt : preferred.prompt,
            target: preferred.target,
            source: preferred.source,
            noteTitle: preferred.noteTitle.isEmpty ? fallback.noteTitle : preferred.noteTitle,
            noteBody: preferred.noteBody.isEmpty ? fallback.noteBody : preferred.noteBody,
            developmentText: normalizedAnchorExcerpt(preferred.developmentText).isEmpty
                ? fallback.developmentText
                : preferred.developmentText,
            writeID: mergedStudioWriteID(preferred: preferred.writeID, fallback: fallback.writeID),
            replacedWriteID: normalizedWriteID(preferred.replacedWriteID).isEmpty ? fallback.replacedWriteID : preferred.replacedWriteID,
            anchorLine: preferred.anchorLine ?? fallback.anchorLine,
            anchorEndLine: preferred.anchorEndLine ?? fallback.anchorEndLine,
            anchorSceneLabel: normalizedAnchorExcerpt(preferred.anchorSceneLabel).isEmpty
                ? fallback.anchorSceneLabel
                : preferred.anchorSceneLabel,
            anchorExcerpt: normalizedAnchorExcerpt(preferred.anchorExcerpt).isEmpty
                ? fallback.anchorExcerpt
                : preferred.anchorExcerpt,
            insertedText: normalizedAnchorExcerpt(preferred.insertedText).isEmpty
                ? fallback.insertedText
                : preferred.insertedText,
            replacementApplied: preferred.replacementApplied ?? fallback.replacementApplied,
            revisedBlockText: normalizedAnchorExcerpt(preferred.revisedBlockText).isEmpty
                ? fallback.revisedBlockText
                : preferred.revisedBlockText,
            resolvedAnchorExcerpt: normalizedAnchorExcerpt(preferred.resolvedAnchorExcerpt).isEmpty
                ? fallback.resolvedAnchorExcerpt
                : preferred.resolvedAnchorExcerpt,
            packLabel: normalizedAnchorExcerpt(preferred.packLabel).isEmpty ? fallback.packLabel : preferred.packLabel,
            phase: normalizedAnchorExcerpt(preferred.phase).isEmpty ? fallback.phase : preferred.phase,
            sluglineAnchorLine: preferred.sluglineAnchorLine ?? fallback.sluglineAnchorLine,
            memoryDomainRaw: (preferred.memoryDomainRaw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? fallback.memoryDomainRaw
                : preferred.memoryDomainRaw,
            companionModeRaw: (preferred.companionModeRaw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? fallback.companionModeRaw
                : preferred.companionModeRaw,
            timestamp: max(existing.timestamp, incoming.timestamp)
        )
    }

    private func mergedStudioThreadHistory(
        local: [StudioAskNoteExchange],
        remote: [StudioAskNoteExchange]
    ) -> [StudioAskNoteExchange] {
        let clearedVoicePinBackendIDs = clearedBackendVoicePinIDs()
        var seenIndices: [String: Int] = [:]
        var merged: [StudioAskNoteExchange] = []
        for exchange in (local + remote).sorted(by: { $0.timestamp > $1.timestamp }) {
            if isClearedBackendVoicePinExchange(exchange, clearedIDs: clearedVoicePinBackendIDs) {
                continue
            }
            let key = studioThreadDedupKey(exchange)
            if let existingIndex = seenIndices[key] {
                merged[existingIndex] = mergeStudioThreadExchange(merged[existingIndex], with: exchange)
                continue
            }
            seenIndices[key] = merged.count
            merged.append(exchange)
        }
        return Array(merged.prefix(24))
    }

    private func studioBackendTimestampString(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    private func parsedStudioExchangeTimestamp(_ raw: String?) -> Date {
        let clean = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return .distantPast }

        let plainFormatter = ISO8601DateFormatter()
        if let date = plainFormatter.date(from: clean) {
            return date
        }

        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractionalFormatter.date(from: clean) ?? .distantPast
    }

    private func backendStudioAskNoteHistoryPayload(
        from entries: [StudioAskNoteExchange]
    ) -> [BackendScreenplayStudioExchange] {
        Array(entries.prefix(24)).map { exchange in
            BackendScreenplayStudioExchange(
                id: exchange.id.uuidString,
                backendThreadId: exchange.backendThreadID,
                backendTurn: exchange.backendTurn,
                requestId: exchange.requestID,
                prompt: exchange.prompt,
                target: exchange.target.rawValue,
                source: exchange.source.rawValue,
                noteTitle: exchange.noteTitle,
                noteBody: exchange.noteBody,
                developmentText: exchange.developmentText,
                writeId: exchange.writeID,
                replacedWriteId: exchange.replacedWriteID,
                anchorLine: exchange.anchorLine,
                anchorEndLine: exchange.anchorEndLine,
                anchorSceneLabel: exchange.anchorSceneLabel,
                anchorExcerpt: exchange.anchorExcerpt,
                insertedText: exchange.insertedText,
                replacementApplied: exchange.replacementApplied,
                revisedBlockText: exchange.revisedBlockText,
                resolvedAnchorExcerpt: exchange.resolvedAnchorExcerpt,
                packLabel: exchange.packLabel,
                phase: exchange.phase,
                sluglineAnchorLine: exchange.sluglineAnchorLine,
                memoryDomainRaw: exchange.memoryDomainRaw,
                companionModeRaw: exchange.companionModeRaw,
                timestamp: studioBackendTimestampString(exchange.timestamp)
            )
        }
    }

    private func studioAskNoteExchange(
        from backend: BackendScreenplayStudioExchange
    ) -> StudioAskNoteExchange? {
        guard let id = UUID(uuidString: backend.id) else { return nil }
        let target = StudioTarget(rawValue: (backend.target ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
            ?? .voicePin
        let source = StudioPromptSource(rawValue: (backend.source ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
            ?? .typed
        let prompt = (backend.prompt ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let noteTitle = (backend.noteTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let noteBody = (backend.noteBody ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackTitle = target == .page ? "Wrote to page" : "Clementine"
        let hasUsefulContent =
            !prompt.isEmpty
            || !noteBody.isEmpty
            || !(backend.insertedText ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !(backend.developmentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard hasUsefulContent else { return nil }

        return StudioAskNoteExchange(
            id: id,
            backendThreadID: normalizedBackendThreadID(backend.backendThreadId).isEmpty
                ? nil
                : normalizedBackendThreadID(backend.backendThreadId),
            backendTurn: backend.backendTurn,
            requestID: normalizedStudioRequestID(backend.requestId).isEmpty
                ? nil
                : normalizedStudioRequestID(backend.requestId),
            prompt: prompt,
            target: target,
            source: source,
            noteTitle: noteTitle.isEmpty ? fallbackTitle : noteTitle,
            noteBody: noteBody,
            developmentText: backend.developmentText,
            writeID: normalizedWriteID(backend.writeId).isEmpty ? nil : normalizedWriteID(backend.writeId),
            replacedWriteID: normalizedWriteID(backend.replacedWriteId).isEmpty ? nil : normalizedWriteID(backend.replacedWriteId),
            anchorLine: backend.anchorLine,
            anchorEndLine: backend.anchorEndLine,
            anchorSceneLabel: backend.anchorSceneLabel,
            anchorExcerpt: backend.anchorExcerpt,
            insertedText: backend.insertedText,
            replacementApplied: backend.replacementApplied,
            revisedBlockText: backend.revisedBlockText,
            resolvedAnchorExcerpt: backend.resolvedAnchorExcerpt,
            packLabel: backend.packLabel,
            phase: backend.phase,
            sluglineAnchorLine: backend.sluglineAnchorLine,
            memoryDomainRaw: backend.memoryDomainRaw,
            companionModeRaw: backend.companionModeRaw,
            timestamp: parsedStudioExchangeTimestamp(backend.timestamp)
        )
    }

    private func backendStudioAskNoteHistory(for key: String) -> [StudioAskNoteExchange] {
        guard let projectId = screenplayProjectIdFromHistoryKey(key) else { return [] }
        let project = (vm.selectedProject?.id == projectId)
            ? vm.selectedProject
            : vm.projects.first(where: { $0.id == projectId })
        let history = project?.studioAskNoteHistory ?? []
        return applyStoredWriteAnchors(
            to: Array(history.compactMap(studioAskNoteExchange(from:)).prefix(24)),
            for: key
        )
    }

    private func backendAskNoteHistorySignature(for key: String) -> String {
        let history = backendStudioAskNoteHistory(for: key)
        guard !history.isEmpty else { return "" }
        return history.map { exchange in
            [
                exchange.id.uuidString.lowercased(),
                normalizedStudioRequestID(exchange.requestID),
                normalizedWriteID(exchange.writeID),
                normalizedWriteID(exchange.replacedWriteID),
                studioBackendTimestampString(exchange.timestamp)
            ].joined(separator: ":")
        }.joined(separator: "|")
    }

    private func schedulePersistStudioAskNoteHistoryToBackend(
        _ entries: [StudioAskNoteExchange],
        for key: String
    ) {
        guard let projectId = screenplayProjectIdFromHistoryKey(key),
              let project = (vm.selectedProject?.id == projectId
                             ? vm.selectedProject
                             : vm.projects.first(where: { $0.id == projectId })) else {
            return
        }

        let historyPayload = backendStudioAskNoteHistoryPayload(from: entries)
        backendAskNoteHistoryPersistTask?.cancel()
        backendAskNoteHistoryPersistTask = Task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            guard !Task.isCancelled else { return }
            do {
                let result = try await BackendMemoryAPI.shared.upsertScreenplayProject(
                    projectId: project.id,
                    title: project.title,
                    phase: project.lastPhase ?? "scene_draft",
                    tags: project.tags ?? [],
                    characters: project.characters ?? [],
                    setting: project.setting ?? "",
                    tone: project.tone ?? "",
                    studioAskNoteHistory: historyPayload
                )
                if let nextProject = result.payload.project {
                    await MainActor.run {
                        vm.applyProjectMetadataUpdate(nextProject)
                        studioBackgroundSyncNoticeText = ""
                    }
                } else {
                    await MainActor.run {
                        studioBackgroundSyncNoticeText = ""
                    }
                }
            } catch {
                await MainActor.run {
                    studioBackgroundSyncNoticeText = "Saved on this device. Studio sync will retry when the connection returns."
                }
            }
        }
    }

    private func retryStudioBackgroundPersistence() {
        studioBackgroundSyncNoticeText = ""
        let key = activeStudioAskNoteHistoryKey
        persistFullThreadBrowseState(for: key)
        persistStudioAskNoteHistory(studioAskNoteHistory, for: key)
    }

    private func clearedBackendVoicePinIDs() -> Set<String> {
        let clean = studioClearedBackendVoicePinIDsStorage
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty,
              let data = clean.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return Set(
            decoded
                .map { normalizedBackendThreadID($0) }
                .filter { !$0.isEmpty }
        )
    }

    private func persistClearedBackendVoicePinIDs(_ ids: Set<String>) {
        let normalizedIDs = Array(
            Set(ids.map { normalizedBackendThreadID($0) }.filter { !$0.isEmpty })
        )
            .sorted()
        guard !normalizedIDs.isEmpty else {
            studioClearedBackendVoicePinIDsStorage = ""
            return
        }
        guard let data = try? JSONEncoder().encode(normalizedIDs),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioClearedBackendVoicePinIDsStorage = encoded
    }

    private func addClearedBackendVoicePinIDs(_ ids: Set<String>) {
        guard !ids.isEmpty else { return }
        var cleared = clearedBackendVoicePinIDs()
        cleared.formUnion(ids)
        persistClearedBackendVoicePinIDs(cleared)
    }

    private func isClearedBackendVoicePinExchange(
        _ exchange: StudioAskNoteExchange,
        clearedIDs: Set<String>
    ) -> Bool {
        guard exchange.target == .voicePin else { return false }
        let backendID = normalizedBackendThreadID(exchange.backendThreadID)
        return !backendID.isEmpty && clearedIDs.contains(backendID)
    }

    private func persistStudioAskNoteHistory(_ entries: [StudioAskNoteExchange], for key: String) {
        var store = loadStudioAskNoteHistoryMap()
        let limited = Array(entries.prefix(24))
        if !shouldDeferBackendThreadViewPersist(for: key) {
            schedulePersistStudioAskNoteHistoryToBackend(limited, for: key)
        }
        if limited.isEmpty {
            store.removeValue(forKey: key)
        } else {
            store[key] = limited
        }
        guard !store.isEmpty else {
            studioAskNoteHistoryStorage = ""
            mirrorStudioDebugString("", forKey: "studio.ask.note.history.v2")
            return
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(store),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioAskNoteHistoryStorage = encoded
        mirrorStudioDebugString(encoded, forKey: "studio.ask.note.history.v2")
    }

    private func restoreStudioAskNoteHistory(for key: String) async {
        guard isCurrentStudioAskNoteHistoryRestore(key: key) else { return }
        let store = loadStudioAskNoteHistoryMap()
        let decoded = applyStoredWriteAnchors(to: Array((store[key] ?? []).prefix(24)), for: key)
        let backendEntries = backendStudioAskNoteHistory(for: key)
        let localAndBackend = mergedStudioThreadHistory(local: decoded, remote: backendEntries)
        if IOThemRuntime.isRunningTests {
            guard isCurrentStudioAskNoteHistoryRestore(key: key) else { return }
            studioAskNoteHistory = localAndBackend
            highlightedStudioExchangeID = restoredSelectedStudioThreadID(for: key, entries: localAndBackend)
            syncLatestCommittedPrompt(from: studioAskNoteHistory.first)
            return
        }
        let shouldBackfill = localAndBackend.count < 8

        do {
            let remoteEntries: [StudioAskNoteExchange]
            if shouldBackfill {
                let history = try await BackendMemoryAPI.shared.fetchHistory(
                    limit: 24,
                    force: false,
                    screenplayProjectId: screenplayProjectIdFromHistoryKey(key)
                )
                remoteEntries = applyStoredWriteAnchors(
                    to: Array(
                        history.payload.threads
                            .sorted(by: { $0.updatedAt < $1.updatedAt })
                            .compactMap(backfilledStudioExchange(from:))
                            .suffix(24)
                            .reversed()
                    ),
                    for: key
                )
            } else {
                remoteEntries = []
            }
            guard isCurrentStudioAskNoteHistoryRestore(key: key) else { return }
            let merged = mergedStudioThreadHistory(local: localAndBackend, remote: remoteEntries)
            studioAskNoteHistory = merged
            highlightedStudioExchangeID = restoredSelectedStudioThreadID(for: key, entries: merged)
            syncLatestCommittedPrompt(from: studioAskNoteHistory.first)
            persistStudioAskNoteHistory(merged, for: key)
        } catch {
            guard isCurrentStudioAskNoteHistoryRestore(key: key) else { return }
            studioAskNoteHistory = localAndBackend
            highlightedStudioExchangeID = restoredSelectedStudioThreadID(for: key, entries: localAndBackend)
            syncLatestCommittedPrompt(from: studioAskNoteHistory.first)
        }
    }

    private func isCurrentStudioAskNoteHistoryRestore(key: String) -> Bool {
        guard activeStudioAskNoteHistoryKey == key else { return false }
        guard let projectID = screenplayProjectIdFromHistoryKey(key) else { return true }
        return vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == projectID
    }

    private func syncLatestCommittedPrompt(from exchange: StudioAskNoteExchange?) {
        guard let exchange else {
            lastCommittedStudioPrompt = ""
            lastCommittedStudioPromptTarget = .voicePin
            lastCommittedStudioPromptSource = .typed
            return
        }
        lastCommittedStudioPrompt = exchange.prompt
        lastCommittedStudioPromptTarget = exchange.target
        lastCommittedStudioPromptSource = exchange.source
    }



    private func normalizedAnchorExcerpt(_ text: String?) -> String {
        (text ?? "")
            .lowercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func normalizedWriteID(_ text: String?) -> String {
        (text ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private func noteBodyForAnchor(_ text: String) -> String {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return "" }
        return String(clean.prefix(220)).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func fallbackAnchorSnapshot(for exchange: StudioAskNoteExchange) -> ResolvedStudioExchangeAnchor? {
        guard let anchorLine = exchange.anchorLine else { return nil }
        return ResolvedStudioExchangeAnchor(
            startLine: anchorLine,
            endLine: exchange.anchorEndLine ?? anchorLine,
            sceneLabel: exchange.anchorSceneLabel
        )
    }

    private func resolvedAnchorSnapshot(for exchange: StudioAskNoteExchange, in draft: String) -> ResolvedStudioExchangeAnchor? {
        let cleanDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanDraft.isEmpty else { return nil }

        if exchange.anchorLine == nil,
           let stored = storedStudioWriteAnchor(for: exchange, key: activeStudioAskNoteHistoryKey) {
            return ResolvedStudioExchangeAnchor(
                startLine: stored.anchorLine,
                endLine: stored.anchorEndLine,
                sceneLabel: stored.anchorSceneLabel
            )
        }

        if !normalizedAnchorExcerpt(exchange.anchorExcerpt).isEmpty,
           let range = cleanDraft.range(of: exchange.anchorExcerpt ?? "", options: [.caseInsensitive]) {
            let nsRange = NSRange(range, in: cleanDraft)
            let lineRange = lineRange(for: nsRange, in: cleanDraft)
            return ResolvedStudioExchangeAnchor(
                startLine: lineRange.start,
                endLine: lineRange.end,
                sceneLabel: sceneLabelForLine(lineRange.start)
            )
        }

        if let anchorLine = exchange.anchorLine,
           let sceneLabel = exchange.anchorSceneLabel,
           !sceneLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let sceneLine = draftSceneNavigatorItems.first(where: {
                normalizedSceneNavigatorKey($0.label) == normalizedSceneNavigatorKey(sceneLabel)
            })?.line ?? anchorLine
            let endLine = max(sceneLine, exchange.anchorEndLine ?? sceneLine)
            return ResolvedStudioExchangeAnchor(
                startLine: sceneLine,
                endLine: endLine,
                sceneLabel: sceneLabel
            )
        }

        return fallbackAnchorSnapshot(for: exchange)
    }

    private func lineRange(for range: NSRange, in text: String) -> (start: Int, end: Int) {
        let safeText = text as NSString
        let maxLength = safeText.length
        let safeLocation = max(0, min(range.location, maxLength))
        let safeEnd = max(safeLocation, min(range.location + range.length, maxLength))
        let start = lineNumber(at: safeLocation, in: text)
        let end = lineNumber(at: safeEnd, in: text)
        return (start, max(start, end))
    }

    private func lineNumber(at location: Int, in text: String) -> Int {
        let safeText = text as NSString
        let maxLength = safeText.length
        let safeLocation = max(0, min(location, maxLength))
        let prefix = safeText.substring(to: safeLocation)
        return max(1, prefix.reduce(into: 1) { count, character in
            if character == "\n" { count += 1 }
        })
    }

    private func persistResolvedAnchorIfNeeded(
        for exchange: StudioAskNoteExchange,
        resolved: ResolvedStudioExchangeAnchor
    ) {
        guard let index = studioAskNoteHistory.firstIndex(where: { $0.id == exchange.id }) else { return }
        let current = studioAskNoteHistory[index]
        guard current.anchorLine != resolved.startLine ||
            (current.anchorEndLine ?? resolved.startLine) != resolved.endLine ||
            (current.anchorSceneLabel ?? "") != (resolved.sceneLabel ?? "") else { return }
        studioAskNoteHistory[index] = StudioAskNoteExchange(
            id: current.id,
            backendThreadID: current.backendThreadID,
            backendTurn: current.backendTurn,
            requestID: current.requestID,
            prompt: current.prompt,
            target: current.target,
            source: current.source,
            noteTitle: current.noteTitle,
            noteBody: current.noteBody,
            developmentText: current.developmentText,
            writeID: current.writeID,
            replacedWriteID: current.replacedWriteID,
            anchorLine: resolved.startLine,
            anchorEndLine: resolved.endLine,
            anchorSceneLabel: resolved.sceneLabel,
            anchorExcerpt: current.anchorExcerpt,
            insertedText: current.insertedText,
            replacementApplied: current.replacementApplied,
            revisedBlockText: current.revisedBlockText,
            resolvedAnchorExcerpt: current.resolvedAnchorExcerpt,
            packLabel: current.packLabel,
            phase: current.phase,
            sluglineAnchorLine: current.sluglineAnchorLine,
            memoryDomainRaw: current.memoryDomainRaw,
            companionModeRaw: current.companionModeRaw,
            timestamp: current.timestamp
        )
    }

    private func refreshStudioAskNoteAnchorsAgainstDraft(_ draft: String) {
        guard !studioAskNoteHistory.isEmpty else { return }
        let refreshed = studioAskNoteHistory.map { exchange -> StudioAskNoteExchange in
            guard exchange.target == .page,
                  let resolved = resolvedAnchorSnapshot(for: exchange, in: draft) else {
                return exchange
            }
            return StudioAskNoteExchange(
                id: exchange.id,
                backendThreadID: exchange.backendThreadID,
                backendTurn: exchange.backendTurn,
                requestID: exchange.requestID,
                prompt: exchange.prompt,
                target: exchange.target,
                source: exchange.source,
                noteTitle: exchange.noteTitle,
                noteBody: exchange.noteBody,
                developmentText: exchange.developmentText,
                writeID: exchange.writeID,
                replacedWriteID: exchange.replacedWriteID,
                anchorLine: resolved.startLine,
                anchorEndLine: resolved.endLine,
                anchorSceneLabel: resolved.sceneLabel,
                anchorExcerpt: exchange.anchorExcerpt,
                insertedText: exchange.insertedText,
                replacementApplied: exchange.replacementApplied,
                revisedBlockText: exchange.revisedBlockText,
                resolvedAnchorExcerpt: exchange.resolvedAnchorExcerpt,
                packLabel: exchange.packLabel,
                phase: exchange.phase,
                sluglineAnchorLine: exchange.sluglineAnchorLine,
                memoryDomainRaw: exchange.memoryDomainRaw,
                companionModeRaw: exchange.companionModeRaw,
                timestamp: exchange.timestamp
            )
        }
        if refreshed != studioAskNoteHistory {
            studioAskNoteHistory = refreshed
        }
    }









    private func focusStudioPage() {
        studioPromptFocused = false
        studioThreadListFocused = false
        studioInspectorFocused = false
        sceneInspectorTitleFocused = false
        triggerDirectionOnePageFocusTransition()
        liveDraftBridge.requestEditorFocus()
        vm.infoText = "Focused the screenplay page."
    }

    private func focusStudioRail() {
        isDirectionOneRightRailExpanded = true
        studioInspectorFocused = false
        sceneInspectorTitleFocused = false
        if !studioAskNoteHistory.isEmpty {
            if highlightedStudioExchangeID == nil {
                highlightedStudioExchangeID = studioAskNoteHistory.first?.id
            }
            studioThreadListFocused = true
            studioPromptFocused = false
            vm.infoText = "Focused the right-rail working thread."
        } else {
            isDirectionOneComposerExpanded = true
            studioPromptFocused = true
            studioThreadListFocused = false
            vm.infoText = "Focused io.them's prompt."
        }
    }

    private func focusStudioInspector() {
        guard vm.selectedProject != nil else {
            vm.infoText = "Create or select a project to focus the inspector."
            return
        }
        isDirectionOneRightRailExpanded = true
        studioPromptFocused = false
        studioThreadListFocused = false
        studioInspectorFocused = true
        if !vm.editingSceneID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            sceneInspectorTitleFocused = true
        } else if selectedInspectorSection == .scenes,
                  highlightedSceneInspectorKey.isEmpty,
                  let current = currentSceneInspectorSelection {
            highlightedSceneInspectorKey = sceneInspectorKey(for: current)
        }
        vm.infoText = "Focused the project inspector."
    }

    private func openStudioCommandBar(
        prefill text: String? = nil,
        routingMode: PromptRoutingMode? = nil,
        intent: StudioPromptIntent? = nil,
        focusComposer: Bool = true
    ) {
        if let text {
            studioPromptSeed = text
        }
        if let routingMode {
            studioPromptRoutingMode = routingMode
        }
        if let intent {
            studioPromptIntent = intent
        }
        withAnimation(.easeInOut(duration: 0.16)) {
            isDirectionOneRightRailExpanded = true
            isDirectionOneComposerExpanded = true
        }
        studioThreadListFocused = false
        studioInspectorFocused = false
        studioPromptFocused = focusComposer
    }

    @ViewBuilder
    private var pendingScreenplayQuestionPrompt: some View {
        if let pending = vm.pendingScreenplayQuestion {
            VStack(alignment: .leading, spacing: 9) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.accentColor.opacity(0.86))
                    Text("Clementine wants to know")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.64))
                    Spacer(minLength: 0)
                    if !pending.targetLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(pending.targetLabel)
                            .font(.system(size: 10, weight: .medium, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.46))
                            .lineLimit(1)
                    }
                }

                Text(pending.question)
                    .font(.system(size: 13, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.90))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("studio.pending-question.text")

                if let options = pending.provisionalOptions, !options.isEmpty {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(options) { option in
                            Button {
                                choosePendingScreenplayOption(option, for: pending)
                            } label: {
                                HStack(alignment: .top, spacing: 9) {
                                    Text("\(option.rank)")
                                        .font(.system(size: 11, weight: .bold, design: .rounded))
                                        .foregroundStyle(Color.accentColor)
                                        .frame(width: 18, height: 18)

                                    VStack(alignment: .leading, spacing: 2) {
                                        if option.recommended {
                                            Text("Clementine’s pick")
                                                .font(.system(size: 9, weight: .semibold))
                                                .foregroundStyle(Color.accentColor.opacity(0.86))
                                        }
                                        Text(option.value)
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundStyle(Color.herText.opacity(0.88))
                                            .fixedSize(horizontal: false, vertical: true)
                                    }

                                    Spacer(minLength: 0)
                                    Image(systemName: "checkmark.circle")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(Color.herText.opacity(0.42))
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 8)
                                .background(Color.herText.opacity(0.055))
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Choose option \(option.rank)")
                            .accessibilityIdentifier("studio.pending-question.option-\(option.rank)")
                            .disabled(
                                isSubmittingStudioPrompt ||
                                    isSubmittingPrompt ||
                                    isResolvingPendingScreenplayQuestion
                            )
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("studio.pending-question.options")
                }

                HStack(spacing: 10) {
                    Button(
                        pending.provisionalOptions?.isEmpty == false
                            ? "Answer differently"
                            : "Answer"
                    ) {
                        answerPendingScreenplayQuestion(pending)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .accessibilityIdentifier("studio.pending-question.answer")
                    .disabled(
                        isSubmittingStudioPrompt ||
                            isSubmittingPrompt ||
                            isResolvingPendingScreenplayQuestion
                    )

                    Button {
                        skipPendingScreenplayQuestion(pending)
                    } label: {
                        Text("Skip")
                            .frame(minWidth: 44, minHeight: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .foregroundStyle(Color.herText.opacity(0.58))
                    .accessibilityIdentifier("studio.pending-question.skip")
                    .disabled(
                        isSubmittingStudioPrompt ||
                            isResolvingPendingScreenplayQuestion
                    )
                }
            }
            .padding(.leading, 12)
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(Color.accentColor.opacity(0.42))
                    .frame(width: 2)
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("studio.pending-question")
            .id("studio.pending-question.anchor")
        }
    }

    private func answerPendingScreenplayQuestion(_ pending: BackendPendingScreenplayQuestion) {
        studioPromptSeed = ""
        #if os(iOS)
        let shouldFocusComposer = false
        #else
        let shouldFocusComposer = true
        #endif
        openStudioCommandBar(
            routingMode: .voicePin,
            intent: .advice,
            focusComposer: shouldFocusComposer
        )
        vm.infoText = "Answer Clementine in your own words. She will remember it with this project."
    }

    private func skipPendingScreenplayQuestion(_ pending: BackendPendingScreenplayQuestion) {
        guard !isSubmittingStudioPrompt, !isResolvingPendingScreenplayQuestion else { return }
        dismissPendingScreenplayQuestion(id: pending.id)
        #if DEBUG
        if IOThemRuntime.isRunningUITests, pending.id == "ui-pending-theme-question" {
            vm.infoText = "Question skipped."
            return
        }
        #endif
        isResolvingPendingScreenplayQuestion = true
        Task { @MainActor in
            defer { isResolvingPendingScreenplayQuestion = false }
            do {
                _ = try await BackendMemoryAPI.shared.resolvePendingScreenplayQuestion(
                    pending,
                    responseStatus: "declined"
                )
                vm.infoText = "Question skipped."
            } catch is BackendTalkQueuedError {
                vm.infoText = "Question skipped. Saving when you're online."
            } catch {
                restorePendingScreenplayQuestion(pending)
                vm.infoText = "Couldn’t save that choice. \(error.localizedDescription)"
            }
        }
    }

    private func choosePendingScreenplayOption(
        _ option: BackendPendingScreenplayOption,
        for pending: BackendPendingScreenplayQuestion
    ) {
        guard !isSubmittingStudioPrompt, !isResolvingPendingScreenplayQuestion else { return }
        dismissPendingScreenplayQuestion(id: pending.id)
        #if DEBUG
        if IOThemRuntime.isRunningUITests, pending.id == "ui-pending-theme-question" {
            vm.infoText = "Option \(option.rank) saved to this project."
            return
        }
        #endif
        isResolvingPendingScreenplayQuestion = true
        Task { @MainActor in
            defer { isResolvingPendingScreenplayQuestion = false }
            do {
                _ = try await BackendMemoryAPI.shared.resolvePendingScreenplayQuestion(
                    pending,
                    responseStatus: "answered",
                    answer: "Option \(option.rank)"
                )
                vm.infoText = "Option \(option.rank) saved to this project."
            } catch is BackendTalkQueuedError {
                vm.infoText = "Choice queued. Clementine will remember it when you’re online."
            } catch {
                restorePendingScreenplayQuestion(pending)
                vm.infoText = "Couldn’t save that choice. \(error.localizedDescription)"
            }
        }
    }

    private func dismissPendingScreenplayQuestion(id: String) {
        vm.dismissPendingScreenplayQuestion(id: id)
        #if DEBUG
        if id == "ui-pending-theme-question" {
            didResolveUITestPendingQuestionFixture = true
        }
        #endif
    }

    private func restorePendingScreenplayQuestion(_ pending: BackendPendingScreenplayQuestion) {
        vm.pendingScreenplayQuestion = pending
        #if DEBUG
        if pending.id == "ui-pending-theme-question" {
            didResolveUITestPendingQuestionFixture = false
        }
        #endif
    }

    private func collapseStudioCommandBar() {
        withAnimation(.easeInOut(duration: 0.16)) {
            isDirectionOneComposerExpanded = false
        }
        studioPromptFocused = false
    }

    private func toggleDirectionOneSidebarVisibility() {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            let nextIsVisible = !isDirectionOneSidebarVisible
            isDirectionOneSidebarVisible = nextIsVisible
            if isDirectionOneCompactLayout, nextIsVisible {
                isDirectionOneRightRailExpanded = false
            }
        }
        vm.infoText = isDirectionOneSidebarVisible
            ? "Sidebar shown."
            : "Sidebar hidden."
    }

    private func toggleDirectionOneRightRailVisibility() {
        let nextIsVisible = !isDirectionOneRightRailExpanded
        #if os(iOS)
        if isDirectionOneCompactLayout, nextIsVisible {
            endCompactScreenplayEditing()
        }
        #endif
        withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
            isDirectionOneRightRailExpanded = nextIsVisible
            if isDirectionOneCompactLayout, nextIsVisible {
                isDirectionOneSidebarVisible = false
            }
        }
    }

    private func closeDirectionOneCompactDrawers() {
        guard isDirectionOneCompactLayout else { return }
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            isDirectionOneSidebarVisible = false
            isDirectionOneRightRailExpanded = false
        }
    }

    private func configureDirectionOneResponsiveLayout(usesDrawers: Bool) {
        let enteredCompactLayout = usesDrawers && !isDirectionOneCompactLayout
        isDirectionOneCompactLayout = usesDrawers
        guard enteredCompactLayout else { return }
        isDirectionOneSidebarVisible = false
        isDirectionOneRightRailExpanded = false
    }

    #if os(iOS)
    /// Ends screenplay editing on the phone layout so the inspector drawer is
    /// not covered by the keyboard. The responder-chain action alone was not
    /// enough on the hosted-runner iOS build: the editor stayed first
    /// responder and the keyboard remained after Save now. Ask every window
    /// to end editing as well, which resigns the current first responder
    /// regardless of which hosted hierarchy owns it.
    private func endCompactScreenplayEditing() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for window in windowScene.windows {
                window.endEditing(true)
            }
        }
    }
    #endif

    private func revealStudioSavedTab() {
        withAnimation(.spring(response: 0.26, dampingFraction: 0.84)) {
            isDirectionOneRightRailExpanded = true
            directionOneRightPanelTab = .saved
        }
    }

    private func triggerStudioManualSave(revealSavedTab: Bool = true) {
        #if DEBUG
        if IOThemRuntime.isRunningUITests {
            uiTestManualSaveTriggerCount += 1
        }
        #endif
        #if os(iOS)
        if isDirectionOneCompactLayout {
            endCompactScreenplayEditing()
        }
        #endif
        guard !vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            vm.errorText = "Draft is empty."
            return
        }
        if revealSavedTab {
            revealStudioSavedTab()
        }
        Task { @MainActor in
            await vm.manualSaveDraft()
        }
    }



    private func submitStudioPromptSeed() {
        let text = studioPromptSeed.trimmingCharacters(in: .whitespacesAndNewlines)
        submitStudioPromptText(
            text,
            displayText: text,
            source: .typed,
            routingMode: studioPromptRoutingMode,
            intent: studioPromptIntent,
            successMessage: "Prompt sent to io.them.",
            clearSeedOnSuccess: true,
            sendingSuggestionID: nil
        )
    }

    private func submitStudioPromptSeedFromKeyboardShortcut() {
        let text = studioPromptSeed.trimmingCharacters(in: .whitespacesAndNewlines)
        let debugReplacementMode = resolvedStudioDebugReplacementModeForSubmission(nil)
        var preparedTokenForSubmit: Int? = nil
        #if DEBUG || os(macOS)
        if let preparedToken = matchingPreparedStudioDebugSubmitToken(
            text: text,
            routingMode: studioPromptRoutingMode,
            replacementMode: debugReplacementMode
        ) {
            preparedTokenForSubmit = preparedToken
            setStudioDebugKeyboardSubmitAck(
                token: preparedToken,
                text: text,
                routing: studioPromptRoutingMode.rawValue,
                replacementMode: debugReplacementMode
            )
        }
        #endif
        submitStudioPromptText(
            text,
            displayText: text,
            source: .typed,
            routingMode: studioPromptRoutingMode,
            intent: studioPromptIntent,
            successMessage: "Prompt sent to io.them.",
            clearSeedOnSuccess: true,
            sendingSuggestionID: nil,
            debugSubmitToken: preparedTokenForSubmit,
            debugSubmitReplacementMode: debugReplacementMode
        )
    }

    #if os(macOS)
    private func installStudioCommandReturnKeyMonitorIfNeeded() {
        guard studioCommandReturnKeyMonitor == nil else { return }
        studioCommandReturnKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { event in
            let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            guard modifiers.contains(.command),
                  !modifiers.contains(.option),
                  !modifiers.contains(.control),
                  !modifiers.contains(.shift) else {
                return event
            }
            guard event.keyCode == 36 else { return event }
            let prompt = studioPromptSeed.trimmingCharacters(in: .whitespacesAndNewlines)
            let composerReady = studioPromptFocused || directionOneRightPanelTab == .them
            guard composerReady,
                  !prompt.isEmpty,
                  !isSubmittingStudioPrompt,
                  !isSubmittingPrompt else {
                return event
            }
            submitStudioPromptSeedFromKeyboardShortcut()
            return nil
        }
    }

    private func removeStudioCommandReturnKeyMonitor() {
        guard let studioCommandReturnKeyMonitor else { return }
        NSEvent.removeMonitor(studioCommandReturnKeyMonitor)
        self.studioCommandReturnKeyMonitor = nil
    }

    #if DEBUG
    @discardableResult
    private func synchronizeMirroredStudioDebugPrepareState() -> Bool {
        var didChange = false

        let prepareToken = readMirroredStudioDebugPreferenceInt("studio_debug_prepare_token")
        let prepareText = readMirroredStudioDebugPreferenceString("studio_debug_prepare_text")
        let prepareRouting = readMirroredStudioDebugPreferenceString(
            "studio_debug_prepare_routing",
            fallback: PromptRoutingMode.automatic.rawValue
        )
        let prepareReplacementMode = readMirroredStudioDebugPreferenceString(
            "studio_debug_prepare_replacement_mode",
            fallback: "none"
        )
        let prepareAckToken = readMirroredStudioDebugPreferenceInt("studio_debug_prepare_ack_token")
        let prepareAckText = readMirroredStudioDebugPreferenceString("studio_debug_prepare_ack_text")
        let prepareAckRouting = readMirroredStudioDebugPreferenceString(
            "studio_debug_prepare_ack_routing",
            fallback: PromptRoutingMode.automatic.rawValue
        )
        let prepareAckReplacementMode = readMirroredStudioDebugPreferenceString(
            "studio_debug_prepare_ack_replacement_mode",
            fallback: "none"
        )
        let loadProjectToken = readMirroredStudioDebugPreferenceInt("studio_debug_load_project_token")
        let loadProjectID = readMirroredStudioDebugPreferenceString("studio_debug_load_project_id")
        let loadProjectVersionID = readMirroredStudioDebugPreferenceString("studio_debug_load_project_version_id")
        let loadProjectAckToken = readMirroredStudioDebugPreferenceInt("studio_debug_load_project_ack_token")

        if prepareToken != studioDebugPrepareToken {
            studioDebugPrepareToken = prepareToken
            didChange = true
        }
        if prepareText != studioDebugPrepareText {
            studioDebugPrepareText = prepareText
            didChange = true
        }
        if prepareRouting != studioDebugPrepareRoutingRaw {
            studioDebugPrepareRoutingRaw = prepareRouting
            didChange = true
        }
        if prepareReplacementMode != studioDebugPrepareReplacementMode {
            studioDebugPrepareReplacementMode = prepareReplacementMode
            didChange = true
        }
        if prepareAckToken != studioDebugPrepareAckToken {
            studioDebugPrepareAckToken = prepareAckToken
            didChange = true
        }
        if prepareAckText != studioDebugPrepareAckText {
            studioDebugPrepareAckText = prepareAckText
            didChange = true
        }
        if prepareAckRouting != studioDebugPrepareAckRoutingRaw {
            studioDebugPrepareAckRoutingRaw = prepareAckRouting
            didChange = true
        }
        if prepareAckReplacementMode != studioDebugPrepareAckReplacementMode {
            studioDebugPrepareAckReplacementMode = prepareAckReplacementMode
            didChange = true
        }
        if loadProjectToken != studioDebugLoadProjectToken {
            studioDebugLoadProjectToken = loadProjectToken
            didChange = true
        }
        if loadProjectID != studioDebugLoadProjectID {
            studioDebugLoadProjectID = loadProjectID
            didChange = true
        }
        if loadProjectVersionID != studioDebugLoadProjectVersionID {
            studioDebugLoadProjectVersionID = loadProjectVersionID
            didChange = true
        }
        if loadProjectAckToken != studioDebugLoadProjectAckToken {
            studioDebugLoadProjectAckToken = loadProjectAckToken
            didChange = true
        }

        return didChange
    }

    @discardableResult
    private func synchronizeMirroredStudioDebugInteractionState() -> Bool {
        var didChange = false

        let focusToken = readMirroredStudioDebugPreferenceInt("studio_debug_focus_page_token")
        let focusAckToken = readMirroredStudioDebugPreferenceInt("studio_debug_focus_page_ack_token")
        let submitToken = readMirroredStudioDebugPreferenceInt("studio_debug_submit_token")
        let submitText = readMirroredStudioDebugPreferenceString("studio_debug_submit_text")
        let submitRouting = readMirroredStudioDebugPreferenceString(
            "studio_debug_submit_routing",
            fallback: PromptRoutingMode.automatic.rawValue
        )
        let submitReplacementMode = readMirroredStudioDebugPreferenceString(
            "studio_debug_submit_replacement_mode",
            fallback: "none"
        )
        let submitAckToken = readMirroredStudioDebugPreferenceInt("studio_debug_submit_ack_token")
        let submitAckText = readMirroredStudioDebugPreferenceString("studio_debug_submit_ack_text")
        let submitAckRouting = readMirroredStudioDebugPreferenceString(
            "studio_debug_submit_ack_routing",
            fallback: PromptRoutingMode.automatic.rawValue
        )
        let submitAckReplacementMode = readMirroredStudioDebugPreferenceString(
            "studio_debug_submit_ack_replacement_mode",
            fallback: "none"
        )
        let submitAckRequestID = readMirroredStudioDebugPreferenceString("studio_debug_submit_ack_request_id")
        let submitResultToken = readMirroredStudioDebugPreferenceInt("studio_debug_submit_result_token")
        let submitResultStatus = readMirroredStudioDebugPreferenceString("studio_debug_submit_result_status")
        let submitResultError = readMirroredStudioDebugPreferenceString("studio_debug_submit_result_error")
        let submitResultJSON = readMirroredStudioDebugPreferenceString("studio_debug_submit_result_json")
        let manualEditToken = readMirroredStudioDebugPreferenceInt("studio_debug_manual_edit_token")
        let manualEditText = readMirroredStudioDebugPreferenceString("studio_debug_manual_edit_text")
        let manualEditAckToken = readMirroredStudioDebugPreferenceInt("studio_debug_manual_edit_ack_token")
        let autosaveToggleToken = readMirroredStudioDebugPreferenceInt("studio_debug_autosave_toggle_token")
        let autosaveEnabled = readMirroredStudioDebugPreferenceBool(
            "studio_debug_autosave_enabled",
            fallback: studioDebugAutosaveEnabled
        )
        let autosaveToggleAckToken = readMirroredStudioDebugPreferenceInt("studio_debug_autosave_toggle_ack_token")
        let forceHydrateToken = readMirroredStudioDebugPreferenceInt("studio_debug_force_hydrate_token")
        let forceHydrateAckToken = readMirroredStudioDebugPreferenceInt("studio_debug_force_hydrate_ack_token")
        let saveToken = readMirroredStudioDebugPreferenceInt("studio_debug_save_token")
        let saveAckToken = readMirroredStudioDebugPreferenceInt("studio_debug_save_ack_token")

        if focusToken != studioDebugFocusPageToken {
            studioDebugFocusPageToken = focusToken
            didChange = true
        }
        if focusAckToken != studioDebugFocusPageAckToken {
            studioDebugFocusPageAckToken = focusAckToken
            didChange = true
        }
        if submitToken != studioDebugSubmitToken {
            studioDebugSubmitToken = submitToken
            didChange = true
        }
        if submitText != studioDebugSubmitText {
            studioDebugSubmitText = submitText
            didChange = true
        }
        if submitRouting != studioDebugSubmitRoutingRaw {
            studioDebugSubmitRoutingRaw = submitRouting
            didChange = true
        }
        if submitReplacementMode != studioDebugSubmitReplacementMode {
            studioDebugSubmitReplacementMode = submitReplacementMode
            didChange = true
        }
        if submitAckToken != studioDebugSubmitAckToken {
            studioDebugSubmitAckToken = submitAckToken
            didChange = true
        }
        if submitAckText != studioDebugSubmitAckText {
            studioDebugSubmitAckText = submitAckText
            didChange = true
        }
        if submitAckRouting != studioDebugSubmitAckRoutingRaw {
            studioDebugSubmitAckRoutingRaw = submitAckRouting
            didChange = true
        }
        if submitAckReplacementMode != studioDebugSubmitAckReplacementMode {
            studioDebugSubmitAckReplacementMode = submitAckReplacementMode
            didChange = true
        }
        if submitAckRequestID != studioDebugSubmitAckRequestID {
            studioDebugSubmitAckRequestID = submitAckRequestID
            didChange = true
        }
        if submitResultToken != studioDebugSubmitResultToken {
            studioDebugSubmitResultToken = submitResultToken
            didChange = true
        }
        if submitResultStatus != studioDebugSubmitResultStatus {
            studioDebugSubmitResultStatus = submitResultStatus
            didChange = true
        }
        if submitResultError != studioDebugSubmitResultError {
            studioDebugSubmitResultError = submitResultError
            didChange = true
        }
        if submitResultJSON != studioDebugSubmitResultJSON {
            studioDebugSubmitResultJSON = submitResultJSON
            didChange = true
        }
        if manualEditToken != studioDebugManualEditToken {
            studioDebugManualEditToken = manualEditToken
            didChange = true
        }
        if manualEditText != studioDebugManualEditText {
            studioDebugManualEditText = manualEditText
            didChange = true
        }
        if manualEditAckToken != studioDebugManualEditAckToken {
            studioDebugManualEditAckToken = manualEditAckToken
            didChange = true
        }
        if autosaveToggleToken != studioDebugAutosaveToggleToken {
            studioDebugAutosaveToggleToken = autosaveToggleToken
            didChange = true
        }
        if autosaveEnabled != studioDebugAutosaveEnabled {
            studioDebugAutosaveEnabled = autosaveEnabled
            didChange = true
        }
        if autosaveToggleAckToken != studioDebugAutosaveToggleAckToken {
            studioDebugAutosaveToggleAckToken = autosaveToggleAckToken
            didChange = true
        }
        if forceHydrateToken != studioDebugForceHydrateToken {
            studioDebugForceHydrateToken = forceHydrateToken
            didChange = true
        }
        if forceHydrateAckToken != studioDebugForceHydrateAckToken {
            studioDebugForceHydrateAckToken = forceHydrateAckToken
            didChange = true
        }
        if saveToken != studioDebugSaveToken {
            studioDebugSaveToken = saveToken
            didChange = true
        }
        if saveAckToken != studioDebugSaveAckToken {
            studioDebugSaveAckToken = saveAckToken
            didChange = true
        }

        return didChange
    }

    private func handleStudioDebugManualEditRequestFileIfNeeded() {
        guard let data = try? Data(contentsOf: studioScreenDebugManualEditRequestURL),
              let request = try? JSONDecoder().decode(StudioDebugManualEditRequest.self, from: data) else {
            return
        }
        guard request.token > 0 else {
            try? FileManager.default.removeItem(at: studioScreenDebugManualEditRequestURL)
            return
        }
        guard request.token != studioDebugManualEditAckToken,
              request.token != lastAppliedStudioDebugManualEditToken else {
            try? FileManager.default.removeItem(at: studioScreenDebugManualEditRequestURL)
            return
        }
        studioDebugManualEditText = request.text
        studioDebugManualEditToken = request.token
        writeMirroredStudioDebugPreferenceString(request.text, forKey: "studio_debug_manual_edit_text")
        writeMirroredStudioDebugPreferenceInt(request.token, forKey: "studio_debug_manual_edit_token")
        try? FileManager.default.removeItem(at: studioScreenDebugManualEditRequestURL)
    }

    private func handleStudioDebugLoadProjectRequestFileIfNeeded() {
        guard let match = studioScreenDebugLoadProjectRequestURLs.lazy.compactMap({ url -> (StudioScreenDebugLoadProjectRequest, URL)? in
            guard let data = try? Data(contentsOf: url),
                  let request = try? JSONDecoder().decode(StudioScreenDebugLoadProjectRequest.self, from: data) else {
                return nil
            }
            return (request, url)
        }).first else {
            return
        }
        let request = match.0
        guard request.token > 0 else {
            for url in studioScreenDebugLoadProjectRequestURLs {
                try? FileManager.default.removeItem(at: url)
            }
            return
        }
        guard request.token != studioDebugLoadProjectAckToken,
              request.token != lastAppliedStudioDebugLoadProjectToken else {
            for url in studioScreenDebugLoadProjectRequestURLs {
                try? FileManager.default.removeItem(at: url)
            }
            return
        }
        studioDebugLoadProjectID = request.projectID
        studioDebugLoadProjectVersionID = request.versionID
        studioDebugLoadProjectToken = request.token
        writeMirroredStudioDebugPreferenceString(request.projectID, forKey: "studio_debug_load_project_id")
        writeMirroredStudioDebugPreferenceString(request.versionID, forKey: "studio_debug_load_project_version_id")
        writeMirroredStudioDebugPreferenceInt(request.token, forKey: "studio_debug_load_project_token")
        for url in studioScreenDebugLoadProjectRequestURLs {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private func handleStudioDebugAutosaveToggleRequestFileIfNeeded() {
        guard let data = try? Data(contentsOf: studioScreenDebugAutosaveToggleRequestURL),
              let request = try? JSONDecoder().decode(StudioDebugAutosaveToggleRequest.self, from: data) else {
            return
        }
        guard request.token > 0 else {
            try? FileManager.default.removeItem(at: studioScreenDebugAutosaveToggleRequestURL)
            return
        }
        guard request.token != studioDebugAutosaveToggleAckToken,
              request.token != lastAppliedStudioDebugAutosaveToggleToken else {
            try? FileManager.default.removeItem(at: studioScreenDebugAutosaveToggleRequestURL)
            return
        }
        studioDebugAutosaveEnabled = request.enabled
        studioDebugAutosaveToggleToken = request.token
        writeMirroredStudioDebugPreferenceInt(request.enabled ? 1 : 0, forKey: "studio_debug_autosave_enabled")
        writeMirroredStudioDebugPreferenceInt(request.token, forKey: "studio_debug_autosave_toggle_token")
        try? FileManager.default.removeItem(at: studioScreenDebugAutosaveToggleRequestURL)
    }

    private func handleStudioDebugSaveRequestFileIfNeeded() {
        guard let data = try? Data(contentsOf: studioScreenDebugSaveRequestURL),
              let request = try? JSONDecoder().decode(StudioDebugSaveRequest.self, from: data) else {
            return
        }
        guard request.token > 0 else {
            try? FileManager.default.removeItem(at: studioScreenDebugSaveRequestURL)
            return
        }
        guard request.token != studioDebugSaveAckToken,
              request.token != lastAppliedStudioDebugSaveToken else {
            try? FileManager.default.removeItem(at: studioScreenDebugSaveRequestURL)
            return
        }
        studioDebugSaveToken = request.token
        writeMirroredStudioDebugPreferenceInt(request.token, forKey: "studio_debug_save_token")
        try? FileManager.default.removeItem(at: studioScreenDebugSaveRequestURL)
    }

    private func startStudioDebugPreparePollingIfNeeded() {
        guard studioDebugPreparePollTask == nil else { return }
        studioDebugPreparePollTask = Task { @MainActor in
            await Task.yield()
            try? await Task.sleep(nanoseconds: 250_000_000)
            while !Task.isCancelled {
                if IOThemRuntime.isStudioAutomationSession {
                    handleStudioDebugLoadProjectRequestFileIfNeeded()
                    handleStudioDebugManualEditRequestFileIfNeeded()
                    handleStudioDebugAutosaveToggleRequestFileIfNeeded()
                    handleStudioDebugSaveRequestFileIfNeeded()
                    _ = synchronizeMirroredStudioDebugPrepareState()
                    _ = synchronizeMirroredStudioDebugInteractionState()
                    applyDebugLoadProjectIfNeeded()
                    applyDebugPreparedStudioPromptIfNeeded()
                    applyDebugSubmittedStudioPromptIfNeeded()
                    applyDebugFocusPageIfNeeded()
                    applyDebugManualDraftEditIfNeeded()
                    applyDebugAutosaveToggleIfNeeded()
                    applyDebugForceHydrateIfNeeded()
                    applyDebugManualSaveIfNeeded()
                }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
    }

    private func stopStudioDebugPreparePolling() {
        studioDebugPreparePollTask?.cancel()
        studioDebugPreparePollTask = nil
    }
    #endif
    #endif

    private func resolvedStudioDebugReplacementModeForSubmission(_ explicitMode: String?) -> String {
        let normalizedExplicit = explicitMode?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? ""
        if !normalizedExplicit.isEmpty {
            return normalizedExplicit
        }
        let hasReplacementTarget = liveDraftBridge.pendingReplacementTarget != nil
            || liveDraftBridge.submittedReplacementTarget != nil
        return hasReplacementTarget ? "latest" : "none"
    }

    private func matchingPreparedStudioDebugSubmitToken(
        text: String,
        routingMode: PromptRoutingMode,
        replacementMode: String
    ) -> Int? {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return nil }
        let preparedToken = studioDebugPrepareAckToken
        guard preparedToken > 0 else { return nil }
        let preparedText = studioDebugPrepareAckText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard preparedText == text else { return nil }
        let preparedRoutingMode = PromptRoutingMode(rawValue: studioDebugPrepareAckRoutingRaw) ?? .automatic
        guard preparedRoutingMode == routingMode else { return nil }
        let preparedReplacementMode = studioDebugPrepareAckReplacementMode
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard preparedReplacementMode == replacementMode else { return nil }
        return preparedToken
        #else
        return nil
        #endif
    }

    private func beginPerceivedSpeedResponse(
        prompt: String,
        requestID: String,
        target: StudioPerceivedSpeedState.Target,
        source: StudioPromptSource
    ) {
        perceivedSpeedState = StudioPerceivedSpeedState.start(
            requestID: requestID,
            prompt: prompt,
            target: target,
            sourceRaw: source.rawValue
        )
        vm.infoText = perceivedSpeedState.statusText
        if target == .page {
            liveDraftBridge.autoInsertStatusText = perceivedSpeedState.statusText
        } else {
            withAnimation(.easeInOut(duration: 0.14)) {
                isDirectionOneRightRailExpanded = true
                directionOneRightPanelTab = .them
            }
        }
    }

    private func completePerceivedSpeedResponse(requestID: String) {
        guard perceivedSpeedState.id == requestID else { return }
        let completedState = perceivedSpeedState.completing()
        if completedState.target == .page && liveDraftBridge.autoInsertStatusText == perceivedSpeedState.statusText {
            liveDraftBridge.autoInsertStatusText = ""
        }
        perceivedSpeedState = completedState
    }

    @MainActor
    private func waitForCommittedStudioPageWrite(
        submittedAt: Date,
        timeoutMs: UInt64 = 8_000
    ) async -> ScreenplayCommittedWrite? {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutMs) / 1_000)
        while Date() < deadline {
            if let committedWrite = liveDraftBridge.lastCommittedWrite {
                let insertedText = committedWrite.insertedText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !insertedText.isEmpty,
                   committedWrite.committedAt >= submittedAt.addingTimeInterval(-0.5) {
                    return committedWrite
                }
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return nil
    }

    private func submitStudioPromptText(
        _ rawText: String,
        displayText: String? = nil,
        source: StudioPromptSource = .typed,
        routingMode: PromptRoutingMode,
        intent: StudioPromptIntent? = nil,
        successMessage: String,
        clearSeedOnSuccess: Bool,
        sendingSuggestionID: String?,
        requestIDOverride: String? = nil,
        debugSubmitToken: Int? = nil,
        debugSubmitReplacementMode: String? = nil,
        completion: ((String?) -> Void)? = nil
    ) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            vm.infoText = "Enter a Studio prompt first."
            return
        }
        guard !isSubmittingStudioPrompt, !isSubmittingPrompt else { return }
        let routesToPage = shouldRoutePromptToPage(text, routingMode)
        let featureSnapshotForSubmission = routesToPage ? featureWorkflowSnapshot : nil
        let restoredStudioContextForSubmission = routesToPage ? restoredStudioPromptContinuityContext : []
        let featureContinuationPrompt = featureSnapshotForSubmission.flatMap { snapshot in
            ScreenplayFeatureWorkflowPlanner.enrichedContinuationPrompt(
                for: text,
                snapshot: snapshot,
                recentStudioContext: restoredStudioContextForSubmission
            )
        }
        let baseSubmittedText = featureContinuationPrompt ?? text
        let compatibleIntent = intent?.compatible(routesToPage: routesToPage)
        let submittedText = compatibleIntent?.preparing(baseSubmittedText) ?? baseSubmittedText
        let requestID = requestIDOverride ?? "studio-\(UUID().uuidString.lowercased())"
        let pendingQuestionAtSubmission = vm.pendingScreenplayQuestion
        let pendingQuestionIDAtSubmission = pendingQuestionAtSubmission?.id
        if let featureSnapshotForSubmission {
            liveDraftBridge.recordFeatureWorkflowContext(
                ScreenplayFeatureWorkflowSessionContext(
                    requestID: requestID,
                    projectID: liveDraftBridge.committedWriteProjectIDSnapshot(),
                    versionID: liveDraftBridge.committedWriteVersionIDSnapshot(),
                    submittedPrompt: submittedText,
                    snapshot: featureSnapshotForSubmission,
                    featureSpine: liveDraftBridge.featureSpine
                )
            )
        }
        let perceivedTarget: StudioPerceivedSpeedState.Target = routesToPage ? .page : .voicePin

        beginPerceivedSpeedResponse(
            prompt: text,
            requestID: requestID,
            target: perceivedTarget,
            source: source
        )
        isSubmittingStudioPrompt = true
        self.sendingVoicePinSuggestionID = sendingSuggestionID
        studioPromptFocused = false
        if routesToPage {
            prepareReplacementTargetForPromptIfNeeded(text, routingMode: routingMode)
            liveDraftBridge.capturePendingPageWriteReplacementForSubmission(requestID: requestID)
        } else {
            liveDraftBridge.clearPendingPageWriteReplacement()
        }
        let debugReplacementMode = resolvedStudioDebugReplacementModeForSubmission(debugSubmitReplacementMode)
        let preparedDebugSubmitToken = matchingPreparedStudioDebugSubmitToken(
            text: text,
            routingMode: routingMode,
            replacementMode: debugReplacementMode
        )
        #if DEBUG
        let shouldForceLocalStubSubmit = IOThemRuntime.isStudioAutomationSession && (
            shouldUseDebugStudioPromptStubTransportForLocalSubmit ||
                (IOThemRuntime.isRunningUITests && !shouldUseBackendStudioPromptTransportForDebugSubmit)
        )
        let generatedDebugStubSubmitToken = shouldForceLocalStubSubmit
            ? Int(Date().timeIntervalSince1970 * 1_000)
            : nil
        let effectiveDebugSubmitToken = debugSubmitToken ?? preparedDebugSubmitToken ?? generatedDebugStubSubmitToken
        #else
        let effectiveDebugSubmitToken = debugSubmitToken ?? preparedDebugSubmitToken
        #endif
#if DEBUG
        if IOThemRuntime.isStudioAutomationSession,
           let effectiveDebugSubmitToken {
            setStudioDebugSubmitAck(
                token: effectiveDebugSubmitToken,
                text: text,
                routing: routingMode.rawValue,
                replacementMode: debugReplacementMode,
                requestID: requestID
            )
            resetStudioDebugSubmitResult()
            setStudioDebugSubmitStage("local_submit_accepted", token: effectiveDebugSubmitToken)
            if shouldForceLocalStubSubmit ||
                (debugSubmitToken != nil && !shouldUseBackendStudioPromptTransportForDebugSubmit) {
                setStudioDebugSubmitStage("stub_submit_started", token: effectiveDebugSubmitToken)
                applyDebugStudioPromptStubSubmit(
                    token: effectiveDebugSubmitToken,
                    prompt: submittedText,
                    displayText: displayText,
                    source: source,
                    requestID: requestID,
                    routingMode: routingMode,
                    routesToPage: routesToPage,
                    successMessage: successMessage,
                    clearSeedOnSuccess: clearSeedOnSuccess
                )
                if let pendingQuestionIDAtSubmission {
                    dismissPendingScreenplayQuestion(id: pendingQuestionIDAtSubmission)
                }
                completion?(nil)
                return
            }
        }
#endif
        publishDebugStudioDiffState()
#if DEBUG
        if let effectiveDebugSubmitToken {
            setStudioDebugSubmitStage("backend_task_enqueued", token: effectiveDebugSubmitToken)
        }
#endif
        Task { @MainActor in
#if DEBUG
            if let effectiveDebugSubmitToken {
                setStudioDebugSubmitStage("on_submit_started", token: effectiveDebugSubmitToken)
            }
#endif
            if let pendingQuestionAtSubmission {
                isResolvingPendingScreenplayQuestion = true
                do {
                    _ = try await BackendMemoryAPI.shared.resolvePendingScreenplayQuestion(
                        pendingQuestionAtSubmission,
                        responseStatus: "answered",
                        answer: text
                    )
                    dismissPendingScreenplayQuestion(id: pendingQuestionAtSubmission.id)
                    isResolvingPendingScreenplayQuestion = false
                } catch is BackendTalkQueuedError {
                    dismissPendingScreenplayQuestion(id: pendingQuestionAtSubmission.id)
                    isResolvingPendingScreenplayQuestion = false
                    isSubmittingStudioPrompt = false
                    self.sendingVoicePinSuggestionID = nil
                    liveDraftBridge.clearPendingPageWriteReplacement()
                    completePerceivedSpeedResponse(requestID: requestID)
                    if clearSeedOnSuccess {
                        studioPromptSeed = ""
                    }
                    vm.infoText = "Answer saved. Clementine will use it when you're online."
                    completion?(nil)
                    return
                } catch {
                    restorePendingScreenplayQuestion(pendingQuestionAtSubmission)
                    isResolvingPendingScreenplayQuestion = false
                    isSubmittingStudioPrompt = false
                    self.sendingVoicePinSuggestionID = nil
                    liveDraftBridge.clearPendingPageWriteReplacement()
                    completePerceivedSpeedResponse(requestID: requestID)
                    let resolutionError = "Couldn’t save that answer. \(error.localizedDescription)"
                    vm.infoText = resolutionError
                    completion?(resolutionError)
                    return
                }
            }
            let submittedAt = Date()
            let error = await onSubmitPrompt(submittedText, routingMode, requestID)
#if DEBUG || os(macOS)
            if let effectiveDebugSubmitToken {
                setStudioDebugSubmitStage("on_submit_finished", token: effectiveDebugSubmitToken, error: error ?? "")
            }
#endif
            isSubmittingStudioPrompt = false
            self.sendingVoicePinSuggestionID = nil
            completePerceivedSpeedResponse(requestID: requestID)
            if let error, !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
#if DEBUG || os(macOS)
                if let effectiveDebugSubmitToken {
                    publishStudioDebugSubmitResultPayload(
                        token: effectiveDebugSubmitToken,
                        status: "error",
                        prompt: text,
                        requestID: requestID,
                        routingMode: routingMode,
                        target: routesToPage ? .page : .voicePin,
                        exchange: nil,
                        error: error
                    )
                }
#endif
                vm.infoText = error
                completion?(error)
                return
            }
            if clearSeedOnSuccess {
                studioPromptSeed = ""
            }
            if let pendingQuestionIDAtSubmission {
                dismissPendingScreenplayQuestion(id: pendingQuestionIDAtSubmission)
                await vm.refreshPendingScreenplayQuestion()
            }
            let resolvedTarget: StudioTarget = routesToPage ? .page : .voicePin
            let committedPageWrite: ScreenplayCommittedWrite?
            if routesToPage {
                committedPageWrite = await waitForCommittedStudioPageWrite(submittedAt: submittedAt)
            } else {
                committedPageWrite = nil
            }
            let pageInsertedTextFallback: String? = {
                guard routesToPage else { return nil }
                if let committedPageWrite {
                    return committedPageWrite.insertedText
                }
                guard liveDraftBridge.lastUpdatedAt >= submittedAt.addingTimeInterval(-0.5) else { return nil }
                let latest = liveDraftBridge.latestVoiceTurn.trimmingCharacters(in: .whitespacesAndNewlines)
                return latest.isEmpty ? nil : latest
            }()
            let promptSummary = (displayText ?? text).trimmingCharacters(in: .whitespacesAndNewlines)
            let voicePinTextFallback: String? = {
                guard !routesToPage else { return nil }
                let defaults = UserDefaults.standard
                let storedUpdatedAtSeconds = defaults.double(forKey: ScreenplayLiveDraftBridge.latestVoicePinReplyUpdatedAtStorageKey)
                let storedUpdatedAt = storedUpdatedAtSeconds > 0
                    ? Date(timeIntervalSince1970: storedUpdatedAtSeconds)
                    : Date.distantPast
                let latestUpdatedAt = max(liveDraftBridge.latestVoicePinReplyUpdatedAt, storedUpdatedAt)
                guard latestUpdatedAt >= submittedAt.addingTimeInterval(-5.0) else { return nil }
                let latestPrompt = {
                    let bridgePrompt = liveDraftBridge.latestVoicePinPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !bridgePrompt.isEmpty { return bridgePrompt }
                    return defaults.string(forKey: ScreenplayLiveDraftBridge.latestVoicePinPromptStorageKey)?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                }()
                guard latestPrompt.isEmpty ||
                        latestPrompt == text ||
                        latestPrompt == promptSummary ||
                        latestPrompt == submittedText else { return nil }
                let latest = {
                    let bridgeReply = liveDraftBridge.latestVoicePinReply.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !bridgeReply.isEmpty { return bridgeReply }
                    return defaults.string(forKey: ScreenplayLiveDraftBridge.latestVoicePinReplyStorageKey)?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                }()
                return latest.isEmpty ? nil : latest
            }()
            lastCommittedStudioPrompt = promptSummary
            lastCommittedStudioPromptTarget = resolvedTarget
            lastCommittedStudioPromptSource = source
            appendStudioAskNoteHistory(
                prompt: promptSummary,
                target: resolvedTarget,
                source: source,
                requestID: requestID,
                committedWriteOverride: committedPageWrite,
                insertedTextOverride: pageInsertedTextFallback,
                voicePinTextOverride: voicePinTextFallback
            )
#if DEBUG || os(macOS)
            if let effectiveDebugSubmitToken {
                let matchingExchange = studioAskNoteHistory.first(where: {
                    normalizedStudioRequestID($0.requestID) == normalizedStudioRequestID(requestID)
                }) ?? studioAskNoteHistory.first
                publishStudioDebugSubmitResultPayload(
                    token: effectiveDebugSubmitToken,
                    status: "ok",
                    prompt: promptSummary,
                    requestID: requestID,
                    routingMode: routingMode,
                    target: resolvedTarget,
                    exchange: matchingExchange,
                    error: ""
                )
            }
#endif
            vm.infoText = successMessage
            completion?(nil)
        }
    }

#if DEBUG || os(macOS)
    private var debugStudioPromptSubmitTransportModeForLocalSubmit: String {
#if DEBUG
        if IOThemRuntime.isRunningUITests,
           let launchOverride = uiTestLaunchArgumentValue(
               "-studio_debug_submit_transport_mode",
               in: ProcessInfo.processInfo.arguments
           ),
           !launchOverride.isEmpty {
            return launchOverride.lowercased()
        }
#endif
        let mirrored = readMirroredStudioDebugPreferenceString(
            "studio_debug_submit_transport_mode",
            fallback: studioDebugSubmitTransportModeRaw
        )
        let resolved = mirrored.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? studioDebugSubmitTransportModeRaw
            : mirrored
        return resolved.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var shouldUseDebugStudioPromptStubTransportForLocalSubmit: Bool {
        ["stub", "structural-quality-stub"].contains(
            debugStudioPromptSubmitTransportModeForLocalSubmit
        )
    }

    private var shouldUseBackendStudioPromptTransportForDebugSubmit: Bool {
        [
            "backend",
            "live-backend",
            "live-submit"
        ].contains(debugStudioPromptSubmitTransportModeForLocalSubmit)
    }

    private func applyDebugStudioPromptStubSubmit(
        token: Int,
        prompt: String,
        displayText: String?,
        source: StudioPromptSource,
        requestID: String,
        routingMode: PromptRoutingMode,
        routesToPage: Bool,
        successMessage: String,
        clearSeedOnSuccess: Bool
    ) {
        let resolvedTarget: StudioTarget = routesToPage ? .page : .voicePin
        let promptSummary = (displayText ?? prompt).trimmingCharacters(in: .whitespacesAndNewlines)
        let memoryDomain = debugStudioPromptMemoryDomain(for: prompt, routesToPage: routesToPage)
        var matchingExchange: StudioAskNoteExchange?
        let noteTitle: String
        let noteBody: String
        let developmentText: String?

        if routesToPage {
            let insertedText = debugStudioPageStubText(for: prompt)
            let previousDraft = vm.fountainDraft
            let separator = previousDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : "\n\n"
            let committedDraft = previousDraft + separator + insertedText
            vm.fountainDraft = committedDraft
            liveDraftBridge.draftText = committedDraft
            liveDraftBridge.lastCommittedWrite = liveDraftBridge.makeCommittedWrite(
                id: UUID(),
                writeID: normalizedStudioRequestID(requestID),
                previousDraft: previousDraft,
                committedDraft: committedDraft,
                insertedText: insertedText,
                replacementApplied: false,
                replacedWriteID: nil,
                startLine: max(1, previousDraft.components(separatedBy: .newlines).count + (separator.isEmpty ? 0 : 2)),
                endLine: committedDraft.components(separatedBy: .newlines).count,
                committedAt: Date()
            )
            liveDraftBridge.lastUpdatedAt = Date()
            liveDraftBridge.clearPendingPageWriteReplacement()
            liveDraftBridge.latestMemoryDomain = .project
            noteTitle = "Wrote to page"
            noteBody = insertedText
            developmentText = nil
        } else {
            liveDraftBridge.clearPendingPageWriteReplacement()
            liveDraftBridge.latestMemoryDomain = memoryDomain
            let stub = debugStudioVoicePinStub(for: prompt, memoryDomain: memoryDomain)
            noteTitle = stub.title
            noteBody = stub.body
            developmentText = stub.body
            liveDraftBridge.updateAssistantPin(
                mode: "copilot",
                category: memoryDomain == .companion ? "Companion" : "Scene",
                title: noteTitle,
                body: noteBodyForExchange(noteBody),
                fullBody: noteBody,
                badge: memoryDomain.title,
                actionSummary: ""
            )
        }

        if clearSeedOnSuccess {
            studioPromptSeed = ""
        }
        lastCommittedStudioPrompt = promptSummary
        lastCommittedStudioPromptTarget = resolvedTarget
        lastCommittedStudioPromptSource = source
        if routesToPage {
            let committedWrite = liveDraftBridge.lastCommittedWrite
            let anchorSceneLabel = firstFountainSlugline(in: committedWrite?.insertedText ?? noteBody)
            let entry = StudioAskNoteExchange(
                id: UUID(),
                backendThreadID: nil,
                backendTurn: nil,
                requestID: normalizedStudioRequestID(requestID),
                prompt: promptSummary,
                target: .page,
                source: source,
                noteTitle: noteTitle,
                noteBody: noteBodyForExchange(noteBody),
                developmentText: developmentText,
                writeID: committedWrite?.writeID,
                replacedWriteID: committedWrite?.replacedWriteID,
                anchorLine: committedWrite?.startLine,
                anchorEndLine: committedWrite?.endLine,
                anchorSceneLabel: anchorSceneLabel,
                anchorExcerpt: noteBodyForAnchor(committedWrite?.insertedText ?? noteBody),
                insertedText: committedWrite?.insertedText ?? noteBody,
                replacementApplied: committedWrite?.replacementApplied,
                revisedBlockText: committedWrite?.replacementApplied == true ? committedWrite?.insertedText : nil,
                resolvedAnchorExcerpt: noteBodyForAnchor(committedWrite?.insertedText ?? noteBody),
                packLabel: liveDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Studio" : liveDraftBridge.latestPack,
                phase: liveDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : liveDraftBridge.latestPhase,
                sluglineAnchorLine: committedWrite?.startLine,
                memoryDomainRaw: memoryDomain.rawValue,
                companionModeRaw: liveDraftBridge.companionMode.rawValue,
                timestamp: Date()
            )
            insertStudioAskNoteHistoryEntry(entry)
        } else {
            let entry = StudioAskNoteExchange(
                id: UUID(),
                backendThreadID: nil,
                backendTurn: nil,
                requestID: normalizedStudioRequestID(requestID),
                prompt: promptSummary,
                target: .voicePin,
                source: source,
                noteTitle: noteTitle,
                noteBody: noteBodyForExchange(noteBody),
                developmentText: developmentText,
                writeID: nil,
                replacedWriteID: nil,
                anchorLine: nil,
                anchorEndLine: nil,
                anchorSceneLabel: nil,
                anchorExcerpt: nil,
                insertedText: nil,
                replacementApplied: nil,
                revisedBlockText: nil,
                resolvedAnchorExcerpt: nil,
                packLabel: liveDraftBridge.latestPack.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Studio" : liveDraftBridge.latestPack,
                phase: liveDraftBridge.latestPhase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : liveDraftBridge.latestPhase,
                sluglineAnchorLine: nil,
                memoryDomainRaw: memoryDomain.rawValue,
                companionModeRaw: liveDraftBridge.companionMode.rawValue,
                timestamp: Date()
            )
            insertStudioAskNoteHistoryEntry(entry)
        }
        matchingExchange = studioAskNoteHistory.first(where: {
            normalizedStudioRequestID($0.requestID) == normalizedStudioRequestID(requestID)
        }) ?? studioAskNoteHistory.first

        isSubmittingStudioPrompt = false
        sendingVoicePinSuggestionID = nil
        completePerceivedSpeedResponse(requestID: requestID)
        publishStudioDebugSubmitResultPayload(
            token: token,
            status: "ok",
            prompt: promptSummary,
            requestID: requestID,
            routingMode: routingMode,
            target: resolvedTarget,
            exchange: matchingExchange,
            error: ""
        )
        vm.infoText = successMessage
        mirrorStudioDebugString(memoryDomain.rawValue, forKey: "studio_debug_last_memory_domain")
        publishDebugStudioDiffState()
    }

    private func debugStudioPageStubText(for prompt: String) -> String {
        let normalizedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedPrompt.contains("second batch") || normalizedPrompt.contains("ferry terminal") {
            return """
EXT. FERRY TERMINAL - DAWN

MARA reaches the locked gate as the last ferry pulls away. Across the water, ELI raises the red flare.

MARA
You said we still had time.

She grips the chain, then turns toward the maintenance skiff.
"""
        }
        return """
INT. KITCHEN - DAY

LUCY reaches the threshold before FRANK can answer, taking the room's silence with her.

FRANK
Lucy--

The door closes softly. That is worse than a slam.
"""
    }

    private func debugStudioPromptMemoryDomain(for prompt: String, routesToPage: Bool) -> StudioMemoryDomain {
        guard !routesToPage else { return .project }
        let normalized = " \(prompt.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) "
        let companionCues = [
            " i feel ",
            " i am ",
            " i'm ",
            " im ",
            " spiraling ",
            " reassure ",
            " talk me through ",
            " stuck ",
            " need you "
        ]
        let projectCues = [
            " screenplay ",
            " script ",
            " scene ",
            " midpoint ",
            " story ",
            " character ",
            " beat ",
            " act ",
            " calls him ",
            " parking lot "
        ]
        let hasCompanion = companionCues.contains(where: normalized.contains)
        let hasProject = projectCues.contains(where: normalized.contains)
        if hasCompanion && hasProject { return .mixed }
        if hasCompanion { return .companion }
        return .project
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

    private func debugStudioVoicePinStub(
        for prompt: String,
        memoryDomain: StudioMemoryDomain
    ) -> (title: String, body: String) {
        if debugStudioPromptSubmitTransportModeForLocalSubmit == "structural-quality-stub" {
            let normalizedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if normalizedPrompt.contains("scene doctor") {
                return (
                    "Scene Doctor",
                    "REPAIRED SCENE DOCTOR. Canon protected: Mara already burned the ferry ledger. The core problem is that the scene repeats information without changing leverage. Strongest move: let Eli reveal he memorized one page before the fire, forcing Mara to choose between trusting him and losing the only surviving lead. That turns plot, relationship, and Act II pressure in one playable beat."
                )
            }
            return (
                "Feature Architecture",
                "REPAIRED FEATURE ARCHITECTURE. Canon protected: Mara already burned the ferry ledger. Act I makes the burned ledger her irreversible break from the safe investigation. Act II weaponizes Eli's memorized page at the midpoint, then makes their alliance cost Mara the case. Act III pays it off when Mara must trust Eli's memory in public, completing her move from private control to exposed faith."
            )
        }
        let characterContext = debugMentionedCharacterName(from: prompt)
        switch memoryDomain {
        case .companion:
            return (
                "Companion Check-In",
                "You are not behind. Take one breath, name the smallest next move, and let the scene become manageable again. I am here with you.\(characterContext.map { " For \($0), keep the emotional tell simple enough that the page can hold it." } ?? "")"
            )
        case .mixed:
            return (
                "Midpoint Direction",
                "The midpoint needs one irreversible choice. Put the character under pressure, make the emotional cost visible, then let the next scene deal with the fallout instead of explaining it.\(characterContext.map { " For \($0), a joke can hide fear, but the scene should still let us feel the fear under it." } ?? "")"
            )
        case .project:
            return (
                "Story Development",
                "Make the parking-lot call a pressure valve before the confrontation. It gives her private fear, lets him arrive late to the truth, and makes the kitchen scene feel like escalation instead of setup.\(characterContext.map { " For \($0), keep the wit as armor instead of decoration." } ?? "")"
            )
        }
    }
#endif

    private func prepareReplacementTargetForPromptIfNeeded(
        _ text: String,
        routingMode: PromptRoutingMode
    ) {
        guard shouldRoutePromptToPage(text, routingMode) else { return }
        guard liveDraftBridge.pendingReplacementTarget == nil,
              liveDraftBridge.submittedReplacementTarget == nil else { return }
        guard studioPromptLooksLikeRewriteIntent(text) else { return }

        if let selection = liveDraftBridge.editorSelection, selection.hasSelection {
            prepareReplacementTarget(for: selection)
            return
        }

        if let committedWrite = liveDraftBridge.lastCommittedWrite {
            prepareReplacementTarget(for: committedWrite)
            return
        }

        if let focusedPageDiffExchangeID,
           let exchange = studioAskNoteHistory.first(where: { $0.id == focusedPageDiffExchangeID }) {
            prepareReplacementTarget(for: exchange, currentText: currentReplacementTargetText(for: exchange))
            return
        }

        if let latestPageExchange = studioAskNoteHistory.first(where: { $0.target == .page }) {
            prepareReplacementTarget(for: latestPageExchange, currentText: currentReplacementTargetText(for: latestPageExchange))
        }
    }

    private func currentReplacementTargetText(for exchange: StudioAskNoteExchange) -> String {
        let currentText = fullThreadDraftComparison(for: exchange)?.currentText
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !currentText.isEmpty {
            return currentText
        }
        return exactInsertedText(for: exchange).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func studioPromptLooksLikeRewriteIntent(_ text: String) -> Bool {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !clean.isEmpty else { return false }
        let cues = [
            "rewrite",
            "replace",
            "restore",
            "shorter",
            "sharper",
            "more visual",
            "from diff",
            "same line",
            "last write",
            "current draft version"
        ]
        return cues.contains(where: { clean.contains($0) })
    }

    private func applyDebugPreparedStudioPromptIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugPrepareToken > 0 else { return }
        guard studioDebugPrepareToken != studioDebugPrepareAckToken else { return }
        let text = studioDebugPrepareText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let replacementMode = studioDebugPrepareReplacementMode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        studioPromptSeed = text
        studioPromptRoutingMode = PromptRoutingMode(rawValue: studioDebugPrepareRoutingRaw) ?? .automatic
        var replacementPrepared = false
        if replacementMode == "latest" {
            if let committedWrite = liveDraftBridge.lastCommittedWrite {
                prepareReplacementTarget(for: committedWrite)
                replacementPrepared = true
            } else if let latestPageExchange = studioAskNoteHistory.first(where: { $0.target == .page }) {
                let currentText = fullThreadDraftComparison(for: latestPageExchange)?.currentText
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let fallbackText = exactInsertedText(for: latestPageExchange).trimmingCharacters(in: .whitespacesAndNewlines)
                prepareReplacementTarget(
                    for: latestPageExchange,
                    currentText: currentText?.isEmpty == false ? (currentText ?? fallbackText) : fallbackText
                )
                replacementPrepared = true
            } else {
                liveDraftBridge.clearPendingPageWriteReplacement()
            }
        } else {
            liveDraftBridge.clearPendingPageWriteReplacement()
            replacementPrepared = true
        }
        guard replacementPrepared else { return }
        studioPromptFocused = true
        setStudioDebugPrepareAck(
            token: studioDebugPrepareToken,
            text: text,
            routing: studioPromptRoutingMode.rawValue,
            replacementMode: replacementMode.isEmpty ? "none" : replacementMode
        )
        publishDebugStudioDiffState()
        #endif
    }

    private func applyDebugAcknowledgedDiffIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugAcknowledgeDiffToken > 0 else { return }
        guard studioDebugAcknowledgeDiffToken != studioDebugAcknowledgeDiffAckToken else { return }
        guard studioDebugAcknowledgeDiffToken != lastAppliedStudioDebugAcknowledgeToken else { return }
        lastAppliedStudioDebugAcknowledgeToken = studioDebugAcknowledgeDiffToken
        let requestedKey = studioDebugAcknowledgeDiffKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let targetExchange = studioAskNoteHistory.first(where: { exchange in
            guard let comparison = fullThreadDraftComparison(for: exchange),
                  comparison.state == .revisedInDraft else {
                return false
            }
            let key = studioExchangePersistentActionKey(exchange)
            return requestedKey.isEmpty ? true : key == requestedKey
        })
        guard let targetExchange else { return }
        acknowledgeCurrentDraftVersion(for: targetExchange)
        studioDebugAcknowledgeDiffAckToken = studioDebugAcknowledgeDiffToken
        publishDebugStudioDiffState()
        #endif
    }

    private func applyDebugFocusedDiffIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugFocusDiffToken > 0 else { return }
        guard studioDebugFocusDiffToken != studioDebugFocusDiffAckToken else { return }
        guard studioDebugFocusDiffToken != lastAppliedStudioDebugFocusDiffToken else { return }
        let requestedKey = studioDebugFocusDiffKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !requestedKey.isEmpty,
              let targetExchange = studioAskNoteHistory.first(where: { exchange in
                  studioExchangePersistentActionKey(exchange) == requestedKey
                      && fullThreadDraftComparison(for: exchange)?.state == .revisedInDraft
              }) else {
            return
        }
        lastAppliedStudioDebugFocusDiffToken = studioDebugFocusDiffToken
        focusedPageDiffExchangeID = targetExchange.id
        focusedPageDiffPersistentKey = requestedKey
        isFocusedPageDiffOverlayPresented = false
        highlightedStudioExchangeID = targetExchange.id
        persistFullThreadBrowseState(for: activeStudioAskNoteHistoryKey)
        studioDebugFocusDiffAckToken = studioDebugFocusDiffToken
        #if os(macOS)
        writeMirroredStudioDebugPreferenceInt(
            studioDebugFocusDiffToken,
            forKey: "studio_debug_focus_diff_ack_token"
        )
        #endif
        publishDebugStudioDiffState()
        #endif
    }

    private func currentStudioDebugProjectLoadBreadcrumbs() -> [StudioDebugProjectLoadBreadcrumb] {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return [] }
        guard let data = studioDebugProjectLoadTraceJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([StudioDebugProjectLoadBreadcrumb].self, from: data) else {
            return []
        }
        return decoded
        #else
        return []
        #endif
    }

    private func persistStudioDebugProjectLoadBreadcrumbs(_ breadcrumbs: [StudioDebugProjectLoadBreadcrumb]) {
        #if DEBUG
        guard let data = try? JSONEncoder().encode(breadcrumbs),
              let encoded = String(data: data, encoding: .utf8) else { return }
        studioDebugProjectLoadTraceJSON = encoded
        #if os(macOS)
        writeMirroredStudioDebugPreferenceString(encoded, forKey: "studio_debug_project_load_trace_json")
        #endif
        #endif
    }

    private func mirrorStudioDebugInt(_ value: Int, forKey key: String) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        #if os(macOS)
        writeMirroredStudioDebugPreferenceInt(value, forKey: key)
        #endif
        #endif
    }

    private func mirrorStudioDebugString(_ value: String, forKey key: String) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        #if os(macOS)
        writeMirroredStudioDebugPreferenceString(value, forKey: key)
        #endif
        #endif
    }

    private func setStudioDebugLoadProjectAckToken(_ token: Int) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        studioDebugLoadProjectAckToken = token
        mirrorStudioDebugInt(token, forKey: "studio_debug_load_project_ack_token")
        #endif
    }

    private func setStudioDebugPrepareAck(
        token: Int,
        text: String,
        routing: String,
        replacementMode: String
    ) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        studioDebugPrepareAckToken = token
        studioDebugPrepareAckText = text
        studioDebugPrepareAckRoutingRaw = routing
        studioDebugPrepareAckReplacementMode = replacementMode
        mirrorStudioDebugInt(token, forKey: "studio_debug_prepare_ack_token")
        mirrorStudioDebugString(text, forKey: "studio_debug_prepare_ack_text")
        mirrorStudioDebugString(routing, forKey: "studio_debug_prepare_ack_routing")
        mirrorStudioDebugString(replacementMode, forKey: "studio_debug_prepare_ack_replacement_mode")
        #endif
    }

    private func setStudioDebugKeyboardSubmitAck(
        token: Int,
        text: String,
        routing: String,
        replacementMode: String
    ) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        studioDebugKeyboardSubmitAckToken = token
        studioDebugKeyboardSubmitAckText = text
        studioDebugKeyboardSubmitAckRoutingRaw = routing
        studioDebugKeyboardSubmitAckReplacementMode = replacementMode
        mirrorStudioDebugInt(token, forKey: "studio_debug_keyboard_submit_ack_token")
        mirrorStudioDebugString(text, forKey: "studio_debug_keyboard_submit_ack_text")
        mirrorStudioDebugString(routing, forKey: "studio_debug_keyboard_submit_ack_routing")
        mirrorStudioDebugString(replacementMode, forKey: "studio_debug_keyboard_submit_ack_replacement_mode")
        #endif
    }

    private func setStudioDebugSubmitAck(
        token: Int,
        text: String,
        routing: String,
        replacementMode: String,
        requestID: String
    ) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        studioDebugSubmitAckToken = token
        studioDebugSubmitAckText = text
        studioDebugSubmitAckRoutingRaw = routing
        studioDebugSubmitAckReplacementMode = replacementMode
        studioDebugSubmitAckRequestID = requestID
        mirrorStudioDebugInt(token, forKey: "studio_debug_submit_ack_token")
        mirrorStudioDebugString(text, forKey: "studio_debug_submit_ack_text")
        mirrorStudioDebugString(routing, forKey: "studio_debug_submit_ack_routing")
        mirrorStudioDebugString(replacementMode, forKey: "studio_debug_submit_ack_replacement_mode")
        mirrorStudioDebugString(requestID, forKey: "studio_debug_submit_ack_request_id")
        #endif
    }

    private func setStudioDebugSubmitResult(
        token: Int,
        status: String,
        error: String,
        payloadJSON: String? = nil
    ) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        studioDebugSubmitResultToken = token
        studioDebugSubmitResultStatus = status
        studioDebugSubmitResultError = error
        if let payloadJSON {
            studioDebugSubmitResultJSON = payloadJSON
            mirrorStudioDebugString(payloadJSON, forKey: "studio_debug_submit_result_json")
        }
        mirrorStudioDebugInt(token, forKey: "studio_debug_submit_result_token")
        mirrorStudioDebugString(status, forKey: "studio_debug_submit_result_status")
        mirrorStudioDebugString(error, forKey: "studio_debug_submit_result_error")
        #endif
    }

    private func setStudioDebugSubmitStage(
        _ stage: String,
        token: Int,
        error: String = ""
    ) {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let cleanStage = stage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanStage.isEmpty else { return }
        mirrorStudioDebugString(cleanStage, forKey: "studio_debug_submit_stage")
        mirrorStudioDebugInt(token, forKey: "studio_debug_submit_stage_token")
        mirrorStudioDebugString(error.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "studio_debug_submit_stage_error")
        #endif
    }

    private func resetStudioDebugSubmitResult() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        studioDebugSubmitResultToken = 0
        studioDebugSubmitResultStatus = ""
        studioDebugSubmitResultError = ""
        studioDebugSubmitResultJSON = ""
        mirrorStudioDebugInt(0, forKey: "studio_debug_submit_result_token")
        mirrorStudioDebugString("", forKey: "studio_debug_submit_result_status")
        mirrorStudioDebugString("", forKey: "studio_debug_submit_result_error")
        mirrorStudioDebugString("", forKey: "studio_debug_submit_result_json")
        mirrorStudioDebugString("", forKey: "studio_debug_submit_stage")
        mirrorStudioDebugInt(0, forKey: "studio_debug_submit_stage_token")
        mirrorStudioDebugString("", forKey: "studio_debug_submit_stage_error")
        #endif
    }

    private func updateTrackedStudioDebugProjectLoadState(
        token: Int,
        requestedProjectID: String,
        requestedVersionID: String,
        stage: String,
        ready: Bool,
        error: String = ""
    ) {
        #if DEBUG
        trackedStudioDebugProjectLoadToken = token
        trackedStudioDebugProjectLoadRequestedProjectID = requestedProjectID
        trackedStudioDebugProjectLoadRequestedVersionID = requestedVersionID
        trackedStudioDebugProjectLoadStage = stage
        trackedStudioDebugProjectLoadReady = ready
        trackedStudioDebugProjectLoadError = error
        #endif
    }

    private func appendStudioDebugProjectLoadBreadcrumb(
        token: Int,
        event: String,
        detail: String,
        requestedProjectID: String,
        requestedVersionID: String
    ) {
        #if DEBUG
        let breadcrumb = StudioDebugProjectLoadBreadcrumb(
            token: token,
            event: event,
            detail: detail,
            requestedProjectID: requestedProjectID,
            requestedVersionID: requestedVersionID,
            selectedProjectID: vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines),
            latestVersionID: vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines),
            loadedDraftProjectID: vm.debugLoadedDraftProjectID,
            isLoading: vm.isLoading,
            hasSelectedProject: vm.selectedProject != nil,
            editorFocusPending: liveDraftBridge.pendingEditorFocus != nil,
            timestampISO8601: ISO8601DateFormatter().string(from: Date())
        )
        var breadcrumbs = currentStudioDebugProjectLoadBreadcrumbs()
        breadcrumbs.append(breadcrumb)
        if breadcrumbs.count > 64 {
            breadcrumbs.removeFirst(breadcrumbs.count - 64)
        }
        persistStudioDebugProjectLoadBreadcrumbs(breadcrumbs)
        #endif
    }

    private func isStudioDebugProjectLoadReady(
        projectID: String,
        versionID: String,
        requireEditorFocusConsumption: Bool = true
    ) -> Bool {
        #if DEBUG
        let cleanProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanProjectID.isEmpty else { return false }
        let cleanVersionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedProjectID = vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedProjectLoaded = (vm.selectedProject?.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let latestVersionID = vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !vm.isLoading else { return false }
        guard selectedProjectID == cleanProjectID else { return false }
        guard selectedProjectLoaded == cleanProjectID else { return false }
        guard vm.debugLoadedDraftProjectID == cleanProjectID else { return false }
        guard cleanVersionID.isEmpty || latestVersionID == cleanVersionID else { return false }
        if requireEditorFocusConsumption && liveDraftBridge.pendingEditorFocus != nil {
            return false
        }
        return true
        #else
        return false
        #endif
    }

    @MainActor
    private func waitForStudioDebugProjectLoadReady(
        projectID: String,
        versionID: String,
        timeoutSeconds: TimeInterval = 25
    ) async -> Bool {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return false }
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while Date() < deadline {
            if isStudioDebugProjectLoadReady(
                projectID: projectID,
                versionID: versionID
            ) {
                return true
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return isStudioDebugProjectLoadReady(
            projectID: projectID,
            versionID: versionID,
            requireEditorFocusConsumption: false
        )
        #else
        return false
        #endif
    }

    @MainActor
    private func waitForStudioDebugSelectedProjectID(
        projectID: String,
        timeoutSeconds: TimeInterval = 10
    ) async -> Bool {
        #if DEBUG
        let cleanProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanProjectID.isEmpty else { return false }
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while Date() < deadline {
            let selectedProjectID = vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            if selectedProjectID == cleanProjectID {
                return true
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == cleanProjectID
        #else
        return false
        #endif
    }

    private func isCurrentStudioDebugProjectLoadRequest(
        token: Int,
        requestedProjectID: String,
        requestedVersionID: String,
        source: String
    ) -> Bool {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return false }
        let cleanProjectID = requestedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersionID = requestedVersionID.trimmingCharacters(in: .whitespacesAndNewlines)

        switch source {
        case "app_storage":
            return studioDebugLoadProjectToken == token
                && studioDebugLoadProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == cleanProjectID
                && studioDebugLoadProjectVersionID.trimmingCharacters(in: .whitespacesAndNewlines) == cleanVersionID
        case "bridge", "bridge_force":
            return liveDraftBridge.debugProjectLoadToken == token
                && liveDraftBridge.debugRequestedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == cleanProjectID
                && liveDraftBridge.debugRequestedVersionID.trimmingCharacters(in: .whitespacesAndNewlines) == cleanVersionID
        default:
            return false
        }
        #else
        return false
        #endif
    }

    @MainActor
    private func performStudioDebugProjectLoad(
        token: Int,
        requestedProjectID: String,
        requestedVersionID: String,
        source: String
    ) async -> Bool {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return false }
        let cleanProjectID = requestedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersionID = requestedVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isCurrentStudioDebugProjectLoadRequest(
            token: token,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID,
            source: source
        ) else { return false }

        guard !cleanProjectID.isEmpty else {
            updateTrackedStudioDebugProjectLoadState(
                token: token,
                requestedProjectID: "",
                requestedVersionID: cleanVersionID,
                stage: "empty_request",
                ready: false,
                error: "Missing requested project ID."
            )
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "empty_request",
                detail: "Ignored debug project load request without a project ID.",
                requestedProjectID: "",
                requestedVersionID: cleanVersionID
            )
            setStudioDebugLoadProjectAckToken(token)
            publishDebugStudioDiffState()
            return false
        }

        if studioDebugProjectLoadInFlight,
           trackedStudioDebugProjectLoadToken == token,
           trackedStudioDebugProjectLoadRequestedProjectID == cleanProjectID,
           trackedStudioDebugProjectLoadRequestedVersionID == cleanVersionID {
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "load_reused",
                detail: "Skipped duplicate debug project load because the same token is already in flight.",
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID
            )
            publishDebugStudioDiffState()
            return false
        }

        let operationID = UUID()
        activeStudioDebugProjectLoadOperationID = operationID
        studioDebugProjectLoadInFlight = true
        defer {
            if activeStudioDebugProjectLoadOperationID == operationID {
                activeStudioDebugProjectLoadOperationID = nil
                studioDebugProjectLoadInFlight = false
                publishDebugStudioDiffState()
            }
        }

        updateTrackedStudioDebugProjectLoadState(
            token: token,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID,
            stage: "studio_screen_active",
            ready: false
        )
        appendStudioDebugProjectLoadBreadcrumb(
            token: token,
            event: "studio_screen_active",
            detail: "Studio screen observed the pending debug project-load request.",
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID
        )
        publishDebugStudioDiffState()

        liveDraftBridge.preferredProjectID = cleanProjectID
        liveDraftBridge.debugRequestedProjectID = cleanProjectID
        liveDraftBridge.preferredVersionID = cleanVersionID
        liveDraftBridge.debugRequestedVersionID = cleanVersionID

        updateTrackedStudioDebugProjectLoadState(
            token: token,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID,
            stage: "selection_started",
            ready: false
        )
        appendStudioDebugProjectLoadBreadcrumb(
            token: token,
            event: "selection_started",
            detail: "Started selecting the requested Studio project via the explicit debug path (\(source)).",
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID
        )
        publishDebugStudioDiffState()

        let selectionTask = Task { @MainActor in
            await vm.selectProject(cleanProjectID)
        }
        let selectionApplied = await waitForStudioDebugSelectedProjectID(projectID: cleanProjectID)
        guard isCurrentStudioDebugProjectLoadRequest(
            token: token,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID,
            source: source
        ) else {
            selectionTask.cancel()
            return false
        }
        if selectionApplied {
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "project_selection_ready",
                detail: "Observed requested Studio project selection before full draft hydration completed.",
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID
            )
        }
        await selectionTask.value
        guard isCurrentStudioDebugProjectLoadRequest(
            token: token,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID,
            source: source
        ) else { return false }

        let resolvedProjectID = vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedLoadedProjectID = (vm.selectedProject?.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedLoadedDraftProjectID = vm.debugLoadedDraftProjectID
        let resolvedVersionID = vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedErrorText = vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedDetail = cleanVersionID.isEmpty
            ? "Project selection resolved to \(resolvedProjectID.isEmpty ? "none" : resolvedProjectID)."
            : "Project selection resolved to \(resolvedProjectID.isEmpty ? "none" : resolvedProjectID) with version \(resolvedVersionID.isEmpty ? "none" : resolvedVersionID)."
        let resolvedDetailWithError = resolvedErrorText.isEmpty
            ? resolvedDetail
            : "\(resolvedDetail) Error: \(resolvedErrorText)"
        updateTrackedStudioDebugProjectLoadState(
            token: token,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID,
            stage: "project_resolved",
            ready: false
        )
        appendStudioDebugProjectLoadBreadcrumb(
            token: token,
            event: "project_resolved",
            detail: resolvedDetailWithError,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID
        )

        let resolvedRequestedProject = resolvedProjectID == cleanProjectID
            && resolvedLoadedProjectID == cleanProjectID
            && resolvedLoadedDraftProjectID == cleanProjectID
        let resolvedRequestedVersion = cleanVersionID.isEmpty || resolvedVersionID == cleanVersionID
        if !resolvedRequestedProject || !resolvedRequestedVersion {
            let failureDetail = [
                "Could not resolve requested debug project after selection.",
                "selected=\(resolvedProjectID.isEmpty ? "none" : resolvedProjectID)",
                "loaded=\(resolvedLoadedProjectID.isEmpty ? "none" : resolvedLoadedProjectID)",
                "draftProject=\(resolvedLoadedDraftProjectID.isEmpty ? "none" : resolvedLoadedDraftProjectID)",
                "version=\(resolvedVersionID.isEmpty ? "none" : resolvedVersionID)",
                resolvedErrorText.isEmpty ? "" : "error=\(resolvedErrorText)",
            ]
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            updateTrackedStudioDebugProjectLoadState(
                token: token,
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID,
                stage: "project_resolve_failed",
                ready: false,
                error: failureDetail
            )
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "project_resolve_failed",
                detail: failureDetail,
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID
            )
            setStudioDebugLoadProjectAckToken(token)
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "acknowledged_failed_request",
                detail: "Published project-load acknowledgment for a terminal failed debug request so later requests can proceed.",
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID
            )
            publishDebugStudioDiffState()
            return false
        }
        if !resolvedErrorText.isEmpty {
            vm.errorText = ""
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "selection_warning_cleared",
                detail: "Ignored stale selection error after the requested project and version resolved: \(resolvedErrorText)",
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID
            )
        }

        liveDraftBridge.requestEditorFocus()
        updateTrackedStudioDebugProjectLoadState(
            token: token,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID,
            stage: "editor_focus_requested",
            ready: false
        )
        appendStudioDebugProjectLoadBreadcrumb(
            token: token,
            event: "editor_focus_requested",
            detail: "Requested screenplay editor focus and will wait for the editor to consume that request before acknowledging load.",
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID
        )
        publishDebugStudioDiffState()

        let ready = await waitForStudioDebugProjectLoadReady(
            projectID: cleanProjectID,
            versionID: cleanVersionID
        )
        guard isCurrentStudioDebugProjectLoadRequest(
            token: token,
            requestedProjectID: cleanProjectID,
            requestedVersionID: cleanVersionID,
            source: source
        ) else { return false }
        if ready {
            updateTrackedStudioDebugProjectLoadState(
                token: token,
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID,
                stage: "editor_ready",
                ready: true
            )
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "editor_ready",
                detail: "Requested Studio project is loaded, active, and the screenplay editor consumed the focus request.",
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID
            )
            setStudioDebugLoadProjectAckToken(token)
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "acknowledged",
                detail: "Published deterministic project-load acknowledgment after the editor-ready checkpoint passed.",
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID
            )
        } else {
            let timeoutDetail = "Timed out waiting for project \(cleanProjectID) to become active and for the screenplay editor focus handshake to complete."
            updateTrackedStudioDebugProjectLoadState(
                token: token,
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID,
                stage: "timeout",
                ready: false,
                error: timeoutDetail
            )
            appendStudioDebugProjectLoadBreadcrumb(
                token: token,
                event: "timeout",
                detail: timeoutDetail,
                requestedProjectID: cleanProjectID,
                requestedVersionID: cleanVersionID
            )
        }
        return ready
        #else
        return false
        #endif
    }

    private func applyDebugLoadProjectIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard !IOThemRuntime.isRunningTests else { return }
        let requestToken = studioDebugLoadProjectToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugLoadProjectAckToken else { return }
        guard requestToken != lastAppliedStudioDebugLoadProjectToken else { return }
        lastAppliedStudioDebugLoadProjectToken = requestToken
        let requestedProjectID = studioDebugLoadProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedVersionID = studioDebugLoadProjectVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requestedProjectID.isEmpty else {
            setStudioDebugLoadProjectAckToken(requestToken)
            publishDebugStudioDiffState()
            return
        }
        Task { @MainActor in
            guard studioDebugLoadProjectToken == requestToken else { return }
            if await performStudioDebugProjectLoad(
                token: requestToken,
                requestedProjectID: requestedProjectID,
                requestedVersionID: requestedVersionID,
                source: "app_storage"
            ) {
                await restoreStudioWorkspaceAfterProjectHydration()
            }
        }
        #endif
    }

    @MainActor
    @discardableResult
    private func applyBridgeDebugProjectLoadIfNeeded(force: Bool = false) async -> Bool {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return false }
        guard !IOThemRuntime.isRunningTests else { return false }
        let token = liveDraftBridge.debugProjectLoadToken
        let requestedProjectID = liveDraftBridge.debugRequestedProjectID
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedVersionID = liveDraftBridge.debugRequestedVersionID
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requestedProjectID.isEmpty else { return false }
        if token > 0,
           token == lastAppliedBridgeDebugProjectLoadToken,
           isStudioDebugProjectLoadReady(
               projectID: requestedProjectID,
               versionID: requestedVersionID,
               requireEditorFocusConsumption: false
           ) {
            return false
        }
        if token > 0 {
            guard force || token != lastAppliedBridgeDebugProjectLoadToken else { return false }
            lastAppliedBridgeDebugProjectLoadToken = token
        } else if !force || vm.selectedProjectID == requestedProjectID {
            return false
        }
        if token > 0 {
            let source = force ? "bridge_force" : "bridge"
            return await performStudioDebugProjectLoad(
                token: token,
                requestedProjectID: requestedProjectID,
                requestedVersionID: requestedVersionID,
                source: source
            )
        }
        liveDraftBridge.preferredProjectID = requestedProjectID
        liveDraftBridge.preferredVersionID = requestedVersionID
        await vm.selectProject(requestedProjectID)
        guard isCurrentStudioDebugProjectLoadRequest(
            token: token,
            requestedProjectID: requestedProjectID,
            requestedVersionID: requestedVersionID,
            source: force ? "bridge_force" : "bridge"
        ) else { return false }
        if !requestedVersionID.isEmpty {
            liveDraftBridge.preferredVersionID = requestedVersionID
        }
        publishDebugStudioDiffState()
        return true
        #else
        return false
        #endif
    }

    private func applyDebugFocusPageIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugFocusPageToken > 0 else { return }
        guard studioDebugFocusPageToken != studioDebugFocusPageAckToken else { return }
        guard studioDebugFocusPageToken != lastAppliedStudioDebugFocusPageToken else { return }
        lastAppliedStudioDebugFocusPageToken = studioDebugFocusPageToken
        liveDraftBridge.requestEditorFocus()
        studioDebugFocusPageAckToken = studioDebugFocusPageToken
        publishDebugStudioDiffState()
        #endif
    }

    private func applyDebugManualDraftEditIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugManualEditToken > 0 else { return }
        guard studioDebugManualEditToken != studioDebugManualEditAckToken else { return }
        guard studioDebugManualEditToken != lastAppliedStudioDebugManualEditToken else { return }
        lastAppliedStudioDebugManualEditToken = studioDebugManualEditToken
        let text = studioDebugManualEditText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            studioDebugManualEditAckToken = studioDebugManualEditToken
            #if os(macOS)
            writeMirroredStudioDebugPreferenceInt(studioDebugManualEditToken, forKey: "studio_debug_manual_edit_ack_token")
            #endif
            publishDebugStudioDiffState()
            return
        }
        let separator = vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : "\n"
        liveDraftBridge.requestEditorFocus()
        vm.fountainDraft += separator + text
        vm.noteManualDraftEdit()
        studioDebugManualEditAckToken = studioDebugManualEditToken
        #if os(macOS)
        writeMirroredStudioDebugPreferenceInt(studioDebugManualEditToken, forKey: "studio_debug_manual_edit_ack_token")
        #endif
        publishDebugStudioDiffState()
        #endif
    }

    private func applyDebugAutosaveToggleIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugAutosaveToggleToken > 0 else { return }
        guard studioDebugAutosaveToggleToken != studioDebugAutosaveToggleAckToken else { return }
        guard studioDebugAutosaveToggleToken != lastAppliedStudioDebugAutosaveToggleToken else { return }
        lastAppliedStudioDebugAutosaveToggleToken = studioDebugAutosaveToggleToken
        vm.autosaveEnabled = studioDebugAutosaveEnabled
        studioDebugAutosaveToggleAckToken = studioDebugAutosaveToggleToken
        #if os(macOS)
        writeMirroredStudioDebugPreferenceInt(studioDebugAutosaveToggleToken, forKey: "studio_debug_autosave_toggle_ack_token")
        #endif
        publishDebugStudioDiffState()
        #endif
    }

    private func applyDebugForceHydrateIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugForceHydrateToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugForceHydrateAckToken else { return }
        guard requestToken != lastAppliedStudioDebugForceHydrateToken else { return }
        lastAppliedStudioDebugForceHydrateToken = requestToken
        let requestedProjectID = liveDraftBridge.debugRequestedProjectID
            .trimmingCharacters(in: .whitespacesAndNewlines)
        Task { @MainActor in
            guard studioDebugForceHydrateToken == requestToken else { return }
            if !requestedProjectID.isEmpty,
               vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) != requestedProjectID {
                await vm.selectProject(requestedProjectID)
                guard studioDebugForceHydrateToken == requestToken else { return }
            }
            await vm.refreshSelectedProjectForDebug()
            guard studioDebugForceHydrateToken == requestToken else { return }
            vm.markManualEditHydrateProtectedForDebugIfNeeded()
            studioDebugForceHydrateAckToken = requestToken
            #if os(macOS)
            writeMirroredStudioDebugPreferenceInt(requestToken, forKey: "studio_debug_force_hydrate_ack_token")
            #endif
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugManualSaveIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugSaveToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugSaveAckToken else { return }
        guard requestToken != lastAppliedStudioDebugSaveToken else { return }
        lastAppliedStudioDebugSaveToken = requestToken
        Task { @MainActor in
            guard studioDebugSaveToken == requestToken else { return }
            await vm.manualSaveDraft()
            guard studioDebugSaveToken == requestToken else { return }
            studioDebugSaveAckToken = requestToken
            #if os(macOS)
            writeMirroredStudioDebugPreferenceInt(requestToken, forKey: "studio_debug_save_ack_token")
            #endif
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugStructuralSeedIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugSeedStructuralToken > 0 else { return }
        guard studioDebugSeedStructuralToken != studioDebugSeedStructuralAckToken else { return }
        guard studioDebugSeedStructuralToken != lastAppliedStudioDebugSeedStructuralToken else { return }
        lastAppliedStudioDebugSeedStructuralToken = studioDebugSeedStructuralToken

        let sampleDraft = """
INT. DINER - NIGHT
LUCY
I can do this.

INT. KITCHEN - DAY
FRANK
I have to move now.
Frank stares at the sink.

INT. ROOF - SUNSET
JESS
Look at the city.
"""

        let now = Date().timeIntervalSince1970 * 1000
        let project = BackendScreenplayProjectSummary(
            id: "debug-structural",
            title: "Debug Structural",
            archived: false,
            tags: ["debug"],
            characters: ["LUCY", "FRANK"],
            setting: "Test City",
            tone: "Grounded",
            promptSeed: nil,
            logline: "A test crew maps broken scenes into a working draft.",
            themeArgument: "Structure lets chaos become playable.",
            centralQuestion: "Can the draft become coherent before the handoff?",
            protagonistWant: "Lucy wants the missing scene order.",
            protagonistNeed: "Lucy needs to trust the rewrite pass.",
            antagonisticForce: "A fractured outline fighting the page.",
            actPosition: "Act I",
            endingImage: "The scenes line up in a clean final pass.",
            unresolvedSetups: ["The duplicate kitchen beat remains unresolved."],
            createdAt: now,
            updatedAt: now,
            versionCount: 1,
            lastPhase: "scene_draft",
            activeVersionId: "debug-version",
            lastVersionId: "debug-version",
            lastVersionAt: now,
            formatScore: nil,
            storyScore: nil,
            confidenceClass: nil,
            latestExcerpt: nil,
            actCount: 2,
            sceneCount: 2,
            beatCount: 3,
            outlineUpdatedAt: now,
            collaboratorCount: nil,
            approvedEmails: nil,
            commentCount: nil,
            lastCommentAt: nil,
            studioThreadViewState: nil,
            studioDiffAcknowledged: nil,
            studioAskNoteHistory: nil,
            collaborators: nil,
            comments: nil,
            versions: nil,
            outline: nil
        )
        let outline = BackendScreenplayOutline(
            updatedAt: now,
            actCount: 2,
            sceneCount: 2,
            beatCount: 3,
            acts: [
                BackendScreenplayAct(
                    id: "act-1",
                    title: "Act I",
                    summary: nil,
                    order: 0,
                    sceneIds: ["scene-diner", "scene-kitchen"],
                    createdAt: now,
                    updatedAt: now
                ),
                BackendScreenplayAct(
                    id: "act-2",
                    title: "Act II",
                    summary: nil,
                    order: 1,
                    sceneIds: [],
                    createdAt: now,
                    updatedAt: now
                ),
            ],
            scenes: [
                BackendScreenplayScene(
                    id: "scene-diner",
                    slugline: "INT. DINER - NIGHT",
                    title: "Diner",
                    objective: "Lucy commits to the plan.",
                    summary: "Lucy steadies herself before the next move.",
                    actId: "act-1",
                    order: 0,
                    status: "open",
                    beatIds: ["beat-diner"],
                    createdAt: now,
                    updatedAt: now
                ),
                BackendScreenplayScene(
                    id: "scene-kitchen",
                    slugline: "INT. KITCHEN - DAY",
                    title: "Kitchen",
                    objective: "Frank covers the evidence.",
                    summary: "Frank stalls in the kitchen.",
                    actId: "act-1",
                    order: 1,
                    status: "open",
                    beatIds: ["beat-kitchen", "beat-kitchen-dup"],
                    createdAt: now,
                    updatedAt: now
                ),
            ],
            beats: [
                BackendScreenplayBeat(
                    id: "beat-diner",
                    label: "Lucy commits",
                    summary: "Lucy decides to push forward.",
                    sceneId: "scene-diner",
                    actId: "act-1",
                    order: 0,
                    status: "open",
                    createdAt: now,
                    updatedAt: now
                ),
                BackendScreenplayBeat(
                    id: "beat-kitchen",
                    label: "Frank stalls",
                    summary: "Frank buys time in the kitchen.",
                    sceneId: "scene-kitchen",
                    actId: "act-1",
                    order: 1,
                    status: "open",
                    createdAt: now,
                    updatedAt: now
                ),
                BackendScreenplayBeat(
                    id: "beat-kitchen-dup",
                    label: "Frank stalls",
                    summary: "Frank lingers at the counter.",
                    sceneId: nil,
                    actId: "act-1",
                    order: 2,
                    status: "open",
                    createdAt: now,
                    updatedAt: now
                ),
            ]
        )

        vm.projects = [project]
        vm.selectedProjectID = project.id
        vm.selectedProject = project
        draggedBeatID = nil
        beatDropTargetID = ""
        isBeatListDropTargeted = false
        shouldRestoreInspectorWorkspaceOnNextOutlineChange = true
        vm.outline = outline
        vm.applyStructuralUITestDraft(sampleDraft, versionID: "debug-version")
        vm.characterTraits = BackendCharacterTraitsResponse(
            schemaVersion: 1,
            userId: "ui-structural",
            characters: [
                BackendCharacterTraitRecord(name: "LUCY", traits: nil)
            ],
            error: nil
        )
        vm.characterArchetypes = nil
        vm.isCharacterTraitsLoading = false
        vm.characterTraitsErrorText = ""
        vm.craftTwists = ScreenplayCraftTwistSuggestResponse(
            schemaVersion: 1,
            frameworkId: "save-the-cat",
            currentBeatId: "midpoint",
            source: "ui-structural",
            twists: [
                ScreenplayCraftTwistSuggestion(
                    id: "ui-twist-midpoint",
                    label: "False Victory",
                    hook: "The clean handoff exposes the missing scene.",
                    severity: "medium",
                    rationale: "Turns structural confidence into fresh pressure."
                )
            ]
        )
        vm.isCraftTwistLoading = false
        vm.craftTwistErrorText = ""
        vm.craftTwistBeatLabel = "Midpoint"
        vm.acceptedCraftTwists = []
        vm.isAcceptedCraftTwistMutating = false
        vm.acceptedCraftTwistErrorText = ""
        liveDraftBridge.draftText = sampleDraft
        liveDraftBridge.preferredProjectID = project.id
        liveDraftBridge.preferredVersionID = "debug-version"
        restoreInspectorWorkspaceState()
        liveDraftBridge.updateEditorSelectionSnapshot(nil)
        liveDraftBridge.jumpToLine(1)
        liveDraftBridge.highlightLineRange(startLine: 1, endLine: 1)
        studioAskNoteHistory = []

        let revisedEntry = StudioAskNoteExchange(
            id: UUID(),
            backendThreadID: nil,
            backendTurn: nil,
            requestID: "debug-rewrite",
            prompt: "Rewrite Lucy's opening line.",
            target: .page,
            source: .typed,
            noteTitle: "Wrote to page",
            noteBody: noteBodyForExchange("LUCY\nI can't do this."),
            developmentText: nil,
            writeID: "debug-write-1",
            replacedWriteID: nil,
            anchorLine: 2,
            anchorEndLine: 3,
            anchorSceneLabel: "Diner - Night",
            anchorExcerpt: noteBodyForAnchor("LUCY\nI can't do this."),
            insertedText: "LUCY\nI can't do this.",
            replacementApplied: true,
            revisedBlockText: "LUCY\nI can't do this.",
            resolvedAnchorExcerpt: noteBodyForAnchor("LUCY\nI can't do this."),
            packLabel: "Debug",
            phase: "scene_draft",
            sluglineAnchorLine: 1,
            memoryDomainRaw: StudioMemoryDomain.project.rawValue,
            companionModeRaw: nil,
            timestamp: Date()
        )
        studioAskNoteHistory = [revisedEntry]
        focusedPageDiffExchangeID = revisedEntry.id
        focusedPageDiffPersistentKey = studioExchangePersistentActionKey(revisedEntry)
        highlightedStudioExchangeID = revisedEntry.id
        liveDraftBridge.latestMemoryDomain = .project
        vm.refreshLiveDraftBridgeContext()
        studioDebugSeedStructuralAckToken = studioDebugSeedStructuralToken
        #if os(macOS)
        writeMirroredStudioDebugPreferenceInt(
            studioDebugSeedStructuralToken,
            forKey: "studio_debug_seed_structural_ack_token"
        )
        #endif
        publishDebugStudioDiffState()
        #endif
    }

    private func applyUITestLaunchActionsIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isRunningUITests else { return }
        guard !didApplyUITestLaunchActions else { return }
        didApplyUITestLaunchActions = true
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--ui-route-page") {
            studioPromptRoutingMode = .page
        } else if arguments.contains("--ui-route-voice-pin") {
            studioPromptRoutingMode = .voicePin
        }
        if arguments.contains("--ui-open-export-tools") {
            openDraftInspector()
            selectedDraftToolsSection = .pages
        }
        if arguments.contains("--ui-open-commandbar") {
            openStudioCommandBar()
        }
        applyUITestCompanionSignalFixtureIfNeeded(arguments)
        applyUITestDraftConflictFixtureIfNeeded()
        applyUITestPendingScreenplayQuestionFixtureIfNeeded()
        if let prompt = uiTestLaunchArgumentValue("--ui-auto-submit-page-prompt", in: arguments) {
            studioPromptRoutingMode = .page
            submitStudioPromptText(
                prompt,
                displayText: prompt,
                source: .typed,
                routingMode: .page,
                successMessage: "Prompt sent to io.them.",
                clearSeedOnSuccess: true,
                sendingSuggestionID: nil
            )
        }
        if let prompt = uiTestLaunchArgumentValue("--ui-auto-submit-voice-pin-prompt", in: arguments) {
            studioPromptRoutingMode = .voicePin
            submitStudioPromptText(
                prompt,
                displayText: prompt,
                source: .typed,
                routingMode: .voicePin,
                successMessage: "Prompt sent to io.them.",
                clearSeedOnSuccess: true,
                sendingSuggestionID: nil
            )
        }
        if let prompt = uiTestLaunchArgumentValue("--ui-auto-submit-voice-source-prompt", in: arguments) {
            studioPromptRoutingMode = .voicePin
            submitStudioPromptText(
                prompt,
                displayText: prompt,
                source: .voice,
                routingMode: .voicePin,
                successMessage: "Voice prompt sent to io.them.",
                clearSeedOnSuccess: true,
                sendingSuggestionID: nil
            )
        }
        #endif
    }

    #if DEBUG
    private func applyUITestCompanionSignalFixtureIfNeeded(_ arguments: [String]) {
        guard arguments.contains("--ui-seed-companion-signal") else { return }
        let now = Date()
        liveDraftBridge.latestMemoryDomain = .project
        liveDraftBridge.applyCompanionSignalState(
            CreativeCompanionSignalState(
                intent: CreativeIntentSnapshot(
                    kind: .storyDevelopment,
                    label: "Story Development",
                    summary: "Hold the creative thread and make the next story choice concrete.",
                    nextMove: "Pressure-test the next three turns before drafting.",
                    confidence: 0.96,
                    sourceText: "Give me three stronger turns for this sequence.",
                    updatedAt: now
                ),
                presence: CreativePresenceSnapshot(
                    title: "Calm Coach",
                    detail: "Holding the creative thread and keeping the next story choice concrete.",
                    updatedAt: now
                ),
                proactiveSuggestion: CreativeProactiveSuggestion(
                    category: "Story",
                    prompt: "Ask: give me three stronger turns for this sequence",
                    reason: "A concrete next ask should be reusable from the Companion rail.",
                    updatedAt: now
                )
            ),
            persist: false
        )
    }

    private func applyUITestSaveNetworkFaultIfNeeded() async {
        let arguments = ProcessInfo.processInfo.arguments
        guard IOThemRuntime.isRunningUITests,
              arguments.contains("--ui-screenplay-save-network-fault"),
              !didApplyUITestSaveNetworkFault,
              let marker = uiTestLaunchArgumentValue(
                "--ui-screenplay-save-network-fault-marker",
                in: arguments
              ) else {
            return
        }
        didApplyUITestSaveNetworkFault = true
        let offlineBaseURL = uiTestLaunchArgumentValue(
            "--ui-screenplay-save-network-fault-url",
            in: arguments
        ) ?? "http://127.0.0.1:3999"
        await vm.runQueuedSaveNetworkFaultUITest(
            marker: marker,
            offlineBaseURL: offlineBaseURL
        )
        publishDebugStudioDiffState()
    }

    private func uiTestLaunchArgumentValue(_ key: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: key) else { return nil }
        let valueIndex = arguments.index(after: index)
        guard arguments.indices.contains(valueIndex) else { return nil }
        return arguments[valueIndex]
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func applyUITestPendingScreenplayQuestionFixtureIfNeeded() {
        let arguments = ProcessInfo.processInfo.arguments
        guard IOThemRuntime.isRunningUITests,
              arguments.contains("--ui-show-pending-screenplay-question"),
              !didResolveUITestPendingQuestionFixture else {
            return
        }
        let provisionalOptions = arguments.contains("--ui-show-provisional-screenplay-options")
            ? [
                BackendPendingScreenplayOption(
                    id: "option-1",
                    rank: 1,
                    value: "Mara gives June the manifest and lets her choose the crossing.",
                    recommended: true
                ),
                BackendPendingScreenplayOption(
                    id: "option-2",
                    rank: 2,
                    value: "Mara exposes the ferry board before June can leave.",
                    recommended: false
                ),
                BackendPendingScreenplayOption(
                    id: "option-3",
                    rank: 3,
                    value: "Mara destroys the manifest and trusts June without proof.",
                    recommended: false
                ),
            ]
            : nil
        vm.pendingScreenplayQuestion = BackendPendingScreenplayQuestion(
            id: "ui-pending-theme-question",
            projectId: vm.selectedProjectID.isEmpty ? "ui-project" : vm.selectedProjectID,
            projectTitle: vm.selectedProject?.title ?? "The Last Crossing",
            targetField: "project.theme_argument",
            targetLabel: "Theme argument",
            question: provisionalOptions == nil
                ? "What does Mara learn about love when control can no longer keep June safe?"
                : "Which path should become true: Option 1, 2, or 3?",
            provisionalOptions: provisionalOptions,
            askedAt: Date().timeIntervalSince1970 * 1_000
        )
        directionOneRightPanelTab = .them
        isDirectionOneRightRailExpanded = true
    }

    private func applyUITestDraftConflictFixtureIfNeeded() {
        guard IOThemRuntime.isRunningUITests,
              ProcessInfo.processInfo.arguments.contains("--ui-show-draft-conflict"),
              !didApplyUITestDraftConflictFixture,
              vm.conflictState == nil else {
            return
        }
        let selectedID = vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let project = vm.selectedProject ?? vm.projects.first(where: {
            selectedID.isEmpty || $0.id == selectedID
        }) else { return }
        vm.selectedProject = project
        vm.selectedProjectID = project.id
        let serverDraft = """
        EXT. FERRY TERMINAL - DAWN
        MARA
        The server copy survives.
        """
        vm.conflictState = ScreenplayStudioViewModel.SaveConflictState(
            projectId: project.id,
            baseVersionId: vm.latestVersionID,
            serverVersionId: "ui-server-version",
            serverDraft: serverDraft,
            serverDraftExcerpt: "EXT. FERRY TERMINAL - DAWN",
            serverUpdatedAt: Date().timeIntervalSince1970 * 1_000
        )
        vm.hasUnsavedDraftChanges = true
        vm.autosaveStatusText = "Conflict detected"
        vm.infoText = "Another device updated this draft. Choose keep mine or load server."
        didApplyUITestDraftConflictFixture = true
    }
    #endif

    private func applyDebugDraftInspectorIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugDraftInspectorToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugDraftInspectorAckToken else { return }
        guard requestToken != lastAppliedStudioDebugDraftInspectorToken else { return }
        lastAppliedStudioDebugDraftInspectorToken = requestToken
        let requestedSection = DraftToolsSection(
            rawValue: studioDebugDraftInspectorSectionRaw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        ) ?? .pages
        Task { @MainActor in
            guard studioDebugDraftInspectorToken == requestToken else { return }
            openDraftInspector()
            selectedDraftToolsSection = requestedSection
            if requestedSection == .pages {
                await vm.refreshDraftInsights()
                guard studioDebugDraftInspectorToken == requestToken else { return }
            }
            studioDebugDraftInspectorAckToken = requestToken
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugShellVisibilityIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugShellVisibilityToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugShellVisibilityAckToken else { return }
        guard requestToken != lastAppliedStudioDebugShellVisibilityToken else { return }
        lastAppliedStudioDebugShellVisibilityToken = requestToken

        let sidebarDirective = studioDebugShellVisibilitySidebarRaw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let inspectorDirective = studioDebugShellVisibilityInspectorRaw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        Task { @MainActor in
            guard studioDebugShellVisibilityToken == requestToken else { return }
            withAnimation(.easeOut(duration: 0.20)) {
                switch sidebarDirective {
                case "show":
                    isDirectionOneSidebarVisible = true
                case "hide":
                    isDirectionOneSidebarVisible = false
                default:
                    break
                }

                switch inspectorDirective {
                case "show":
                    isDirectionOneRightRailExpanded = true
                case "hide":
                    isDirectionOneRightRailExpanded = false
                default:
                    break
                }
            }

            if inspectorDirective == "show" {
                directionOneRightPanelTab = .them
            }

            studioDebugShellVisibilityAckToken = requestToken
            #if os(macOS)
            writeMirroredStudioDebugPreferenceInt(
                requestToken,
                forKey: "studio_debug_shell_visibility_ack_token"
            )
            #endif
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugRightPanelTabIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugRightPanelTabToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugRightPanelTabAckToken else { return }
        guard requestToken != lastAppliedStudioDebugRightPanelTabToken else { return }
        lastAppliedStudioDebugRightPanelTabToken = requestToken

        let requestedTabRaw = studioDebugRightPanelTabRaw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let requestedTab = DirectionOneRightPanelTab.resolved(from: requestedTabRaw) ?? .beats

        Task { @MainActor in
            guard studioDebugRightPanelTabToken == requestToken else { return }
            isDirectionOneRightRailExpanded = true
            directionOneRightPanelTab = requestedTab
            if requestedTabRaw == "intelligence" {
                previewAllSuggestedIntelligenceFixes()
            }
            studioDebugRightPanelTabAckToken = requestToken
            #if os(macOS)
            writeMirroredStudioDebugPreferenceInt(
                requestToken,
                forKey: "studio_debug_right_panel_tab_ack_token"
            )
            #endif
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugCommandBarIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugCommandBarToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugCommandBarAckToken else { return }
        guard requestToken != lastAppliedStudioDebugCommandBarToken else { return }
        lastAppliedStudioDebugCommandBarToken = requestToken

        Task { @MainActor in
            guard studioDebugCommandBarToken == requestToken else { return }
            openStudioCommandBar()
            studioDebugCommandBarAckToken = requestToken
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugRouteMetadataSeedIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugSeedRouteMetadataToken > 0 else { return }
        guard studioDebugSeedRouteMetadataToken != studioDebugSeedRouteMetadataAckToken else { return }
        guard studioDebugSeedRouteMetadataToken != lastAppliedStudioDebugSeedRouteMetadataToken else { return }
        lastAppliedStudioDebugSeedRouteMetadataToken = studioDebugSeedRouteMetadataToken
        guard vm.selectedProject != nil else {
            studioDebugSeedRouteMetadataAckToken = studioDebugSeedRouteMetadataToken
            #if os(macOS)
            writeMirroredStudioDebugPreferenceInt(
                studioDebugSeedRouteMetadataToken,
                forKey: "studio_debug_seed_route_metadata_ack_token"
            )
            #endif
            publishDebugStudioDiffState()
            return
        }

        let pageEntry = StudioAskNoteExchange(
            id: UUID(),
            backendThreadID: nil,
            backendTurn: nil,
            requestID: "debug-route-page",
            prompt: "Write the opening slugline on the page.",
            target: .page,
            source: .voice,
            noteTitle: "Wrote to page",
            noteBody: noteBodyForExchange("INT. DINER - NIGHT\nSteam curls off the coffee."),
            developmentText: nil,
            writeID: "debug-route-write-page",
            replacedWriteID: nil,
            anchorLine: 1,
            anchorEndLine: 2,
            anchorSceneLabel: "Diner - Night",
            anchorExcerpt: noteBodyForAnchor("INT. DINER - NIGHT\nSteam curls off the coffee."),
            insertedText: "INT. DINER - NIGHT\nSteam curls off the coffee.",
            replacementApplied: false,
            revisedBlockText: nil,
            resolvedAnchorExcerpt: noteBodyForAnchor("INT. DINER - NIGHT\nSteam curls off the coffee."),
            packLabel: "Debug",
            phase: "scene_draft",
            sluglineAnchorLine: 1,
            memoryDomainRaw: StudioMemoryDomain.project.rawValue,
            companionModeRaw: nil,
            timestamp: Date().addingTimeInterval(-30)
        )
        let companionEntry = StudioAskNoteExchange(
            id: UUID(),
            backendThreadID: nil,
            backendTurn: nil,
            requestID: "debug-route-pin",
            prompt: "Can you coach me through the next beat?",
            target: .voicePin,
            source: .voice,
            noteTitle: "io.them",
            noteBody: "Try grounding Lucy in what she refuses to say out loud.",
            developmentText: "Try grounding Lucy in what she refuses to say out loud.",
            writeID: nil,
            replacedWriteID: nil,
            anchorLine: 1,
            anchorEndLine: 2,
            anchorSceneLabel: "Diner - Night",
            anchorExcerpt: nil,
            insertedText: nil,
            replacementApplied: nil,
            revisedBlockText: nil,
            resolvedAnchorExcerpt: nil,
            packLabel: "Coach",
            phase: "discussion",
            sluglineAnchorLine: 1,
            memoryDomainRaw: StudioMemoryDomain.companion.rawValue,
            companionModeRaw: StudioCompanionMode.coach.rawValue,
            timestamp: Date()
        )
        studioAskNoteHistory = [companionEntry, pageEntry]
        highlightedStudioExchangeID = companionEntry.id
        showFullVoicePinThread = true
        expandedVoicePinTurnID = companionEntry.id
        directionOneRightPanelTab = .them
        isDirectionOneRightRailExpanded = true
        liveDraftBridge.latestMemoryDomain = .companion
        liveDraftBridge.latestStudioRouteTarget = .voicePin
        liveDraftBridge.companionMode = .coach
        studioDebugSeedRouteMetadataAckToken = studioDebugSeedRouteMetadataToken
        #if os(macOS)
        writeMirroredStudioDebugPreferenceInt(
            studioDebugSeedRouteMetadataToken,
            forKey: "studio_debug_seed_route_metadata_ack_token"
        )
        #endif
        publishDebugStudioDiffState()
        #endif
    }

    private func debugSelectionSnapshot(startLine: Int, endLine: Int) -> ScreenplayEditorSelectionSnapshot? {
        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard !lines.isEmpty else { return nil }
        let safeStart = max(1, startLine)
        let safeEnd = max(safeStart, endLine)
        guard safeStart <= lines.count else { return nil }
        let boundedEnd = min(lines.count, safeEnd)
        let selectedLines = Array(lines[(safeStart - 1)..<boundedEnd])
        let selectedText = selectedLines.joined(separator: "\n")
        let prefixText = lines.prefix(max(0, safeStart - 1)).joined(separator: "\n")
        let locationBase = prefixText.isEmpty ? 0 : (prefixText as NSString).length + 1
        let selectedLength = (selectedText as NSString).length
        let localSceneLabel = stride(from: min(boundedEnd, lines.count) - 1, through: 0, by: -1)
            .compactMap { index -> String? in
                let candidate = lines[index].trimmingCharacters(in: .whitespacesAndNewlines)
                guard looksLikeDraftSceneHeading(candidate) else { return nil }
                return compactSceneNavigatorLabel(candidate)
            }
            .first
        return ScreenplayEditorSelectionSnapshot(
            location: locationBase,
            length: selectedLength,
            startLine: safeStart,
            endLine: boundedEnd,
            text: selectedText,
            sceneLabel: localSceneLabel ?? sceneLabelForLine(safeStart)
        )
    }

    private func applyDebugSelectedLinesIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugSelectLinesToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugSelectLinesAckToken else { return }
        guard requestToken != lastAppliedStudioDebugSelectLinesToken else { return }
        lastAppliedStudioDebugSelectLinesToken = requestToken
        let requestedStartLine = studioDebugSelectLinesStartLine
        let requestedEndLine = max(requestedStartLine, studioDebugSelectLinesEndLine)
        if let snapshot = debugSelectionSnapshot(
            startLine: requestedStartLine,
            endLine: requestedEndLine
        ) {
            liveDraftBridge.jumpToLine(snapshot.startLine)
            liveDraftBridge.highlightLineRange(startLine: snapshot.startLine, endLine: snapshot.endLine)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 120_000_000)
                guard studioDebugSelectLinesToken == requestToken,
                      studioDebugSelectLinesAckToken == requestToken else { return }
                liveDraftBridge.updateEditorSelectionSnapshot(snapshot)
                publishDebugStudioDiffState()
            }
        } else {
            liveDraftBridge.updateEditorSelectionSnapshot(nil)
        }
        studioDebugSelectLinesAckToken = requestToken
        publishDebugStudioDiffState()
        #endif
    }

    private func applyDebugLocalStudioCommandIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugLocalCommandToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugLocalCommandAckToken else { return }
        guard requestToken != lastAppliedStudioDebugLocalCommandToken else { return }
        lastAppliedStudioDebugLocalCommandToken = requestToken
        let text = studioDebugLocalCommandText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            studioDebugLocalCommandAckToken = requestToken
            studioDebugLocalCommandResultToken = requestToken
            studioDebugLocalCommandResultStatus = "error"
            studioDebugLocalCommandResultError = "local_command_empty"
            studioDebugLocalCommandResultJSON = studioDebugJSONString(from: [
                "request_token": requestToken,
                "status": "error",
                "error": "local_command_empty",
            ])
            publishDebugStudioDiffState()
            return
        }
        let source = StudioPromptSource(rawValue: studioDebugLocalCommandSourceRaw) ?? .voice
        let commandSource: ScreenplayStudioUserPrompt.Source = source == .typed ? .typed : .voice
        let requestedSelectionSnapshot: ScreenplayEditorSelectionSnapshot?
        if studioDebugSelectLinesAckToken == studioDebugSelectLinesToken,
           studioDebugSelectLinesStartLine > 0 {
            requestedSelectionSnapshot = debugSelectionSnapshot(
                startLine: studioDebugSelectLinesStartLine,
                endLine: max(studioDebugSelectLinesStartLine, studioDebugSelectLinesEndLine)
            )
        } else {
            requestedSelectionSnapshot = nil
        }
        Task { @MainActor in
            guard studioDebugLocalCommandToken == requestToken else { return }
            if let snapshot = requestedSelectionSnapshot {
                liveDraftBridge.updateEditorSelectionSnapshot(snapshot)
            }
            let feedback = liveDraftBridge.executeLocalStudioCommand(text, source: commandSource)
            let expectsPreview = feedback?.confirmation
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .hasPrefix("confirm ") == true
            if expectsPreview && liveDraftBridge.pendingStudioActionPreview == nil {
                for _ in 0..<8 {
                    try? await Task.sleep(nanoseconds: 25_000_000)
                    guard studioDebugLocalCommandToken == requestToken else { return }
                    if liveDraftBridge.pendingStudioActionPreview != nil { break }
                }
            }
            if liveDraftBridge.pendingStudioAction != nil {
                for _ in 0..<20 {
                    if liveDraftBridge.pendingStudioAction == nil { break }
                    try? await Task.sleep(nanoseconds: 50_000_000)
                    guard studioDebugLocalCommandToken == requestToken else { return }
                }
            }
            guard studioDebugLocalCommandToken == requestToken else { return }
            let preview = liveDraftBridge.pendingStudioActionPreview
            let previewDiffRows = preview.map(studioActionPreviewDiffRows(for:)) ?? []
            let previewDiffSummary = preview.map { studioActionPreviewDiffSummary(for: $0, diffRows: previewDiffRows) }
            let selectedBeat = vm.outline.beats.first(where: { $0.id == selectedBeatInspectorID })
            let payload: [String: Any] = [
                "request_token": requestToken,
                "status": feedback == nil ? "unhandled" : (feedback?.isError == true ? "error" : "handled"),
                "confirmation": feedback?.confirmation ?? "",
                "is_error": feedback?.isError ?? true,
                "preview_title": preview?.title ?? "",
                "preview_before": preview?.beforeLines ?? [],
                "preview_after": preview?.afterLines ?? [],
                "preview_warning": preview?.warning ?? "",
                "preview_transaction_id": preview.map(studioActionPreviewTransactionID) ?? "",
                "preview_risk_label": previewDiffSummary?.isDestructive == true ? "destructive" : (preview == nil ? "" : "safe"),
                "preview_impacted_line_count": previewDiffSummary?.impactedCount ?? 0,
                "preview_changed_line_count": previewDiffSummary?.changedCount ?? 0,
                "preview_added_line_count": previewDiffSummary?.addedCount ?? 0,
                "preview_removed_line_count": previewDiffSummary?.removedCount ?? 0,
                "pending_action": liveDraftBridge.pendingStudioAction?.action.rawValue ?? "",
                "current_cursor_line": liveDraftBridge.currentCursorLine,
                "active_element": liveDraftBridge.activeScreenplayElement.rawValue,
                "outline_scene_count": vm.outline.scenes.count,
                "outline_beat_count": vm.outline.beats.count,
                "selected_beat_id": selectedBeatInspectorID,
                "selected_beat_label": selectedBeat?.label ?? "",
                "selected_beat_summary": (selectedBeat?.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_scene_id": (selectedBeat?.sceneId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_act_id": (selectedBeat?.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_provenance": beatProvenance(forBeatID: selectedBeatInspectorID).rawValue,
                "beat_count": vm.outline.beats.count,
                "beat_order_ids": sortedOutlineBeats.map(\.id),
                "beat_order_labels": sortedOutlineBeats.map(\.label),
                "beat_draft_label": vm.newBeatLabel,
                "beat_draft_summary": vm.newBeatSummary,
                "project_bound_scene_count": liveDraftBridge.projectBinding.boundSceneCount,
                "draft_scene_count": liveDraftBridge.structuredDraft.sceneCount,
                "intelligence_issue_count": liveDraftBridge.intelligenceReport.continuityIssues.count,
                "selection_start_line": liveDraftBridge.editorSelection?.startLine ?? 0,
                "selection_end_line": liveDraftBridge.editorSelection?.endLine ?? 0,
                "latest_info_text": vm.infoText,
                "draft_preview": String(vm.fountainDraft.prefix(220)),
                "draft_tail_preview": String(vm.fountainDraft.suffix(220)),
            ]
            studioDebugLocalCommandAckToken = requestToken
            studioDebugLocalCommandResultToken = requestToken
            studioDebugLocalCommandResultStatus = feedback == nil
                ? "unhandled"
                : (feedback?.isError == true ? "error" : "handled")
            studioDebugLocalCommandResultError = feedback?.isError == true ? (feedback?.confirmation ?? "local_command_failed") : ""
            studioDebugLocalCommandResultJSON = studioDebugJSONString(from: payload)
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugCompanionModeIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugCompanionModeToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugCompanionModeAckToken else { return }
        guard requestToken != lastAppliedStudioDebugCompanionModeToken else { return }
        lastAppliedStudioDebugCompanionModeToken = requestToken

        let requestedMode = StudioCompanionMode(
            rawValue: studioDebugCompanionModeRaw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        ) ?? .coach

        Task { @MainActor in
            guard studioDebugCompanionModeToken == requestToken else { return }
            isDirectionOneRightRailExpanded = true
            directionOneRightPanelTab = .them
            liveDraftBridge.setCompanionMode(requestedMode)
            studioDebugCompanionModeAckToken = requestToken
            #if os(macOS)
            writeMirroredStudioDebugPreferenceInt(
                requestToken,
                forKey: "studio_debug_companion_mode_ack_token"
            )
            #endif
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugIntelligenceQueueIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugIntelligenceQueueToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugIntelligenceQueueAckToken else { return }
        guard requestToken != lastAppliedStudioDebugIntelligenceQueueToken else { return }
        lastAppliedStudioDebugIntelligenceQueueToken = requestToken

        let requestedAction = StudioDebugIntelligenceQueueAction(
            rawValue: studioDebugIntelligenceQueueActionRaw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        )
        let requestedItemID = studioDebugIntelligenceQueueItemID
            .trimmingCharacters(in: .whitespacesAndNewlines)

        Task { @MainActor in
            guard studioDebugIntelligenceQueueToken == requestToken else { return }
            directionOneRightPanelTab = .them
            isDirectionOneRightRailExpanded = true

            var status = "handled"
            var errorText = ""
            var affectedFixCount = 0

            switch requestedAction {
            case .previewAll:
                affectedFixCount = previewAllSuggestedIntelligenceFixes()
            case .applyOne:
                let candidates = queuedIntelligenceFixes.isEmpty ? availableIntelligenceFixQueueItems : queuedIntelligenceFixes
                guard let item = candidates.first(where: {
                    requestedItemID.isEmpty || $0.id.caseInsensitiveCompare(requestedItemID) == .orderedSame
                }) else {
                    status = "error"
                    errorText = "queue_item_not_found"
                    vm.infoText = "I couldn't resolve that queued fix."
                    break
                }
                affectedFixCount = await applyQueuedIntelligenceFix(item) ? 1 : 0
                guard studioDebugIntelligenceQueueToken == requestToken else { return }
                if affectedFixCount == 0, errorText.isEmpty {
                    status = "error"
                    errorText = "queue_apply_one_failed"
                }
            case .applyAllSafe:
                affectedFixCount = await applyAllSafeQueuedIntelligenceFixes()
                guard studioDebugIntelligenceQueueToken == requestToken else { return }
                if affectedFixCount == 0, !queuedIntelligenceFixes.filter(\.isSafe).isEmpty {
                    status = "error"
                    errorText = "queue_apply_all_safe_failed"
                }
            case .rollbackLastBatch:
                affectedFixCount = await rollbackLastIntelligenceFixBatch()
                guard studioDebugIntelligenceQueueToken == requestToken else { return }
                if affectedFixCount == 0 {
                    status = "error"
                    errorText = "queue_rollback_failed"
                }
            case .none:
                status = "error"
                errorText = "queue_action_invalid"
                vm.infoText = "I couldn't resolve that queue action."
            }

            guard studioDebugIntelligenceQueueToken == requestToken else { return }
            let payload: [String: Any] = [
                "request_token": requestToken,
                "status": status,
                "action": requestedAction?.rawValue ?? "",
                "error": errorText,
                "affected_fix_count": affectedFixCount,
                "queue_count": queuedIntelligenceFixes.count,
                "safe_queue_count": queuedIntelligenceFixes.filter(\.isSafe).count,
                "queued_ids": queuedIntelligenceFixes.map(\.id),
                "queued_safe_ids": queuedIntelligenceFixes.filter(\.isSafe).map(\.id),
                "queued_titles": queuedIntelligenceFixes.map(\.title),
                "available_fix_count": availableIntelligenceFixQueueItems.count,
                "last_batch_id": lastAppliedIntelligenceFixBatch?.id ?? "",
                "last_batch_applied_fix_count": lastAppliedIntelligenceFixBatch?.appliedFixIDs.count ?? 0,
                "latest_info_text": vm.infoText,
            ]
            studioDebugIntelligenceQueueAckToken = requestToken
            studioDebugIntelligenceQueueResultToken = requestToken
            studioDebugIntelligenceQueueResultStatus = status
            studioDebugIntelligenceQueueResultError = errorText
            studioDebugIntelligenceQueueResultJSON = studioDebugJSONString(from: payload)
            #if os(macOS)
            writeMirroredStudioDebugPreferenceInt(
                requestToken,
                forKey: "studio_debug_intelligence_queue_ack_token"
            )
            writeMirroredStudioDebugPreferenceInt(
                requestToken,
                forKey: "studio_debug_intelligence_queue_result_token"
            )
            writeMirroredStudioDebugPreferenceString(
                status,
                forKey: "studio_debug_intelligence_queue_result_status"
            )
            writeMirroredStudioDebugPreferenceString(
                errorText,
                forKey: "studio_debug_intelligence_queue_result_error"
            )
            writeMirroredStudioDebugPreferenceString(
                studioDebugIntelligenceQueueResultJSON,
                forKey: "studio_debug_intelligence_queue_result_json"
            )
            #endif
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugPageWriteToastIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugPageWriteToastToken > 0 else { return }
        guard studioDebugPageWriteToastToken != studioDebugPageWriteToastAckToken else { return }
        guard studioDebugPageWriteToastToken != lastAppliedStudioDebugPageWriteToastToken else { return }
        lastAppliedStudioDebugPageWriteToastToken = studioDebugPageWriteToastToken

        let requestedMode = StudioDebugPageWriteToastMode(
            rawValue: studioDebugPageWriteToastModeRaw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        ) ?? .expanded
        let requestedSource = StudioPromptSource(
            rawValue: studioDebugPageWriteToastSourceRaw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        ) ?? .typed

        switch requestedMode {
        case .dismiss:
            dismissLastCommittedWriteActions()
            studioDebugPageWriteToastAckToken = studioDebugPageWriteToastToken
            publishDebugStudioDiffState()
            return
        case .undo:
            if let committedWrite = liveDraftBridge.lastCommittedWrite {
                undoLastCommittedWrite(committedWrite)
            } else {
                vm.infoText = "There isn't a recent page write to undo."
            }
            studioDebugPageWriteToastAckToken = studioDebugPageWriteToastToken
            publishDebugStudioDiffState()
            return
        case .more:
            vm.infoText = "Opened page-write actions menu."
            studioDebugPageWriteToastAckToken = studioDebugPageWriteToastToken
            publishDebugStudioDiffState()
            return
        case .escape:
            dismissLastCommittedWriteActions()
            studioDebugPageWriteToastAckToken = studioDebugPageWriteToastToken
            publishDebugStudioDiffState()
            return
        case .returnKey:
            if isLastCommittedWriteActionVisible,
               liveDraftBridge.lastCommittedWrite != nil,
               isLastCommittedWriteToastCollapsed {
                expandLastCommittedWriteActions()
            }
            studioDebugPageWriteToastAckToken = studioDebugPageWriteToastToken
            publishDebugStudioDiffState()
            return
        case .expanded, .collapsed:
            break
        }

        let sampleInsertedText = "INT. KITCHEN - DAY\nFrank closes the blinds and waits."
        let committedDraft = vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? sampleInsertedText
            : vm.fountainDraft

        suppressLastCommittedWriteAutoReveal = true
        lastCommittedStudioPromptSource = requestedSource
        lastCommittedStudioPromptTarget = .page
        lastCommittedStudioPrompt = sampleInsertedText
        liveDraftBridge.lastCommittedWrite = liveDraftBridge.makeCommittedWrite(
            id: UUID(),
            writeID: "debug-page-write-toast-\(studioDebugPageWriteToastToken)",
            previousDraft: committedDraft,
            committedDraft: committedDraft,
            insertedText: sampleInsertedText,
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: 1,
            endLine: 2,
            committedAt: Date()
        )
        clearPageCommitNotice()
        cancelLastCommittedWriteCollapse()
        if accessibilityReduceMotion {
            isLastCommittedWriteActionVisible = true
            isLastCommittedWriteToastCollapsed = requestedMode == .collapsed
        } else {
            withAnimation(.easeInOut(duration: 0.18)) {
                isLastCommittedWriteActionVisible = true
                isLastCommittedWriteToastCollapsed = requestedMode == .collapsed
            }
        }

        studioDebugPageWriteToastAckToken = studioDebugPageWriteToastToken
        publishDebugStudioDiffState()
        #endif
    }

    private func applyDebugPageWriteToastInteractionIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugPageWriteToastInteractionToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugPageWriteToastInteractionAckToken else { return }
        guard requestToken != lastAppliedStudioDebugPageWriteToastInteractionToken else { return }
        lastAppliedStudioDebugPageWriteToastInteractionToken = requestToken
        studioDebugPageWriteToastInteractionAckToken = requestToken

        let requestedAction = StudioDebugPageWriteToastInteractionAction(
            rawValue: studioDebugPageWriteToastInteractionActionRaw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        )

        Task { @MainActor in
            guard studioDebugPageWriteToastInteractionToken == requestToken else { return }
            var status = "handled"
            var errorText = ""
            var openedMore = false
            var jumpedToPage = false

            switch requestedAction {
            case .undo:
                guard let committedWrite = liveDraftBridge.lastCommittedWrite else {
                    status = "error"
                    errorText = "toast_missing"
                    break
                }
                undoLastCommittedWrite(committedWrite)
            case .more:
                guard isLastCommittedWriteActionVisible, liveDraftBridge.lastCommittedWrite != nil else {
                    status = "error"
                    errorText = "toast_missing"
                    break
                }
                openedMore = true
            case .escape:
                guard isLastCommittedWriteActionVisible else {
                    status = "error"
                    errorText = "toast_missing"
                    break
                }
                dismissLastCommittedWriteActions()
            case .returnKey:
                guard isLastCommittedWriteActionVisible, liveDraftBridge.lastCommittedWrite != nil else {
                    status = "error"
                    errorText = "toast_missing"
                    break
                }
                if isLastCommittedWriteToastCollapsed {
                    expandLastCommittedWriteActions()
                    jumpedToPage = true
                }
            case .none:
                status = "error"
                errorText = "toast_interaction_invalid"
            }

            let payload: [String: Any] = [
                "request_token": requestToken,
                "status": status,
                "action": requestedAction?.rawValue ?? "",
                "error": errorText,
                "opened_more": openedMore,
                "jumped_to_page": jumpedToPage,
                "toast_visible": isLastCommittedWriteActionVisible && liveDraftBridge.lastCommittedWrite != nil,
                "toast_collapsed": isLastCommittedWriteActionVisible && isLastCommittedWriteToastCollapsed,
                "toast_source": lastCommittedStudioPromptSource.rawValue,
                "toast_preview": liveDraftBridge.lastCommittedWrite.map { committedWriteToastPreview($0.insertedText) } ?? "",
                "current_cursor_line": liveDraftBridge.currentCursorLine,
                "latest_info_text": vm.infoText,
            ]
            studioDebugPageWriteToastInteractionResultToken = requestToken
            studioDebugPageWriteToastInteractionResultStatus = status
            studioDebugPageWriteToastInteractionResultError = errorText
            studioDebugPageWriteToastInteractionResultJSON = studioDebugJSONString(from: payload)
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugShortcutIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugShortcutToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugShortcutAckToken else { return }
        guard requestToken != lastAppliedStudioDebugShortcutToken else { return }
        lastAppliedStudioDebugShortcutToken = requestToken

        let requestedAction = StudioDebugShortcutAction(
            rawValue: studioDebugShortcutActionRaw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        )

        Task { @MainActor in
            guard studioDebugShortcutToken == requestToken else { return }
            directionOneRightPanelTab = .beats
            isDirectionOneRightRailExpanded = true

            var status = "handled"
            var errorText = ""

            switch requestedAction {
            case .optionCommandB:
                if canTriggerMakeBeatFromSelectionShortcut {
                    triggerMakeBeatFromSelectionShortcut()
                } else {
                    status = "error"
                    errorText = "shortcut_make_from_selection_unavailable"
                    vm.infoText = "Select a page block in Beats first."
                }
            case .optionCommandU:
                if canTriggerUpdateSelectedBeatFromSelectionShortcut {
                    triggerUpdateSelectedBeatFromSelectionShortcut()
                } else {
                    status = "error"
                    errorText = "shortcut_update_selected_unavailable"
                    vm.infoText = "Select a beat and a page block first."
                }
            case .none:
                status = "error"
                errorText = "shortcut_action_invalid"
                vm.infoText = "I couldn't resolve that shortcut action."
            }

            let selectedBeat = vm.outline.beats.first(where: { $0.id == selectedBeatInspectorID })
            let payload: [String: Any] = [
                "request_token": requestToken,
                "status": status,
                "action": requestedAction?.rawValue ?? "",
                "error": errorText,
                "right_panel_tab": directionOneRightPanelTab.rawValue,
                "selected_beat_id": selectedBeatInspectorID,
                "selected_beat_label": selectedBeat?.label ?? "",
                "selected_beat_summary": (selectedBeat?.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_scene_id": (selectedBeat?.sceneId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_act_id": (selectedBeat?.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_provenance": beatProvenance(forBeatID: selectedBeatInspectorID).rawValue,
                "beat_count": vm.outline.beats.count,
                "beat_order_ids": sortedOutlineBeats.map(\.id),
                "beat_order_labels": sortedOutlineBeats.map(\.label),
                "beat_draft_label": vm.newBeatLabel,
                "beat_draft_summary": vm.newBeatSummary,
                "selection_start_line": liveDraftBridge.editorSelection?.startLine ?? 0,
                "selection_end_line": liveDraftBridge.editorSelection?.endLine ?? 0,
                "latest_info_text": vm.infoText,
            ]
            studioDebugShortcutAckToken = requestToken
            studioDebugShortcutResultToken = requestToken
            studioDebugShortcutResultStatus = status
            studioDebugShortcutResultError = errorText
            studioDebugShortcutResultJSON = studioDebugJSONString(from: payload)
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugInspectorInteractionIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let requestToken = studioDebugInspectorInteractionToken
        guard requestToken > 0 else { return }
        guard requestToken != studioDebugInspectorInteractionAckToken else { return }
        guard requestToken != lastAppliedStudioDebugInspectorInteractionToken else { return }
        lastAppliedStudioDebugInspectorInteractionToken = requestToken
        studioDebugInspectorInteractionAckToken = requestToken
        mirrorStudioDebugInt(requestToken, forKey: "studio_debug_inspector_interaction_ack_token")

        let requestedAction = StudioDebugInspectorInteractionAction(
            rawValue: studioDebugInspectorInteractionActionRaw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        )
        let primary = studioDebugInspectorInteractionPrimary.trimmingCharacters(in: .whitespacesAndNewlines)
        let secondary = studioDebugInspectorInteractionSecondary.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedSelectionStartLine = studioDebugSelectLinesStartLine
        let requestedSelectionEndLine = max(requestedSelectionStartLine, studioDebugSelectLinesEndLine)

        Task { @MainActor in
            guard studioDebugInspectorInteractionToken == requestToken else { return }
            directionOneRightPanelTab = .beats
            isDirectionOneRightRailExpanded = true

            var status = "handled"
            var errorText = ""

            switch requestedAction {
            case .makeBeatFromSelection:
                if selectionQuickCaptureSeed == nil,
                   requestedSelectionStartLine > 0,
                   let snapshot = debugSelectionSnapshot(
                        startLine: requestedSelectionStartLine,
                        endLine: requestedSelectionEndLine
                   ) {
                    liveDraftBridge.updateEditorSelectionSnapshot(snapshot)
                }
                guard let seed = selectionQuickCaptureSeed else {
                    status = "error"
                    errorText = "selection_seed_missing"
                    vm.infoText = "Select the block you want to turn into a beat first."
                    break
                }
                await createBeatFromQuickCaptureSeed(seed, persistToBackend: false)
                guard studioDebugInspectorInteractionToken == requestToken else { return }
            case .makeBeatFromCurrentScene:
                guard let seed = currentSceneQuickCaptureSeed else {
                    status = "error"
                    errorText = "scene_seed_missing"
                    vm.infoText = "I couldn't resolve the current scene for a quick beat."
                    break
                }
                await createBeatFromQuickCaptureSeed(seed, persistToBackend: false)
                guard studioDebugInspectorInteractionToken == requestToken else { return }
            case .updateSelectedBeatFromSelection:
                let resolvedBeat = selectedBeatForQuickUpdate
                    ?? vm.outline.beats.first(where: {
                        $0.id == primary || $0.label.caseInsensitiveCompare(primary) == .orderedSame
                    })
                guard let beat = resolvedBeat else {
                    status = "error"
                    errorText = "selected_beat_missing"
                    vm.infoText = "Select the beat you want to update first."
                    break
                }
                if selectedBeatInspectorID != beat.id {
                    selectBeatInInspector(beat)
                }
                if selectionQuickCaptureSeed == nil,
                   requestedSelectionStartLine > 0,
                   let snapshot = debugSelectionSnapshot(
                        startLine: requestedSelectionStartLine,
                        endLine: requestedSelectionEndLine
                   ) {
                    liveDraftBridge.updateEditorSelectionSnapshot(snapshot)
                }
                guard let seed = selectionQuickCaptureSeed else {
                    status = "error"
                    errorText = "selection_seed_missing"
                    vm.infoText = "Select the block you want to use first."
                    break
                }
                await updateBeatFromSelectionSeed(beat, seed: seed, persistToBackend: false)
                guard studioDebugInspectorInteractionToken == requestToken else { return }
            case .previewSelectedBeatDropBefore:
                let sourceBeat = vm.outline.beats.first(where: {
                    $0.id == primary || $0.label.caseInsensitiveCompare(primary) == .orderedSame
                }) ?? selectedBeatForQuickUpdate
                let targetBeat = vm.outline.beats.first(where: {
                    $0.id == secondary || $0.label.caseInsensitiveCompare(secondary) == .orderedSame
                })
                guard let sourceBeat else {
                    status = "error"
                    errorText = "source_beat_missing"
                    vm.infoText = "Select a beat before previewing the drop."
                    break
                }
                guard let targetBeat else {
                    status = "error"
                    errorText = "target_beat_missing"
                    vm.infoText = "I couldn't resolve where to preview that drop."
                    break
                }
                selectBeatInInspector(sourceBeat)
                draggedBeatID = sourceBeat.id
                beatDropTargetID = targetBeat.id
                isBeatListDropTargeted = false
                vm.infoText = "Previewing the drop before \(targetBeat.label)."
            case .previewSelectedBeatDropToEnd:
                let sourceBeat = vm.outline.beats.first(where: {
                    $0.id == primary || $0.label.caseInsensitiveCompare(primary) == .orderedSame
                }) ?? selectedBeatForQuickUpdate
                guard let sourceBeat else {
                    status = "error"
                    errorText = "source_beat_missing"
                    vm.infoText = "Select a beat before previewing the end drop."
                    break
                }
                selectBeatInInspector(sourceBeat)
                draggedBeatID = sourceBeat.id
                beatDropTargetID = ""
                isBeatListDropTargeted = true
                vm.infoText = "Previewing the drop at the end of the beat list."
            case .clearBeatDragPreview:
                draggedBeatID = nil
                beatDropTargetID = ""
                isBeatListDropTargeted = false
                vm.infoText = "Cleared the beat drag preview."
            case .selectBeat:
                let targetID = primary
                guard let beat = vm.outline.beats.first(where: { $0.id == targetID || $0.label.caseInsensitiveCompare(targetID) == .orderedSame }) else {
                    status = "error"
                    errorText = "beat_not_found"
                    vm.infoText = "I couldn't resolve that beat."
                    break
                }
                selectBeatInInspector(beat)
                vm.infoText = "Selected \(beat.label)."
            case .moveSelectedBeatToTop:
                if !moveSelectedBeatLocally(toEnd: false) {
                    status = "error"
                    errorText = "selected_beat_missing"
                    vm.infoText = "Select a beat before reordering it."
                } else {
                    vm.infoText = "Moved the selected beat to the top."
                }
            case .moveSelectedBeatToEnd:
                if !moveSelectedBeatLocally(toEnd: true) {
                    status = "error"
                    errorText = "selected_beat_missing"
                    vm.infoText = "Select a beat before reordering it."
                } else {
                    vm.infoText = "Moved the selected beat to the end."
                }
            case .seedBeatDraft:
                vm.cancelEditingBeat()
                beatComposerProvenance = .manual
                vm.newBeatLabel = primary
                vm.newBeatSummary = secondary
                vm.infoText = "Loaded a draft beat into the composer."
            case .refreshCollaboration:
                directionOneRightPanelTab = .draft
                selectedInspectorSection = .comments
                await vm.refreshCollaborationData(source: "Manual retry")
                guard studioDebugInspectorInteractionToken == requestToken else { return }
                if !vm.collaborationErrorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    status = "error"
                    errorText = vm.collaborationErrorText.trimmingCharacters(in: .whitespacesAndNewlines)
                }
            case .approveCollaborator:
                directionOneRightPanelTab = .draft
                selectedInspectorSection = .collaborators
                let email = primary.lowercased()
                guard !email.isEmpty else {
                    status = "error"
                    errorText = "collaborator_email_missing"
                    vm.infoText = "Enter a collaborator email."
                    break
                }
                vm.errorText = ""
                vm.collaboratorEmail = email
                vm.collaboratorNote = secondary
                vm.collaboratorInvitedBy = "studio-debug"
                await vm.approveCollaborator()
                guard studioDebugInspectorInteractionToken == requestToken else { return }
                if !vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    status = "error"
                    errorText = vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines)
                } else if !vm.approvedEmails.contains(email) {
                    status = "error"
                    errorText = "collaborator_not_approved"
                }
            case .addComment:
                directionOneRightPanelTab = .draft
                selectedInspectorSection = .comments
                let fallbackAuthor = vm.approvedEmails.first ?? ""
                let authorEmail = primary.isEmpty ? fallbackAuthor : primary.lowercased()
                let commentBody = secondary.isEmpty
                    ? "Clementine should keep this emotional beat alive on the next pass."
                    : secondary
                guard !commentBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    status = "error"
                    errorText = "comment_text_missing"
                    vm.infoText = "Add comment text or voice note details."
                    break
                }
                vm.errorText = ""
                vm.commentText = commentBody
                vm.commentAuthorEmail = authorEmail
                vm.commentActorEmail = authorEmail
                vm.commentAuthorName = "Studio Debug"
                vm.commentAnchorLine = "1"
                vm.commentType = "text"
                vm.commentVoiceURL = ""
                vm.commentVoiceTranscript = ""
                vm.commentVoiceDurationMs = ""
                vm.commentReplyToID = ""
                vm.commentEditID = ""
                await vm.addComment()
                guard studioDebugInspectorInteractionToken == requestToken else { return }
                let normalizedCommentBody = commentBody.trimmingCharacters(in: .whitespacesAndNewlines)
                if !vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    status = "error"
                    errorText = vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines)
                } else if !vm.comments.contains(where: {
                    ($0.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines) == normalizedCommentBody
                }) {
                    status = "error"
                    errorText = "comment_not_saved"
                }
            case .resolveFirstComment, .unresolveFirstComment, .deleteFirstComment:
                directionOneRightPanelTab = .draft
                selectedInspectorSection = .comments
                vm.errorText = ""
                let requestedCommentID = primary.trimmingCharacters(in: .whitespacesAndNewlines)
                let targetComment = vm.comments.first(where: { comment in
                    let id = comment.id.trimmingCharacters(in: .whitespacesAndNewlines)
                    return !requestedCommentID.isEmpty && id == requestedCommentID
                }) ?? vm.comments.first(where: { !($0.isDeleted ?? false) })
                guard let targetComment else {
                    status = "error"
                    errorText = "comment_not_found"
                    vm.infoText = "Select a comment first."
                    break
                }
                switch requestedAction {
                case .resolveFirstComment:
                    await vm.setCommentResolved(targetComment, resolved: true)
                    guard studioDebugInspectorInteractionToken == requestToken else { return }
                    if !vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        status = "error"
                        errorText = vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines)
                    } else if vm.comments.first(where: { $0.id == targetComment.id })?.resolved != true {
                        status = "error"
                        errorText = "comment_not_resolved"
                    }
                case .unresolveFirstComment:
                    await vm.setCommentResolved(targetComment, resolved: false)
                    guard studioDebugInspectorInteractionToken == requestToken else { return }
                    if !vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        status = "error"
                        errorText = vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines)
                    } else if vm.comments.first(where: { $0.id == targetComment.id })?.resolved == true {
                        status = "error"
                        errorText = "comment_not_reopened"
                    }
                case .deleteFirstComment:
                    await vm.deleteComment(targetComment)
                    guard studioDebugInspectorInteractionToken == requestToken else { return }
                    if !vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        status = "error"
                        errorText = vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines)
                    } else if vm.comments.first(where: { $0.id == targetComment.id })?.isDeleted != true {
                        status = "error"
                        errorText = "comment_not_deleted"
                    }
                default:
                    break
                }
            case .keepLocalConflict:
                directionOneRightPanelTab = .draft
                selectedDraftToolsSection = .pages
                guard vm.conflictState != nil else {
                    status = "error"
                    errorText = "conflict_not_present"
                    vm.infoText = "No save conflict is active."
                    break
                }
                vm.errorText = ""
                await vm.keepLocalDraftAfterConflict()
                guard studioDebugInspectorInteractionToken == requestToken else { return }
                if !vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    status = "error"
                    errorText = vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines)
                } else if vm.conflictState != nil {
                    status = "error"
                    errorText = "conflict_not_cleared"
                } else if vm.hasUnsavedDraftChanges {
                    status = "error"
                    errorText = "local_conflict_save_still_dirty"
                }
            case .loadServerConflict:
                directionOneRightPanelTab = .draft
                selectedDraftToolsSection = .pages
                guard vm.conflictState != nil else {
                    status = "error"
                    errorText = "conflict_not_present"
                    vm.infoText = "No save conflict is active."
                    break
                }
                vm.errorText = ""
                vm.applyServerVersionFromConflict()
                if vm.conflictState != nil {
                    status = "error"
                    errorText = "conflict_not_cleared"
                }
            case .restoreWorkspace:
                isRestoringInspectorWorkspaceState = true
                directionOneRightPanelTab = .draft
                selectedInspectorSection = .comments
                selectedBeatInspectorID = ""
                highlightedSceneInspectorKey = ""
                vm.cancelEditingBeat()
                beatComposerProvenance = .manual
                isRestoringInspectorWorkspaceState = false
                restoreInspectorWorkspaceState()
                vm.infoText = "Restored the inspector workspace."
            case .none:
                status = "error"
                errorText = "inspector_action_invalid"
                vm.infoText = "I couldn't resolve that inspector interaction."
            }

            guard studioDebugInspectorInteractionToken == requestToken else { return }
            let selectedBeat = vm.outline.beats.first(where: { $0.id == selectedBeatInspectorID })

            let payload: [String: Any] = [
                "request_token": requestToken,
                "status": status,
                "action": requestedAction?.rawValue ?? "",
                "error": errorText,
                "right_panel_tab": directionOneRightPanelTab.rawValue,
                "selected_beat_id": selectedBeatInspectorID,
                "selected_beat_label": selectedBeat?.label ?? "",
                "selected_beat_summary": (selectedBeat?.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_scene_id": (selectedBeat?.sceneId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_act_id": (selectedBeat?.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                "selected_beat_provenance": beatProvenance(forBeatID: selectedBeatInspectorID).rawValue,
                "beat_count": vm.outline.beats.count,
                "beat_order_ids": sortedOutlineBeats.map(\.id),
                "beat_order_labels": sortedOutlineBeats.map(\.label),
                "beat_drag_in_flight": draggedBeatID != nil,
                "dragged_beat_id": draggedBeatID ?? "",
                "beat_drop_target_id": beatDropTargetID,
                "beat_end_drop_targeted": isBeatListDropTargeted,
                "beat_insertion_marker_visible": !beatDropTargetID.isEmpty,
                "beat_draft_label": vm.newBeatLabel,
                "beat_draft_summary": vm.newBeatSummary,
                "highlighted_scene_key": highlightedSceneInspectorKey,
                "collaborator_count": vm.collaborators.count,
                "approved_emails": vm.approvedEmails,
                "comment_count": vm.comments.count,
                "comment_ids": vm.comments.map(\.id),
                "latest_comment_id": vm.comments.first?.id ?? "",
                "latest_comment_text": vm.comments.first?.text ?? "",
                "latest_comment_author": vm.comments.first?.authorEmail ?? "",
                "latest_comment_resolved": vm.comments.first?.resolved ?? false,
                "latest_comment_deleted": vm.comments.first?.isDeleted ?? false,
                "selected_project_id": vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines),
                "latest_version_id": vm.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines),
                "latest_info_text": vm.infoText,
                "vm_error_text": vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines),
            ]
            studioDebugInspectorInteractionResultToken = requestToken
            studioDebugInspectorInteractionResultStatus = status
            studioDebugInspectorInteractionResultError = errorText
            studioDebugInspectorInteractionResultJSON = studioDebugJSONString(from: payload)
            mirrorStudioDebugInt(requestToken, forKey: "studio_debug_inspector_interaction_result_token")
            mirrorStudioDebugString(status, forKey: "studio_debug_inspector_interaction_result_status")
            mirrorStudioDebugString(errorText, forKey: "studio_debug_inspector_interaction_result_error")
            mirrorStudioDebugString(studioDebugInspectorInteractionResultJSON, forKey: "studio_debug_inspector_interaction_result_json")
            publishDebugStudioDiffState()
        }
        #endif
    }

    private func applyDebugSubmittedStudioPromptIfNeeded() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        guard studioDebugSubmitToken > 0 else { return }
        guard studioDebugSubmitToken != studioDebugSubmitAckToken else { return }
        guard studioDebugSubmitToken != lastAppliedStudioDebugSubmitToken else { return }
        guard !isSubmittingStudioPrompt, !isSubmittingPrompt else { return }
        let text = studioDebugSubmitText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let routingMode = PromptRoutingMode(rawValue: studioDebugSubmitRoutingRaw) ?? .automatic
        let replacementMode = studioDebugSubmitReplacementMode
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        studioPromptSeed = text
        studioPromptRoutingMode = routingMode
        if replacementMode == "latest" {
            prepareReplacementTargetForPromptIfNeeded(text, routingMode: routingMode)
        } else {
            liveDraftBridge.clearPendingPageWriteReplacement()
        }
        studioPromptFocused = true
        studioDebugSubmitCommandReceivedToken = studioDebugSubmitToken
        mirrorStudioDebugInt(studioDebugSubmitToken, forKey: "studio_debug_submit_command_received_token")
        publishDebugStudioDiffState()
        lastAppliedStudioDebugSubmitToken = studioDebugSubmitToken
        let requestID = "studio-\(UUID().uuidString.lowercased())"
        submitStudioPromptText(
            text,
            displayText: text,
            source: .typed,
            routingMode: routingMode,
            successMessage: "Prompt sent to io.them.",
            clearSeedOnSuccess: true,
            sendingSuggestionID: nil,
            requestIDOverride: requestID,
            debugSubmitToken: studioDebugSubmitToken,
            debugSubmitReplacementMode: replacementMode
        )
        #endif
    }

    private func publishDebugStudioDiffState() {
        #if DEBUG
        guard IOThemRuntime.isStudioAutomationSession else { return }
        let pendingReplacement = liveDraftBridge.pendingReplacementTarget
        let submittedReplacement = liveDraftBridge.submittedReplacementTarget
        let currentDraft = vm.fountainDraft
        let normalizedDraft = currentDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let draftPreview = String(normalizedDraft.prefix(220))
        let draftTailPreview = String(normalizedDraft.suffix(220))
        let revisedEntries = studioAskNoteHistory.filter { exchange in
            fullThreadDraftComparison(for: exchange)?.state == .revisedInDraft
        }
        let revisedExchangesByLineage = latestRevisedDiffExchangeByLineage(in: studioAskNoteHistory)
        let focusedDiffLineageKey = focusedPageDiffExchange.map { studioExchangeLineageKey($0) } ?? ""
        let focusedDiffWriteID = focusedPageDiffExchange?.writeID ?? ""
        let activeRevisedExchange = preferredRevisedDiffExchange(in: studioAskNoteHistory)
        let activeRevisedKey = activeRevisedExchange.map(studioExchangePersistentActionKey) ?? ""
        let activeRevisedLineageKey = activeRevisedExchange.map { studioExchangeLineageKey($0) } ?? ""
        let activeLineageRevisedExchanges = revisedEntries.filter { exchange in
            let lineageKey = studioExchangeLineageKey(exchange)
            return !activeRevisedLineageKey.isEmpty && lineageKey == activeRevisedLineageKey
        }
        let latestRevisedExchange = revisedEntries.first
        let latestRevisedKey = latestRevisedExchange.map(studioExchangePersistentActionKey) ?? ""
        let latestRevisedLineageKey = latestRevisedExchange.map { studioExchangeLineageKey($0) } ?? ""
        let latestRevisedWriteID = latestRevisedExchange?.writeID ?? ""
        let latestReopenedExchange = revisedEntries.first(where: { isDiffReopened(for: $0) })
            ?? studioAskNoteHistory.first(where: { isDiffReopened(for: $0) })
        let latestReopenedKey = latestReopenedExchange.map(studioExchangePersistentActionKey) ?? ""
        let latestReopenedLineageKey = latestReopenedExchange.map { studioExchangeLineageKey($0) } ?? ""
        let latestReopenedWriteID = normalizedWriteID(latestReopenedExchange?.writeID)
        let fallbackReopenedWriteID = fallbackLatestReopenedWriteID(for: activeStudioAskNoteHistoryKey)
        let latestAcknowledgedRecord = latestAcknowledgedDiffRecord(
            revisedExchangesByLineage: revisedExchangesByLineage
        )
        let latestThreadEntry = studioAskNoteHistory.first
        let latestThreadMemoryDomain = latestThreadEntry.map(resolvedMemoryDomain(for:)) ?? liveDraftBridge.latestMemoryDomain
        let latestThreadOutputValue = latestThreadEntry.map { studioOutputValue(for: $0.target) } ?? ""
        let footerOutputTarget: StudioTarget = liveDraftBridge.latestStudioRouteTarget == .page ? .page : .voicePin
        let activeProjectID = screenplayProjectIdFromHistoryKey(activeStudioAskNoteHistoryKey)
        let selectedBeat = vm.outline.beats.first(where: { $0.id == selectedBeatInspectorID })
        let inspectorAutoScrollRequest = currentInspectorAutoScrollRequest
        let currentPageWritePreview = liveDraftBridge.lastCommittedWrite.map { committedWriteToastPreview($0.insertedText) } ?? ""
        let featureSnapshot = featureWorkflowSnapshot
        let acceptedPageWrites = acceptedStudioPageWriteExchanges
        let selectedBackendProject = (vm.selectedProject?.id == activeProjectID) ? vm.selectedProject : nil
        let listedBackendProject = activeProjectID.flatMap { projectID in
            vm.projects.first(where: { $0.id == projectID })
        }
        let backendAskNoteEntries = backendStudioAskNoteHistory(for: activeStudioAskNoteHistoryKey)
        let localThreadState = loadStudioFullThreadBrowseStateMap()[activeStudioAskNoteHistoryKey]
        let conflict = vm.conflictState
        let recovery = vm.recoveryCandidate
        let recoveryDraft = recovery?.draft.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let state = StudioDebugDiffState(
            debugSessionID: studioDebugSessionID,
            projectKey: activeStudioAskNoteHistoryKey,
            selectedProjectID: vm.selectedProjectID,
            latestVersionID: vm.latestVersionID,
            studioSurfaceActive: true,
            initialLoadSettled: studioDebugInitialLoadSettled,
            selectedProjectPresent: vm.selectedProject != nil,
            errorText: vm.errorText.trimmingCharacters(in: .whitespacesAndNewlines),
            debugAutomationSession: IOThemRuntime.isStudioAutomationSession,
            debugAuthSessionAuthenticated: BackendAuthClient.currentAuthSessionState().isAuthenticated,
            debugAuthHeaderPresent: BackendAuthClient.authorizationHeaderValue() != nil,
            debugProjectClientOwner: liveDraftBridge.usesDebugClientTokenOwner(
                forProjectID: vm.selectedProjectID
            ),
            debugProjectClientTokenPresent: liveDraftBridge.debugClientTokenOwnerToken(
                forProjectID: vm.selectedProjectID
            ) != nil,
            debugDidLoadScreenplayProjectsFromBackend: vm.debugDidLoadScreenplayProjectsFromBackend,
            debugIsCrossDeviceRefreshInFlight: vm.debugIsCrossDeviceRefreshInFlight,
            debugIsDraftSaveInFlight: vm.debugIsDraftSaveInFlight,
            debugIsLoading: vm.isLoading,
            debugIsStreamingDraftPreviewActive: vm.isStreamingDraftPreviewActive,
            isSaving: vm.isSaving,
            loadedDraftProjectID: vm.debugLoadedDraftProjectID,
            loadProjectToken: trackedStudioDebugProjectLoadToken,
            loadProjectAckToken: studioDebugLoadProjectAckToken,
            loadProjectRequestedProjectID: trackedStudioDebugProjectLoadRequestedProjectID,
            loadProjectRequestedVersionID: trackedStudioDebugProjectLoadRequestedVersionID,
            loadProjectStage: trackedStudioDebugProjectLoadStage,
            loadProjectReady: trackedStudioDebugProjectLoadReady,
            loadProjectError: trackedStudioDebugProjectLoadError,
            editorFocusPending: liveDraftBridge.pendingEditorFocus != nil,
            preparedPromptToken: studioDebugPrepareAckToken,
            preparedPromptText: studioDebugPrepareAckText,
            preparedPromptRouting: studioDebugPrepareAckRoutingRaw,
            composerFocused: studioPromptFocused,
            composerExpanded: isDirectionOneComposerExpanded,
            submitInFlight: isSubmittingStudioPrompt,
            submitCommandReceivedToken: studioDebugSubmitCommandReceivedToken,
            submitAckToken: studioDebugSubmitAckToken,
            submitAckText: studioDebugSubmitAckText,
            submitAckRouting: studioDebugSubmitAckRoutingRaw,
            submitAckReplacementMode: studioDebugSubmitAckReplacementMode,
            submitAckRequestID: studioDebugSubmitAckRequestID,
            commandBarToken: studioDebugCommandBarToken,
            commandBarAckToken: studioDebugCommandBarAckToken,
            hasPendingReplacementTarget: pendingReplacement != nil,
            pendingReplacementWriteID: pendingReplacement?.sourceWriteID ?? "",
            pendingReplacementStartLine: pendingReplacement?.startLine,
            pendingReplacementEndLine: pendingReplacement?.endLine,
            pendingReplacementPreview: noteBodyForAnchor(pendingReplacement?.currentText ?? ""),
            hasSubmittedReplacementTarget: submittedReplacement != nil,
            submittedReplacementWriteID: submittedReplacement?.sourceWriteID ?? "",
            submittedReplacementStartLine: submittedReplacement?.startLine,
            submittedReplacementEndLine: submittedReplacement?.endLine,
            submittedReplacementPreview: noteBodyForAnchor(submittedReplacement?.currentText ?? ""),
            revisedDiffCount: revisedEntries.count,
            reopenedDiffCount: reopenedDiffExchangeKeys.count,
            acknowledgedDiffCount: acknowledgedDiffExchangeKeys.count,
            askNoteHistoryCount: studioAskNoteHistory.count,
            backendAskNoteHistoryCount: backendAskNoteEntries.count,
            latestAskNotePrompt: studioAskNoteHistory.first?.prompt ?? "",
            latestAskNoteInsertedText: studioAskNoteHistory.first?.insertedText ?? "",
            latestRevisedKey: latestRevisedKey,
            latestRevisedLineageKey: latestRevisedLineageKey,
            latestRevisedWriteID: latestRevisedWriteID,
            focusedDiffLineageKey: focusedDiffLineageKey,
            focusedDiffWriteID: focusedDiffWriteID,
            activeRevisedKey: activeRevisedKey,
            activeRevisedLineageKey: activeRevisedLineageKey,
            activeRevisedWriteID: activeRevisedExchange?.writeID ?? "",
            activeLineageRevisedKeys: activeLineageRevisedExchanges.map(studioExchangePersistentActionKey),
            activeLineageRevisedWriteIDs: activeLineageRevisedExchanges.compactMap { exchange in
                let writeID = normalizedWriteID(exchange.writeID)
                return writeID.isEmpty ? nil : writeID
            },
            latestReopenedKey: latestReopenedKey,
            latestReopenedLineageKey: latestReopenedLineageKey,
            latestReopenedWriteID: latestReopenedWriteID.isEmpty ? fallbackReopenedWriteID : latestReopenedWriteID,
            restoredStateSource: restoredStudioDebugStateSourceRaw,
            restoredFocusedDiffSource: restoredStudioDebugFocusedDiffSourceRaw,
            restoredReopenedSource: restoredStudioDebugReopenedSourceRaw,
            restoredFocusedDiffKey: restoredStudioDebugFocusedDiffKey,
            restoredReopenedLineageKeys: restoredStudioDebugReopenedLineageKeys,
            restoredLatestReopenedWriteID: restoredStudioDebugLatestReopenedWriteID,
            localThreadStateKeyPresent: localThreadState != nil,
            localThreadStateFocusedDiffKey: localThreadState?.focusedDiffKey ?? "",
            localThreadStateReopenedLineageKeys: localThreadState?.reopenedLineageKeys ?? [],
            localThreadStateLatestReopenedWriteID: localThreadState?.latestReopenedWriteID ?? "",
            latestAcknowledgedLineageKey: latestAcknowledgedRecord?.lineageKey ?? "",
            latestAcknowledgedWriteID: latestAcknowledgedRecord?.acknowledgedWriteID ?? "",
            latestAcknowledgedFingerprint: latestAcknowledgedRecord?.acknowledgedFingerprint ?? "",
            backendSelectedProjectID: selectedBackendProject?.id ?? "",
            backendSelectedFocusedDiffKey: selectedBackendProject?.studioThreadViewState?.focusedDiffKey ?? "",
            backendSelectedReopenedLineageKeys: selectedBackendProject?.studioThreadViewState?.reopenedLineageKeys ?? [],
            backendSelectedLatestReopenedWriteID: selectedBackendProject?.studioThreadViewState?.latestReopenedWriteID ?? "",
            backendSelectedAcknowledgedKeysCount: selectedBackendProject?.studioDiffAcknowledged?.keys?.count ?? 0,
            backendSelectedAcknowledgedEntriesCount: selectedBackendProject?.studioDiffAcknowledged?.entries?.count ?? 0,
            backendListedFocusedDiffKey: listedBackendProject?.studioThreadViewState?.focusedDiffKey ?? "",
            backendListedReopenedLineageKeys: listedBackendProject?.studioThreadViewState?.reopenedLineageKeys ?? [],
            backendListedLatestReopenedWriteID: listedBackendProject?.studioThreadViewState?.latestReopenedWriteID ?? "",
            backendListedAcknowledgedKeysCount: listedBackendProject?.studioDiffAcknowledged?.keys?.count ?? 0,
            backendListedAcknowledgedEntriesCount: listedBackendProject?.studioDiffAcknowledged?.entries?.count ?? 0,
            isManualDraftEditing: vm.isManualDraftEditing,
            hasUnsavedDraftChanges: vm.hasUnsavedDraftChanges,
            autosaveEnabled: vm.autosaveEnabled,
            autosaveStatusText: vm.autosaveStatusText,
            conflictPresent: conflict != nil,
            conflictProjectID: conflict?.projectId ?? "",
            conflictBaseVersionID: conflict?.baseVersionId ?? "",
            conflictServerVersionID: conflict?.serverVersionId ?? "",
            conflictServerDraftPreview: noteBodyForAnchor(conflict?.serverDraftExcerpt ?? conflict?.serverDraft ?? ""),
            recoveryPresent: recovery != nil,
            recoveryProjectID: recovery?.projectId ?? "",
            recoveryBaseVersionID: recovery?.baseVersionId ?? "",
            recoverySavedAt: recovery?.savedAt ?? 0,
            recoveryDraftPreview: noteBodyForAnchor(recovery?.draft ?? ""),
            recoveryMatchesCurrentDraft: !recoveryDraft.isEmpty && recoveryDraft == normalizedDraft,
            leftSidebarVisible: isDirectionOneSidebarVisible,
            sidebarSection: selectedSidebarSection.rawValue,
            draftInspectorPresented: draftInspectorIsPresented,
            draftInspectorSection: selectedDraftToolsSection.rawValue,
            draftPaginationPageCount: vm.paginationPages.count,
            draftIntegrityIssueCount: screenplayIntegrityIssues.count,
            draftIntegrityCanMoveToPin: primaryScreenplayIntegrityIssue != nil,
            draftIntegrityCanMoveAllToPin: screenplayIntegrityIssues.count > 1,
            draftIntegrityPrimaryPreview: primaryScreenplayIntegrityIssue?.preview ?? "",
            infoText: vm.infoText,
            draftPreview: draftPreview,
            draftTailPreview: draftTailPreview,
            draftCharacterCount: normalizedDraft.count,
            draftFingerprint: ScreenplayDraftIntegrityFingerprint.value(for: normalizedDraft),
            focusedDiffKey: focusedPageDiffPersistentKey,
            latestThreadRequestID: latestThreadEntry?.requestID ?? "",
            latestThreadWriteID: latestThreadEntry?.writeID ?? "",
            latestThreadReplacedWriteID: latestThreadEntry?.replacedWriteID ?? "",
            latestThreadReplacementApplied: latestThreadEntry?.replacementApplied == true,
            latestThreadPrompt: latestThreadEntry?.prompt ?? "",
            latestThreadInsertedPreview: noteBodyForAnchor(latestThreadEntry?.insertedText ?? ""),
            latestThreadMemoryLabel: latestThreadEntry == nil ? "" : "Memory",
            latestThreadMemoryValue: latestThreadEntry == nil ? "" : latestThreadMemoryDomain.title,
            latestThreadOutputLabel: latestThreadEntry == nil ? "" : "Output",
            latestThreadOutputValue: latestThreadOutputValue,
            footerMemoryLabel: "Memory",
            footerMemoryValue: liveDraftBridge.latestMemoryDomain.title,
            footerOutputLabel: "Output",
            footerOutputValue: studioOutputValue(for: footerOutputTarget),
            transientStatusVisible: directionOneTransientStatusIsVisible,
            pageWriteToastVisible: isLastCommittedWriteActionVisible && liveDraftBridge.lastCommittedWrite != nil,
            pageWriteToastCollapsed: isLastCommittedWriteActionVisible && isLastCommittedWriteToastCollapsed,
            pageWriteToastSource: lastCommittedStudioPromptSource.rawValue,
            pageWriteToastPreview: currentPageWritePreview,
            voicePinTurnCount: voicePinTurns.count,
            voicePinEmpty: voicePinTurns.isEmpty,
            collaboratorCount: vm.collaborators.count,
            approvedEmails: vm.approvedEmails,
            commentCount: vm.comments.count,
            latestCommentID: vm.comments.first?.id ?? "",
            latestCommentText: vm.comments.first?.text ?? "",
            latestCommentAuthor: vm.comments.first?.authorEmail ?? "",
            latestCommentResolved: vm.comments.first?.resolved ?? false,
            latestCommentDeleted: vm.comments.first?.isDeleted ?? false,
            collaboratorInspectorCompact: true,
            themCompanionMode: liveDraftBridge.companionMode.rawValue,
            themUnifiedSurface: true,
            themModeControlStyle: "segmented",
            themRecentThreadInlineSummaryVisible: companionVoicePinEntries.isEmpty,
            intelligenceQueueCount: queuedIntelligenceFixes.count,
            intelligenceQueueSafeCount: queuedIntelligenceFixes.filter(\.isSafe).count,
            intelligenceQueueTitles: queuedIntelligenceFixes.map(\.title),
            intelligenceLastBatchID: lastAppliedIntelligenceFixBatch?.id ?? "",
            intelligenceLastBatchAppliedCount: lastAppliedIntelligenceFixBatch?.appliedFixIDs.count ?? 0,
            featureCompassAct: featureSnapshot.currentActTitle,
            featureCompassNextScene: featureSnapshot.nextSceneTitle,
            featureCompassMoveTitles: featureSnapshot.nextMoves.map(\.title),
            featureCompassAcceptedBatchCount: acceptedPageWrites.count,
            featureCompassAcceptedBatchDetail: featureSnapshot.acceptedBatchDetail,
            featureCompassHasAcceptedBatch: featureSnapshot.hasAcceptedBatch,
            rightRailExpanded: isDirectionOneRightRailExpanded,
            rightPanelTab: directionOneRightPanelTab.rawValue,
            selectedBeatID: selectedBeatInspectorID,
            selectedBeatLabel: selectedBeat?.label ?? "",
            selectedBeatSummary: (selectedBeat?.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            selectedBeatSceneID: (selectedBeat?.sceneId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            selectedBeatActID: (selectedBeat?.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            selectedBeatProvenance: beatProvenance(forBeatID: selectedBeatInspectorID).rawValue,
            beatDraftLabel: vm.newBeatLabel,
            beatDraftSummary: vm.newBeatSummary,
            beatOrderIDs: sortedOutlineBeats.map(\.id),
            beatOrderLabels: sortedOutlineBeats.map(\.label),
            beatDragInFlight: draggedBeatID != nil,
            draggedBeatID: draggedBeatID ?? "",
            beatDropTargetID: beatDropTargetID,
            beatInsertionMarkerVisible: !beatDropTargetID.isEmpty,
            beatEndDropVisible: draggedBeatID != nil,
            beatEndDropTargeted: isBeatListDropTargeted,
            inspectorAutoScrollAnchorID: inspectorAutoScrollRequest?.anchorID ?? "",
            inspectorAutoScrollDirection: inspectorAutoScrollRequest.map { $0.direction == .down ? "down" : "up" } ?? "",
            highlightedSceneInspectorKey: highlightedSceneInspectorKey,
            selectionStartLine: liveDraftBridge.editorSelection?.startLine ?? 0,
            selectionEndLine: liveDraftBridge.editorSelection?.endLine ?? 0
        )
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(state),
              let encoded = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async {
            studioDebugDiffStateJSON = encoded
            #if os(macOS)
            writeMirroredStudioDebugPreferenceString(encoded, forKey: "studio_debug_diff_state_json")
            #endif
        }
        #endif
    }



    private var filteredNavigatorEntries: [StudioFileEntry] {
        let query = navigatorFilterText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return navigatorEntries }
        return navigatorEntries.filter { $0.name.lowercased().contains(query) }
    }

    private var canNavigateUpInNavigator: Bool {
        guard let current = navigatorCurrentURL else { return false }
        guard let root = navigatorRootURL else { return false }
        return current.path != root.path
    }

    private var navigatorBreadcrumbs: [URL] {
        guard let current = navigatorCurrentURL else { return [] }
        guard let root = navigatorRootURL else { return [current] }
        var crumbs: [URL] = []
        var cursor = current
        crumbs.append(cursor)
        while cursor.path != root.path {
            let parent = cursor.deletingLastPathComponent()
            if parent.path == cursor.path { break }
            crumbs.append(parent)
            cursor = parent
        }
        return crumbs.reversed()
    }

    private func bootstrapNavigatorIfNeeded() {
        guard !IOThemRuntime.isRunningTests else { return }
        guard navigatorCurrentURL == nil else { return }
        let fallback = ScreenplayNavigatorRootPolicy.preferredRootURL()
        try? FileManager.default.createDirectory(
            at: fallback,
            withIntermediateDirectories: true
        )
        navigatorRootURL = fallback
        navigatorCurrentURL = fallback
        refreshNavigatorEntries()
    }

    private func openNavigatorRootPicker() {
        #if os(macOS)
        let panel = NSOpenPanel()
        panel.title = "Select Folder"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let folder = panel.url {
            navigatorRootURL = folder
            navigatorCurrentURL = folder
            navigatorBackStack = []
            navigatorForwardStack = []
            refreshNavigatorEntries()
            vm.infoText = "Folder opened: \(folder.lastPathComponent)"
        }
        #endif
    }

    private func navigateNavigatorTo(_ url: URL, pushHistory: Bool) {
        let target = url.standardizedFileURL
        if pushHistory, let current = navigatorCurrentURL, current.path != target.path {
            navigatorBackStack.append(current)
            navigatorForwardStack = []
        }
        navigatorCurrentURL = target
        refreshNavigatorEntries()
    }

    private func navigateNavigatorBack() {
        guard let previous = navigatorBackStack.popLast() else { return }
        if let current = navigatorCurrentURL {
            navigatorForwardStack.append(current)
        }
        navigatorCurrentURL = previous
        refreshNavigatorEntries()
    }

    private func navigateNavigatorForward() {
        guard let next = navigatorForwardStack.popLast() else { return }
        if let current = navigatorCurrentURL {
            navigatorBackStack.append(current)
        }
        navigatorCurrentURL = next
        refreshNavigatorEntries()
    }

    private func navigateNavigatorUp() {
        guard let current = navigatorCurrentURL else { return }
        let parent = current.deletingLastPathComponent()
        guard parent.path != current.path else { return }
        if let root = navigatorRootURL, current.path == root.path { return }
        navigateNavigatorTo(parent, pushHistory: true)
    }

    private func refreshNavigatorEntries() {
        guard let folder = navigatorCurrentURL else {
            navigatorEntries = []
            return
        }
        do {
            let urls = try FileManager.default.contentsOfDirectory(
                at: folder,
                includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey, .isHiddenKey],
                options: [.skipsPackageDescendants]
            )
            let mapped: [StudioFileEntry] = urls.compactMap { url in
                let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .contentModificationDateKey, .isHiddenKey])
                if !navigatorShowHidden, values?.isHidden == true { return nil }
                let isDirectory = values?.isDirectory ?? false
                return StudioFileEntry(
                    url: url,
                    isDirectory: isDirectory,
                    modifiedAt: values?.contentModificationDate
                )
            }
            navigatorEntries = mapped.sorted { lhs, rhs in
                if lhs.isDirectory != rhs.isDirectory { return lhs.isDirectory && !rhs.isDirectory }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
        } catch {
            navigatorEntries = []
            vm.errorText = error.localizedDescription
        }
    }

    private func openNavigatorEntry(_ entry: StudioFileEntry) {
        if entry.isDirectory {
            navigateNavigatorTo(entry.url, pushHistory: true)
            return
        }
        let ext = entry.url.pathExtension.lowercased()
        if Self.draftImportTextExtensions.contains(ext) {
            queueDraftImport(from: entry.url)
            return
        }
        if ext == "pdf" {
            queueDraftImport(from: entry.url)
            return
        }
        #if os(macOS)
        NSWorkspace.shared.open(entry.url)
        #endif
    }

    private func saveDraftToLocalFile() {
        let draft = vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.isEmpty else {
            vm.errorText = "Draft is empty."
            return
        }
        #if os(macOS)
        let panel = NSSavePanel()
        panel.title = "Save Fountain Draft"
        let baseName = (vm.selectedProject?.title ?? "screenplay")
            .replacingOccurrences(of: "/", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        panel.nameFieldStringValue = "\(baseName.isEmpty ? "screenplay" : baseName).fountain"
        panel.canCreateDirectories = true
        panel.directoryURL = navigatorCurrentURL
        if panel.runModal() == .OK, let url = panel.url {
            do {
                try draft.write(to: url, atomically: true, encoding: .utf8)
                vm.infoText = "Saved \(url.lastPathComponent)"
                navigatorCurrentURL = url.deletingLastPathComponent()
                refreshNavigatorEntries()
            } catch {
                vm.errorText = error.localizedDescription
            }
        }
        #endif
    }

    private func createFolderInNavigator() {
        guard let folder = navigatorCurrentURL else { return }
        let raw = navigatorNewFolderName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else {
            vm.errorText = "Enter a folder name."
            return
        }
        let safeName = raw
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
        let nextURL = folder.appendingPathComponent(safeName, isDirectory: true)
        guard !FileManager.default.fileExists(atPath: nextURL.path) else {
            vm.errorText = "A file or folder with that name already exists."
            return
        }
        do {
            try FileManager.default.createDirectory(at: nextURL, withIntermediateDirectories: false)
            navigatorNewFolderName = ""
            refreshNavigatorEntries()
            vm.infoText = "Created folder \(safeName)"
        } catch {
            vm.errorText = error.localizedDescription
        }
    }

    private func renameNavigatorEntry(_ entry: StudioFileEntry) {
        #if os(macOS)
        let alert = NSAlert()
        alert.messageText = "Rename \(entry.name)"
        alert.informativeText = "Enter a new name."
        alert.addButton(withTitle: "Rename")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(string: entry.name)
        field.frame = NSRect(x: 0, y: 0, width: 360, height: 24)
        alert.accessoryView = field
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return }
        let proposed = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !proposed.isEmpty else { return }
        let safeName = proposed
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
        let destination = entry.url.deletingLastPathComponent().appendingPathComponent(safeName, isDirectory: entry.isDirectory)
        guard destination.path != entry.url.path else { return }
        guard !FileManager.default.fileExists(atPath: destination.path) else {
            vm.errorText = "A file or folder with that name already exists."
            return
        }
        do {
            try FileManager.default.moveItem(at: entry.url, to: destination)
            refreshNavigatorEntries()
            vm.infoText = "Renamed to \(safeName)"
        } catch {
            vm.errorText = error.localizedDescription
        }
        #endif
    }

    private func deleteNavigatorEntry(_ entry: StudioFileEntry) {
        #if os(macOS)
        let alert = NSAlert()
        alert.messageText = "Delete \(entry.name)?"
        alert.informativeText = "This will move it to Trash."
        alert.addButton(withTitle: "Delete")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return }
        do {
            _ = try FileManager.default.trashItem(at: entry.url, resultingItemURL: nil)
            refreshNavigatorEntries()
            vm.infoText = "Moved \(entry.name) to Trash."
        } catch {
            vm.errorText = error.localizedDescription
        }
        #endif
    }

    private func handleNavigatorDrop(providers: [NSItemProvider]) -> Bool {
        guard navigatorCurrentURL != nil else { return false }
        let fileProviders = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) }
        guard !fileProviders.isEmpty else { return false }
        for provider in fileProviders {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, error in
                if let error {
                    DispatchQueue.main.async {
                        vm.errorText = error.localizedDescription
                    }
                    return
                }
                guard let sourceURL = decodeDroppedURL(item) else { return }
                DispatchQueue.main.async {
                    importDroppedFile(intoNavigator: sourceURL)
                }
            }
        }
        return true
    }

    private func handleDraftDrop(providers: [NSItemProvider]) -> Bool {
        let fileProviders = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) }
        guard !fileProviders.isEmpty else { return false }
        for provider in fileProviders {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, error in
                if let error {
                    DispatchQueue.main.async {
                        vm.errorText = error.localizedDescription
                    }
                    return
                }
                guard let sourceURL = decodeDroppedURL(item) else { return }
                DispatchQueue.main.async {
                    queueDraftImport(from: sourceURL)
                }
            }
        }
        return true
    }

    private func decodeDroppedURL(_ item: NSSecureCoding?) -> URL? {
        if let url = item as? URL {
            return url
        }
        if let data = item as? Data {
            return URL(dataRepresentation: data, relativeTo: nil)
        }
        if let text = item as? String {
            if let url = URL(string: text), url.isFileURL {
                return url
            }
            return URL(fileURLWithPath: text)
        }
        return nil
    }

    private func importDroppedFile(intoNavigator sourceURL: URL) {
        guard let destinationFolder = navigatorCurrentURL else { return }
        let source = sourceURL.standardizedFileURL
        let hasAccess = source.startAccessingSecurityScopedResource()
        defer {
            if hasAccess { source.stopAccessingSecurityScopedResource() }
        }
        let destination = uniqueNavigatorDestination(for: source, in: destinationFolder)
        do {
            try FileManager.default.copyItem(at: source, to: destination)
            refreshNavigatorEntries()
            vm.infoText = "Imported \(destination.lastPathComponent)"
        } catch {
            vm.errorText = error.localizedDescription
        }
    }

    private func importDraftDocument() {
        #if os(macOS)
        let panel = NSOpenPanel()
        panel.title = "Import Screenplay"
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.canCreateDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = Self.draftImportContentTypes
        if panel.runModal() == .OK, let url = panel.url {
            queueDraftImport(from: url)
        }
        #else
        showingDraftFileImporter = true
        #endif
    }

    private func queueDraftImport(from sourceURL: URL) {
        let standardizedURL = sourceURL.standardizedFileURL
        let hasExistingDraft = !vm.fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard hasExistingDraft else {
            Task { await importDraftFile(from: standardizedURL, appendToExisting: false) }
            return
        }
        pendingDraftImportURL = standardizedURL
        pendingDraftImportSourceName = standardizedURL.lastPathComponent
        showingDraftImportChoice = true
    }

    private func confirmDraftImport(_ mode: DraftImportMode) {
        guard let sourceURL = pendingDraftImportURL else { return }
        let shouldAppend = (mode == .append)
        clearPendingDraftImport()
        Task { await importDraftFile(from: sourceURL, appendToExisting: shouldAppend) }
    }

    private func clearPendingDraftImport() {
        pendingDraftImportURL = nil
        pendingDraftImportSourceName = ""
    }

    private func importDraftFile(from sourceURL: URL, appendToExisting: Bool) async {
        let source = sourceURL.standardizedFileURL
        let hasAccess = source.startAccessingSecurityScopedResource()
        defer {
            if hasAccess { source.stopAccessingSecurityScopedResource() }
        }

        do {
            let importedDraft = try await extractedEditableDraft(from: source)
            vm.importExternalDraft(
                importedDraft.text,
                sourceName: source.lastPathComponent,
                appendToExisting: appendToExisting
            )
            if importedDraft.usedOCR {
                vm.infoText += " OCR was used for scanned pages."
            }
            if importedDraft.usedBackendFountainImport {
                vm.infoText += " Parsed with the Fountain import service."
            }
            liveDraftBridge.draftText = vm.fountainDraft
        } catch {
            vm.errorText = error.localizedDescription
        }
    }

    private func extractedEditableDraft(from sourceURL: URL) async throws -> (text: String, usedOCR: Bool, usedBackendFountainImport: Bool) {
        let ext = sourceURL.pathExtension.lowercased()
        if ext == "pdf" {
            let extracted = try extractDraftTextFromPDF(sourceURL)
            return (extracted.text, extracted.usedOCR, false)
        }
        if Self.draftImportTextExtensions.contains(ext) {
            let raw = try String(contentsOf: sourceURL, encoding: .utf8)
            if let imported = try? await BackendMemoryAPI.shared.importFountainDraft(text: raw) {
                let parsedDraft = normalizeImportedDraftText(imported.screenplay.fountainDraft)
                if !parsedDraft.isEmpty {
                    return (parsedDraft, false, true)
                }
            }
            let normalized = normalizeImportedDraftText(raw)
            guard !normalized.isEmpty else {
                throw NSError(
                    domain: "ScreenplayStudioImport",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "That file did not contain readable screenplay text."]
                )
            }
            return (normalized, false, false)
        }
        throw NSError(
            domain: "ScreenplayStudioImport",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Only screenplay PDFs and Fountain/plain-text script files can be imported into the draft."]
        )
    }

    private func extractDraftTextFromPDF(_ sourceURL: URL) throws -> (text: String, usedOCR: Bool) {
        guard let document = PDFDocument(url: sourceURL) else {
            throw NSError(
                domain: "ScreenplayStudioImport",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "That PDF could not be opened."]
            )
        }
        let raw = document.string ?? ""
        let normalized = normalizeImportedDraftText(raw)
        if !normalized.isEmpty {
            return (normalized, false)
        }

        let ocrText = try extractDraftTextFromScannedPDF(document)
        let normalizedOCR = normalizeImportedDraftText(ocrText)
        guard !normalizedOCR.isEmpty else {
            throw NSError(
                domain: "ScreenplayStudioImport",
                code: 4,
                userInfo: [NSLocalizedDescriptionKey: "That PDF did not contain readable screenplay text, even after OCR."]
            )
        }
        return (normalizedOCR, true)
    }

    private func extractDraftTextFromScannedPDF(_ document: PDFDocument) throws -> String {
        guard document.pageCount > 0 else { return "" }
        var pageTexts: [String] = []
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            let pageText = try recognizeText(in: page)
            let normalizedPageText = pageText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !normalizedPageText.isEmpty {
                pageTexts.append(normalizedPageText)
            }
        }
        return pageTexts.joined(separator: "\n\n")
    }

    private func recognizeText(in page: PDFPage) throws -> String {
        #if os(macOS)
        guard let cgImage = renderedCGImage(for: page) else {
            throw NSError(
                domain: "ScreenplayStudioImport",
                code: 5,
                userInfo: [NSLocalizedDescriptionKey: "A scanned PDF page could not be rendered for OCR."]
            )
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["en-US"]
        request.minimumTextHeight = 0.006

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])

        let observations = (request.results ?? []).sorted { lhs, rhs in
            let left = lhs.boundingBox
            let right = rhs.boundingBox
            if abs(left.midY - right.midY) > 0.025 {
                return left.midY > right.midY
            }
            return left.minX < right.minX
        }
        let lines = observations.compactMap { observation in
            observation.topCandidates(1).first?.string
        }
        return lines.joined(separator: "\n")
        #else
        throw NSError(
            domain: "ScreenplayStudioImport",
            code: 6,
            userInfo: [NSLocalizedDescriptionKey: "OCR PDF import is currently available on macOS only."]
        )
        #endif
    }

    #if os(macOS)
    private func renderedCGImage(for page: PDFPage) -> CGImage? {
        let bounds = page.bounds(for: .mediaBox)
        let targetSize = NSSize(
            width: max(1400, bounds.width * 2.2),
            height: max(1800, bounds.height * 2.2)
        )
        let image = page.thumbnail(of: targetSize, for: .mediaBox)
        var rect = NSRect(origin: .zero, size: image.size)
        return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
    }
    #endif

    private func normalizeImportedDraftText(_ raw: String) -> String {
        let normalizedLineEndings = raw
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
        let rawLines = normalizedLineEndings.components(separatedBy: .newlines)
        var cleanedLines: [String] = []
        var previousWasBlank = false

        for rawLine in rawLines {
            let compactLine = rawLine
                .replacingOccurrences(of: "\t", with: " ")
                .trimmingCharacters(in: .whitespaces)
            let lowercase = compactLine.lowercased()
            let isPageMarker = compactLine.range(of: #"^(page\s+)?\d+[a-z]?$"#, options: .regularExpression) != nil
            if isPageMarker || lowercase == "continued:" || lowercase == "(continued)" {
                continue
            }
            if compactLine.isEmpty {
                if previousWasBlank { continue }
                cleanedLines.append("")
                previousWasBlank = true
                continue
            }
            cleanedLines.append(compactLine)
            previousWasBlank = false
        }

        return cleanedLines
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func uniqueNavigatorDestination(for sourceURL: URL, in folder: URL) -> URL {
        let ext = sourceURL.pathExtension
        let stem = sourceURL.deletingPathExtension().lastPathComponent
        var candidate = folder.appendingPathComponent(sourceURL.lastPathComponent)
        var copyIndex = 1
        while FileManager.default.fileExists(atPath: candidate.path) {
            let suffix = copyIndex == 1 ? " copy" : " copy \(copyIndex)"
            let filename = ext.isEmpty ? "\(stem)\(suffix)" : "\(stem)\(suffix).\(ext)"
            candidate = folder.appendingPathComponent(filename)
            copyIndex += 1
        }
        return candidate
    }


    private var snapshotVersions: [BackendScreenplayVersion] {
        ScreenplayStudioDraftToolsPresentationPlanner.orderedSnapshotVersions(
            vm.selectedProject?.versions ?? []
        )
    }

    private var screenplayIntegrityIssues: [ScreenplayPageIntegrityIssue] {
        FountainFormatter.screenplayIntegrityIssues(in: vm.fountainDraft)
    }

    private var draftInspectorIsPresented: Bool {
        isDirectionOneRightRailExpanded && directionOneRightPanelTab == .draft
    }

    private var primaryScreenplayIntegrityIssue: ScreenplayPageIntegrityIssue? {
        screenplayIntegrityIssues.first
    }


    private func toggleDraftInspector() {
        withAnimation(.spring(response: 0.30, dampingFraction: 0.85)) {
            if draftInspectorIsPresented {
                isDirectionOneRightRailExpanded = false
            } else {
                directionOneRightPanelTab = .draft
                isDirectionOneRightRailExpanded = true
            }
        }
    }

    private func openDraftInspector() {
        withAnimation(.spring(response: 0.30, dampingFraction: 0.85)) {
            directionOneRightPanelTab = .draft
            isDirectionOneRightRailExpanded = true
        }
    }

    private func openDirectionOneDraftShortcut(_ shortcut: DirectionOneDraftShortcut) {
        withAnimation(.spring(response: 0.30, dampingFraction: 0.85)) {
            isDirectionOneRightRailExpanded = true
            switch shortcut {
            case .pages:
                directionOneRightPanelTab = .draft
                selectedDraftToolsSection = .pages
            case .revisions:
                directionOneRightPanelTab = .draft
                selectedDraftToolsSection = .revisions
            case .snapshots:
                directionOneRightPanelTab = .draft
                selectedDraftToolsSection = .snapshots
            case .saved:
                directionOneRightPanelTab = .saved
            }
        }
    }

    private func isDirectionOneDraftShortcutActive(_ shortcut: DirectionOneDraftShortcut) -> Bool {
        guard isDirectionOneRightRailExpanded else { return false }
        switch shortcut {
        case .pages:
            return directionOneRightPanelTab == .draft && selectedDraftToolsSection == .pages
        case .revisions:
            return directionOneRightPanelTab == .draft && selectedDraftToolsSection == .revisions
        case .snapshots:
            return directionOneRightPanelTab == .draft && selectedDraftToolsSection == .snapshots
        case .saved:
            return directionOneRightPanelTab == .saved
        }
    }

    private func reviewScreenplayIntegrityIssue(_ issue: ScreenplayPageIntegrityIssue) {
        openDraftInspector()
        liveDraftBridge.jumpToLine(issue.startLine)
        liveDraftBridge.highlightLineRange(startLine: issue.startLine, endLine: issue.endLine)
    }

    private func removeScreenplayIntegrityIssue(_ issue: ScreenplayPageIntegrityIssue) {
        let nextDraft = draftRemovingLines(issue.startLine...issue.endLine, from: vm.fountainDraft)
        guard nextDraft != vm.fountainDraft else { return }
        vm.fountainDraft = nextDraft
        vm.noteManualDraftEdit()
        vm.infoText = "Removed non-screenplay text from the page."
        let fallbackLine = max(1, min(issue.startLine, nextDraft.components(separatedBy: "\n").count))
        liveDraftBridge.jumpToLine(fallbackLine)
    }

    @discardableResult
    private func convertScreenplayIntegrityIssueToPin(
        _ issue: ScreenplayPageIntegrityIssue,
        revealThread: Bool = true,
        updateInfoText: Bool = true
    ) -> UUID? {
        let blockText = draftLinesText(issue.startLine...issue.endLine, from: vm.fountainDraft)
        guard !blockText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }

        liveDraftBridge.latestMemoryDomain = .companion
        liveDraftBridge.updateAssistantPin(
            mode: "copilot",
            category: "voice_pin",
            title: "Recovered from page",
            body: noteBodyForExchange(blockText),
            fullBody: blockText,
            badge: "Pin",
            actionSummary: "Recovered off-page"
        )

        let recoveredEntry = StudioAskNoteExchange(
            id: UUID(),
            backendThreadID: nil,
            backendTurn: nil,
            requestID: nil,
            prompt: "Recover this non-screenplay block from the page.",
            target: .voicePin,
            source: .typed,
            noteTitle: "Recovered from page",
            noteBody: noteBodyForExchange(blockText),
            developmentText: blockText,
            writeID: nil,
            replacedWriteID: nil,
            anchorLine: issue.startLine,
            anchorEndLine: issue.endLine,
            anchorSceneLabel: sceneLabelForLine(issue.startLine),
            anchorExcerpt: nil,
            insertedText: nil,
            replacementApplied: nil,
            revisedBlockText: nil,
            resolvedAnchorExcerpt: nil,
            packLabel: liveDraftBridge.latestPack.isEmpty ? nil : liveDraftBridge.latestPack,
            phase: liveDraftBridge.latestPhase.isEmpty ? nil : liveDraftBridge.latestPhase,
            sluglineAnchorLine: nil,
            memoryDomainRaw: StudioMemoryDomain.companion.rawValue,
            companionModeRaw: liveDraftBridge.companionMode.rawValue,
            timestamp: Date()
        )
        insertStudioAskNoteHistoryEntry(recoveredEntry)
        if revealThread {
            expandedVoicePinTurnID = recoveredEntry.id
            showFullVoicePinThread = true
        }

        let nextDraft = draftRemovingLines(issue.startLine...issue.endLine, from: vm.fountainDraft)
        guard nextDraft != vm.fountainDraft else { return recoveredEntry.id }
        vm.fountainDraft = nextDraft
        vm.noteManualDraftEdit()
        if updateInfoText {
            vm.infoText = "Moved non-screenplay text to Voice Pin and removed it from the page."
        }
        let fallbackLine = max(1, min(issue.startLine, nextDraft.components(separatedBy: "\n").count))
        liveDraftBridge.jumpToLine(fallbackLine)
        return recoveredEntry.id
    }

    private func convertAllScreenplayIntegrityIssuesToPin() {
        let issues = screenplayIntegrityIssues.sorted { lhs, rhs in
            if lhs.startLine == rhs.startLine {
                return lhs.endLine > rhs.endLine
            }
            return lhs.startLine > rhs.startLine
        }
        guard !issues.isEmpty else { return }

        var movedCount = 0
        var firstRecoveredID: UUID?
        var earliestStartLine = Int.max

        for issue in issues {
            guard let recoveredID = convertScreenplayIntegrityIssueToPin(
                issue,
                revealThread: false,
                updateInfoText: false
            ) else { continue }
            movedCount += 1
            if firstRecoveredID == nil {
                firstRecoveredID = recoveredID
            }
            earliestStartLine = min(earliestStartLine, issue.startLine)
        }

        guard movedCount > 0 else { return }
        if let firstRecoveredID {
            expandedVoicePinTurnID = firstRecoveredID
            showFullVoicePinThread = true
        }
        let fallbackLine = max(
            1,
            min(
                earliestStartLine == Int.max ? 1 : earliestStartLine,
                vm.fountainDraft.components(separatedBy: "\n").count
            )
        )
        liveDraftBridge.jumpToLine(fallbackLine)
        vm.infoText = movedCount == 1
            ? "Moved 1 non-screenplay block to Voice Pin and removed it from the page."
            : "Moved \(movedCount) non-screenplay blocks to Voice Pin and removed them from the page."
    }

    private func draftLinesText(_ range: ClosedRange<Int>, from draft: String) -> String {
        let normalized = draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.components(separatedBy: "\n")
        guard !lines.isEmpty else { return "" }

        let lowerBound = max(1, min(range.lowerBound, lines.count))
        let upperBound = max(lowerBound, min(range.upperBound, lines.count))
        return Array(lines[(lowerBound - 1)...(upperBound - 1)])
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func draftRemovingLines(_ range: ClosedRange<Int>, from draft: String) -> String {
        let normalized = draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        var lines = normalized.components(separatedBy: "\n")
        guard !lines.isEmpty else { return draft }

        let lowerBound = max(1, min(range.lowerBound, lines.count))
        let upperBound = max(lowerBound, min(range.upperBound, lines.count))
        lines.removeSubrange((lowerBound - 1)...(upperBound - 1))

        let joined = lines.joined(separator: "\n")
        let collapsed = joined.replacingOccurrences(
            of: #"\n{3,}"#,
            with: "\n\n",
            options: .regularExpression
        )
        return collapsed.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func jumpToPaginationPage(_ page: BackendScreenplayPaginationPage) {
        liveDraftBridge.jumpToLine(page.startLine)
        liveDraftBridge.highlightLineRange(startLine: page.startLine, endLine: page.endLine)
    }

    @MainActor
    private func studioExportDependencies() -> ScreenplayStudioExportSupport.Dependencies {
        ScreenplayStudioExportSupport.Dependencies(
            draft: vm.fountainDraft,
            projectTitle: vm.selectedProject?.title,
            navigatorCurrentURL: navigatorCurrentURL,
            isRunningUITests: IOThemRuntime.isRunningUITests,
            refreshFormatLint: { source in
                await vm.refreshFormatLint(source: source)
            },
            exportFromBackend: { format in
                try await vm.exportArtifact(format: format)
            },
            setInfo: { message in
                vm.infoText = message
            },
            setError: { message in
                vm.errorText = message
            },
            noteSavedDirectory: { directoryURL in
                navigatorCurrentURL = directoryURL
                refreshNavigatorEntries()
            },
            openURL: { url in
                openURL(url)
            }
        )
    }

    @MainActor
    private func exportCurrentDraft(format: String) async {
        await ScreenplayStudioExportSupport.exportCurrentDraft(
            format: format,
            deps: studioExportDependencies()
        )
    }

    @MainActor
    private func openInGoogleDocs(draft: String) {
        var deps = studioExportDependencies()
        deps.draft = draft
        ScreenplayStudioExportSupport.openInGoogleDocs(deps: deps)
    }


    @MainActor
    private func restoreStudioWorkspaceAfterProjectHydration() async {
        let restoredProjectID = vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let restoredHistoryKey = activeStudioAskNoteHistoryKey
        guard ScreenplayStudioPostHydrationRestorePolicy.canRestoreWorkspace(
            selectedProjectID: vm.selectedProjectID,
            loadedProjectID: vm.selectedProject?.id,
            loadedDraftProjectID: vm.debugLoadedDraftProjectID,
            isLoading: vm.isLoading
        ) else {
            return
        }
        vm.replaceDraftFromVoiceBridgeIfNeeded(
            liveDraftBridge.draftText,
            draftOriginProjectID: liveDraftBridge.draftOriginProjectIDSnapshot()
        )
        bootstrapNavigatorIfNeeded()
        await restoreStudioAskNoteHistory(for: restoredHistoryKey)
        guard vm.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == restoredProjectID,
              activeStudioAskNoteHistoryKey == restoredHistoryKey,
              ScreenplayStudioPostHydrationRestorePolicy.canRestoreWorkspace(
                  selectedProjectID: vm.selectedProjectID,
                  loadedProjectID: vm.selectedProject?.id,
                  loadedDraftProjectID: vm.debugLoadedDraftProjectID,
                  isLoading: vm.isLoading
              ) else {
            return
        }
        restoreInspectorWorkspaceState()
        vm.refreshLiveDraftBridgeContext()
        restoreFeatureWorkflowContextAfterProjectHydration()
    }

    @MainActor
    private func restoreFeatureWorkflowContextAfterProjectHydration() {
        let projectID = liveDraftBridge.committedWriteProjectIDSnapshot()
        let versionID = liveDraftBridge.committedWriteVersionIDSnapshot()
        guard ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext(
            current: liveDraftBridge.latestFeatureWorkflowContext,
            projectID: projectID,
            versionID: versionID
        ) else {
            return
        }
        liveDraftBridge.recordFeatureWorkflowContext(
            ScreenplayFeatureWorkflowSessionContext(
                requestID: "studio-restore-\(projectID)",
                projectID: projectID,
                versionID: versionID,
                submittedPrompt: "Restored project continuity",
                snapshot: featureWorkflowSnapshot,
                featureSpine: liveDraftBridge.featureSpine,
                pageCount: vm.estimatedFeaturePageCount,
                targetPages: ScreenplayFeatureProgressionGuide.defaultTargetPages
            )
        )
    }

    @MainActor
    @discardableResult
    private func selectPreferredProjectIfNeeded(_ projectID: String) async -> Bool {
        guard !IOThemRuntime.isRunningTests else { return false }
        let clean = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        guard vm.selectedProjectID != clean else { return false }
        await vm.selectProject(clean)
        return true
    }

    private func relativeTimestamp(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func dateFromTimestamp(_ value: TimeInterval?) -> Date? {
        guard let value, value > 0 else { return nil }
        let seconds = value > 10_000_000_000 ? (value / 1000.0) : value
        return Date(timeIntervalSince1970: seconds)
    }
}
