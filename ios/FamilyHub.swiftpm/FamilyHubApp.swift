import SwiftUI

@main
struct FamilyHubApp: App {
    #if canImport(UIKit)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif

    @StateObject private var app = AppState()
    @StateObject private var push = PushManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(app)
                .environmentObject(push)
                .task {
                    push.register = { token in await app.registerAPNs(token) }
                    push.unregister = { await app.unregisterAPNs() }
                    push.refreshStatus()
                    await app.checkStatus()
                    await app.loadConfig()
                }
        }
    }
}
