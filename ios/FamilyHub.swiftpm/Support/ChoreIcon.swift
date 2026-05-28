import Foundation

/// Maps the web app's icon keys to SF Symbols.
enum ChoreIcon {
    static func symbol(_ key: String) -> String {
        switch key {
        case "trash": return "trash"
        case "dishes", "plate": return "fork.knife"
        case "dog": return "dog"
        case "cat": return "cat"
        case "bed": return "bed.double"
        case "laundry": return "tshirt"
        case "clean": return "sparkles"
        case "sweep": return "paintbrush"
        case "recycle": return "arrow.3.trianglepath"
        case "plants": return "leaf"
        case "shopping": return "cart"
        case "screen": return "desktopcomputer"
        case "play": return "gamecontroller"
        case "homework": return "book"
        default: return "sparkles"
        }
    }

    static let allKeys = [
        "trash", "dishes", "dog", "cat", "bed", "laundry", "clean", "sweep",
        "recycle", "plants", "shopping", "plate", "screen", "play", "homework"
    ]
}
