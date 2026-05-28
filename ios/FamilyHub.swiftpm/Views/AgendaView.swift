import SwiftUI

struct AgendaView: View {
    @EnvironmentObject var app: AppState
    @State private var events: [CalendarEvent] = []
    @State private var loading = true
    @State private var error: String?

    private var hasCalendars: Bool { !(app.googleConfig?.selectedCalendars ?? []).isEmpty }

    var body: some View {
        TabScaffold(title: "Kalender") {
            Group {
                if !hasCalendars {
                    notice("Keine Kalender ausgewählt. Bitte im Admin einen Google-Kalender verbinden.")
                } else if let error {
                    notice(error)
                } else if loading && events.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if grouped.isEmpty {
                    notice("Keine anstehenden Termine.")
                } else {
                    List {
                        ForEach(grouped, id: \.0) { day, dayEvents in
                            Section(dayLabel(day)) {
                                ForEach(dayEvents) { event in eventRow(event) }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private func notice(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func eventRow(_ event: CalendarEvent) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing) {
                if event.isAllDay {
                    Text("ganztägig").font(.caption).foregroundStyle(.secondary)
                } else {
                    Text(timeString(event.start)).font(.subheadline.bold()).monospacedDigit()
                    Text(timeString(event.end)).font(.caption).foregroundStyle(.secondary).monospacedDigit()
                }
            }
            .frame(width: 64, alignment: .trailing)

            Rectangle().fill(Color(webColor: event.color)).frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text(event.title).bold()
                if let loc = event.location, !loc.isEmpty {
                    Label(loc, systemImage: "mappin.and.ellipse")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer()
        }
    }

    // MARK: Grouping

    private var grouped: [(Date, [CalendarEvent])] {
        let now = Date()
        var map: [Date: [CalendarEvent]] = [:]
        for e in events {
            if !e.isAllDay && e.end < now { continue }
            let key = dayStart(e)
            map[key, default: []].append(e)
        }
        return map
            .map { ($0.key, $0.value.sorted { $0.start < $1.start }) }
            .sorted { $0.0 < $1.0 }
    }

    private func dayStart(_ e: CalendarEvent) -> Date {
        if e.isAllDay {
            var utc = Calendar(identifier: .gregorian)
            utc.timeZone = TimeZone(identifier: "UTC")!
            let c = utc.dateComponents([.year, .month, .day], from: e.start)
            return Calendar.current.date(from: c) ?? e.start
        }
        return Calendar.current.startOfDay(for: e.start)
    }

    private func dayLabel(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "Heute" }
        if cal.isDateInTomorrow(date) { return "Morgen" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.dateFormat = "EEEE, d. MMM"
        return f.string(from: date)
    }

    private func timeString(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    // MARK: Load

    private func load() async {
        let cals = app.googleConfig?.selectedCalendars ?? []
        guard !cals.isEmpty else { events = []; loading = false; return }
        loading = true
        struct Body: Encodable { let calendarIds: [String]; let timeMin: String; let timeMax: String }
        let today0 = Calendar.current.startOfDay(for: Date())
        let iso = ISO8601DateFormatter()
        let body = Body(
            calendarIds: cals,
            timeMin: iso.string(from: today0),
            timeMax: iso.string(from: today0.addingTimeInterval(21 * 86400))
        )
        do {
            let data = try await app.send("/api/google/events", method: "POST", body: JSONEncoder().encode(body))
            let raw = try JSONDecoder().decode([GoogleRawEvent].self, from: data)
            let colors = app.googleConfig?.calendarColors ?? [:]
            events = raw.compactMap { rawEvent -> CalendarEvent? in
                guard var ev = CalendarEvent.parse(rawEvent) else { return nil }
                if let calId = ev.calendarId, let hex = colors[calId] {
                    ev = CalendarEvent(id: ev.id, title: ev.title, start: ev.start, end: ev.end,
                                       isAllDay: ev.isAllDay, calendarId: ev.calendarId,
                                       location: ev.location, color: hex)
                }
                return ev
            }
            error = nil
        } catch {
            self.error = "Termine konnten nicht geladen werden."
        }
        loading = false
    }
}
