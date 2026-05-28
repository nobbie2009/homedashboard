import SwiftUI

struct StarsView: View {
    @EnvironmentObject var app: AppState

    @State private var selectedKid: String?
    @State private var stars: Int = 1
    @State private var reason: String = ""
    @State private var busy = false
    @State private var flash: String?
    @State private var error: String?
    @State private var history: [CompletionEntry] = []
    @State private var loadingHistory = true

    private var kids: [Kid] { app.chores?.kids ?? [] }
    private var rewards: RewardConfig? { app.rewards }
    private var sharedMode: Bool { rewards?.mode == "shared" }
    private var target: Int { rewards?.targetStars ?? 20 }
    private var canGrant: Bool { sharedMode || selectedKid != nil }

    var body: some View {
        TabScaffold(title: "Sterne") {
            ScrollView {
                VStack(spacing: 16) {
                    rewardBanner
                    balances
                    grantCard
                    historyCard
                }
                .padding()
            }
            .refreshable { await reload() }
        }
        .task { await reload() }
    }

    // MARK: Reward banner

    private var rewardBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "gift.fill").font(.title2).foregroundStyle(.yellow)
            VStack(alignment: .leading, spacing: 2) {
                Text("Belohnung").font(.caption2.bold()).foregroundStyle(.secondary)
                Text(rewards?.currentReward.isEmpty == false ? rewards!.currentReward : "Noch nicht gesetzt")
                    .font(.headline)
                Text("\(target) ★ Ziel · \(sharedMode ? "Gemeinsam" : "Individuell")")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(Color.yellow.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: Balances

    @ViewBuilder
    private var balances: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Aktueller Stand").font(.subheadline.bold()).foregroundStyle(.secondary)
            if sharedMode {
                HStack {
                    Text("Gemeinsam").font(.headline)
                    Spacer()
                    Text("\(rewards?.sharedStars ?? 0) / \(target) ★").bold()
                }
                .padding().background(cardBG).clipShape(RoundedRectangle(cornerRadius: 12))
            } else {
                ForEach(kids) { kid in
                    let v = rewards?.kidStars?[kid.id] ?? 0
                    HStack(spacing: 12) {
                        Avatar(name: kid.name, color: Color(webColor: kid.color))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(kid.name).bold()
                            ProgressView(value: Double(min(v, target)), total: Double(max(target, 1)))
                                .tint(Color(webColor: kid.color))
                        }
                        Spacer()
                        Text("\(v) ★").foregroundStyle(.yellow).bold().monospacedDigit()
                    }
                    .padding().background(cardBG).clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    // MARK: Grant

    private var grantCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sterne vergeben").font(.subheadline.bold()).foregroundStyle(.secondary)

            if !sharedMode {
                if kids.isEmpty {
                    Text("Keine Kinder konfiguriert.").foregroundStyle(.secondary)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(kids) { kid in
                            Button { selectedKid = kid.id } label: {
                                HStack {
                                    ColorDot(color: Color(webColor: kid.color))
                                    Text(kid.name).lineLimit(1)
                                    Spacer()
                                }
                                .padding(8)
                                .background(selectedKid == kid.id ? Color.accentColor.opacity(0.15) : cardBG)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            Stepper("Anzahl: \(stars) ★", value: $stars, in: 1...5)
            TextField("Grund (optional)", text: $reason).textFieldStyle(.roundedBorder)

            Button(action: grant) {
                if busy { ProgressView().frame(maxWidth: .infinity) }
                else { Text("\(stars) Stern\(stars == 1 ? "" : "e") vergeben").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent)
            .tint(.yellow)
            .disabled(busy || !canGrant)

            if let flash { Label(flash, systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
            if let error { InlineError(message: error) }
        }
        .padding().background(cardBG).clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: History

    @ViewBuilder
    private var historyCard: some View {
        if loadingHistory && history.isEmpty {
            ProgressView().frame(maxWidth: .infinity).padding()
        } else if !history.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Letzte Aktivitäten").font(.caption.bold()).foregroundStyle(.secondary)
                ForEach(history) { e in
                    HStack {
                        Text(e.kidName ?? "—").bold().font(.subheadline)
                        Text(e.taskLabel ?? "").foregroundStyle(.secondary).font(.subheadline).lineLimit(1)
                        Spacer()
                        Text("+\(e.stars)★").foregroundStyle(.yellow).bold().monospacedDigit()
                    }
                    Divider()
                }
            }
            .padding().background(cardBG).clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private var cardBG: Color { Color(.secondarySystemBackground) }

    // MARK: Actions

    private func reload() async {
        await app.loadConfig()
        await fetchHistory()
    }

    private func fetchHistory() async {
        loadingHistory = true
        do {
            let resp = try await app.get("/api/rewards/history?limit=15", as: RewardsHistoryResponse.self)
            history = resp.completions ?? []
        } catch {
            // keep existing
        }
        loadingHistory = false
    }

    private func grant() {
        guard canGrant, stars >= 1 else { return }
        busy = true
        error = nil
        struct BonusBody: Encodable { let stars: Int; let reason: String; let kidId: String? }
        Task {
            do {
                let body = BonusBody(stars: stars,
                                     reason: reason.isEmpty ? "Bonus" : reason,
                                     kidId: sharedMode ? nil : selectedKid)
                let resp = try await app.post("/api/rewards/bonus", body: body, as: RewardsMutationResponse.self)
                if let r = resp.rewards { app.cacheRewards(r) }
                flash = "+\(stars) ★ vergeben"
                reason = ""
                stars = 1
                await fetchHistory()
                try? await Task.sleep(nanoseconds: 1_800_000_000)
                flash = nil
            } catch {
                self.error = "Fehler beim Vergeben"
            }
            busy = false
        }
    }
}
