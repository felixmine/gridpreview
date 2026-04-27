-- =====================================================================
-- Gridfinity Preview - Supabase Schema
-- =====================================================================
-- Führe dieses Skript im Supabase SQL-Editor aus, NACHDEM du ein
-- neues Projekt erstellt hast. Es legt Tabellen, Indizes, RLS-Policies
-- und den Storage-Bucket an.
--
-- Sicherheitskonzept:
--   - Row Level Security (RLS) ist AUF ALLEN Tabellen aktiv.
--   - Jeder authentifizierte User kann nur seine eigenen Daten sehen
--     und verändern (user_id = auth.uid()).
--   - Der `anon` Key hat KEINEN direkten Zugriff auf Daten -
--     nur angemeldete Sessions über RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelle: user_models
-- Metadaten für hochgeladene STL/OBJ-Dateien.
-- Die eigentlichen Dateien liegen im Storage-Bucket `models`.
-- ---------------------------------------------------------------------
create table if not exists public.user_models (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 128),
  file_path     text not null,                  -- Pfad innerhalb des Storage-Buckets
  file_format   text not null check (file_format in ('stl', 'obj', '3mf', 'step')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 52428800), -- max 50 MB
  checksum      text,                           -- optionaler SHA-256 Hash
  created_at    timestamptz not null default now()
);

create index if not exists user_models_user_id_idx on public.user_models(user_id);

alter table public.user_models enable row level security;

create policy "models_select_own"
  on public.user_models for select
  using (auth.uid() = user_id);

create policy "models_insert_own"
  on public.user_models for insert
  with check (auth.uid() = user_id);

create policy "models_update_own"
  on public.user_models for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "models_delete_own"
  on public.user_models for delete
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- Tabelle: arrangements
-- Speichert das Grid-Layout plus Platzierungen als JSON.
-- Struktur des `placements`-Felds (validiert im Frontend):
--   [
--     { "model_id": "uuid", "cell_x": 0, "cell_y": 0,
--       "rotation": 0, "color": "#a0a0a0" },
--     ...
--   ]
-- ---------------------------------------------------------------------
create table if not exists public.arrangements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  grid_width   int  not null check (grid_width  between 1 and 20),
  grid_depth   int  not null check (grid_depth  between 1 and 20),
  unit_mm      int  not null default 42 check (unit_mm between 10 and 200),
  placements   jsonb not null default '[]'::jsonb,
  preview_url  text,                               -- base64 JPEG thumbnail, nullable
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists arrangements_user_id_idx on public.arrangements(user_id);
create index if not exists arrangements_updated_idx on public.arrangements(updated_at desc);

alter table public.arrangements enable row level security;

create policy "arrangements_select_own"
  on public.arrangements for select
  using (auth.uid() = user_id);

create policy "arrangements_insert_own"
  on public.arrangements for insert
  with check (auth.uid() = user_id);

create policy "arrangements_update_own"
  on public.arrangements for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "arrangements_delete_own"
  on public.arrangements for delete
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- Trigger: updated_at automatisch aktualisieren
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists arrangements_touch_updated on public.arrangements;
create trigger arrangements_touch_updated
  before update on public.arrangements
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------
-- Storage-Bucket für Modell-Dateien
-- WICHTIG: NICHT public - Zugriff nur über signed URLs / Auth.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'models',
  'models',
  false,                                              -- nicht öffentlich
  52428800,                                           -- 50 MB
  array[
    'model/stl','application/vnd.ms-pki.stl','application/sla',
    'model/obj','text/plain',
    'model/3mf','application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
    'application/step','application/x-step','model/step+zip',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;


-- Storage-RLS: User darf nur in seinen eigenen Unterordner schreiben/lesen.
-- Konvention: file_path beginnt mit `<user_id>/...`
create policy "models_storage_read_own"
  on storage.objects for select
  using (
    bucket_id = 'models'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "models_storage_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'models'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "models_storage_update_own"
  on storage.objects for update
  using (
    bucket_id = 'models'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "models_storage_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'models'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
