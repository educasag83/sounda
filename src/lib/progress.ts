import type { TitleDetails } from "./tmdb";

export type Watched = { season: number; episode: number };

export type Progress = {
  watched: number;
  aired: number;
  /** Próximo capítulo ya emitido que el usuario no vio, o null si está al día. */
  next: { season: number; episode: number } | null;
};

/** Calcula el progreso de una serie a partir de los capítulos vistos. */
export function computeProgress(show: Pick<TitleDetails, "seasons" | "last_episode">, watched: Watched[]): Progress {
  const last = show.last_episode;
  const isAired = (s: number, e: number) =>
    !last || s < last.season_number || (s === last.season_number && e <= last.episode_number);

  const seen = new Set(watched.map((w) => `${w.season}x${w.episode}`));
  let aired = 0;
  let watchedAired = 0;
  for (const season of show.seasons) {
    for (let e = 1; e <= season.episode_count; e++) {
      if (!isAired(season.season_number, e)) continue;
      aired++;
      if (seen.has(`${season.season_number}x${e}`)) watchedAired++;
    }
  }

  // El siguiente es el que sigue al último visto (como TV Time), no el primer hueco.
  let next: Progress["next"] = null;
  const furthest = watched.reduce<Watched | null>(
    (a, w) => (!a || w.season > a.season || (w.season === a.season && w.episode > a.episode) ? w : a),
    null,
  );
  const seasons = [...show.seasons].sort((a, b) => a.season_number - b.season_number);
  if (!furthest) {
    const first = seasons.find((s) => s.episode_count > 0);
    if (first && isAired(first.season_number, 1)) next = { season: first.season_number, episode: 1 };
  } else {
    const cur = seasons.find((s) => s.season_number === furthest.season);
    if (cur && furthest.episode < cur.episode_count) {
      next = { season: furthest.season, episode: furthest.episode + 1 };
    } else {
      const following = seasons.find((s) => s.season_number > furthest.season && s.episode_count > 0);
      if (following) next = { season: following.season_number, episode: 1 };
    }
    if (next && !isAired(next.season, next.episode)) next = null;
  }

  return { watched: watchedAired, aired, next };
}
