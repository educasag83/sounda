import "server-only";

const API = process.env.TMDB_API_BASE || "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export type MediaType = "movie" | "tv";

export type SearchResult = {
  id: number;
  media_type: MediaType;
  title: string;
  year: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
};

export type CastMember = { id: number; name: string; character: string; profile_path: string | null };
export type Season = { season_number: number; name: string; episode_count: number; air_date: string | null; poster_path: string | null };
export type Provider = { provider_id: number; provider_name: string; logo_path: string };

export type TitleDetails = SearchResult & {
  tagline: string;
  genres: string[];
  runtime: number | null;
  status: string;
  cast: CastMember[];
  seasons: Season[];
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  next_episode: { season_number: number; episode_number: number; name: string; air_date: string } | null;
  last_episode: { season_number: number; episode_number: number } | null;
  trailer_key: string | null;
  providers: Provider[];
  imdb_id: string | null;
};

export function tmdbConfigured() {
  return Boolean(process.env.TMDB_READ_TOKEN);
}

export function img(path: string | null | undefined, size: "w185" | "w342" | "w500" | "w780" | "w1280" | "original" = "w342") {
  return path ? `${IMG}/${size}${path}` : null;
}

async function tmdb<T>(path: string, params: Record<string, string> = {}, revalidate = 3600): Promise<T> {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) throw new Error("Falta TMDB_READ_TOKEN en las variables de entorno.");
  const url = new URL(API + path);
  url.searchParams.set("language", process.env.TMDB_LANGUAGE || "es-MX");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} en ${path}`);
  return res.json() as Promise<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function normalize(r: Raw, fallbackType?: MediaType): SearchResult {
  const media_type: MediaType = r.media_type === "tv" || (!r.media_type && fallbackType === "tv") ? "tv" : "movie";
  const date: string = r.release_date || r.first_air_date || "";
  return {
    id: r.id,
    media_type,
    title: r.title || r.name || "",
    year: date.slice(0, 4),
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
    overview: r.overview || "",
    vote_average: r.vote_average ?? 0,
  };
}

export async function searchTitles(query: string): Promise<SearchResult[]> {
  const data = await tmdb<{ results: Raw[] }>("/search/multi", { query, include_adult: "false" }, 600);
  return data.results.filter((r) => r.media_type === "movie" || r.media_type === "tv").map((r) => normalize(r));
}

export async function trending(): Promise<SearchResult[]> {
  const data = await tmdb<{ results: Raw[] }>("/trending/all/week");
  return data.results.filter((r) => r.media_type === "movie" || r.media_type === "tv").map((r) => normalize(r));
}

export async function getTitle(type: MediaType, id: number): Promise<TitleDetails> {
  const r = await tmdb<Raw>(`/${type}/${id}`, {
    append_to_response: "credits,videos,watch/providers,external_ids",
    include_video_language: "es,en",
  });
  const base = normalize(r, type);
  const region = process.env.TMDB_REGION || "UY";
  const prov = r["watch/providers"]?.results?.[region];
  const videos: Raw[] = r.videos?.results ?? [];
  const trailer = videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ?? videos.find((v) => v.site === "YouTube");
  return {
    ...base,
    media_type: type,
    tagline: r.tagline || "",
    genres: (r.genres ?? []).map((g: Raw) => g.name),
    runtime: r.runtime ?? r.episode_run_time?.[0] ?? null,
    status: r.status || "",
    cast: (r.credits?.cast ?? []).slice(0, 12).map((c: Raw) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profile_path: c.profile_path,
    })),
    seasons: (r.seasons ?? []).filter((s: Raw) => s.season_number > 0),
    number_of_seasons: r.number_of_seasons ?? null,
    number_of_episodes: r.number_of_episodes ?? null,
    next_episode: r.next_episode_to_air ?? null,
    last_episode: r.last_episode_to_air ?? null,
    trailer_key: trailer?.key ?? null,
    providers: prov?.flatrate ?? [],
    imdb_id: r.imdb_id ?? r.external_ids?.imdb_id ?? null,
  };
}

/** Busca la mejor coincidencia en TMDB para un título adivinado. */
export async function findTitle(type: MediaType, title: string, year: number | null): Promise<SearchResult | null> {
  const params: Record<string, string> = { query: title, include_adult: "false" };
  if (year) params[type === "movie" ? "primary_release_year" : "first_air_date_year"] = String(year);
  let data = await tmdb<{ results: Raw[] }>(`/search/${type}`, params, 600);
  if (!data.results.length && year) data = await tmdb<{ results: Raw[] }>(`/search/${type}`, { query: title }, 600);
  const first = data.results[0];
  return first ? normalize(first, type) : null;
}

export type Episode = { season_number: number; episode_number: number; name: string; still_path: string | null; air_date: string | null };

export async function getEpisode(tvId: number, season: number, episode: number): Promise<Episode | null> {
  try {
    const r = await tmdb<Raw>(`/tv/${tvId}/season/${season}/episode/${episode}`);
    return { season_number: r.season_number, episode_number: r.episode_number, name: r.name, still_path: r.still_path, air_date: r.air_date };
  } catch {
    return null;
  }
}

export type SeasonEpisode = Episode & { overview: string; runtime: number | null };

export async function getSeason(tvId: number, season: number): Promise<{ name: string; overview: string; episodes: SeasonEpisode[] } | null> {
  try {
    const r = await tmdb<Raw>(`/tv/${tvId}/season/${season}`);
    return {
      name: r.name,
      overview: r.overview || "",
      episodes: (r.episodes ?? []).map((e: Raw) => ({
        season_number: e.season_number,
        episode_number: e.episode_number,
        name: e.name,
        overview: e.overview || "",
        still_path: e.still_path ?? null,
        air_date: e.air_date ?? null,
        runtime: e.runtime ?? null,
      })),
    };
  } catch {
    return null;
  }
}
