import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var baseURL: String
    @Published var deviceId: String
    @Published var deviceName: String
    @Published var deviceStatus: String        // unknown | pending | approved | rejected
    @Published var rawConfig: JSONValue
    @Published var isCheckingStatus: Bool = true
    @Published var lastError: String?

    private let defaults = UserDefaults.standard

    init() {
        baseURL = defaults.string(forKey: "baseURL") ?? ""
        if let id = defaults.string(forKey: "deviceId") {
            deviceId = id
        } else {
            let id = UUID().uuidString
            defaults.set(id, forKey: "deviceId")
            deviceId = id
        }
        deviceName = defaults.string(forKey: "deviceName") ?? ""
        deviceStatus = defaults.string(forKey: "deviceStatus") ?? "unknown"
        if let data = defaults.data(forKey: "configCache"),
           let cfg = try? JSONDecoder().decode(JSONValue.self, from: data) {
            rawConfig = cfg
        } else {
            rawConfig = .object([:])
        }
        // Trust a cached approval so the app is usable offline / on cold start.
        isCheckingStatus = (deviceStatus != "approved")
    }

    var isConfigured: Bool { !baseURL.isEmpty }
    var isApproved: Bool { deviceStatus == "approved" }

    func setBaseURL(_ url: String) {
        let trimmed = url.trimmingCharacters(in: .whitespaces).trimmedTrailingSlash()
        baseURL = trimmed
        defaults.set(trimmed, forKey: "baseURL")
    }

    func resetServer() {
        setBaseURL("")
        deviceStatus = "unknown"
        defaults.set("unknown", forKey: "deviceStatus")
        isCheckingStatus = false
    }

    // MARK: - Networking

    enum APIError: Error, LocalizedError {
        case badURL, http(Int)
        var errorDescription: String? {
            switch self {
            case .badURL: return "Ungültige Server-Adresse"
            case .http(let c): return "Serverfehler (\(c))"
            }
        }
    }

    private func makeRequest(_ path: String, method: String, body: Data?) throws -> URLRequest {
        guard let url = URL(string: baseURL + path) else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        if let body = body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        req.timeoutInterval = 15
        return req
    }

    @discardableResult
    func send(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        let req = try makeRequest(path, method: method, body: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw APIError.http(http.statusCode)
        }
        return data
    }

    func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try JSONDecoder().decode(T.self, from: await send(path))
    }

    @discardableResult
    func post<B: Encodable, T: Decodable>(_ path: String, body: B, as type: T.Type) async throws -> T {
        let data = try await send(path, method: "POST", body: JSONEncoder().encode(body))
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Auth

    func checkStatus() async {
        guard isConfigured else { isCheckingStatus = false; return }
        do {
            let resp = try await get("/api/auth/status", as: DeviceStatusResponse.self)
            if let s = resp.status {
                deviceStatus = s
                defaults.set(s, forKey: "deviceStatus")
            }
            if let n = resp.name { deviceName = n }
        } catch {
            // Offline / unreachable: keep the cached status.
        }
        isCheckingStatus = false
    }

    func register(name: String) async {
        struct Body: Encodable { let id: String; let name: String }
        do {
            _ = try await send("/api/auth/register", method: "POST",
                               body: JSONEncoder().encode(Body(id: deviceId, name: name)))
            deviceName = name
            defaults.set(name, forKey: "deviceName")
            await checkStatus()
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Config

    func loadConfig() async {
        guard isConfigured else { return }
        do {
            let data = try await send("/api/config")
            rawConfig = try JSONDecoder().decode(JSONValue.self, from: data)
            persistConfigCache()
        } catch {
            // keep cached config
        }
    }

    /// POST the full config back so unmodeled keys survive the round-trip.
    func saveConfig() async {
        guard isConfigured else { return }
        do {
            _ = try await send("/api/config", method: "POST",
                               body: JSONEncoder().encode(rawConfig))
            persistConfigCache()
        } catch {
            lastError = "Speichern fehlgeschlagen"
        }
    }

    private func persistConfigCache() {
        if let data = try? JSONEncoder().encode(rawConfig) {
            defaults.set(data, forKey: "configCache")
        }
    }

    // MARK: - Typed config accessors

    var chores: ChoresConfig? { rawConfig.decode("chores", as: ChoresConfig.self) }
    var rewards: RewardConfig? { rawConfig.decode("rewards", as: RewardConfig.self) }
    var bathroom: BathroomConfig? { rawConfig.decode("bathroom", as: BathroomConfig.self) }
    var household: HouseholdConfig? { rawConfig.decode("household", as: HouseholdConfig.self) }
    var googleConfig: GoogleConfig? { rawConfig.decode("google", as: GoogleConfig.self) }

    var adminPin: String {
        if case .string(let s)? = rawConfig["adminPin"] { return s }
        return "1234"
    }

    func cacheRewards(_ r: RewardConfig) {
        if let v = JSONValue.from(r) {
            rawConfig["rewards"] = v
            persistConfigCache()
        }
    }

    func saveBathroom(_ b: BathroomConfig) async {
        if let v = JSONValue.from(b) { rawConfig["bathroom"] = v }
        await saveConfig()
    }

    func saveHousehold(_ h: HouseholdConfig) async {
        if let v = JSONValue.from(h) { rawConfig["household"] = v }
        await saveConfig()
    }

    // MARK: - Push (APNs)

    func registerAPNs(_ token: String) async {
        struct Body: Encodable { let token: String }
        do {
            _ = try await send("/api/push/apns-subscribe", method: "POST",
                               body: JSONEncoder().encode(Body(token: token)))
        } catch {
            lastError = "Push-Registrierung fehlgeschlagen"
        }
    }

    func unregisterAPNs() async {
        do { _ = try await send("/api/push/apns-unsubscribe", method: "POST") } catch { }
    }

    func sendTestPush() async {
        do { _ = try await send("/api/push/apns-test", method: "POST") } catch { }
    }
}

extension String {
    func trimmedTrailingSlash() -> String {
        var s = self
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }
}
