-- Capítulos vistos por cada usuario (seguimiento estilo TV Time).
create table if not exists public.watched_episodes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  season integer not null,
  episode integer not null,
  watched_at timestamptz not null default now(),
  unique (user_id, tmdb_id, season, episode)
);

create index if not exists watched_episodes_user_show_idx on public.watched_episodes (user_id, tmdb_id);

alter table public.watched_episodes enable row level security;

create policy "Cada usuario ve sus capítulos"
  on public.watched_episodes for select using (auth.uid() = user_id);
create policy "Cada usuario marca sus capítulos"
  on public.watched_episodes for insert with check (auth.uid() = user_id);
create policy "Cada usuario desmarca sus capítulos"
  on public.watched_episodes for delete using (auth.uid() = user_id);
