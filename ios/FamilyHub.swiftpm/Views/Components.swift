import SwiftUI

/// Wraps a tab in a NavigationStack with a title and a bell button that opens
/// the push-notification settings sheet.
struct TabScaffold<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content
    @State private var showPush = false

    var body: some View {
        NavigationStack {
            content()
                .navigationTitle(title)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { showPush = true } label: {
                            Image(systemName: "bell")
                        }
                    }
                }
                .sheet(isPresented: $showPush) { PushSettingsView() }
        }
    }
}

struct Avatar: View {
    let name: String
    let color: Color
    var size: CGFloat = 40

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .overlay(
                Text(String(name.prefix(2)).uppercased())
                    .font(.system(size: size * 0.4, weight: .bold))
                    .foregroundStyle(.white)
            )
    }
}

struct ColorDot: View {
    let color: Color
    var size: CGFloat = 12
    var body: some View {
        Circle().fill(color).frame(width: size, height: size)
    }
}

/// Lightweight inline error banner.
struct InlineError: View {
    let message: String
    var body: some View {
        Text(message)
            .font(.footnote)
            .foregroundStyle(.white)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

func relativeTime(_ msTimestamp: Double) -> String {
    let date = Date(timeIntervalSince1970: msTimestamp / 1000)
    let f = RelativeDateTimeFormatter()
    f.locale = Locale(identifier: "de_DE")
    f.unitsStyle = .short
    return f.localizedString(for: date, relativeTo: Date())
}
