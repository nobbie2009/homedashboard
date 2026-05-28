import SwiftUI

struct ContentView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        Group {
            if !app.isConfigured {
                ServerSetupView()
            } else if app.isCheckingStatus {
                VStack(spacing: 16) {
                    ProgressView()
                    Text("Verbinde mit \(app.baseURL)…")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } else if app.isApproved {
                MainTabView()
            } else {
                RegisterView()
            }
        }
    }
}
