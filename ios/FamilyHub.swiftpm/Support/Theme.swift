import SwiftUI

extension Color {
    /// Parse colors coming from the backend config. Accepts `#rrggbb`,
    /// `#rgb`, and a few named CSS colors used by the web app.
    init(webColor raw: String?) {
        let fallback = Color.blue
        guard let raw = raw?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else {
            self = fallback
            return
        }

        let named: [String: Color] = [
            "blue": .blue, "red": .red, "green": .green, "pink": .pink,
            "purple": .purple, "orange": .orange, "yellow": .yellow,
            "teal": .teal, "cyan": .cyan, "indigo": .indigo, "gray": .gray,
            "grey": .gray, "black": .black, "white": .white
        ]
        if let c = named[raw.lowercased()] {
            self = c
            return
        }

        var hex = raw
        if hex.hasPrefix("#") { hex.removeFirst() }
        if hex.count == 3 {
            hex = hex.map { "\($0)\($0)" }.joined()
        }
        guard hex.count == 6, let int = UInt64(hex, radix: 16) else {
            self = fallback
            return
        }
        let r = Double((int >> 16) & 0xff) / 255.0
        let g = Double((int >> 8) & 0xff) / 255.0
        let b = Double(int & 0xff) / 255.0
        self = Color(red: r, green: g, blue: b)
    }
}
