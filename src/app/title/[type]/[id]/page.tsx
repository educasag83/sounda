import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import EpisodeCheck from "@/components/EpisodeCheck";
import LibraryButton from "@/components/LibraryButton";
import { computeProgress, type Watched } from "@/lib/progress";
import Notice from "@/components/Notice";
import { formatLongDate, fromNow } from "@/lib/dates";
import { getTitle, img, tmdbConfigured, type MediaType } from "@/lib/tmdb";
import { createClient, getUser } from "@/lib/supabase/server";

type Props = { params: Promise<{ type: string; id: string }> };

function parse(type: string, id: string): { type: MediaType; id: number } | null {
  const n = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(n) || n <= 0) return null;
  return { type, id: n };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, id } = await params;
  const p = parse(type, id);
  if (!p || !tmdbConfigured()) return {};
  try {
    const t = await getTitle(p.type, p.id);
    return { title: t.title, description: t.overview.slice(0, 160) };
  } catch {
    return {};
  }
}

export default async function TitlePage({ params }: Props) {
  const { type, id } = await params;
  const p = parse(type, id);
  if (!p) notFound();
  if (!tmdbConfigured()) return <Notice title="Falta conectar TMDB">Agrega <code>TMDB_READ_TOKEN</code> para ver las fichas.</Notice>;

  let t;
  try {
    t = await getTitle(p.type, p.id);
  } catch {
    notFound();
  }

  const user = await getUser();
  let inLibrary = false;
  let watched: Watched[] = [];
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase.from("library_items").select("id").match({ media_type: p.type, tmdb_id: p.id }).maybeSingle();
    inLibrary = Boolean(data);
    if (p.type === "tv") {
      const { data: rows } = await supabase.from("watched_episodes").select("season,episode").eq("tmdb_id", p.id);
      watched = rows ?? [];
    }
  }
  const progress = t.media_type === "tv" && user ? computeProgress(t, watched) : null;
  const libItem = { media_type: t.media_type, tmdb_id: t.id, title: t.title, poster_path: t.poster_path, backdrop_path: t.backdrop_path, year: t.year };

  const backdrop = img(t.backdrop_path, "w1280");
  const poster = img(t.poster_path, "w500");
  const facts = [
    t.media_type === "tv" ? "Serie" : "Película",
    t.year,
    t.runtime ? `${t.runtime} min${t.media_type === "tv" ? " por capítulo" : ""}` : null,
    t.number_of_seasons ? `${t.number_of_seasons} temporada${t.number_of_seasons > 1 ? "s" : ""}` : null,
  ].filter(Boolean);

  return (
    <article className="-mt-6">
      <div className="relative -mx-4 overflow-hidden sm:rounded-b-2xl">
        {backdrop && <Image src={backdrop} alt="" fill priority sizes="100vw" className="object-cover opacity-40" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
        <div className="relative flex flex-col gap-6 px-4 pb-8 pt-10 sm:flex-row sm:items-end sm:px-8 sm:pt-24">
          <div className="relative aspect-[2/3] w-36 shrink-0 overflow-hidden rounded-xl bg-white/5 shadow-2xl ring-1 ring-white/10 sm:w-56">
            {poster && <Image src={poster} alt={t.title} fill sizes="224px" className="object-cover" />}
          </div>
          <div className="min-w-0 space-y-3">
            {t.airing && (
              <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-300 ring-1 ring-red-400/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                </span>
                En emisión
              </span>
            )}
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
            {t.tagline && <p className="italic text-white/60">{t.tagline}</p>}
            <p className="text-sm text-white/70">{facts.join(" · ")}</p>
            {t.next_episode?.air_date ? (
              <p className="text-sm font-medium text-accent">
                Nuevo capítulo {fromNow(t.next_episode.air_date)} · T{t.next_episode.season_number} E{t.next_episode.episode_number}
              </p>
            ) : t.upcoming_season ? (
              <p className="text-sm font-medium text-accent">
                {t.upcoming_season.name} {t.upcoming_season.air_date ? `llega ${fromNow(t.upcoming_season.air_date)}` : "confirmada, sin fecha todavía"}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {t.vote_average > 0 && (
                <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">★ {t.vote_average.toFixed(1)}</span>
              )}
              {t.genres.map((g) => (
                <span key={g} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                  {g}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <LibraryButton inLibrary={inLibrary} item={libItem} />
              <Link href={`/explore/${t.media_type}/${t.id}`} className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/20">
                ✦ Explorar parecidas
              </Link>
              {t.trailer_key && (
                <a href={`https://www.youtube.com/watch?v=${t.trailer_key}`} target="_blank" rel="noreferrer" className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/20">
                  ▶ Ver tráiler
                </a>
              )}
              {t.imdb_id && (
                <a href={`https://www.imdb.com/title/${t.imdb_id}/`} target="_blank" rel="noreferrer" className="text-sm text-white/60 underline-offset-4 hover:underline">
                  IMDb
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_280px]">
        <div className="space-y-10">
          <section>
            <h2 className="mb-2 text-lg font-semibold">Sinopsis</h2>
            <p className="leading-relaxed text-white/80">{t.overview || "Sin sinopsis disponible en este idioma."}</p>
          </section>

          {t.cast.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold">Reparto</h2>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {t.cast.map((c) => {
                  const ph = img(c.profile_path, "w185");
                  return (
                    <div key={c.id} className="w-24 shrink-0">
                      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-white/5">
                        {ph && <Image src={ph} alt={c.name} fill sizes="96px" className="object-cover" />}
                      </div>
                      <p className="mt-1.5 text-xs font-medium leading-tight">{c.name}</p>
                      <p className="text-[11px] leading-tight text-white/50">{c.character}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {t.media_type === "tv" && t.seasons.length > 0 && (
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-lg font-semibold">Temporadas</h2>
                {progress && progress.aired > 0 && (
                  <p className="text-sm text-white/60">
                    {progress.watched} de {progress.aired} capítulos vistos
                  </p>
                )}
              </div>
              {progress && progress.aired > 0 && (
                <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((progress.watched / progress.aired) * 100)}%` }} />
                </div>
              )}
              {progress?.next && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-accent/10 p-4 ring-1 ring-accent/30">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-accent">{progress.watched ? "Te toca" : "Empieza por"}</p>
                    <Link href={`/title/tv/${t.id}/season/${progress.next.season}`} className="font-medium hover:underline">
                      Temporada {progress.next.season}, capítulo {progress.next.episode}
                    </Link>
                  </div>
                  <EpisodeCheck key={`${progress.next.season}x${progress.next.episode}`} variant="pill" show={libItem} season={progress.next.season} episodes={[progress.next.episode]} watched={false} />
                </div>
              )}
              <ul className="divide-y divide-white/10 rounded-xl bg-panel">
                {t.seasons.map((s) => {
                  const seen = watched.filter((w) => w.season === s.season_number).length;
                  return (
                    <li key={s.season_number}>
                      <Link href={`/title/tv/${t.id}/season/${s.season_number}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-white/5">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-white/50">
                          {user ? `${seen}/${s.episode_count} vistos` : `${s.episode_count} capítulos`}
                          {s.air_date ? ` · ${s.air_date.slice(0, 4)}` : ""} ›
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {t.next_episode && (
            <Link
              href={`/title/tv/${t.id}/season/${t.next_episode.season_number}`}
              className="block rounded-xl bg-accent/10 p-4 ring-1 ring-accent/30 hover:bg-accent/15"
            >
              <p className="text-xs uppercase tracking-wide text-accent">Próximo capítulo</p>
              <p className="mt-1 font-medium">
                T{t.next_episode.season_number} E{t.next_episode.episode_number} · {t.next_episode.name}
              </p>
              {t.next_episode.air_date && (
                <p className="text-sm text-white/70">
                  <span className="font-semibold text-accent">{capitalize(fromNow(t.next_episode.air_date))}</span> · {formatLongDate(t.next_episode.air_date)}
                </p>
              )}
            </Link>
          )}
          {!t.next_episode && t.upcoming_season && (
            <Link
              href={`/title/tv/${t.id}/season/${t.upcoming_season.season_number}`}
              className="block rounded-xl bg-accent/10 p-4 ring-1 ring-accent/30 hover:bg-accent/15"
            >
              <p className="text-xs uppercase tracking-wide text-accent">Próxima temporada</p>
              <p className="mt-1 font-medium">{t.upcoming_season.name}</p>
              <p className="text-sm text-white/70">
                {t.upcoming_season.air_date ? (
                  <>
                    <span className="font-semibold text-accent">{capitalize(fromNow(t.upcoming_season.air_date))}</span> · {formatLongDate(t.upcoming_season.air_date)}
                  </>
                ) : (
                  "Confirmada, todavía sin fecha"
                )}
              </p>
            </Link>
          )}
          <div className="rounded-xl bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Dónde ver</p>
            {t.providers.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {t.providers.map((pr) => (
                  <Image key={pr.provider_id} src={img(pr.logo_path, "w185")!} alt={pr.provider_name} title={pr.provider_name} width={40} height={40} className="rounded-lg" />
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-white/60">Sin datos de streaming en tu región.</p>
            )}
            <p className="mt-3 text-[11px] text-white/30">Datos de JustWatch vía TMDB</p>
          </div>
          {t.status && (
            <div className="rounded-xl bg-panel p-4 text-sm">
              <p className="text-xs uppercase tracking-wide text-white/40">Estado</p>
              <p className="mt-1">{STATUS[t.status] ?? t.status}</p>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATUS: Record<string, string> = {
  Ended: "Finalizada",
  "Returning Series": "En emisión",
  Canceled: "Cancelada",
  "In Production": "En producción",
  Planned: "Anunciada",
  Released: "Estrenada",
  "Post Production": "En posproducción",
  Rumored: "Rumoreada",
};
