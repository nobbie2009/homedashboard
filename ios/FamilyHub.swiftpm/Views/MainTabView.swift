import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            StarsView()
                .tabItem { Label("Sterne", systemImage: "star.fill") }
            ChoresView()
                .tabItem { Label("Aufgaben", systemImage: "checklist") }
            AgendaView()
                .tabItem { Label("Kalender", systemImage: "calendar") }
            BathroomView()
                .tabItem { Label("Bad", systemImage: "drop.fill") }
            HouseholdView()
                .tabItem { Label("Haushalt", systemImage: "house.fill") }
        }
    }
}
