# Gridfinity Preview

Eine Web-App, mit der du ein [Gridfinity](https://gridfinity.xyz/)-Raster im Browser konfigurieren, eigene STL/OBJ-Modelle hochladen, auf dem Grid platzieren (mit Einrasten) und Anordnungen online speichern kannst.

Stack: **React + Vite**, **Three.js** (via `@react-three/fiber` + `drei`), **Supabase** (Auth, Postgres, Storage), Zustand für State.

## Features

- Grid-Konfigurator (Breite, Tiefe, Einheitsgröße, Standard 42 mm)
- Upload von **STL, OBJ, 3MF und STEP/STP** mit Validierung und Triangle-Count-Limit
  - STL/OBJ/3MF werden direkt geparst (three.js-Loader)
  - STEP wird über OpenCASCADE-WASM tesseliert (on-demand geladen, ~4-5 MB)
- 3D-Vorschau mit OrbitControls und Gizmo
- Drag-to-Place mit Grid-Snapping
- Auswahl, Rotation (in 90°-Schritten) und farbliche Kennzeichnung
- Undo/Redo und Keyboard-Shortcuts
- Benutzerkonten (E-Mail + Passwort) via Supabase Auth
- Anordnungen pro User cloud-gespeichert (Postgres + RLS)
- Warnung bei ungespeicherten Änderungen

## Sicherheit

| Feature | Umsetzung |
|---|---|
| Row Level Security | Alle Tabellen (`user_models`, `arrangements`) und der Storage-Bucket haben RLS-Policies, die den Zugriff auf `auth.uid() = user_id` beschränken. |
| Keine Service-Keys im Frontend | Nur der öffentliche `anon` Key wird ausgeliefert. |
| Content-Security-Policy | In `index.html` als Meta-Tag. Beim Deploy zusätzlich als HTTP-Header setzen. |
| Eingabe-Validierung | Grid-Konfig, Platzierungen und Dateien werden im Frontend validiert vor dem INSERT. |
| Upload-Limits | 50 MB pro Datei, Dateityp-Whitelist (`.stl`, `.obj`), Triangle-Count ≤ 1.5 Mio. |
| XSS-Schutz | React escaped alles automatisch. Keine `dangerouslySetInnerHTML`. |
| Password Policy | Mindestens 8 Zeichen; Supabase erzwingt zusätzlich eigene Regeln. |
| Tokens | Session-Tokens im `localStorage` (Supabase-Default). Für höchste Sicherheit kann auf Cookie-basierte Auth umgestellt werden. |
| E-Mail-Bestätigung | Supabase kann im Projekt-Setting "Confirm Email" erzwingen (empfohlen). |

---

## Lokale Entwicklung

### 1. Dependencies installieren

```bash
cd /pfad/zu/GridPreview
npm install
```

### 2. Supabase-Projekt anlegen

1. [supabase.com](https://supabase.com) → neues Projekt (kostenloser Plan reicht).
2. In **Project Settings → API** kopierst du:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public Key** → `VITE_SUPABASE_ANON_KEY`
3. Kopiere `.env.example` zu `.env.local` und trage die Werte ein.
4. Öffne **SQL Editor** im Supabase-Dashboard und führe den Inhalt von
   `supabase/schema.sql` aus (legt Tabellen, RLS-Policies und Storage-Bucket an).
5. Optional in **Authentication → Providers**: E-Mail-Bestätigung aktivieren.

> Du kannst die App auch ohne Supabase starten — dann sind Login und
> Cloud-Speicher deaktiviert und du arbeitest nur lokal.

### 3. Dev-Server starten

```bash
npm run dev
```

Die App läuft dann auf http://localhost:5173.

### 4. Production Build

```bash
npm run build
npm run preview   # lokale Vorschau des Builds
```

---

## Deployment (kostenlos)

### Variante: Vercel + Supabase (empfohlen)

1. Git-Repo auf GitHub pushen.
2. Bei [vercel.com](https://vercel.com) einloggen und das Repo importieren.
3. Unter **Environment Variables** setzen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Framework Preset: **Vite**. Build Command: `npm run build`. Output: `dist`.
5. Deploy. Fertig.

Für höchste Sicherheit in Production zusätzlich per `vercel.json` folgende
HTTP-Header setzen:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "geolocation=(), microphone=(), camera=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

Alternativ funktionieren **Netlify** (`netlify.toml`) und **Cloudflare Pages** mit denselben Einstellungen.

---

## Docker (optional)

Docker ist **nicht nötig** für diesen Stack — npm+Vite+Supabase laufen lokal direkt. Für reproduzierbare Builds oder Self-Hosting gibt es dennoch optionale Docker-Files:

```bash
# Dev-Server im Container (Hot-Reload, Port 5173)
docker compose --profile dev up

# Production-Build im Container (nginx, Port 8080)
docker compose --profile prod up --build
```

Siehe `Dockerfile`, `docker-compose.yml` und `docker/nginx.conf` für Details.

Für **lokale Supabase-Entwicklung** (statt Cloud) gibt es zusätzlich die [Supabase CLI](https://supabase.com/docs/guides/cli), die intern Docker verwendet:

```bash
npm install -g supabase
supabase init
supabase start   # startet Postgres, Auth, Storage als Container
```

---

## Projektstruktur

```
GridPreview/
├── index.html               # CSP-Meta-Tag, Root-Div
├── package.json
├── vite.config.js           # Vendor-Chunks, ES2020-Build
├── .env.example             # Supabase-Konfig-Template
├── supabase/
│   └── schema.sql           # Tabellen, RLS, Storage-Bucket
└── src/
    ├── main.jsx             # React-Root mit AuthProvider
    ├── App.jsx              # Layout (Sidebar + Scene)
    ├── store.js             # Zustand-Store (State, History)
    ├── index.css            # Basis-Styles (Dark-Theme)
    ├── context/
    │   └── AuthContext.jsx  # Supabase-Session-Hook
    ├── lib/
    │   ├── supabase.js      # Client-Setup
    │   ├── gridfinity.js    # Grid-Math & Validierung
    │   └── modelLoader.js   # STL/OBJ-Loader + Datei-Check
    └── components/
        ├── Auth/AuthPanel.jsx
        ├── Scene/
        │   ├── GridScene.jsx
        │   ├── GridBase.jsx
        │   └── PlacedModel.jsx
        └── UI/
            ├── Toolbar.jsx
            ├── GridConfig.jsx
            ├── ModelLibrary.jsx
            └── ArrangementManager.jsx
```

## Bedienung

1. **Grid einstellen** (Sidebar links oben) — Breite, Tiefe, Einheit.
2. **Modell hochladen** (Button in "Modelle"). STL oder OBJ, bis 50 MB.
3. **Modell auswählen** (Klick auf den Eintrag in der Liste).
4. **Auf das Grid klicken** — das Modell rastet in die Zelle ein.
5. **R** dreht, **Entf** löscht, **Ctrl+Z** macht rückgängig.
6. **Anordnung benennen und speichern** (falls angemeldet).

## Roadmap / Ideen

- Per-User-Storage für STL-Dateien (derzeit werden Geometrien nur
  lokal im RAM gehalten — die DB speichert nur Platzierungs-Metadaten).
- Multi-Cell-Bins (Modelle, die 2x1, 2x2 etc. Zellen belegen).
- Teilen-Link pro Anordnung (read-only Share).
- Export der Szene als glTF/PNG.
- OAuth-Login (Google, GitHub) — in Supabase ein Klick.

## Lizenz

MIT
