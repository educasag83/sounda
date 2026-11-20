-- Historial de reconocimientos (como el historial de Shazam).
create table if not exists public.recognitions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  transcript text not null,
  media_type text check (media_type in ('movie', 'tv')),
  tmdb_id integer,
  title text,
  season integer,
  episode integer,
  confidence text,
  created_at timestamptz not null default now()
);

create index if not exists recognitions_user_idx on public.recognitions (user_id, created_at desc);

alter table public.recognitions enable row level security;

create policy "Cada usuario ve sus reconocimientos"
  on public.recognitions for select using (auth.uid() = user_id);
create policy "Cada usuario guarda sus reconocimientos"
  on public.recognitions for insert with check (auth.uid() = user_id);

-- Último capítulo reconocido de cada serie en la biblioteca.
alter table public.library_items add column if not exists last_season integer;
alter table public.library_items add column if not exists last_episode integer;
