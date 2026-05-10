import SwiftUI
import ScreenplayStudio

// Deprecated compatibility shim. New UI should use IOThemColors directly.
extension Color {
    static var herPeachTop: Color { IOThemColors.Background.peachTop }
    static var herPeachMid: Color { IOThemColors.Background.peachMid }
    static var herPeachBottom: Color { IOThemColors.Background.peachBottom }

    static var herShellPanel: Color { IOThemColors.Shell.panel }
    static var herShellPanelSoft: Color { IOThemColors.Shell.panelSoft }
    static var herShellStroke: Color { IOThemColors.Shell.stroke }

    static var herPaper: Color { IOThemColors.Paper.surface }
    static var herPaperLine: Color { IOThemColors.Paper.line }
    static var herPaperShadow: Color { IOThemColors.Paper.shadow }

    static var herStudioAccent: Color { IOThemColors.Accent.studio }
    static var herStudioAccentSoft: Color { IOThemColors.Accent.studioSoft }
    static var herStudioActiveFill: Color { IOThemColors.Accent.activeFill }
    static var herStudioActiveStroke: Color { IOThemColors.Accent.activeStroke }

    static var herOrbBgTop: Color { IOThemColors.Orb.bgTop }
    static var herOrbBgMid: Color { IOThemColors.Orb.bgMid }
    static var herOrbBgBottom: Color { IOThemColors.Orb.bgBottom }

    static var herOrbStroke: Color { IOThemColors.Orb.stroke }

    static var herText: Color { IOThemColors.Text.primary }
}
