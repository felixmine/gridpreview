# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at localhost:5173 (Vite HMR)
npm run build     # Production build → dist/
npm run preview   # Serve the production build locally
npm run lint      # ESLint
```

No test framework is configured.

## Environment Setup

Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable key before running the dev server. Without this, auth and arrangement persistence will not work.

## Architecture

**Frontend-only React SPA.** All backend logic is handled by Supabase (Postgres with RLS + Storage). No custom server.

### State

`src/store.js` is the single Zustand store. It holds:
- Grid configuration (`width`, `depth`, `unitMm`)
- `models` map: `id → { name, geometry, format, color }` (geometries live in RAM; raw files are persisted to Supabase Storage and re-parsed on restore)
- `placements` array: `{ id, model_id, cell_x, cell_y, rotation, color }` — what's saved to Supabase
- Undo/redo history stacks
- `isDirty` flag (unsaved changes)

### Data Flow

1. **Upload** — `BottomDrawer` → `lib/modelLoader.js` → geometry added to `store.models` → raw file uploaded to Supabase Storage via `lib/modelPersistence.js` (background, non-blocking)
2. **Place** — click/drag on `GridScene` (raycasting against a plane) → `store.placeModel()`
3. **Render** — `GridScene` maps `store.placements` to `<PlacedModel />` components (React-Three-Fiber)
4. **Save** — `Toolbar` serializes grid config + placements JSONB → Supabase `arrangements` table
5. **Load** — `Toolbar` fetches arrangement → `restoreModels` re-downloads and re-parses any model files missing from RAM

### File Loading Pipeline (`src/lib/modelLoader.js`)

| Format | Parser |
|--------|--------|
| STL / OBJ | Three.js loaders |
| 3MF | Custom parser (splits per build item) + Three.js fallback |
| STEP / STP | OpenCASCADE WASM (`occt-import-js`) — lazy-loaded ~4–5 MB, expensive |

Validation: 50 MB max, 1.5 M triangle limit, extension whitelist (`.stl .obj .3mf .step .stp`).

### 3D Scene (`src/components/Scene/`)

- `GridScene.jsx` — root `<Canvas>`, OrbitControls, drag placement (pointer events + raycasting), keyboard shortcuts (R=rotate, Delete, Ctrl+Z/Y, arrow keys)
- `GridBase.jsx` — renders the cell grid as wireframe/plane
- `PlacedModel.jsx` — single placed mesh; instance color highlight for selection
- `SceneErrorBoundary.jsx` — catches Three.js render errors

### Grid Math (`src/lib/gridfinity.js`)

World coordinates are centered; cell (0,0) is bottom-left. All cell↔world coordinate transforms live here. Default unit: 42 mm (Gridfinity standard).

### Auth (`src/context/AuthContext.jsx`)

Supabase email/password auth. Session stored in localStorage. `AuthContext` provides the current user; `AuthPanel` is the login UI.

### Supabase Schema

- `public.arrangements` — grid config + `placements` JSONB array, per-user RLS
- `public.user_models` — one row per parsed model part; columns: `model_id`, `user_id`, `storage_path`, `part_index`, `name`, `format`, `size_bytes`, `created_at`
- `public.app_config` — key/value settings table; `model_retention_days` (default `7`) controls how long uploaded model files are kept
- Storage bucket `models` — 50 MB per file, scoped to `{user_id}/` paths; files auto-expire via cleanup function

### Model Persistence Flow

1. User uploads a file → parsed locally → parts added to store → file uploaded to Storage once (`{userId}/{uuid}.{ext}`) → one `user_models` row inserted per parsed part
2. User loads a saved arrangement → `restoreModels` checks which model IDs are missing from RAM → downloads and re-parses each missing file from Storage

### Edge Functions

| Function | Purpose |
|---|---|
| `cleanup-models` | Deletes `user_models` rows and orphaned Storage files older than `model_retention_days` |
| `import-model` | Proxy for Printables / MakerWorld model downloads (kept but not wired to UI) |

#### Deploying cleanup-models (Supabase Free plan)

Deploy without a schedule:
```bash
supabase functions deploy cleanup-models
```

**cron-job.org is already configured** (daily at 03:00 UTC) with:
- URL: `https://ejfeqrrcjrljjehgknif.supabase.co/functions/v1/cleanup-models`
- Method: POST
- Header: `Authorization: Bearer <publishable key>`

To change the retention window: open the Supabase Table Editor → `app_config` table → edit the `model_retention_days` value (currently `7`). No redeploy needed.

On Supabase Pro, the schedule can be set at deploy time instead:
```bash
supabase functions deploy cleanup-models --schedule "0 3 * * *"
```

#### First-time Supabase setup (run in SQL Editor)

`public.app_config` is already created. Still needed if starting fresh:

```sql
-- user_models: tracks uploaded model files per user
CREATE TABLE IF NOT EXISTS public.user_models (
  model_id     TEXT        PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  storage_path TEXT        NOT NULL,
  part_index   INT         NOT NULL DEFAULT 0,
  name         TEXT        NOT NULL,
  format       TEXT        NOT NULL,
  size_bytes   BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own models" ON public.user_models
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage policies for the 'models' bucket
CREATE POLICY "Users upload own models" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own models" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own models" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### Build / Deploy

- Vite splits vendors: `three`, `supabase` into separate chunks (`vite.config.js`)
- Vercel deployment: `vercel.json` sets CSP and other security headers
- Docker: multi-stage build (Node builder → nginx), optional `docker-compose.yml`
