# FamilyHub – native iOS App (SwiftUI)

Ein nativer SwiftUI-Client für das FamilyHub-Dashboard, entwickelt als
**Swift Playgrounds App** (`.swiftpm`). Er spricht dasselbe Node-Backend an wie
die Web-/PWA-Version (`/api/...`).

> **Hinweis:** Dieser Code wurde auf einem Linux-System geschrieben und **nicht
> kompiliert** (SwiftUI baut nur auf Apple-Plattformen). Erwarte beim ersten
> Build in Swift Playgrounds/Xcode möglicherweise kleine Anpassungen.

## Öffnen & Bauen

1. Ordner `ios/FamilyHub.swiftpm` auf iPad oder Mac öffnen:
   - **Swift Playgrounds** (kostenlos im App Store) → Datei öffnen, oder
   - **Xcode** → „Open" → `FamilyHub.swiftpm`.
2. Auf einem echten Gerät (oder Simulator) starten.

## Erste Schritte in der App

1. **Server-Adresse** eingeben, z.B. `http://192.168.1.100:3001`
   (die IP/Port deines FamilyHub-Servers im Heimnetz).
2. **Gerät anmelden** (Name vergeben). Danach im **Admin-Bereich** des
   Dashboards freischalten – wie bei der PWA (Whitelist).
3. Nach Freigabe erscheinen die Tabs: Sterne, Aufgaben, Kalender, Bad, Haushalt.

## Funktionsumfang

- **Sterne:** Stand pro Kind / gemeinsam, Sterne vergeben, letzte Aktivitäten.
- **Aufgaben:** Aufgaben pro Kind, „Erledigt" vergibt Sterne (nutzt Admin-PIN).
- **Kalender:** Agenda aus den verbundenen Google-Kalendern, nach Tagen gruppiert.
- **Bad:** Zeitfenster + Aufgaben anlegen/bearbeiten (config-basiert).
- **Haushalt:** Fälligkeiten, „Erledigt" (mit Mitglied-Auswahl) + Rückgängig.
- **Push (APNs):** Glocken-Button → Benachrichtigungen aktivieren; Türklingel
  löst eine Push aus.

Geräte-Konfiguration (Config) wird vollständig erhalten: die App schreibt beim
Speichern den kompletten Config-Baum zurück, sodass keine Felder verloren gehen,
die die App nicht modelliert.

## Push (APNs) einrichten

Native iOS-Push nutzt **APNs** (nicht Web-Push). Voraussetzung: Apple-Developer-Account.

**Auf Apple-Seite:**
1. App ID mit Capability *Push Notifications* (Bundle-ID `com.familyhub.manager`
   – muss mit `Package.swift` übereinstimmen).
2. APNs **Auth Key** (`.p8`) erstellen → Key-ID + Team-ID notieren.
3. In Swift Playgrounds: App-Einstellungen → Capabilities → *Push Notifications*
   aktivieren (bzw. in Xcode unter Signing & Capabilities).

**Auf dem Server** (Env-Variablen, sonst ist iOS-Push einfach deaktiviert):

```
APNS_KEY_ID=ABC123DEFG
APNS_TEAM_ID=TEAM123456
APNS_BUNDLE_ID=com.familyhub.manager
APNS_KEY_PATH=/pfad/zu/AuthKey_ABC123DEFG.p8   # oder APNS_KEY mit \n-escaptem Inhalt
APNS_PRODUCTION=false                           # true für App-Store-Builds
```

Backend-Endpunkte: `/api/push/apns-subscribe`, `/api/push/apns-unsubscribe`,
`/api/push/apns-test`. Die Türklingel (`/api/webhook/doorbell`) sendet an
Web-Push **und** APNs an alle freigegebenen Abonnenten.

## Bekannte Grenzen

- Anlegen/Bearbeiten von Kindern, Chore-Aufgaben und Haushalts-Mitgliedern/-Aufgaben
  erfolgt weiterhin im Dashboard/Admin; die App fokussiert die täglichen Aktionen.
- Remote-Push erfordert ein echtes Gerät + die APNs-Einrichtung oben.
