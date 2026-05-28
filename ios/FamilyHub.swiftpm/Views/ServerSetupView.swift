import SwiftUI

struct ServerSetupView: View {
    @EnvironmentObject var app: AppState
    @State private var url: String = ""
    @State private var connecting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server-Adresse") {
                    TextField("http://192.168.1.100:3001", text: $url)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }
                Section {
                    Button(action: connect) {
                        if connecting {
                            ProgressView()
                        } else {
                            Text("Verbinden").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty || connecting)
                }
                Section {
                    Text("Gib die Adresse deines FamilyHub-Servers im Heimnetz ein – z.B. http://192.168.1.100:3001. Danach muss das Gerät im Admin freigeschaltet werden.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("FamilyHub")
            .onAppear { if url.isEmpty { url = app.baseURL } }
        }
    }

    private func connect() {
        connecting = true
        app.setBaseURL(url)
        Task {
            await app.checkStatus()
            await app.loadConfig()
            connecting = false
        }
    }
}
