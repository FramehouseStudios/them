import SwiftUI

/// The app's look: the original peach by default, or dark when the writer
/// picks it (founder, 2026-10-01). Stored in UserDefaults under `storageKey`;
/// the app root rebuilds its views when it changes, so every token below reads
/// the current value.
public enum IOThemAppearance: String, CaseIterable, Sendable {
    case dark
    case peach

    public static let storageKey = "io.them.appearance"

    /// Read on every color token, so it is cached rather than read from
    /// UserDefaults each time; `apply` updates it when the writer switches.
    nonisolated(unsafe) private static var cached: IOThemAppearance?

    public static var current: IOThemAppearance {
        if let cached { return cached }
        let stored = IOThemAppearance(rawValue: UserDefaults.standard.string(forKey: storageKey) ?? "") ?? .peach
        cached = stored
        return stored
    }

    public static func apply(_ appearance: IOThemAppearance) {
        cached = appearance
    }

    public var title: String {
        switch self {
        case .dark: return "Dark"
        case .peach: return "Peach"
        }
    }

    public var colorScheme: ColorScheme { self == .dark ? .dark : .light }
}

public enum IOThemColors {
    private static var isDark: Bool { IOThemAppearance.current == .dark }

    public enum Background {
        public static var peachTop: Color { isDark ? Color(red: 0.067, green: 0.067, blue: 0.075) : Color(red: 0.930, green: 0.700, blue: 0.676) }
        public static var peachMid: Color { isDark ? Color(red: 0.063, green: 0.063, blue: 0.071) : Color(red: 0.922, green: 0.689, blue: 0.665) }
        public static var peachBottom: Color { isDark ? Color(red: 0.055, green: 0.055, blue: 0.063) : Color(red: 0.914, green: 0.677, blue: 0.653) }
    }

    public enum Shell {
        public static var panel: Color { isDark ? Color(red: 0.106, green: 0.106, blue: 0.118) : Color(red: 0.976, green: 0.926, blue: 0.900) }
        public static var panelSoft: Color { isDark ? Color(red: 0.094, green: 0.094, blue: 0.106) : Color(red: 0.984, green: 0.948, blue: 0.929) }
        public static var stroke: Color { isDark ? Color(red: 0.173, green: 0.173, blue: 0.188) : Color(red: 0.824, green: 0.650, blue: 0.622) }
    }

    public enum Paper {
        /// Paper-tone panels around the page; they follow the theme.
        public static var surface: Color { isDark ? Color(red: 0.125, green: 0.125, blue: 0.141) : script }
        public static var line: Color { isDark ? Color(red: 0.227, green: 0.227, blue: 0.251) : scriptLine }
        public static var shadow: Color { isDark ? Color.black.opacity(0.35) : scriptShadow }
        /// The screenplay page itself: white paper with black ink in every theme.
        public static let script = Color(red: 0.991, green: 0.980, blue: 0.964)
        public static let scriptLine = Color(red: 0.817, green: 0.759, blue: 0.707)
        public static let scriptShadow = Color(red: 0.470, green: 0.278, blue: 0.250).opacity(0.10)
    }

    public enum Accent {
        public static var studio: Color { isDark ? Color(red: 0.941, green: 0.761, blue: 0.812) : Color(red: 0.588, green: 0.312, blue: 0.292) }
        public static var studioSoft: Color { isDark ? Color(red: 0.227, green: 0.145, blue: 0.188) : Color(red: 0.921, green: 0.838, blue: 0.809) }
        public static var activeFill: Color { isDark ? Color(red: 0.231, green: 0.149, blue: 0.192) : Color(red: 0.952, green: 0.862, blue: 0.832) }
        public static var activeStroke: Color { isDark ? Color(red: 0.941, green: 0.761, blue: 0.812) : Color(red: 0.640, green: 0.366, blue: 0.343) }
    }

    /// Studio's top bar, element bar and panels. Peach keeps the original
    /// light chrome with black text.
    public enum StudioChrome {
        public static var topBar: Color { isDark ? Color(.sRGB, red: 0.086, green: 0.086, blue: 0.094, opacity: 0.94) : Color(.sRGB, red: 0.93, green: 0.925, blue: 0.918, opacity: 0.88) }
        public static var panel: Color { isDark ? Color(.sRGB, red: 0.122, green: 0.122, blue: 0.137, opacity: 0.94) : Color(.sRGB, red: 0.935, green: 0.934, blue: 0.936, opacity: 0.86) }
        public static var panelSoft: Color { isDark ? Color(.sRGB, red: 0.137, green: 0.137, blue: 0.153, opacity: 0.94) : Color(.sRGB, red: 0.955, green: 0.953, blue: 0.950, opacity: 0.90) }
        public static var stroke: Color { isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.09) }
        public static var text: Color { isDark ? Color.white.opacity(0.90) : Color.black.opacity(0.74) }
        public static var secondaryText: Color { isDark ? Color.white.opacity(0.62) : Color.black.opacity(0.52) }
        public static var tertiaryText: Color { isDark ? Color.white.opacity(0.42) : Color.black.opacity(0.34) }
        public static var activeChip: Color { isDark ? Color.white.opacity(0.14) : Color.white.opacity(0.84) }
    }

    /// The orb keeps its original pinks in both themes.
    public enum Orb {
        public static let bgTop = Color(red: 0.980, green: 0.800, blue: 0.782)
        public static let bgMid = Color(red: 0.966, green: 0.742, blue: 0.724)
        public static let bgBottom = Color(red: 0.948, green: 0.692, blue: 0.676)
        public static let stroke = Color(red: 1.0, green: 0.955, blue: 0.930)
    }

    public enum Text {
        public static var primary: Color { isDark ? Color(red: 0.957, green: 0.945, blue: 0.949) : Color(red: 0.31, green: 0.145, blue: 0.155) }
    }

    public enum Screenplay {
        public static let pageBackground = Color.black
        public static let paper = Color(white: 0.06)
        public static let text = Color(white: 0.92)
        public static let hidden = Color.clear
        public static let cursor = Color(red: 1, green: 0.6, blue: 0.2)
    }
}
