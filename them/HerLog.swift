import os.log

enum HerLog {
    static let subsystem = "io.them.them"
    static let talk = Logger(subsystem: subsystem, category: "talk")
    static let audio = Logger(subsystem: subsystem, category: "audio")
    static let mic = Logger(subsystem: subsystem, category: "mic")
    static let ui = Logger(subsystem: subsystem, category: "ui")
    static let sync = Logger(subsystem: subsystem, category: "sync")
    static let network = Logger(subsystem: subsystem, category: "network")
    static let realtime = Logger(subsystem: subsystem, category: "realtime")
}
