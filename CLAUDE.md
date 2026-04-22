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

Copy `.env.example` to `.env.local` and fill in the Supabase project URL and anon key before running the dev server. Without this, auth and arrangement persistence will not work.

## Architecture

**Frontend-only React SPA.** All backend logic is handled by Supabase (Postgres with RLS + Storage). No custom server.

### State

`src/store.js` is the single Zustand store. It holds:
- Grid configuration (`width`, `depth`, `unitMm`)
- `models` map: `id → { name, geometry, format, color }` (geometries live in RAM only, never persisted)
- `placements` array: `{ id, modelId, cellX, cellY, rotation }` — what's saved to Supabase
- Undo/redo history stacks
- `isDirty` flag (unsaved changes)

### Data Flow

1. **Upload** — `ModelLibrary` → `lib/modelLoader.js` → geometry added to `store.models`
2. **Place** — click/drag on `GridScene` (raycasting against a plane) → `store.placeModel()`
3. **Render** — `GridScene` maps `store.placements` to `<PlacedModel />` components (React-Three-Fiber)
4. **Save** — `ArrangementManager` serializes grid config + placements JSONB → Supabase `arrangements` table

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
- `public.user_models` — file metadata (geometry itself is NOT stored server-side)
- Storage bucket `models` — 50 MB limit, scoped to `{user_id}/` paths

### Build / Deploy

- Vite splits vendors: `three`, `supabase` into separate chunks (`vite.config.js`)
- Vercel deployment: `vercel.json` sets CSP and other security headers
- Docker: multi-stage build (Node builder → nginx), optional `docker-compose.yml`
