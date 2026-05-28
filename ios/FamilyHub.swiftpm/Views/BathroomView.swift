import SwiftUI

struct BathroomView: View {
    @EnvironmentObject var app: AppState
    @State private var editing: BathroomItem?
    @State private var schedule = BathroomSchedule(morningStart: "06:00", morningEnd: "10:00",
                                                   eveningStart: "18:00", eveningEnd: "22:00")
    @State private var scheduleFlash = false

    private var config: BathroomConfig {
        app.bathroom ?? BathroomConfig(items: [], schedule: schedule)
    }
    private var kids: [Kid] { app.chores?.kids ?? [] }
    private var chores: [Chore] { app.chores?.tasks ?? [] }

    var body: some View {
        TabScaffold(title: "Bad") {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    scheduleCard
                    slotSection("Morgens", items: items(for: ["morning", "both"]))
                    slotSection("Abends", items: items(for: ["evening", "both"]))
                    if config.items.isEmpty {
                        Text("Noch keine Bad-Aufgaben. Tippe oben auf +.")
                            .italic().foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity).padding()
                    }
                }
                .padding()
            }
            .refreshable { await app.loadConfig() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { editing = newItem() } label: { Image(systemName: "plus") }
                }
            }
        }
        .task {
            await app.loadConfig()
            schedule = config.schedule
        }
        .sheet(item: $editing) { item in
            BathItemEditor(item: item, kids: kids, chores: chores,
                           onSave: saveItem, onDelete: deleteItem)
        }
    }

    private var scheduleCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Zeitfenster", systemImage: "clock").font(.subheadline.bold()).foregroundStyle(.secondary)
            timeRow("Morgen-Start", \.morningStart)
            timeRow("Morgen-Ende", \.morningEnd)
            timeRow("Abend-Start", \.eveningStart)
            timeRow("Abend-Ende", \.eveningEnd)
            HStack {
                Button("Speichern") {
                    Task { await app.saveBathroom(BathroomConfig(items: config.items, schedule: schedule))
                        scheduleFlash = true
                        try? await Task.sleep(nanoseconds: 1_500_000_000); scheduleFlash = false }
                }
                .buttonStyle(.borderedProminent)
                if scheduleFlash { Text("Gespeichert").foregroundStyle(.green).font(.caption) }
            }
        }
        .padding().background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func timeRow(_ label: String, _ keyPath: WritableKeyPath<BathroomSchedule, String>) -> some View {
        DatePicker(label, selection: Binding(
            get: { dateFromHHMM(schedule[keyPath: keyPath]) },
            set: { schedule[keyPath: keyPath] = hhmm(from: $0) }
        ), displayedComponents: .hourAndMinute)
    }

    private func slotSection(_ title: String, items: [BathroomItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(title) (\(items.count))").font(.subheadline.bold()).foregroundStyle(.secondary)
            if items.isEmpty {
                Text("Keine Aufgaben").italic().foregroundStyle(.secondary).font(.caption)
            } else {
                ForEach(items) { item in
                    Button { editing = item } label: { itemRow(item) }.buttonStyle(.plain)
                }
            }
        }
    }

    private func itemRow(_ item: BathroomItem) -> some View {
        let kid = kids.first { $0.id == item.assignedTo }
        return HStack(spacing: 12) {
            Image(systemName: ChoreIcon.symbol(item.icon))
                .frame(width: 36, height: 36)
                .background(Color(.tertiarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.label).bold()
                Text(kid?.name ?? "Niemand").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary).font(.caption)
        }
        .padding().background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Data ops

    private func items(for slots: [String]) -> [BathroomItem] {
        config.items.filter { slots.contains($0.timeSlot) }
    }

    private func newItem() -> BathroomItem {
        BathroomItem(id: UUID().uuidString, label: "", icon: "clean",
                     assignedTo: kids.first?.id ?? "", timeSlot: "morning", linkedChoreId: nil)
    }

    private func saveItem(_ item: BathroomItem) {
        var items = config.items
        if let idx = items.firstIndex(where: { $0.id == item.id }) { items[idx] = item }
        else { items.append(item) }
        editing = nil
        Task { await app.saveBathroom(BathroomConfig(items: items, schedule: schedule)) }
    }

    private func deleteItem(_ item: BathroomItem) {
        let items = config.items.filter { $0.id != item.id }
        editing = nil
        Task { await app.saveBathroom(BathroomConfig(items: items, schedule: schedule)) }
    }
}

private struct BathItemEditor: View {
    @State var item: BathroomItem
    let kids: [Kid]
    let chores: [Chore]
    let onSave: (BathroomItem) -> Void
    let onDelete: (BathroomItem) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Bezeichnung (z.B. Zähne putzen)", text: $item.label) }

                Section("Kind") {
                    Picker("Kind", selection: $item.assignedTo) {
                        ForEach(kids) { Text($0.name).tag($0.id) }
                    }
                }

                Section("Zeitfenster") {
                    Picker("Zeitfenster", selection: $item.timeSlot) {
                        Text("Morgens").tag("morning")
                        Text("Abends").tag("evening")
                        Text("Beides").tag("both")
                    }.pickerStyle(.segmented)
                }

                Section("Sterne-Verknüpfung") {
                    Picker("Aufgabe", selection: Binding(
                        get: { item.linkedChoreId ?? "" },
                        set: { item.linkedChoreId = $0.isEmpty ? nil : $0 }
                    )) {
                        Text("Keine").tag("")
                        ForEach(chores) { Text($0.label).tag($0.id) }
                    }
                }

                Section("Symbol") { iconGrid }

                Section {
                    Button("Löschen", role: .destructive) { onDelete(item) }
                }
            }
            .navigationTitle("Bad-Aufgabe")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { onSave(item) }
                        .disabled(item.label.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var iconGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 10) {
            ForEach(ChoreIcon.allKeys, id: \.self) { key in
                Image(systemName: ChoreIcon.symbol(key))
                    .frame(width: 36, height: 36)
                    .background(item.icon == key ? Color.accentColor.opacity(0.2) : Color(.tertiarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .onTapGesture { item.icon = key }
            }
        }
    }
}

// MARK: time helpers

func dateFromHHMM(_ s: String) -> Date {
    let parts = s.split(separator: ":").compactMap { Int($0) }
    var c = DateComponents()
    c.hour = parts.first ?? 8
    c.minute = parts.count > 1 ? parts[1] : 0
    return Calendar.current.date(from: c) ?? Date()
}

func hhmm(from date: Date) -> String {
    let c = Calendar.current.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
}
