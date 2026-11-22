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
  /** Temporada nueva con fecha de estreno futura (si TMDB la tiene). */
  upcoming_season: Season | null;
  /** true si la serie sigue saliendo (en emisión o con capítulos por venir). */
  airing: boolean;
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

const FALLBACK_LANGUAGE = "en-US";

/** TMDB en español suele traer "Episodio 3" o nada cuando nadie tradujo el nombre. */
export function isGenericEpisodeName(name: string | null | undefined, episode?: number) {
  const n = (name ?? "").trim();
  if (!n) return true;
  if (/^(episodio|cap[ií]tulo|episode|ep\.?)\s*\d+$/i.test(n)) return true;
  return episode !== undefined && n === String(episode);
}

function pickName(local: string | null | undefined, fallback: string | null | undefined, episode: number) {
  if (!isGenericEpisodeName(local, episode)) return local!.trim();
  if (!isGenericEpisodeName(fallback, episode)) return fallback!.trim();
  return `Capítulo ${episode}`;
}

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
  const seasons: Season[] = (r.seasons ?? []).filter((s: Raw) => s.season_number > 0);
  const today = new Date().toISOString().slice(0, 10);
  const nextEp: Raw | null = r.next_episode_to_air ?? null;
  let next_episode: TitleDetails["next_episode"] = null;
  if (nextEp) {
    let name = nextEp.name;
    if (isGenericEpisodeName(name, nextEp.episode_number)) {
      const en = await getEpisodeRaw(id, nextEp.season_number, nextEp.episode_number, FALLBACK_LANGUAGE);
      name = en?.name;
    }
    next_episode = {
      season_number: nextEp.season_number,
      episode_number: nextEp.episode_number,
      name: pickName(name, null, nextEp.episode_number),
      air_date: nextEp.air_date,
    };
  }
  const airing = type === "tv" && (r.status === "Returning Series" || r.in_production === true || Boolean(next_episode));
  const lastSeason: number = r.last_episode_to_air?.season_number ?? 0;
  const upcoming_season = airing
    ? (seasons.find((s) => s.air_date && s.air_date > today) ??
      seasons.find((s) => s.season_number > lastSeason && !s.air_date && lastSeason > 0) ??
      null)
    : null;
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
    seasons,
    number_of_seasons: r.number_of_seasons ?? null,
    number_of_episodes: r.number_of_episodes ?? null,
    next_episode,
    last_episode: r.last_episode_to_air ?? null,
    upcoming_season,
    airing,
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

async function getEpisodeRaw(tvId: number, season: number, episode: number, language?: string): Promise<Raw | null> {
  try {
    return await tmdb<Raw>(`/tv/${tvId}/season/${season}/episode/${episode}`, language ? { language } : {});
  } catch {
    return null;
  }
}

export async function getEpisode(tvId: number, season: number, episode: number): Promise<Episode | null> {
  const r = await getEpisodeRaw(tvId, season, episode);
  if (!r) return null;
  const en = isGenericEpisodeName(r.name, r.episode_number) ? await getEpisodeRaw(tvId, season, episode, FALLBACK_LANGUAGE) : null;
  return {
    season_number: r.season_number,
    episode_number: r.episode_number,
    name: pickName(r.name, en?.name, r.episode_number),
    still_path: r.still_path,
    air_date: r.air_date,
  };
}

export type SeasonEpisode = Episode & { overview: string; runtime: number | null };

export async function getSeason(tvId: number, season: number): Promise<{ name: string; overview: string; episodes: SeasonEpisode[] } | null> {
  try {
    const r = await tmdb<Raw>(`/tv/${tvId}/season/${season}`);
    const episodes: Raw[] = r.episodes ?? [];
    // Si faltan nombres o sinopsis en español, los completamos con los de inglés.
    const needsFallback = episodes.some((e) => isGenericEpisodeName(e.name, e.episode_number) || !e.overview);
    const en = needsFallback
      ? await tmdb<Raw>(`/tv/${tvId}/season/${season}`, { language: FALLBACK_LANGUAGE }).catch(() => null)
      : null;
    const enByNumber = new Map<number, Raw>((en?.episodes ?? []).map((e: Raw) => [e.episode_number, e]));
    return {
      name: r.name,
      overview: r.overview || en?.overview || "",
      episodes: episodes.map((e: Raw) => ({
        season_number: e.season_number,
        episode_number: e.episode_number,
        name: pickName(e.name, enByNumber.get(e.episode_number)?.name, e.episode_number),
        overview: e.overview || enByNumber.get(e.episode_number)?.overview || "",
        still_path: e.still_path ?? null,
        air_date: e.air_date ?? null,
        runtime: e.runtime ?? null,
      })),
    };
  } catch {
    return null;
  }
}

/* ---------- Explorar: grafo de títulos parecidos ---------- */

export type GraphKind = MediaType;

export type GraphNode = {
  /** Clave única: "tv-1399", "movie-603". */
  key: string;
  kind: GraphKind;
  id: number;
  label: string;
  /** "Serie · 2019" o "Película · 2010". */
  sub: string;
  image: string | null;
  backdrop: string | null;
  year: string;
  rating: number;
};

// Programas de entrevistas, noticias y realities no son buenas recomendaciones.
const NOISY_GENRES = new Set([10763, 10764, 10767]);

function titleNode(r: Raw, fallbackType?: MediaType): GraphNode {
  const t = normalize(r, fallbackType);
  return {
    key: `${t.media_type}-${t.id}`,
    kind: t.media_type,
    id: t.id,
    label: t.title,
    sub: [t.media_type === "tv" ? "Serie" : "Película", t.year].filter(Boolean).join(" · "),
    image: t.poster_path,
    backdrop: t.backdrop_path,
    year: t.year,
    rating: t.vote_average,
  };
}

/** Un título y sus vecinos: series o películas recomendadas y parecidas. */
export async function getTitleNeighbors(type: MediaType, id: number): Promise<{ node: GraphNode; neighbors: GraphNode[] }> {
  const r = await tmdb<Raw>(`/${type}/${id}`, { append_to_response: "recommendations,similar" }, 86400);
  const node = titleNode(r, type);
  const seen = new Set<string>([node.key]);
  const neighbors: GraphNode[] = [];
  const pool: Raw[] = [...(r.recommendations?.results ?? []), ...(r.similar?.results ?? [])];
  for (const raw of pool) {
    if (neighbors.length >= 10) break;
    if (!raw.poster_path || (raw.genre_ids ?? []).some((g: number) => NOISY_GENRES.has(g))) continue;
    const n = titleNode(raw, type);
    if (seen.has(n.key)) continue;
    seen.add(n.key);
    neighbors.push(n);
  }
  return { node, neighbors };
}
