import SwiftUI

struct ChoresView: View {
    @EnvironmentObject var app: AppState
    @State private var busyId: String?
    @State private var doneIds: Set<String> = []
    @State private var error: String?

    private var kids: [Kid] { app.chores?.kids ?? [] }
    private var tasks: [Chore] { app.chores?.tasks ?? [] }

    var body: some View {
        TabScaffold(title: "Aufgaben") {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let error { InlineError(message: error) }
                    if kids.isEmpty {
                        Text("Keine Kinder konfiguriert. Bitte im Admin anlegen.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(kids) { kid in
                        let kidTasks = tasks.filter { $0.assignedTo == kid.id }
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                ColorDot(color: Color(webColor: kid.color))
                                Text(kid.name).font(.headline)
                                Text("(\(kidTasks.count))").foregroundStyle(.secondary).font(.subheadline)
                            }
                            if kidTasks.isEmpty {
                                Text("Keine Aufgaben").italic().foregroundStyle(.secondary).font(.subheadline)
                            } else {
                                ForEach(kidTasks) { task in
                                    taskRow(task, kid: kid)
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .refreshable { await app.loadConfig() }
        }
        .task { await app.loadConfig() }
    }

    private func taskRow(_ task: Chore, kid: Kid) -> some View {
        let done = doneIds.contains(task.id)
        return HStack(spacing: 12) {
            Image(systemName: ChoreIcon.symbol(task.icon))
                .frame(width: 36, height: 36)
                .background(Color(.tertiarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(task.label).bold()
                Text(String(repeating: "★", count: task.difficulty ?? 1))
                    .font(.caption).foregroundStyle(.yellow)
            }
            Spacer()
            Button {
                complete(task)
            } label: {
                if busyId == task.id {
                    ProgressView()
                } else {
                    Image(systemName: done ? "checkmark.circle.fill" : "star.fill")
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(done ? .green : .green)
            .disabled(busyId == task.id || done)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(webColor: kid.color), lineWidth: 0)
                .padding(.leading, 0)
        )
    }

    private func complete(_ task: Chore) {
        guard let kidId = task.assignedTo else {
            error = "Aufgabe ohne Kind zugewiesen"; return
        }
        busyId = task.id
        error = nil
        struct CompleteBody: Encodable { let taskId: String; let kidId: String; let pin: String }
        Task {
            do {
                let resp = try await app.post("/api/rewards/complete",
                                              body: CompleteBody(taskId: task.id, kidId: kidId, pin: app.adminPin),
                                              as: RewardsMutationResponse.self)
                if let r = resp.rewards { app.cacheRewards(r) }
                doneIds.insert(task.id)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                doneIds.remove(task.id)
            } catch {
                self.error = "Fehler beim Abschließen"
            }
            busyId = nil
        }
    }
}
