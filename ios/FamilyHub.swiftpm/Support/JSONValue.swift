import Foundation

/// A type-erased JSON value. The full server config is kept as a `JSONValue`
/// tree so that writing back a partial edit (e.g. bathroom items) never drops
/// unknown keys the iOS app doesn't model (notion, screensaver, weather, …).
enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else if let o = try? c.decode([String: JSONValue].self) {
            self = .object(o)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .object(let o): try c.encode(o)
        case .array(let a): try c.encode(a)
        case .null: try c.encodeNil()
        }
    }

    // MARK: Accessors

    subscript(_ key: String) -> JSONValue? {
        get {
            if case .object(let o) = self { return o[key] }
            return nil
        }
        set {
            var o: [String: JSONValue]
            if case .object(let existing) = self { o = existing } else { o = [:] }
            o[key] = newValue
            self = .object(o)
        }
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let o) = self { return o }
        return nil
    }
}

extension JSONValue {
    /// Decode a subtree at `key` into a typed `Decodable`.
    func decode<T: Decodable>(_ key: String, as type: T.Type) -> T? {
        guard let sub = self[key] else { return nil }
        guard let data = try? JSONEncoder().encode(sub) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    /// Build a `JSONValue` from any `Encodable`.
    static func from<T: Encodable>(_ value: T) -> JSONValue? {
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }
}
