import SwiftUI
import UserNotifications
#if canImport(UIKit)
import UIKit
#endif

/// Handles APNs permission + device-token registration. The token is delivered
/// asynchronously through the AppDelegate and forwarded to the backend via the
/// `register` closure wired up in the App.
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    @Published var authorized: Bool = false
    @Published var denied: Bool = false
    @Published var subscribed: Bool = false
    @Published var deviceToken: String?

    /// Set by the app: sends the hex token to the backend.
    var register: ((String) async -> Void)?
    /// Set by the app: tells the backend to drop this device.
    var unregister: (() async -> Void)?

    func refreshStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                self.authorized = settings.authorizationStatus == .authorized
                self.denied = settings.authorizationStatus == .denied
            }
        }
    }

    func enable() async {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        await MainActor.run {
            self.authorized = granted
            self.denied = !granted
        }
        guard granted else { return }
        #if canImport(UIKit)
        await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
        #endif
        // The token arrives via AppDelegate.didRegisterForRemoteNotifications.
    }

    func disable() async {
        await unregister?()
        await MainActor.run { self.subscribed = false }
    }

    func handleToken(_ tokenData: Data) {
        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
        DispatchQueue.main.async { self.deviceToken = hex }
        Task {
            await register?(hex)
            await MainActor.run { self.subscribed = true }
        }
    }

    func handleFailure(_ error: Error) {
        print("[Push] APNs registration failed: \(error.localizedDescription)")
    }
}

extension PushManager: UNUserNotificationCenterDelegate {
    // Show notifications even while the app is in the foreground.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler:
                                @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }
}

#if canImport(UIKit)
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions:
                     [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = PushManager.shared
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.handleToken(deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PushManager.shared.handleFailure(error)
    }
}
#endif
