# Claude-Code Prompt: music-assistant-pwa — Tab „Räume" durch „Bad" ersetzen

Dieser Prompt ist spezifisch für das Repo
`https://github.com/nobbie2009/music-assistant-pwa` (Default-Branch `master`).
Die Struktur wurde bereits geprüft, daher enthält der Prompt konkrete
Datei- und Codepfade.

## So nutzt du diesen Prompt

1. Klone das Repo lokal:
   ```bash
   git clone https://github.com/nobbie2009/music-assistant-pwa
   cd music-assistant-pwa
   ```
2. Starte eine Claude-Code-Session dort:
   ```bash
   claude
   ```
3. Paste den Block zwischen den ` ``` ` unten in die Session.

---

```
Ersetze in diesem Repo den Bottom-Navigation-Tab "Räume" durch einen
neuen Tab "Bad", der die Bad-Aufgabenliste meines separaten
homedashboard-Projekts in einem iframe anzeigt. Die URL kommt aus einer
Env-Variable, damit sie pro Installation konfigurierbar ist.

Konkrete Änderungen:

## 1. `src/components/shared/TabBar.tsx`

Im `TABS`-Array den Eintrag `{ id: 'rooms', label: 'Räume', icon: '🏠' }`
ersetzen durch:

    { id: 'bathroom', label: 'Bad', icon: '🛁' },

Position im Array bleibt (zwischen 'library' und 'settings').

## 2. `src/App.tsx`

### 2a. Import entfernen
    import { RoomList } from './components/MultiRoom/RoomList';

### 2b. Render-Zweig austauschen
Entferne:
    {activeTab === 'rooms' && <RoomList />}

Ersetze durch:
    {activeTab === 'bathroom' && <BathroomFrame />}

### 2c. Neuer Import
    import { BathroomFrame } from './components/Bathroom/BathroomFrame';

## 3. Neue Datei `src/components/Bathroom/BathroomFrame.tsx`

Inhalt:

    export function BathroomFrame() {
        const url = import.meta.env.VITE_BATHROOM_URL as string | undefined;
        if (!url) {
            return (
                <div className="w-full h-full flex items-center justify-center text-text-muted p-6 text-center">
                    VITE_BATHROOM_URL ist nicht gesetzt. Trage die URL deiner
                    homedashboard Bad-Seite in .env oder .env.local ein
                    (z.B. http://192.168.1.100/bathroom) und baue die App neu.
                </div>
            );
        }
        return (
            <iframe
                src={url}
                title="Bad"
                className="w-full h-full border-0 bg-bg"
                allow="fullscreen"
            />
        );
    }

## 4. Env-Variable dokumentieren

Lege eine neue Datei `.env.example` an (falls noch keine existiert),
ergänze sie sonst, mit:

    VITE_BATHROOM_URL=

Wenn es ein README.md gibt, ergänze einen kurzen Abschnitt unter einer
passenden Überschrift:

    ### Bad-Tab
    Setze `VITE_BATHROOM_URL` in `.env.local` auf die URL der Bad-Seite
    deines homedashboard (z.B. `http://192.168.1.100/bathroom`). Wenn
    leer, zeigt der Bad-Tab einen Hinweis statt des iframes.

## 5. `RoomList` nicht mehr referenziert

Die Datei `src/components/MultiRoom/RoomList.tsx` bleibt liegen (kein
Löschen), da evtl. andere Code-Teile darauf verweisen. Einfach den
Import/Render aus App.tsx entfernen reicht.

## 6. Tests / Sanity

- `npm install` falls noch nicht gemacht
- `npm run build` muss durchlaufen (TypeScript-Fehler = Blocker)
- `npm run dev` starten und prüfen: der untere Tab zeigt jetzt "Bad 🛁"
  statt "Räume 🏠"; Tap öffnet iframe (oder Hinweistext wenn URL leer)

## 7. Commit + Push

Commit-Message: "Replace Räume tab with Bad tab (iframe to homedashboard)"
Wenn ein Remote vorhanden ist, push nach master.

Kein zusätzliches Styling-Feintuning, kein Refactoring anderer Stellen.
```

---

## Nach der Implementierung (was DU machst)

1. `.env.local` im `music-assistant-pwa` Repo anlegen:
   ```
   VITE_BATHROOM_URL=http://<ip-deines-dashboards>/bathroom
   ```
   Die IP ist die deines laufenden homedashboard-Servers (Port nur wenn ≠ 80).

2. PWA bauen:
   ```bash
   npm run build
   ```
   Der `dist/` Ordner enthält die fertigen Dateien.

3. PWA hosten (falls nicht schon geschehen): nginx/Apache/Docker — irgendeinen
   Webserver, der `dist/` ausliefert. Falls die PWA heute schon läuft,
   einfach den Inhalt austauschen.

4. Auf dem Echo Show 5: im Silk-Browser die PWA-URL öffnen und
   „Zum Startbildschirm hinzufügen". Beim ersten Aufruf des Bad-Tabs
   zeigt der iframe die Access-Denied-Seite mit Device-ID des Echos —
   die ID notieren, vom Handy/PC im homedashboard-Admin unter
   „Sicherheit" freigeben. Danach läuft die Bad-Liste im iframe.

## Warum iframe und nicht `window.location.href`?

Ein harter Location-Wechsel würde die Music-App verlassen. Der
Echo-Browser macht den Back-Button-Workflow unangenehm (Silk versteckt
die Chrome-Leiste teils). Im iframe bleibt die PWA aktiv, der Tab-Switch
bringt dich nahtlos zurück zu „Läuft" oder „Bibliothek".
