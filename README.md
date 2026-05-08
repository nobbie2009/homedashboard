# FamilyHub - Smart Home Dashboard

Ein modernes, webbasiertes Dashboard für die ganze Familie, optimiert für Touchscreens (z.B. Raspberry Pi an der Wand). Entwickelt mit React, Vite, Node.js und Docker.

![Dashboard Preview](docs/preview.png)

## 🌟 Features

### 🏠 Dashboard (Startseite)
- **Große Uhrzeitanzeige** für gute Lesbarkeit.
- **Wetter-Widget**: Integration des DWD (Deutscher Wetterdienst) mit Regenradar (GIF).
- **Müllkalender**: Anzeige der nächsten Abholtermine (ICS-Import).
- **Status-Icons**: Schnellübersicht für wichtige Informationen.

### 📅 Kalender
- **Google Kalender Integration**: Zeigt Termine mehrerer Kalender farbcodiert an.
- **Auto-Refresh**: Automatische Aktualisierung und Token-Management im Hintergrund.
- **Listenansicht**: Übersichtliche Darstellung der kommenden Termine.

### 🧹 Aufgaben (Chores)
- **Gamification für Kinder**: Kinder können Aufgaben erledigen und "Sterne" sammeln.
- **Konfigurierbar**: Aufgaben, Intervalle und Belohnungen (Sterne) sind einstellbar.
- **Eigene Ansicht**: Kindgerechte Oberfläche mit Avatar-Bildern.

### 🏫 Schule (EduPage)
- **Stundenplan**: Anzeige des aktuellen Stundenplans.
- **Hausaufgaben**: Übersicht über offene Hausaufgaben.
- **Multi-User**: Unterstützung für mehrere Kinder.

### 📝 Notizen (Notion)
- **Notion Integration**: Anzeige von Notizen oder einer Familien-Pinnwand direkt aus Notion.

### 🏠 Smart Home & Kamera
- **Kamera-Stream**: Live-Bild einer Überwachungskamera.
- **Türspion-Popup**: Automatisches Fullscreen-Popup des Kamerabildes bei Klingeln (via Webhook).
- **Home Assistant**: Grundlegende Integration (iframe/Links möglich).

### ⚙️ Administration & Sicherheit
- **Admin-Oberfläche**: Passwortgeschützter Bereich für alle Einstellungen.
- **Geräte-Verwaltung**: Whitelist-System – Nur freigeschaltete Geräte (z.B. Tablets) erhalten Zugriff.
- **Backup & Restore**: Vollständige Sicherung der Konfiguration (inkl. Bilder) als JSON.
- **Docker**: Vollständig containerisiert für einfache Installation.

---

## 🚀 Installation (Docker)

Diese Anwendung ist für den Betrieb mit Docker & Docker Compose ausgelegt.

### Voraussetzungen
- Docker & Docker Compose installiert.
- Ein Google Cloud Projekt (für Kalender-Zugriff) mit `credentials.json`.

### Starten
1. Repository klonen.
2. `credentials.json` (von Google) in den Ordner `server/` legen (wird für den ersten Start benötigt).
3. Container starten:
```bash
docker-compose up -d --build
```
4. Zugriff über `http://<SERVER-IP>:80`.

---

## ⚙️ Konfiguration

Alle Einstellungen können bequem über das **Admin-Panel** (`/admin`) vorgenommen werden.
Das Standard-Passwort für den ersten Zugriff wird in den Server-Logs angezeigt oder kann in der `config.json` gesetzt werden.

### Wichtige Einstellungen:
- **Wetter**: Koordinaten (Latitude/Longitude) für DWD.
- **Kalender**: Auswahl der anzuzeigenden Google Kalender.
- **Schule**: Zugangsdaten für EduPage.
- **Kamera**: URL zum MJPEG-Stream oder Snapshot.

---

## 🔔 API & Webhooks

Das Dashboard bietet Schnittstellen für die Integration in Smart Home Systeme (z.B. Home Assistant).

### Türklingel Trigger
Zeigt das Kamera-Popup für 30 Sekunden auf allen verbundenen Dashboards an —
zuerst mit einem **frisch abgerufenen Snapshot** der Türklingel-Kamera, danach
optional als Live-Stream.

- **URL**: `http://<DASHBOARD-IP>:3001/api/webhook/doorbell`
- **Methods**: `POST` oder `GET`
- **Body**: `{}` (leer)

**Beispiel `curl`:**
```bash
curl -X POST http://192.168.1.100:3001/api/webhook/doorbell
```

**Beispiel Home Assistant (`configuration.yaml`):**
```yaml
rest_command:
  familyhub_doorbell:
    url: "http://192.168.1.100:3001/api/webhook/doorbell"
    method: POST
```

#### Reolink Türklingel einrichten

1. **Snapshot URL** (Admin → Externe Daten → Türklingel-Kamera):
   ```
   http://USER:PASS@<REOLINK-IP>/cgi-bin/api.cgi?cmd=Snap&channel=0
   ```
   Diese URL wird beim Klingeln direkt vom Backend geholt und sofort
   im Popup angezeigt — keine ffmpeg-Latenz.

2. **RTSP Stream URL** (optional, für Live-Bild im Popup):
   ```
   rtsp://USER:PASS@<REOLINK-IP>:554/h264Preview_01_main
   ```

3. **Klingel-Trigger über Home Assistant:**
   - Reolink Türklingel via Reolink- oder ONVIF-Integration in HA einbinden.
   - Automation auf das `binary_sensor.<...>_visitor` (oder ONVIF `event`) Event:
     ```yaml
     automation:
       - alias: "Türklingel → FamilyHub Popup"
         trigger:
           - platform: state
             entity_id: binary_sensor.reolink_doorbell_visitor
             to: "on"
         action:
           - service: rest_command.familyhub_doorbell
     ```

> Hinweis: Direkte HTTP-Webhooks aus der Reolink-Firmware sind je nach Modell
> nicht stabil verfügbar — der Umweg über Home Assistant ist robuster.

---

## 🛠 Tech Stack

- **Frontend**: React, Vite, TailwindCSS, Lucide Icons
- **Backend**: Node.js, Express
- **Sicherheit**: Device-Fingerprinting, Local Network Only (empfohlen)
- **Daten**: JSON-File Storage (keine externe Datenbank nötig)

---

## Lizenz

[MIT](LICENSE)
