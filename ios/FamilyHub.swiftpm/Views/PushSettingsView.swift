import SwiftUI

struct PushSettingsView: View {
    @EnvironmentObject var app: AppState
    @EnvironmentObject var push: PushManager
    @Environment(\.dismiss) private var dismiss
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Benachrichtigungen") {
                    if push.denied {
                        Text("Benachrichtigungen sind in den iOS-Einstellungen blockiert. Bitte dort für FamilyHub erlauben.")
                            .font(.footnote).foregroundStyle(.secondary)
                    } else if push.subscribed {
                        Label("Aktiviert auf diesem Gerät", systemImage: "bell.fill")
                            .foregroundStyle(.green)
                        Button("Test senden") { Task { await app.sendTestPush() } }
                        Button("Deaktivieren", role: .destructive) {
                            Task { await push.disable() }
                        }
                    } else {
                        Text("Erhalte Push-Benachrichtigungen – z.B. wenn es an der Tür klingelt.")
                            .font(.footnote).foregroundStyle(.secondary)
                        Button {
                            working = true
                            Task { await push.enable(); working = false }
                        } label: {
                            if working { ProgressView() } else { Text("Aktivieren") }
                        }
                        .disabled(working)
                    }
                }

                Section("Gerät") {
                    LabeledContent("Name", value: app.deviceName.isEmpty ? "—" : app.deviceName)
                    LabeledContent("Server", value: app.baseURL)
                    Button("Daten neu laden") { Task { await app.loadConfig() } }
                    Button("Server ändern", role: .destructive) {
                        app.resetServer(); dismiss()
                    }
                }
            }
            .navigationTitle("Einstellungen")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } }
            }
            .onAppear { push.refreshStatus() }
        }
    }
}
