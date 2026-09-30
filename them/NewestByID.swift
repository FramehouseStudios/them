import Foundation

/// Memories are keyed by id, and one id could arrive twice (a character bible
/// in two scripts); `Dictionary(uniqueKeysWithValues:)` trapped on it and the
/// app crashed refreshing Memories (twice on 2026-09-30). The newest copy wins.
nonisolated enum NewestByID {
    static func map<T>(_ items: [T], id: KeyPath<T, String>, date: KeyPath<T, Date>) -> [String: T] {
        Dictionary(items.map { ($0[keyPath: id], $0) }) { first, second in
            second[keyPath: date] > first[keyPath: date] ? second : first
        }
    }

    /// The list in its given order, one row per id (the newest copy).
    static func uniqued<T>(_ items: [T], id: KeyPath<T, String>, date: KeyPath<T, Date>) -> [T] {
        let newest = map(items, id: id, date: date)
        var seen = Set<String>()
        return items.compactMap { item in
            seen.insert(item[keyPath: id]).inserted ? newest[item[keyPath: id]] : nil
        }
    }
}
