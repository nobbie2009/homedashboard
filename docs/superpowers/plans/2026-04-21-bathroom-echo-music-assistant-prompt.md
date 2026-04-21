# Claude-Code Prompt: music-assistant-pwa Bad-Link

Copy the block between the fences into a fresh Claude-Code session started
inside the `music-assistant-pwa` repo
(`https://github.com/nobbie2009/music-assistant-pwa`). It is
self-contained — no context from this repo is needed.

---

```
Ich möchte in dieser PWA einen Button/Kachel ergänzen, der die Bad-
Checkliste meines homedashboard-Projekts öffnet. Die Checkliste ist eine
eigene Web-Seite — diese PWA soll nur in derselben Browser-Session dahin
navigieren. KEINE API-Integration, KEIN Datenabruf, KEINE iframes.

Kontext zum Ziel:
- Die Bad-Checkliste wird vom homedashboard serviert unter dem Pfad
  `/bathroom` (z.B. http://<dashboard-host>/bathroom in Produktion oder
  http://<dashboard-host>:3001/bathroom wenn das Backend direkt erreichbar
  ist). Die Ziel-URL ist pro Installation unterschiedlich und muss
  konfigurierbar sein.
- Gerät: Echo Show 5 (960×480, Silk-Browser auf Fire OS mit ~40–50 px
  nicht ausblendbarer Top-Bar).
- Diese PWA läuft als Kiosk/Startseite auf dem Echo. Nutzer sollen von
  hier mit einem Tap die Bad-Liste öffnen können.

Anforderungen:
1. Konfigurationsoption für die Bad-URL einführen. Nutze das Muster, das
   dieses Projekt bereits für Konfiguration verwendet — bitte erst das
   Repo anschauen (env-Vars via `import.meta.env.VITE_*` oder eine
   bestehende Settings-Datei). Wenn kein Muster existiert, füge eine
   Env-Variable `VITE_BATHROOM_URL` hinzu und dokumentiere sie im README.
   Default: leer. Wenn leer, wird der Button nicht angezeigt.
2. Sichtbarer Button/Kachel auf dem Hauptscreen, Label "Bad",
   bathroom-Icon (Droplets oder ähnlich aus lucide-react, falls bereits
   verwendet — sonst das Icon-Set des Projekts nutzen). Position passend
   zum bestehenden Button-Raster.
3. Klick/Tap ändert die Location im aktuellen Tab
   (`window.location.href = BATHROOM_URL`). KEIN neuer Tab, KEIN
   `window.open` — Silk auf dem Echo Show geht mit neuen Tabs schlecht
   um.
4. Touch-freundliche Größe: mindestens 64×64 px, gut lesbare Schrift.
5. Keine weitere Logik, keine Auth, keine Daten. Reiner Launcher.
6. README aktualisieren mit einem kurzen Abschnitt zur neuen Env-Variable.

Ablauf:
- Zuerst das Repo scannen (Config-Muster, Component-Struktur, Styling,
  vorhandene Buttons/Navigation) — passe dich an die vorhandenen
  Patterns an.
- Dann implementieren.
- Commit mit aussagekräftiger Message; wenn ein Remote vorhanden ist,
  auch pushen.

Bitte frag nach, falls die Konfigurationskonvention des Projekts nicht
eindeutig ableitbar ist.
```

---

## Hintergrund für dich (den homedashboard-Nutzer)

Nach der Implementierung:
1. Setze im `.env` der PWA `VITE_BATHROOM_URL` auf die passende URL deines
   homedashboard (z.B. `http://192.168.1.100/bathroom`).
2. Build + Deploy der PWA wie gehabt.
3. Auf dem Echo Show 5: die PWA als Startseite/Bookmark öffnen — beim
   ersten Aufruf von `/bathroom` wird der Echo als neues Gerät
   registriert. Von einem Komfort-Gerät aus (Phone/iPad/PC) das Echo im
   homedashboard-Admin unter "Sicherheit" freigeben. Danach lädt der
   Button im PWA direkt die Checkliste.
