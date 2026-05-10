import SwiftUI

public enum IOThemColors {
    public enum Background {
        public static let peachTop = Color(red: 0.930, green: 0.700, blue: 0.676)
        public static let peachMid = Color(red: 0.922, green: 0.689, blue: 0.665)
        public static let peachBottom = Color(red: 0.914, green: 0.677, blue: 0.653)
    }

    public enum Shell {
        public static let panel = Color(red: 0.976, green: 0.926, blue: 0.900)
        public static let panelSoft = Color(red: 0.984, green: 0.948, blue: 0.929)
        public static let stroke = Color(red: 0.824, green: 0.650, blue: 0.622)
    }

    public enum Paper {
        public static let surface = Color(red: 0.991, green: 0.980, blue: 0.964)
        public static let line = Color(red: 0.817, green: 0.759, blue: 0.707)
        public static let shadow = Color(red: 0.470, green: 0.278, blue: 0.250).opacity(0.10)
    }

    public enum Accent {
        public static let studio = Color(red: 0.588, green: 0.312, blue: 0.292)
        public static let studioSoft = Color(red: 0.921, green: 0.838, blue: 0.809)
        public static let activeFill = Color(red: 0.952, green: 0.862, blue: 0.832)
        public static let activeStroke = Color(red: 0.640, green: 0.366, blue: 0.343)
    }

    public enum Orb {
        public static let bgTop = Color(red: 0.980, green: 0.800, blue: 0.782)
        public static let bgMid = Color(red: 0.966, green: 0.742, blue: 0.724)
        public static let bgBottom = Color(red: 0.948, green: 0.692, blue: 0.676)
        public static let stroke = Color(red: 1.0, green: 0.955, blue: 0.930)
    }

    public enum Text {
        public static let primary = Color(red: 0.31, green: 0.145, blue: 0.155)
    }

    public enum Screenplay {
        public static let pageBackground = Color.black
        public static let paper = Color(white: 0.06)
        public static let text = Color(white: 0.92)
        public static let hidden = Color.clear
        public static let cursor = Color(red: 1, green: 0.6, blue: 0.2)
    }
}
