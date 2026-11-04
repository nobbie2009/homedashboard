# LAGE-Index – Plan

Eigener, inoffizieller Indikator für die „Gefahr von außen“ (Stufen 5 → 1).
Unwetter und Hochwasser bleiben in den bestehenden DWD-Anzeigen.

## Stufen

| Stufe | Farbe | Bedeutung |
|---|---|---|
| 5 | Grün | Normal |
| 4 | Blau | Auffällig – ein einzelnes Signal (≥ 2 Punkte, nicht aus „Öffentlichkeit“) |
| 3 | Gelb | Erhöht – Gesamtwert ≥ 5 und ≥ 2 aktive Gruppen |
| 2 | Orange | Angespannt – Gesamtwert ≥ 9 und alle 3 Gruppen aktiv, oder NATO-Art.-4-Konsultation |
| 1 | Rot | Akut – **nur** durch amtliche Warnung / Messwert erreichbar |

## Schicht A – amtliche Untergrenzen

| Quelle | Regel | Stufe |
|---|---|---|
| NINA Landkreis (MoWaS, KATWARN, BIWAPP, Polizei; ohne DWD/LHP) | Schlüsselwort Luftgefahr/CBRN/Strahlung/Schutz suchen | 1 |
| | sonst Severity Extreme / Severe / Moderate | 2 / 3 / 4 |
| NINA bundesweit (MoWaS-Karte) | Extreme/Severe **und** Schlüsselwort | 2 |
| BfS-ODL im Umkreis | ≥ 2 Sonden über Alarmschwelle (0,8 µSv/h) | 1 |
| | ≥ 2 Sonden über Warnschwelle (0,3 µSv/h) | 3 |
| Nachrichten | „Spannungs-/Verteidigungsfall festgestellt“, „Bündnisfall ausgerufen“ | 2 |
| Manuell (Admin) | frei wählbar | 1–5 |

## Schicht B – Indikatoren (je 0–3 Punkte)

| Gruppe | Indikator | Quelle | Methode |
|---|---|---|---|
| LUFT | Flugbereitschaft | adsb.lol `/v2/mil` | Regierungsflieger (10+/14+/15+/16+, GAF) und A400M/C-130J (54+/55+): Abweichung vom Normalwert; +1 je Muster: nachts 0–5 Uhr, über der Ostflanke, ≥ 3 gleichzeitig |
| LUFT | Militärluft Europa | adsb.lol `/v2/mil` | AWACS/Tanker/Aufklärer über Europa bzw. an der Ostflanke (stärkerer Ausschlag zählt); E-4B/E-6B in Europa = 3 |
| LUFT | Luftraum | Tagesschau, NATO | Luftraumverletzung/Eindringen (2), Abfangmanöver (1), Sperrungen |
| LUFT | Drohnen | Tagesschau | Drohne + Flughafen/Bundeswehr |
| POLITIK | Parlament | Bundestag-Feeds (hib, Aktuelle Themen, Pressemitteilungen) + Sitzungskalender (ICS), Tagesschau | Sondersitzung Plenum/Sicherheitsausschüsse (2), Regierungserklärung zur Lage (1); +1 außerhalb der Sitzungswoche |
| POLITIK | Krisenstab | Tagesschau | Nationaler Sicherheitsrat, Krisenstab |
| POLITIK | NATO | nato.int (News + Media Advisories), Tagesschau | Art.-4-Konsultationen (3), außerordentlicher Nordatlantikrat (2), erhöhte Bereitschaft (1), Alarmbereitschaft/Mobilmachung (2) |
| POLITIK | Diplomatie | Tagesschau | Sondergipfel, abgesagte Reisen |
| ÖFFENTLICHKEIT | Suchinteresse | Wikipedia-Abrufzahlen | Abweichung vom 28-Tage-Normalwert für Verteidigungsfall, Schutzraum, Kaliumiodid … |
| ÖFFENTLICHKEIT | Eilmeldungen | Tagesschau | Sicherheitsrelevante Eilmeldungen der letzten 24 h |

Punkte aus Abweichungen: ≥ 2σ → 1, ≥ 3σ → 2, ≥ 4,5σ → 3 (Lernphase: mind. 3 Tage Messwerte).
Nachrichten-Punkte klingen mit 24 h Halbwertszeit ab (+1 bei Eilmeldung).

Gesamtwert = LUFT × 1,0 + POLITIK × 1,2 + ÖFFENTLICHKEIT × 0,6 (Gruppen auf 6 gedeckelt).
Aktive Gruppe = mind. 2 Punkte. Kontext-Ereignisse (Manöver, Gipfel) halbieren LUFT/POLITIK.
Verschlechterung sofort, Verbesserung erst nach 60 min stabil.

## Alarmierung (ab einstellbarer Stufe, Standard LAGE 2)

- Dashboard-Popup (wegklickbar) – immer
- Web-Push an PWA-Handys – nur wenn Alarmierung aktiviert
- Home Assistant (nur wenn aktiviert, jede Aktion einzeln schaltbar, Standard aus):
  Jarvis-Ansage Küche, Unterschrank-LED rot blinkend, FritzFon-Rundruf,
  kritische Benachrichtigung über die Companion-App
- Wiederholung derselben Stufe frühestens nach 6 h; Eskalation sofort.

## Umsetzung

1. `server/lage.js` – reine Bewertungslogik + Tests (`server/test/lage.test.js`)
2. `server/lageSources.js` – Datenabruf (NINA, BfS, ADS-B, Tagesschau, Wikipedia)
3. `server/homeassistant.js` – REST-Aufrufe, Blinken
4. `server/lageService.js` – Zeitplan, Verlauf, Zustand, Alarmierung
5. API: `GET /api/lage`, `POST /api/lage/refresh`, Test-Popup, HA-Verbindungscheck, Zugangsdaten
6. Frontend: Header-Button `LageHeaderButton` (öffnet `LageWidget` als Popup), `LageAlarmOverlay`, `LageAdmin`
