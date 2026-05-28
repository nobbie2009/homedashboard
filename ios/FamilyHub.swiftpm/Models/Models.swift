import Foundation

// MARK: - Auth

struct DeviceStatusResponse: Codable {
    let status: String?
    let name: String?
}

// MARK: - Chores / Rewards

struct Kid: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var color: String
    var photo: String?
}

struct Chore: Codable, Identifiable, Equatable {
    let id: String
    var label: String
    var description: String?
    var icon: String
    var assignedTo: String?
    var rotation: String          // "daily" | "weekly" | "none"
    var difficulty: Int?          // 1..3
}

struct RotationSettings: Codable, Equatable {
    var interval: String          // "weekly" | "daily"
    var lastRotation: Double?
}

struct ChoresConfig: Codable, Equatable {
    var kids: [Kid]
    var tasks: [Chore]
    var settings: RotationSettings?
}

struct RewardConfig: Codable, Equatable {
    var mode: String              // "individual" | "shared"
    var targetStars: Int
    var currentReward: String
    var rewardImage: String?
    var kidStars: [String: Int]?
    var sharedStars: Int?
}

struct CompletionEntry: Codable, Identifiable, Equatable {
    let id: String
    let taskId: String?
    let taskLabel: String?
    let kidId: String?
    let kidName: String?
    let stars: Int
    let timestamp: Double
}

struct RewardsHistoryResponse: Codable {
    let completions: [CompletionEntry]?
}

struct RewardsMutationResponse: Codable {
    let rewards: RewardConfig?
    let error: String?
}

// MARK: - Bathroom

struct BathroomSchedule: Codable, Equatable {
    var morningStart: String
    var morningEnd: String
    var eveningStart: String
    var eveningEnd: String
}

struct BathroomItem: Codable, Identifiable, Equatable {
    let id: String
    var label: String
    var icon: String
    var assignedTo: String
    var timeSlot: String          // "morning" | "evening" | "both"
    var linkedChoreId: String?
}

struct BathroomConfig: Codable, Equatable {
    var items: [BathroomItem]
    var schedule: BathroomSchedule
}

// MARK: - Household

struct HouseholdMember: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var color: String
    var photo: String?
}

struct HouseholdRecurrence: Codable, Equatable {
    var mode: String              // "relative" | "absolute"
    var intervalValue: Int
    var intervalUnit: String      // "days" | "weeks" | "months"
    var startDate: String?
}

struct HouseholdTask: Codable, Identifiable, Equatable {
    let id: String
    var label: String
    var icon: String
    var description: String?
    var assignedTo: String?
    var recurrence: HouseholdRecurrence
    var nextDueAt: Double
    var lastCompletedAt: Double?
    var lastCompletedBy: String?
}

struct HouseholdConfig: Codable, Equatable {
    var members: [HouseholdMember]
    var tasks: [HouseholdTask]
}

struct HouseholdServerState: Codable {
    let tasks: [HouseholdTask]?
    let members: [HouseholdMember]?
    let now: Double?
}

struct HouseholdCompleteResponse: Codable {
    let completedAt: Double?
    let error: String?
}

// MARK: - Calendar

struct GoogleConfig: Codable, Equatable {
    var selectedCalendars: [String]?
    var calendarColors: [String: String]?
}

struct GoogleDateField: Codable {
    let dateTime: String?
    let date: String?
}

struct GoogleRawEvent: Codable {
    let id: String?
    let summary: String?
    let description: String?
    let location: String?
    let start: GoogleDateField
    let end: GoogleDateField
    let calendarId: String?
}

struct CalendarEvent: Identifiable {
    let id: String
    let title: String
    let start: Date
    let end: Date
    let isAllDay: Bool
    let calendarId: String?
    let location: String?
    let color: String?

    static func parse(_ raw: GoogleRawEvent) -> CalendarEvent? {
        let allDay = (raw.start.dateTime == nil && raw.start.date != nil)
        guard let start = Self.date(from: raw.start, allDay: allDay),
              let end = Self.date(from: raw.end, allDay: allDay) else { return nil }
        return CalendarEvent(
            id: raw.id ?? UUID().uuidString,
            title: raw.summary ?? "Kein Titel",
            start: start,
            end: end,
            isAllDay: allDay,
            calendarId: raw.calendarId,
            location: raw.location,
            color: nil
        )
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoNoFrac = ISO8601DateFormatter()
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func date(from field: GoogleDateField, allDay: Bool) -> Date? {
        if allDay, let d = field.date {
            return dayFormatter.date(from: d)
        }
        if let dt = field.dateTime {
            return iso.date(from: dt) ?? isoNoFrac.date(from: dt)
        }
        return nil
    }
}
