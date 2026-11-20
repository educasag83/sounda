-- Biblioteca del usuario: cada serie o película que descubrió o agregó.
create table if not exists public.library_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  title text not null,
  poster_path text,
  backdrop_path text,
  year text,
  -- 'search' = agregado a mano, 'recognition' = descubierto escuchando
  source text not null default 'search' check (source in ('search', 'recognition')),
  status text not null default 'watching' check (status in ('watching', 'plan', 'completed', 'dropped')),
  added_at timestamptz not null default now(),
  unique (user_id, media_type, tmdb_id)
);

create index if not exists library_items_user_idx on public.library_items (user_id, added_at desc);

alter table public.library_items enable row level security;

create policy "Cada usuario ve su biblioteca"
  on public.library_items for select using (auth.uid() = user_id);
create policy "Cada usuario agrega a su biblioteca"
  on public.library_items for insert with check (auth.uid() = user_id);
create policy "Cada usuario edita su biblioteca"
  on public.library_items for update using (auth.uid() = user_id);
create policy "Cada usuario borra de su biblioteca"
  on public.library_items for delete using (auth.uid() = user_id);
