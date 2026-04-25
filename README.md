# Gridfinity Preview

A web app for configuring a [Gridfinity](https://gridfinity.xyz/) grid in the browser, uploading custom STL/OBJ models, placing them on the grid with snapping, and saving arrangements to the cloud.

Stack: **React + Vite**, **Three.js** (via `@react-three/fiber` + `drei`), **Supabase** (Auth, Postgres, Storage), Zustand for state.

## Features

- Grid configurator (width, depth, unit size — default 42 mm)
- Upload **STL, OBJ, 3MF and STEP/STP** with validation and triangle-count limit
  - STL/OBJ/3MF parsed directly (three.js loaders)
  - STEP tessellated via OpenCASCADE WASM (loaded on demand, ~4–5 MB)
- 3D preview with OrbitControls and gizmo
- Drag-to-place with grid snapping
- Select, rotate (90° steps), and color-code placed models
- Undo/redo and keyboard shortcuts
- User accounts (email + password) via Supabase Auth
- Arrangements saved per user to the cloud (Postgres + RLS)
- Warning on unsaved changes

## Security

| Feature | Implementation |
|---|---|
| Row Level Security | All tables (`user_models`, `arrangements`) and the storage bucket have RLS policies restricting access to `auth.uid() = user_id`. |
| No service keys in the frontend | Only the public `anon` key is shipped. |
| Content Security Policy | Set as a meta tag in `index.html`. Also set as an HTTP header on deployment. |
| Input validation | Grid config, placements, and files are validated in the frontend before INSERT. |
| Upload limits | 50 MB per file, file type whitelist (`.stl`, `.obj`, `.3mf`, `.step`, `.stp`), triangle count ≤ 1.5 M. |
| XSS protection | React escapes everything automatically. No `dangerouslySetInnerHTML`. |
| Password policy | Minimum 8 characters; Supabase enforces additional rules. |
| Tokens | Session tokens in `localStorage` (Supabase default). For maximum security, cookie-based auth can be configured. |
| Email confirmation | Supabase can enforce "Confirm Email" in project settings (recommended). |

---

## Local Development

### 1. Install dependencies

```bash
cd /path/to/GridPreview
npm install
```

### 2. Set up a Supabase project

1. Go to [supabase.com](https://supabase.com) → create a new project (free tier is enough).
2. In **Project Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Open the **SQL Editor** in the Supabase dashboard and run the contents of
   `supabase/schema.sql` (creates tables, RLS policies, and storage bucket).
5. Optionally enable email confirmation under **Authentication → Providers**.

> You can also run the app without Supabase — login and cloud storage will be
> disabled and you work locally only.

### 3. Start the dev server

```bash
npm run dev
```

The app runs at http://localhost:5173.

### 4. Production build

```bash
npm run build
npm run preview   # local preview of the build
```

---

## Deployment (free)

### Option: Vercel + Supabase (recommended)

1. Push the git repo to GitHub.
2. Log in to [vercel.com](https://vercel.com) and import the repo.
3. Set the following **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.
5. Deploy. Done.

For maximum security in production, set the following HTTP headers via `vercel.json`:

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

**Netlify** (`netlify.toml`) and **Cloudflare Pages** work with the same setup.

---

## Docker (optional)

Docker is **not required** for this stack — npm + Vite + Supabase run locally without it. Optional Docker files are provided for reproducible builds or self-hosting:

```bash
# Dev server in a container (hot reload, port 5173)
docker compose --profile dev up

# Production build in a container (nginx, port 8080)
docker compose --profile prod up --build
```

See `Dockerfile`, `docker-compose.yml`, and `docker/nginx.conf` for details.

For **local Supabase development** (instead of cloud), use the [Supabase CLI](https://supabase.com/docs/guides/cli), which runs Postgres, Auth, and Storage as containers:

```bash
npm install -g supabase
supabase init
supabase start
```

---

## Project Structure

```
GridPreview/
├── index.html                     # CSP meta tag, root div
├── package.json
├── vite.config.js                 # Vendor chunks, ES2020 build
├── vercel.json                    # Security headers
├── .env.example                   # Supabase config template
├── supabase/
│   └── schema.sql                 # Tables, RLS policies, storage bucket
└── src/
    ├── main.jsx                   # React root with AuthProvider
    ├── App.jsx                    # Layout (toolbar + scene + drawer)
    ├── store.js                   # Zustand store (state, undo/redo history)
    ├── index.css                  # Base styles (dark theme)
    ├── context/
    │   └── AuthContext.jsx        # Supabase session hook
    ├── lib/
    │   ├── supabase.js            # Client setup
    │   ├── gridfinity.js          # Grid math & coordinate transforms
    │   └── modelLoader.js         # STL/OBJ/3MF/STEP loader + validation
    └── components/
        ├── Auth/AuthPanel.jsx
        ├── Scene/
        │   ├── GridScene.jsx      # Canvas, OrbitControls, placement logic
        │   ├── GridBase.jsx       # Cell grid wireframe
        │   ├── PlacedModel.jsx    # Single placed mesh with selection highlight
        │   └── SceneErrorBoundary.jsx
        └── UI/
            ├── Toolbar.jsx        # Top toolbar (grid config, auth, save)
            ├── BottomDrawer.jsx   # Collapsible model library drawer
            ├── ModelLibrary.jsx   # Model tile strip with upload tile
            ├── ModelThumbnail.jsx # Off-screen Three.js render → data URL
            ├── ColorPicker.jsx    # Hex color picker popover
            └── ArrangementManager.jsx
```

## Usage

1. **Configure the grid** (toolbar) — width, depth, unit size.
2. **Upload a model** — drag files onto the drawer or click the upload button. STL, OBJ, 3MF, or STEP, up to 50 MB.
3. **Select a model** — click a tile in the bottom drawer.
4. **Click a cell** on the grid — the model snaps into place.
5. **R** rotates, **Del** removes, **Ctrl+Z** undoes, **arrow keys** move the selected model.
6. **Name and save the arrangement** (requires login).

## Roadmap / Ideas

- Per-user storage for model files (geometries are currently held in RAM only — the DB stores placement metadata only).
- Multi-cell bins (models occupying 2×1, 2×2, etc. cells).
- Share link per arrangement (read-only).
- Export scene as glTF / PNG.
- OAuth login (Google, GitHub) — one click in Supabase.

## License

MIT
