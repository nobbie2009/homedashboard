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
Zeigt das Kamera-Popup für 30 Sekunden auf allen verbundenen Dashboards an.

- **URL**: `http://<DASHBOARD-IP>:3001/api/webhook/doorbell`
- **Method**: `POST`
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

---

## 📶 WLAN-Watchdog (Auto-Reconnect)

Wenn der Raspberry Pi zeitweise die WLAN-Verbindung verliert und sich nicht von alleine neu verbindet, kann der mitgelieferte Watchdog die Verbindung automatisch wiederherstellen.

Der Watchdog prüft alle 2 Minuten per `ping` (Gateway + öffentliche DNS-Server) ob das Netz erreichbar ist. Schlägt der Test fehl, läuft eine Eskalationskette:

1. WLAN-Interface kurz down/up (`nmcli device disconnect/connect`).
2. Wenn das nicht hilft: NetworkManager komplett neu starten.
3. Optional: Nach N aufeinanderfolgenden Fehlversuchen kompletten Reboot auslösen (Standard: aus).

### Installation

Wird automatisch via `install_kiosk.sh` angeboten. Manuelle Installation:

```bash
sudo ./scripts/wifi-watchdog/install.sh
```

### Status & Logs

```bash
systemctl status wifi-watchdog.timer
journalctl -u wifi-watchdog.service -f
```

### Konfiguration

`/etc/default/wifi-watchdog` (Interface, Ping-Ziele, Reboot-Schwelle).

---

## 🛠 Tech Stack

- **Frontend**: React, Vite, TailwindCSS, Lucide Icons
- **Backend**: Node.js, Express
- **Sicherheit**: Device-Fingerprinting, Local Network Only (empfohlen)
- **Daten**: JSON-File Storage (keine externe Datenbank nötig)

---

## Lizenz

[MIT](LICENSE)
