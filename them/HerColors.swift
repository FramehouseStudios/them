import SwiftUI

extension Color {
    // Background gradient tones (pearl peach, warmer pink-peach)
    static let herPeachTop = Color(red: 0.930, green: 0.700, blue: 0.676)
    static let herPeachMid = Color(red: 0.922, green: 0.689, blue: 0.665)
    static let herPeachBottom = Color(red: 0.914, green: 0.677, blue: 0.653)

    // Studio shell surfaces
    static let herShellPanel = Color(red: 0.976, green: 0.926, blue: 0.900)
    static let herShellPanelSoft = Color(red: 0.984, green: 0.948, blue: 0.929)
    static let herShellStroke = Color(red: 0.824, green: 0.650, blue: 0.622)

    // Neutral paper plane for the screenplay page
    static let herPaper = Color(red: 0.991, green: 0.980, blue: 0.964)
    static let herPaperLine = Color(red: 0.817, green: 0.759, blue: 0.707)
    static let herPaperShadow = Color(red: 0.470, green: 0.278, blue: 0.250).opacity(0.10)

    // Active and interactive states
    static let herStudioAccent = Color(red: 0.588, green: 0.312, blue: 0.292)
    static let herStudioAccentSoft = Color(red: 0.921, green: 0.838, blue: 0.809)
    static let herStudioActiveFill = Color(red: 0.952, green: 0.862, blue: 0.832)
    static let herStudioActiveStroke = Color(red: 0.640, green: 0.366, blue: 0.343)

    // Orb fill (kept close to the background so it reads flatter and brighter)
    static let herOrbBgTop = Color(red: 0.980, green: 0.800, blue: 0.782)
    static let herOrbBgMid = Color(red: 0.966, green: 0.742, blue: 0.724)
    static let herOrbBgBottom = Color(red: 0.948, green: 0.692, blue: 0.676)

    // Orb stroke
    static let herOrbStroke = Color(red: 1.0, green: 0.955, blue: 0.930)

    // Text (warm ivory, not white)
    static let herText = Color(red: 0.31, green: 0.145, blue: 0.155)
}
