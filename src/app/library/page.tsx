import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PosterCard, { PosterGrid } from "@/components/PosterCard";
import Notice from "@/components/Notice";
import Image from "next/image";
import EpisodeCheck from "@/components/EpisodeCheck";
import { computeProgress, type Progress, type Watched } from "@/lib/progress";
import { getTitle, img, tmdbConfigured, type TitleDetails } from "@/lib/tmdb";
import { createClient, getUser, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mi biblioteca" };

type Item = {
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  year: string | null;
  source: "search" | "recognition";
};

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  if (!supabaseConfigured()) {
    return <Notice title="Falta conectar Supabase">Configura Supabase para guardar tu biblioteca. Los pasos están en el README.</Notice>;
  }
  const user = await getUser();
  if (!user) redirect("/login?next=/library");

  const { tipo } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("library_items").select("media_type,tmdb_id,title,poster_path,year,source").order("added_at", { ascending: false });
  if (tipo === "tv" || tipo === "movie") query = query.eq("media_type", tipo);
  const { data, error } = await query.returns<Item[]>();
  if (error) return <Notice title="No pude cargar tu biblioteca">{error.message}</Notice>;

  // Seguimiento de series: progreso y próximos estrenos (solo en la vista "Todo" o "Series").
  const tracked: { show: TitleDetails; progress: Progress }[] = [];
  const shows = tipo === "movie" || !tmdbConfigured() ? [] : (data ?? []).filter((i) => i.media_type === "tv").slice(0, 30);
  if (shows.length) {
    const { data: rows } = await supabase
      .from("watched_episodes")
      .select("tmdb_id,season,episode")
      .in("tmdb_id", shows.map((s) => s.tmdb_id))
      .returns<(Watched & { tmdb_id: number })[]>();
    const details = await Promise.all(shows.map((s) => getTitle("tv", s.tmdb_id).catch(() => null)));
    details.forEach((show) => {
      if (!show) return;
      tracked.push({ show, progress: computeProgress(show, (rows ?? []).filter((r) => r.tmdb_id === show.id)) });
    });
  }
  const continuing = tracked.filter((t) => t.progress.next && t.progress.watched > 0);
  const upcoming = tracked
    .filter((t) => t.show.next_episode?.air_date)
    .sort((a, b) => a.show.next_episode!.air_date.localeCompare(b.show.next_episode!.air_date));

  const tabs = [
    { label: "Todo", value: undefined },
    { label: "Series", value: "tv" },
    { label: "Películas", value: "movie" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">Mi biblioteca</h1>
        <div className="flex gap-1 rounded-full bg-white/5 p-1 text-sm">
          {tabs.map((tab) => (
            <Link
              key={tab.label}
              href={tab.value ? `/library?tipo=${tab.value}` : "/library"}
              className={`rounded-full px-3 py-1 ${tipo === tab.value ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      {continuing.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Continuar viendo</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {continuing.map(({ show, progress }) => {
              const bg = img(show.backdrop_path, "w780");
              const n = progress.next!;
              return (
                <div key={show.id} className="relative overflow-hidden rounded-xl bg-panel ring-1 ring-white/10">
                  {bg && <Image src={bg} alt="" fill sizes="400px" className="object-cover opacity-25" />}
                  <div className="relative space-y-3 p-4">
                    <div>
                      <Link href={`/title/tv/${show.id}`} className="font-semibold hover:underline">{show.title}</Link>
                      <p className="text-sm text-white/70">
                        Te toca{" "}
                        <Link href={`/title/tv/${show.id}/season/${n.season}`} className="text-accent hover:underline">T{n.season} E{n.episode}</Link>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((progress.watched / progress.aired) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-white/50">{progress.watched}/{progress.aired}</span>
                    </div>
                    <EpisodeCheck
                      key={`${n.season}x${n.episode}`}
                      variant="pill"
                      show={{ media_type: "tv", tmdb_id: show.id, title: show.title, poster_path: show.poster_path, backdrop_path: show.backdrop_path, year: show.year }}
                      season={n.season}
                      episodes={[n.episode]}
                      watched={false}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Próximos estrenos</h2>
          <ul className="divide-y divide-white/10 rounded-xl bg-panel">
            {upcoming.map(({ show }) => (
              <li key={show.id}>
                <Link href={`/title/tv/${show.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-white/5">
                  <span className="min-w-0">
                    <span className="font-medium">{show.title}</span>
                    <span className="text-white/50"> · T{show.next_episode!.season_number} E{show.next_episode!.episode_number}</span>
                  </span>
                  <span className="shrink-0 text-accent">{formatDate(show.next_episode!.air_date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data?.length ? <h2 className="text-lg font-semibold">Todo lo guardado</h2> : null}

      {!data?.length ? (
        <p className="text-white/60">
          Todavía no guardaste nada. <Link href="/" className="text-accent underline-offset-4 hover:underline">Busca algo</Link> y tócale “Añadir a mi biblioteca”.
        </p>
      ) : (
        <PosterGrid>
          {data.map((it) => (
            <PosterCard
              key={`${it.media_type}-${it.tmdb_id}`}
              media_type={it.media_type}
              id={it.tmdb_id}
              title={it.title}
              year={it.year}
              poster_path={it.poster_path}
              badge={it.source === "recognition" ? "🎙 Descubierto" : undefined}
            />
          ))}
        </PosterGrid>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short" });
}
