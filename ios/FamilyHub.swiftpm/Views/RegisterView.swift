import SwiftUI

struct RegisterView: View {
    @EnvironmentObject var app: AppState
    @State private var name = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                Image(systemName: iconName)
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)
                content
                Spacer()
            }
            .padding()
            .navigationTitle("Gerät freischalten")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Server ändern") { app.resetServer() }
                }
            }
        }
    }

    private var iconName: String {
        switch app.deviceStatus {
        case "pending": return "clock.badge.questionmark"
        case "rejected": return "xmark.shield"
        default: return "iphone.badge.play"
        }
    }

    @ViewBuilder
    private var content: some View {
        switch app.deviceStatus {
        case "pending":
            VStack(spacing: 12) {
                Text("Warte auf Freigabe")
                    .font(.title2.bold())
                Text("Dieses Gerät wurde registriert. Bitte im Admin-Bereich des Dashboards freischalten.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                Button("Status prüfen") { Task { await app.checkStatus() } }
                    .buttonStyle(.borderedProminent)
            }
        case "rejected":
            VStack(spacing: 12) {
                Text("Zugriff abgelehnt")
                    .font(.title2.bold())
                Text("Dieses Gerät wurde abgelehnt. Wende dich an den Administrator.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
        default:
            VStack(spacing: 16) {
                Text("Dieses Gerät anmelden")
                    .font(.title2.bold())
                TextField("Gerätename (z.B. iPhone Mama)", text: $name)
                    .textFieldStyle(.roundedBorder)
                Button(action: registerDevice) {
                    if busy { ProgressView() } else { Text("Anmelden").frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || busy)
            }
        }
    }

    private func registerDevice() {
        busy = true
        Task {
            await app.register(name: name.trimmingCharacters(in: .whitespaces))
            busy = false
        }
    }
}
