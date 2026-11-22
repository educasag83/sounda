import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import EpisodeCheck from "@/components/EpisodeCheck";
import { formatDate } from "@/lib/dates";
import { getSeason, getTitle, img, tmdbConfigured } from "@/lib/tmdb";
import { createClient, getUser } from "@/lib/supabase/server";

type Props = { params: Promise<{ type: string; id: string; season: string }> };

function parse(p: { type: string; id: string; season: string }) {
  const id = Number(p.id);
  const season = Number(p.season);
  if (p.type !== "tv" || !Number.isInteger(id) || id <= 0 || !Number.isInteger(season) || season < 0) return null;
  return { id, season };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = parse(await params);
  if (!p || !tmdbConfigured()) return {};
  try {
    const show = await getTitle("tv", p.id);
    return { title: `${show.title} · Temporada ${p.season}` };
  } catch {
    return {};
  }
}

export default async function SeasonPage({ params }: Props) {
  const p = parse(await params);
  if (!p || !tmdbConfigured()) notFound();
  const [show, season] = await Promise.all([getTitle("tv", p.id).catch(() => null), getSeason(p.id, p.season)]);
  if (!show || !season) notFound();

  const user = await getUser();
  const seen = new Set<number>();
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase.from("watched_episodes").select("episode").match({ tmdb_id: p.id, season: p.season });
    data?.forEach((r) => seen.add(r.episode));
  }

  const today = new Date().toISOString().slice(0, 10);
  const aired = season.episodes.filter((e) => e.air_date && e.air_date <= today);
  const allSeen = aired.length > 0 && aired.every((e) => seen.has(e.episode_number));
  const item = { media_type: "tv" as const, tmdb_id: show.id, title: show.title, poster_path: show.poster_path, backdrop_path: show.backdrop_path, year: show.year };
  const idx = show.seasons.findIndex((s) => s.season_number === p.season);
  const prev = show.seasons[idx - 1];
  const next = show.seasons[idx + 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/title/tv/${show.id}`} className="text-sm text-white/50 hover:text-white">
            ← {show.title}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{season.name}</h1>
          <p className="text-sm text-white/60">
            {aired.filter((e) => seen.has(e.episode_number)).length} de {aired.length} capítulos vistos
            {season.episodes.length > aired.length ? ` · ${season.episodes.length - aired.length} por estrenar` : ""}
          </p>
        </div>
        {user && aired.length > 0 && (
          <EpisodeCheck
            variant="pill"
            show={item}
            season={p.season}
            episodes={aired.map((e) => e.episode_number)}
            watched={allSeen}
            label={{ on: "✓ Temporada vista", off: "Marcar temporada como vista" }}
          />
        )}
      </div>

      {!user && (
        <p className="rounded-xl bg-panel p-4 text-sm text-white/70">
          <Link href={`/login?next=/title/tv/${show.id}/season/${p.season}`} className="text-accent">Entra</Link> para marcar los capítulos que ya viste.
        </p>
      )}

      <ol className="space-y-3">
        {season.episodes.map((e) => {
          const still = img(e.still_path, "w342");
          const isAired = Boolean(e.air_date && e.air_date <= today);
          return (
            <li key={e.episode_number} className={`flex gap-3 rounded-xl bg-panel p-3 sm:gap-4 ${isAired ? "" : "opacity-60"}`}>
              <div className="relative hidden aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-white/5 sm:block">
                {still && <Image src={still} alt="" fill sizes="160px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/40">
                  T{e.season_number} E{e.episode_number}
                  {e.air_date ? ` · ${formatDate(e.air_date)}` : ""}
                  {e.runtime ? ` · ${e.runtime} min` : ""}
                </p>
                <p className="font-medium leading-tight">{e.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-white/50">{isAired ? e.overview : "Todavía no se estrenó."}</p>
              </div>
              {user && (
                <EpisodeCheck show={item} season={p.season} episodes={[e.episode_number]} watched={seen.has(e.episode_number)} disabled={!isAired} />
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex justify-between text-sm">
        {prev ? <Link href={`/title/tv/${show.id}/season/${prev.season_number}`} className="text-white/60 hover:text-white">← {prev.name}</Link> : <span />}
        {next && <Link href={`/title/tv/${show.id}/season/${next.season_number}`} className="text-white/60 hover:text-white">{next.name} →</Link>}
      </div>
    </div>
  );
}
