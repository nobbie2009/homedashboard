import SwiftUI

struct HouseholdView: View {
    @EnvironmentObject var app: AppState
    @State private var serverTasks: [HouseholdTask] = []
    @State private var now: Double = Date().timeIntervalSince1970 * 1000
    @State private var picker: HouseholdTask?
    @State private var undoTaskId: String?
    @State private var error: String?

    private var members: [HouseholdMember] { app.household?.members ?? [] }
    private var tasks: [HouseholdTask] {
        serverTasks.isEmpty ? (app.household?.tasks ?? []) : serverTasks
    }

    var body: some View {
        TabScaffold(title: "Haushalt") {
            ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if let error { InlineError(message: error) }
                        if tasks.isEmpty {
                            Text("Keine Aufgaben.").italic().foregroundStyle(.secondary)
                        }
                        ForEach(tasks) { task in taskCard(task) }
                    }
                    .padding()
                }
                .refreshable { await load() }

                if undoTaskId != nil {
                    Button {
                        undo()
                    } label: {
                        Label("Rückgängig", systemImage: "arrow.uturn.backward")
                            .padding(.horizontal, 20).padding(.vertical, 12)
                            .background(Color(.darkGray)).foregroundStyle(.white)
                            .clipShape(Capsule())
                    }
                    .padding(.bottom, 12)
                }
            }
        }
        .task { await load() }
        .sheet(item: $picker) { task in
            memberPicker(task)
        }
    }

    private func taskCard(_ task: HouseholdTask) -> some View {
        let member = members.first { $0.id == task.assignedTo }
        let overdue = task.nextDueAt > 0 && task.nextDueAt < now
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if overdue { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red) }
                if let member { ColorDot(color: Color(webColor: member.color)) }
                Image(systemName: ChoreIcon.symbol(task.icon))
                Text(task.label).bold()
                Spacer()
            }
            Text(dueText(task))
                .font(.subheadline)
                .foregroundStyle(overdue ? .red : .secondary)
            if let last = task.lastCompletedAt {
                Text("Zuletzt: \(shortDate(last))").font(.caption).foregroundStyle(.secondary)
            }
            Button {
                onComplete(task)
            } label: {
                Label("Erledigt", systemImage: "checkmark.circle").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).tint(.green)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(overdue ? Color.red : Color.clear, lineWidth: 2)
        )
    }

    private func memberPicker(_ task: HouseholdTask) -> some View {
        NavigationStack {
            List(members) { m in
                Button {
                    complete(task, memberId: m.id)
                    picker = nil
                } label: {
                    HStack { ColorDot(color: Color(webColor: m.color)); Text(m.name) }
                }
            }
            .navigationTitle("Wer hat es erledigt?")
        }
    }

    // MARK: actions

    private func onComplete(_ task: HouseholdTask) {
        if members.count <= 1 {
            complete(task, memberId: members.first?.id)
        } else {
            picker = task
        }
    }

    private func complete(_ task: HouseholdTask, memberId: String?) {
        struct Body: Encodable { let taskId: String; let memberId: String? }
        Task {
            do {
                _ = try await app.post("/api/household/complete",
                                       body: Body(taskId: task.id, memberId: memberId),
                                       as: HouseholdCompleteResponse.self)
                undoTaskId = task.id
                await load()
                let pending = task.id
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if undoTaskId == pending { undoTaskId = nil }
            } catch {
                self.error = "Fehler beim Abschließen"
            }
        }
    }

    private func undo() {
        guard let id = undoTaskId else { return }
        struct Body: Encodable { let taskId: String }
        undoTaskId = nil
        Task {
            _ = try? await app.send("/api/household/undo", method: "POST",
                                    body: JSONEncoder().encode(Body(taskId: id)))
            await load()
        }
    }

    private func load() async {
        do {
            let state = try await app.get("/api/household/tasks", as: HouseholdServerState.self)
            serverTasks = state.tasks ?? []
            now = state.now ?? Date().timeIntervalSince1970 * 1000
        } catch {
            // fall back to config snapshot
        }
        await app.loadConfig()
    }

    // MARK: formatting

    private func dueText(_ task: HouseholdTask) -> String {
        guard task.nextDueAt > 0 else { return "Noch nicht fällig" }
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "de_DE")
        let date = Date(timeIntervalSince1970: task.nextDueAt / 1000)
        let ref = Date(timeIntervalSince1970: now / 1000)
        let rel = f.localizedString(for: date, relativeTo: ref)
        return task.nextDueAt < now ? "überfällig (\(rel))" : rel
    }

    private func shortDate(_ ms: Double) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.dateStyle = .short
        return f.string(from: Date(timeIntervalSince1970: ms / 1000))
    }
}
